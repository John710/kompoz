const express = require('express');
const fs      = require('fs');
const path    = require('path');
const yaml    = require('yaml');
const { DCLinter } = require('dclint');
const { getProjectDir, safeResolvePath, listYamlFiles } = require('../utils/fs');

const router  = express.Router();
const YAML_RE = /\.(yml|yaml)$/;

const ALLOWED_EXT_DEFAULT = /\.(yml|yaml|env|conf|json|txt|md|ini|properties|bak)$/i;
const EXT_WHITELIST = process.env.FILE_EXT_WHITELIST
  ? new RegExp(process.env.FILE_EXT_WHITELIST, 'i')
  : (process.env.ALLOW_ALL_EXTENSIONS === 'true' ? null : ALLOWED_EXT_DEFAULT);

function base(project) { return getProjectDir(project); }

function listDir(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(e => fs.statSync(path.join(dir, e)).isFile());
}

// GET /api/files?project=x
router.get('/', (req, res) => {
  try {
    const { project } = req.query;
    if (!project) return res.status(400).json({ error: 'project required', errorKey: 'errMissingFields' });
    const b = base(project);
    const files = [];

    listYamlFiles(b).forEach(name => files.push({ name, path: name, type: 'root' }));
    if (fs.existsSync(path.join(b, '.env'))) files.push({ name: '.env', path: '.env', type: 'env' });

    const composeDir = path.join(b, 'compose');
    listYamlFiles(composeDir).forEach(name => files.push({ name, path: `compose/${name}`, type: 'compose' }));

    const appdataDir = path.join(b, 'appdata');
    if (fs.existsSync(appdataDir))
      listDir(appdataDir).forEach(name => files.push({ name, path: `appdata/${name}`, type: 'appdata' }));

    const secretsDir = path.join(b, 'secrets');
    if (fs.existsSync(secretsDir))
      listDir(secretsDir).filter(n => !n.endsWith('.bak')).forEach(name =>
        files.push({ name, path: `secrets/${name}`, type: 'secret' }));

    res.json({ files });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorLoadFiles' });
  }
});

// GET /api/files/all?project=x  (bulk for map)
router.get('/all', (req, res) => {
  try {
    const { project } = req.query;
    if (!project) return res.status(400).json({ error: 'project required', errorKey: 'errMissingFields' });
    const b = base(project);
    const result = [];

    listYamlFiles(b).forEach(name => {
      result.push({ name, path: name, type: 'root', content: fs.readFileSync(path.join(b, name), 'utf8') });
    });
    const envPath = path.join(b, '.env');
    if (fs.existsSync(envPath)) {
      result.push({ name: '.env', path: '.env', type: 'env', content: fs.readFileSync(envPath, 'utf8') });
    }
    const composeDir = path.join(b, 'compose');
    listYamlFiles(composeDir).forEach(name => {
      result.push({ name, path: `compose/${name}`, type: 'compose', content: fs.readFileSync(path.join(composeDir, name), 'utf8') });
    });

    res.json({ files: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorLoadFiles' });
  }
});

// GET /api/files/read?project=x&path=...
router.get('/read', (req, res) => {
  try {
    const { project, path: fp } = req.query;
    if (!project || !fp) return res.status(400).json({ error: 'project and path required', errorKey: 'errMissingFields' });
    const fullPath = safeResolvePath(base(project), fp);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found', errorKey: 'errFileNotFound' });
    res.json({ content: fs.readFileSync(fullPath, 'utf8'), path: fp });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorOpenFile' });
  }
});

// POST /api/files/save
router.post('/save', (req, res) => {
  try {
    const { project, filePath, content } = req.body;
    if (!project || !filePath || content === undefined) return res.status(400).json({ error: 'missing fields', errorKey: 'errMissingFields' });
    if (EXT_WHITELIST && !EXT_WHITELIST.test(filePath)) {
      return res.status(400).json({ error: 'Invalid file type', errorKey: 'invalidFileType' });
    }
    const fullPath = safeResolvePath(base(project), filePath);
    if (fs.existsSync(fullPath)) fs.copyFileSync(fullPath, fullPath + '.bak');
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorSave' });
  }
});

// POST /api/files/create
router.post('/create', (req, res) => {
  try {
    const { project, filePath, content } = req.body;
    if (!project || !filePath) return res.status(400).json({ error: 'missing fields', errorKey: 'errMissingFields' });
    if (EXT_WHITELIST && !EXT_WHITELIST.test(filePath)) {
      return res.status(400).json({ error: 'Invalid file type', errorKey: 'invalidFileType' });
    }
    const fullPath = safeResolvePath(base(project), filePath);
    if (fs.existsSync(fullPath)) return res.status(409).json({ error: 'File already exists', errorKey: 'errFileExists' });
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content || '', 'utf8');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorCreateFile' });
  }
});

// DELETE /api/files
router.delete('/', (req, res) => {
  try {
    const { project, path: fp } = req.query;
    if (!project || !fp) return res.status(400).json({ error: 'missing fields', errorKey: 'errMissingFields' });
    const fullPath = safeResolvePath(base(project), fp);
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'File not found', errorKey: 'errFileNotFound' });
    fs.unlinkSync(fullPath);
    if (fs.existsSync(fullPath + '.bak')) fs.unlinkSync(fullPath + '.bak');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorDelete' });
  }
});

// POST /api/files/restore
router.post('/restore', (req, res) => {
  try {
    const { project, filePath } = req.body;
    if (!project || !filePath) return res.status(400).json({ error: 'missing fields', errorKey: 'errMissingFields' });
    const fullPath = safeResolvePath(base(project), filePath);
    const bak = fullPath + '.bak';
    if (!fs.existsSync(bak)) return res.status(404).json({ error: 'No backup found', errorKey: 'errNoBackup' });
    fs.copyFileSync(bak, fullPath);
    res.json({ ok: true, content: fs.readFileSync(fullPath, 'utf8') });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorRestore' });
  }
});

// POST /api/files/lint — DCLint для compose файлов
router.post('/lint', (req, res) => {
  try {
    const { project, filePath, content } = req.body;
    if (!project || !filePath || content === undefined) return res.status(400).json({ error: 'missing fields', errorKey: 'errMissingFields' });

    if (!YAML_RE.test(filePath)) return res.json({ messages: [] });

    let parsed;
    try {
      const doc = yaml.parseDocument(content, { merge: true });
      if (doc.errors && doc.errors.length > 0) {
        const e = doc.errors[0];
        const linePos = Array.isArray(e.linePos) ? e.linePos[0] : e.linePos;
        return res.json({ messages: [{
          rule: 'invalid-yaml', type: 'error', severity: 'critical',
          message: e.message || 'YAML syntax error',
          line: linePos?.line || 1, column: linePos?.col || 1,
        }]});
      }
      parsed = doc.toJS();
    } catch (parseErr) {
      return res.json({ messages: [{
        rule: 'invalid-yaml', type: 'error', severity: 'critical',
        message: parseErr.message, line: 1, column: 1,
      }]});
    }

    if (!parsed || !parsed.services) {
      return res.json({ messages: [] });
    }

    const rules = {
      'no-build-and-image':                   1,
      'no-duplicate-container-names':         2,
      'no-duplicate-exported-ports':          2,
      'no-quotes-in-volumes':                 1,
      'no-unbound-port-interfaces':           1,
      'no-version-field':                     2,
      'require-project-name-field':           0,
      'require-quotes-in-ports':              0,
      'service-container-name-regex':         2,
      'service-dependencies-alphabetical-order': 0,
      'service-image-require-explicit-tag': [1, { prohibitedTags: [] }],
      'service-keys-order':                   0,
      'service-ports-alphabetical-order':     0,
      'services-alphabetical-order':          0,
      'top-level-properties-order':           0,
    };

    const linter   = new DCLinter({ rules, debug: false });
    const messages = linter.lintContent({ sourceCode: content, content: parsed, path: filePath });

    res.json({ messages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', errorKey: 'errorLoadFiles' });
  }
});

module.exports = router;
module.exports.ALLOWED_EXT_DEFAULT = ALLOWED_EXT_DEFAULT;
module.exports.EXT_WHITELIST = EXT_WHITELIST;
