const crypto = require('crypto');

const AUTH_COOKIE_NAME = 'tally_auth';

function parseCookies(cookieHeader) {
  const header = String(cookieHeader || '');
  const cookies = {};
  if (!header) return cookies;

  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }

  return cookies;
}

function base64UrlEncode(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ''), 'base64url');
}

function deriveCookieKey(secret) {
  return crypto.createHash('sha256').update(String(secret || '')).digest();
}

function sealAuthPayload(payload, secret) {
  const iv = crypto.randomBytes(12);
  const key = deriveCookieKey(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${base64UrlEncode(iv)}.${base64UrlEncode(tag)}.${base64UrlEncode(ciphertext)}`;
}

function unsealAuthPayload(token, secret) {
  try {
    const [ivB64, tagB64, dataB64] = String(token || '').split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;

    const iv = base64UrlDecode(ivB64);
    const tag = base64UrlDecode(tagB64);
    const ciphertext = base64UrlDecode(dataB64);
    const key = deriveCookieKey(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
  } catch (_) {
    return null;
  }
}

function buildCookieString(name, value, options = {}) {
  const secure = !!options.secure;
  const httpOnly = options.httpOnly !== false;
  const sameSite = options.sameSite || 'Strict';
  const maxAgeMs = Number(options.maxAgeMs);
  const path = options.path || '/';

  const parts = [`${name}=${encodeURIComponent(String(value || ''))}`];
  parts.push(`Path=${path}`);
  if (Number.isFinite(maxAgeMs) && maxAgeMs >= 0) {
    parts.push(`Max-Age=${Math.floor(maxAgeMs / 1000)}`);
    parts.push(`Expires=${new Date(Date.now() + maxAgeMs).toUTCString()}`);
  }
  if (httpOnly) parts.push('HttpOnly');
  parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');

  return parts.join('; ');
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader('Set-Cookie');
  if (!current) {
    res.setHeader('Set-Cookie', [cookieValue]);
    return;
  }
  const next = Array.isArray(current) ? current.concat(cookieValue) : [current, cookieValue];
  res.setHeader('Set-Cookie', next);
}

function setAuthCookie(res, payload, secret, options = {}) {
  const token = sealAuthPayload(payload, secret);
  const cookie = buildCookieString(AUTH_COOKIE_NAME, token, options);
  appendSetCookie(res, cookie);
}

function clearAuthCookie(res, options = {}) {
  const cookie = buildCookieString(AUTH_COOKIE_NAME, '', {
    ...options,
    maxAgeMs: 0
  });
  appendSetCookie(res, cookie);
}

module.exports = {
  AUTH_COOKIE_NAME,
  parseCookies,
  sealAuthPayload,
  unsealAuthPayload,
  buildCookieString,
  setAuthCookie,
  clearAuthCookie
};
