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
  // Tamper with the auth tag (second segment) to guarantee GCM verification failure.
  // Flipping the last char of the full token may only change base64 padding bits.
  const parts = token.split('.');
  const tag = parts[1];
  const mid = Math.floor(tag.length / 2);
  parts[1] = tag.slice(0, mid) + (tag[mid] === 'A' ? 'B' : 'A') + tag.slice(mid + 1);
  const tampered = parts.join('.');
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
