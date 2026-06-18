process.env.COMPOSE_MOUNTS = '/tmp/test-mounts';
process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { safeResolvePath } = require('../server/utils/fs');

test('safeResolvePath allows valid paths inside base', () => {
  const tmpDir = fs.mkdtempSync(path.join('/tmp', 'kompoz-test-'));
  try {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'hello');
    const result = safeResolvePath(tmpDir, 'test.txt');
    assert.strictEqual(result, filePath);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('safeResolvePath blocks paths outside base', () => {
  const tmpDir = fs.mkdtempSync(path.join('/tmp', 'kompoz-test-'));
  try {
    assert.throws(() => {
      safeResolvePath(tmpDir, '../outside.txt');
    }, /Path traversal detected/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('safeResolvePath blocks nested traversal', () => {
  const tmpDir = fs.mkdtempSync(path.join('/tmp', 'kompoz-test-'));
  const inner = path.join(tmpDir, 'inner');
  fs.mkdirSync(inner);
  try {
    assert.throws(() => {
      safeResolvePath(tmpDir, 'inner/../../outside.txt');
    }, /Path traversal detected/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
