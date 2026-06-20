process.env.COMPOSE_MOUNTS = '/tmp/test-mounts';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const filesRouter = require('../server/routes/files.js');
const { ALLOWED_EXT_DEFAULT, EXT_WHITELIST } = filesRouter;

async function httpRequest(app, method, path) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const response = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        method,
        path,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null,
          });
        });
      });
      req.on('error', reject);
      req.end();
    });
    return response;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('ALLOWED_EXT_DEFAULT matches allowed extensions', () => {
  const allowed = [
    'docker-compose.yml', 'config.yaml', '.env', 'nginx.conf',
    'settings.json', 'readme.txt', 'notes.md', 'php.ini',
    'app.properties',
  ];
  for (const name of allowed) {
    assert.strictEqual(ALLOWED_EXT_DEFAULT.test(name), true, `${name} should match`);
  }
});

test('ALLOWED_EXT_DEFAULT rejects disallowed extensions', () => {
  const disallowed = [
    'script.js', 'style.css', 'run.sh', 'program.exe',
    'image.png', 'data.csv', 'archive.zip', 'file.pdf',
  ];
  for (const name of disallowed) {
    assert.strictEqual(ALLOWED_EXT_DEFAULT.test(name), false, `${name} should not match`);
  }
});

test('EXT_WHITELIST falls back to default when env not set', () => {
  assert.strictEqual(EXT_WHITELIST, ALLOWED_EXT_DEFAULT);
});

test('files endpoint returns generic error without path leak', async () => {
  const app = require('../server/index.js');
  const res = await httpRequest(app, 'GET', '/api/files?project=nonexistent-project-xyz');
  assert.strictEqual(res.status, 500);
  assert.strictEqual(res.body.error, 'Internal server error');
  assert.strictEqual(res.body.errorKey, 'errorLoadFiles');
  assert.ok(!res.body.error.includes('не найден'), 'error should not leak internal path info');
});
