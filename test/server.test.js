const test = require('node:test');
const assert = require('node:assert');

test('server module exports an express app', () => {
  process.env.COMPOSE_MOUNTS = '/tmp/test-mounts';
  process.env.NODE_ENV = 'test';
  const app = require('../server/index.js');
  assert.strictEqual(typeof app, 'function');
});
