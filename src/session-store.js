const DEFAULT_TTL_SECONDS = 2 * 60 * 60; // 2 hours
const PREFIX = 'tally:sess:';

function getSessionTtlSeconds(sessionData) {
  const maxAgeMs = Number(sessionData?.cookie?.maxAge);
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) {
    return Math.max(1, Math.ceil(maxAgeMs / 1000));
  }
  return DEFAULT_TTL_SECONDS;
}

function parseSession(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }
  return raw;
}

class UpstashSessionStore {
  constructor(sessionLib, redis, options = {}) {
    if (!sessionLib?.Store) {
      throw new Error('session.Store is required');
    }
    if (!redis) {
      throw new Error('redis client is required');
    }

    this.redis = redis;
    this.prefix = options.prefix || PREFIX;
    this.defaultTtlSeconds = options.defaultTtlSeconds || DEFAULT_TTL_SECONDS;

    const BaseStore = sessionLib.Store;
    const self = this;
    this.store = new (class extends BaseStore {
      get(sid, callback) {
        self.redis.get(self.prefix + sid)
          .then((raw) => callback(null, parseSession(raw)))
          .catch((error) => callback(error));
      }

      set(sid, sessionData, callback) {
        const ttl = getSessionTtlSeconds(sessionData) || self.defaultTtlSeconds;
        self.redis.set(self.prefix + sid, JSON.stringify(sessionData), { ex: ttl })
          .then(() => callback?.(null))
          .catch((error) => callback?.(error));
      }

      destroy(sid, callback) {
        self.redis.del(self.prefix + sid)
          .then(() => callback?.(null))
          .catch((error) => callback?.(error));
      }

      touch(sid, sessionData, callback) {
        const ttl = getSessionTtlSeconds(sessionData) || self.defaultTtlSeconds;
        self.redis.set(self.prefix + sid, JSON.stringify(sessionData), { ex: ttl })
          .then(() => callback?.(null))
          .catch((error) => callback?.(error));
      }
    })();
  }
}

let cachedRedisClient = null;

function createUpstashRedisClientFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  let Redis;
  try {
    ({ Redis } = require('@upstash/redis'));
  } catch (error) {
    if (error && error.code === 'MODULE_NOT_FOUND') {
      return null;
    }
    throw error;
  }

  if (!cachedRedisClient) {
    cachedRedisClient = new Redis({ url, token });
  }
  return cachedRedisClient;
}

function createSessionStore(sessionLib, env = process.env) {
  const redis = createUpstashRedisClientFromEnv(env);
  if (!redis) return null;
  const store = new UpstashSessionStore(sessionLib, redis);
  return store.store;
}

module.exports = {
  createSessionStore,
  createUpstashRedisClientFromEnv,
  getSessionTtlSeconds,
  parseSession,
  UpstashSessionStore
};
