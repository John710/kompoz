const express = require('express');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const db      = require('./utils/db');
const { getMountRoots, getAllProjects } = require('./utils/fs');
const pkg = require('../package.json');

const app  = express();
const PORT = process.env.PORT || 3000;

// -- Auth config --
const AUTH_USER   = process.env.AUTH_USER   || '';
const AUTH_PASS   = process.env.AUTH_PASS   || '';
const AUTH_SECRET = process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex');
const AUTH_ENABLED = !!(AUTH_USER && AUTH_PASS);
const COOKIE_NAME = 'kompoz_auth';
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function signToken(username, expiry) {
  const payload = username + ':' + expiry;
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyToken(token) {
  try {
    const dot = token.indexOf('.');
    if (dot === -1) return null;
    const payload = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
    const sig = token.slice(dot + 1);
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
    if (sig !== expected) return null;
    const colon = payload.indexOf(':');
    if (colon === -1) return null;
    const username = payload.slice(0, colon);
    const expiry = parseInt(payload.slice(colon + 1), 10);
    if (Date.now() > expiry) return null;
    return { username, expiry };
  } catch { return null; }
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const cookies = {};
  raw.split(';').forEach(c => {
    const [k, ...v] = c.trim().split('=');
    if (k) cookies[k] = decodeURIComponent(v.join('='));
  });
  return cookies;
}

async function isAuthEnabled() {
  if (process.env.DATABASE_URL) {
    try {
      const { rows } = await db.query('SELECT id FROM users LIMIT 1');
      return rows.length > 0 || AUTH_ENABLED;
    } catch {
      return AUTH_ENABLED;
    }
  }
  return AUTH_ENABLED;
}

async function requireAuth(req, res, next) {
  try {
    const enabled = await isAuthEnabled();
    if (!enabled) return next();

    if (req.path === '/login.html' || req.path === '/api/login') return next();
    if (req.path === '/api/info') return next();
    if (req.path === '/api/latest-release') return next();
    if (req.path.startsWith('/locales/') || req.path === '/api/locales') return next();
    if (req.path.startsWith('/css/') || req.path.startsWith('/js/')) return next();

    const cookies = parseCookies(req);
    const token = cookies[COOKIE_NAME];

    if (!token) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
      return res.redirect('/login.html');
    }

    if (process.env.DATABASE_URL) {
      const { rows } = await db.query(
        'SELECT u.username, u.name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = $1 AND s.expires_at > NOW()',
        [token]
      );
      if (rows.length === 0) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
        return res.redirect('/login.html');
      }
      req.authUser = rows[0].username;
      req.authName = rows[0].name;
    } else {
      const data = verifyToken(token);
      if (!data) {
        if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
        return res.redirect('/login.html');
      }
      req.authUser = data.username;
    }

    next();
  } catch (err) {
    console.error('Auth error:', err);
    if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Auth error' });
    return res.redirect('/login.html');
  }
}

app.use(requireAuth);
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/locales', express.static(path.join(__dirname, '../locales')));

app.use('/api/projects', require('./routes/projects'));
app.use('/api/files',    require('./routes/files'));

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    const enabled = await isAuthEnabled();
    if (!enabled) return res.json({ ok: true, enabled: false });

    const { username, password } = req.body || {};

    if (process.env.DATABASE_URL) {
      const { rows } = await db.query('SELECT id, password_hash, name FROM users WHERE username = $1', [username]);
      if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

      const bcrypt = require('bcryptjs');
      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
      await db.query('INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)', [rows[0].id, token, expiresAt]);

      res.setHeader('Set-Cookie', COOKIE_NAME + '=' + token + '; HttpOnly; Path=/; Max-Age=' + (TOKEN_TTL_MS / 1000) + '; SameSite=Strict');
      res.json({ ok: true });
    } else {
      if (username !== AUTH_USER || password !== AUTH_PASS) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const expiry = Date.now() + TOKEN_TTL_MS;
      const token = signToken(username, expiry);
      res.setHeader('Set-Cookie', COOKIE_NAME + '=' + token + '; HttpOnly; Path=/; Max-Age=' + (TOKEN_TTL_MS / 1000) + '; SameSite=Strict');
      res.json({ ok: true });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login error' });
  }
});

// POST /api/logout
app.post('/api/logout', async (req, res) => {
  try {
    if (process.env.DATABASE_URL) {
      const cookies = parseCookies(req);
      const token = cookies[COOKIE_NAME];
      if (token) {
        await db.query('DELETE FROM sessions WHERE token = $1', [token]);
      }
    }
    res.setHeader('Set-Cookie', COOKIE_NAME + '=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict');
    res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ error: 'Logout error' });
  }
});

// GET /api/locales -- list available languages
app.get('/api/locales', (req, res) => {
  try {
    const localesDir = path.join(__dirname, '../locales');
    const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));
    const locales = files.map(f => {
      const code = f.replace('.json', '');
      const raw = fs.readFileSync(path.join(localesDir, f), 'utf8');
      const content = JSON.parse(raw);
      return { code, name: content._meta?.name || code };
    });
    res.json({ locales });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/me -- current user
app.get('/api/me', async (req, res) => {
  try {
    const enabled = await isAuthEnabled();
    if (!enabled) return res.json({ enabled: false });
    if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' });
    res.json({ enabled: true, user: { name: req.authName || req.authUser } });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Me error' });
  }
});

// GET /api/info -- mount status (for UI)
app.get('/api/info', (req, res) => {
  try {
    const mounts = getMountRoots();
    const projects = getAllProjects();
    res.json({ mounts, projects, version: pkg.version });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/version -- application version
app.get('/api/version', (req, res) => {
  res.json({ version: pkg.version });
});

// GET /api/latest-release -- latest GitHub release tag
app.get('/api/latest-release', async (req, res) => {
  try {
    const r = await fetch('https://api.github.com/repos/John710/kompoz/releases/latest', {
      headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'kompoz' }
    });
    if (!r.ok) throw new Error('GitHub API error');
    const d = await r.json();
    res.json({ tag: d.tag_name, published: d.published_at, url: d.html_url });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// POST /api/verify-password -- password check for dangerous ops
app.post('/api/verify-password', async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password) return res.status(401).json({ error: 'Invalid password', errorKey: 'invalidPassword' });

    if (process.env.DATABASE_URL && req.authUser) {
      const { rows } = await db.query('SELECT password_hash FROM users WHERE username = $1', [req.authUser]);
      if (rows.length === 0) return res.status(401).json({ error: 'Invalid password', errorKey: 'invalidPassword' });

      const bcrypt = require('bcryptjs');
      const valid = await bcrypt.compare(password, rows[0].password_hash);
      if (!valid) return res.status(401).json({ error: 'Invalid password', errorKey: 'invalidPassword' });
    } else {
      if (!AUTH_ENABLED) return res.json({ ok: true });
      if (password !== AUTH_PASS) {
        return res.status(401).json({ error: 'Invalid password', errorKey: 'invalidPassword' });
      }
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Verify password error:', err);
    res.status(500).json({ error: 'Verify password error' });
  }
});

if (require.main === module) {
  (async () => {
    await db.initDatabase();
    await db.migrateAuth();

    const statusChecker = require(./utils/status-checker);
    statusChecker.start();

    app.listen(PORT, () => {
      const mounts = getMountRoots();
      console.log('Kompoz v' + pkg.version + ' running on :' + PORT);
      (async () => {
        const enabled = await isAuthEnabled();
        if (enabled) {
          console.log('Authentication enabled');
        } else {
          console.log('Authentication disabled -- set AUTH_USER and AUTH_PASS to enable');
        }
      })();
      console.log('Mount points (' + mounts.length + '):');
      mounts.forEach(m => console.log('  ' + m));
      try {
        const projects = getAllProjects();
        console.log('Projects found: ' + (projects.map(p => p.name).join(', ') || 'none'));
      } catch {}
    });
  })();
}

module.exports = app;
