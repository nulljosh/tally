const assert = require('assert');
const {
  parseCookies,
  sealAuthPayload,
  unsealAuthPayload,
  buildCookieString
} = require('../src/auth-cookie');

function testCookieParsing() {
  const parsed = parseCookies('a=1; tally_auth=abc%2Edef; empty=');
  assert.strictEqual(parsed.a, '1');
  assert.strictEqual(parsed.tally_auth, 'abc.def');
  assert.strictEqual(parsed.empty, '');
}

function testSealAndUnseal() {
  const secret = 'test-secret';
  const payload = { authenticated: true, userId: 'abc123', exp: Date.now() + 1000 };
  const token = sealAuthPayload(payload, secret);
  const decoded = unsealAuthPayload(token, secret);
  assert.strictEqual(decoded.authenticated, true);
  assert.strictEqual(decoded.userId, 'abc123');
}

function testTamperDetection() {
  const secret = 'test-secret';
  const payload = { authenticated: true, userId: 'abc123' };
  const token = sealAuthPayload(payload, secret);
  const tampered = token.slice(0, -1) + (token.slice(-1) === 'A' ? 'B' : 'A');
  const decoded = unsealAuthPayload(tampered, secret);
  assert.strictEqual(decoded, null);
}

function testCookieSerialization() {
  const serialized = buildCookieString('tally_auth', 'x.y.z', {
    maxAgeMs: 60_000,
    secure: true,
    httpOnly: true,
    sameSite: 'Strict'
  });
  assert(serialized.includes('tally_auth=x.y.z'));
  assert(serialized.includes('Max-Age=60'));
  assert(serialized.includes('HttpOnly'));
  assert(serialized.includes('SameSite=Strict'));
  assert(serialized.includes('Secure'));
}

function run() {
  testCookieParsing();
  testSealAndUnseal();
  testTamperDetection();
  testCookieSerialization();
  console.log('Auth cookie tests passed');
}

run();
