const assert = require('assert');
const session = require('express-session');
const {
  UpstashSessionStore,
  createSessionStore,
  getSessionTtlSeconds,
  parseSession
} = require('../src/session-store');

class MockRedis {
  constructor() {
    this.map = new Map();
    this.ttlByKey = new Map();
  }

  async get(key) {
    return this.map.get(key) || null;
  }

  async set(key, value, options = {}) {
    this.map.set(key, value);
    if (options.ex) this.ttlByKey.set(key, options.ex);
    return 'OK';
  }

  async del(key) {
    this.map.delete(key);
    this.ttlByKey.delete(key);
    return 1;
  }
}

function testHelpers() {
  assert.strictEqual(getSessionTtlSeconds({ cookie: { maxAge: 30000 } }), 30);
  assert.strictEqual(getSessionTtlSeconds({}), 7200);
  assert.deepStrictEqual(parseSession('{"a":1}'), { a: 1 });
  assert.strictEqual(parseSession('invalid-json'), null);
  assert.strictEqual(parseSession(null), null);
}

function testNoEnvStore() {
  const store = createSessionStore(session, {});
  assert.strictEqual(store, null);
}

function testStoreLifecycle() {
  const redis = new MockRedis();
  const wrapper = new UpstashSessionStore(session, redis);
  const store = wrapper.store;

  const sid = 'abc123';
  const payload = { cookie: { maxAge: 45000 }, user: 'josh' };

  return new Promise((resolve, reject) => {
    store.set(sid, payload, (setErr) => {
      if (setErr) return reject(setErr);
      assert.strictEqual(redis.ttlByKey.get('tally:sess:' + sid), 45);

      store.get(sid, (getErr, result) => {
        if (getErr) return reject(getErr);
        assert.strictEqual(result.user, 'josh');

        store.destroy(sid, (destroyErr) => {
          if (destroyErr) return reject(destroyErr);
          assert.strictEqual(redis.map.has('tally:sess:' + sid), false);
          resolve();
        });
      });
    });
  });
}

async function run() {
  testHelpers();
  testNoEnvStore();
  await testStoreLifecycle();
  console.log('Session store tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
