process.env.COMPOSE_MOUNTS = '/tmp/test-mounts';
process.env.NODE_ENV = 'test';
process.env.AUTH_USER = 'testuser';
process.env.AUTH_PASS = 'testpass';
process.env.AUTH_SECRET = 'fixed-secret-for-testing';

const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const serverModule = require('../server/index.js');
const app = serverModule;
const { safeCompare, parseCookies, verifyToken, signToken, checkRateLimit } = serverModule;

async function httpRequest(app, method, path, body, extraHeaders = {}) {
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
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
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
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
    return response;
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('safeCompare returns true for equal strings', () => {
  assert.strictEqual(safeCompare('secret', 'secret'), true);
});

test('safeCompare returns false for different strings', () => {
  assert.strictEqual(safeCompare('secret', 'wrong'), false);
  assert.strictEqual(safeCompare('abc', 'abcd'), false);
});

test('safeCompare returns false for non-strings', () => {
  assert.strictEqual(safeCompare(123, '123'), false);
  assert.strictEqual(safeCompare('123', 123), false);
  assert.strictEqual(safeCompare(null, 'null'), false);
  assert.strictEqual(safeCompare(undefined, undefined), false);
});

test('parseCookies parses well-formed cookies', () => {
  const cookies = parseCookies({ headers: { cookie: 'session=abc123; user=john' } });
  assert.deepStrictEqual(cookies, { session: 'abc123', user: 'john' });
});

test('parseCookies handles empty cookie header', () => {
  const cookies = parseCookies({ headers: {} });
  assert.deepStrictEqual(cookies, {});
});

test('parseCookies handles malformed percent-encoding without crashing', () => {
  const cookies = parseCookies({ headers: { cookie: 'bad=%ZZ; good=ok' } });
  assert.strictEqual(cookies.bad, '%ZZ');
  assert.strictEqual(cookies.good, 'ok');
});

test('verifyToken verifies a valid token', () => {
  const expiry = Date.now() + 10000;
  const token = signToken('alice', expiry);
  const result = verifyToken(token);
  assert.notStrictEqual(result, null);
  assert.strictEqual(result.username, 'alice');
  assert.strictEqual(result.expiry, expiry);
});

test('verifyToken rejects an invalid token', () => {
  assert.strictEqual(verifyToken('totally.invalid'), null);
  assert.strictEqual(verifyToken('nodot'), null);
  assert.strictEqual(verifyToken(''), null);
});

test('verifyToken rejects a tampered signature', () => {
  const expiry = Date.now() + 10000;
  const token = signToken('alice', expiry);
  const dot = token.lastIndexOf('.');
  const tampered = token.slice(0, dot + 1) + 'tampered';
  assert.strictEqual(verifyToken(tampered), null);
});

test('verifyToken rejects an expired token', () => {
  const expiry = Date.now() - 1000;
  const token = signToken('alice', expiry);
  assert.strictEqual(verifyToken(token), null);
});

test('checkRateLimit allows up to 5 attempts', () => {
  const ip = '10.0.0.1';
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(checkRateLimit(ip), true, `attempt ${i + 1} should be allowed`);
  }
});

test('checkRateLimit blocks after 5 attempts', () => {
  const ip = '10.0.0.2';
  for (let i = 0; i < 5; i++) checkRateLimit(ip);
  assert.strictEqual(checkRateLimit(ip), false);
});

test('checkRateLimit tracks different IPs independently', () => {
  const ipA = '10.0.0.3';
  const ipB = '10.0.0.4';
  for (let i = 0; i < 5; i++) checkRateLimit(ipA);
  assert.strictEqual(checkRateLimit(ipA), false);
  assert.strictEqual(checkRateLimit(ipB), true);
});

test('login returns cookie without Secure by default', async () => {
  const res = await httpRequest(app, 'POST', '/api/login', { username: 'testuser', password: 'testpass' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['set-cookie']);
  const cookie = res.headers['set-cookie'][0];
  assert.ok(!cookie.includes(' Secure'), 'cookie should not include Secure flag by default');
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('SameSite=Strict'));
});

test('login returns cookie with Secure when COOKIE_SECURE is true', async () => {
  process.env.COOKIE_SECURE = 'true';
  const res = await httpRequest(app, 'POST', '/api/login', { username: 'testuser', password: 'testpass' });
  assert.strictEqual(res.status, 200);
  assert.ok(res.headers['set-cookie']);
  const cookie = res.headers['set-cookie'][0];
  assert.ok(cookie.includes(' Secure'), 'cookie should include Secure flag');
});
