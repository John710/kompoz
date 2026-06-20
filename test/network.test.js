const test = require('node:test');
const assert = require('node:assert');
const { parseCidr } = require('../server/utils/network-scanner');

test('parseCidr parses valid /24 CIDR', () => {
  const result = parseCidr('192.168.1.0/24');
  assert.strictEqual(result.prefix, 24);
  assert.ok(Array.isArray(result.hosts));
  assert.strictEqual(result.hosts.length, 254);
});

test('parseCidr throws on invalid format', () => {
  assert.throws(() => parseCidr('not-a-cidr'), /Invalid CIDR format/);
  assert.throws(() => parseCidr('192.168.1.0'), /Invalid CIDR format/);
  assert.throws(() => parseCidr('192.168.1.0/33'), /Invalid CIDR format/);
});

test('parseCidr throws errCidrTooLarge for oversized CIDR', () => {
  // /12 produces ~1M hosts (>4096)
  assert.throws(() => parseCidr('10.0.0.0/12'), /errCidrTooLarge/);
  assert.throws(() => parseCidr('10.0.0.0/8'), /errCidrTooLarge/);
  // /20 produces 4094 hosts (just under the limit)
  const ok = parseCidr('10.0.0.0/20');
  assert.ok(ok.hosts.length <= 4096);
});
