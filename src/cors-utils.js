function parseAllowedOrigins(rawValue, fallbackValue) {
  const value = rawValue || fallbackValue;
  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function normalizeHost(value) {
  return String(value || '').trim().toLowerCase();
}

function getRequestHost(req) {
  if (!req || !req.headers) return '';
  return normalizeHost(req.headers['x-forwarded-host'] || req.headers.host);
}

function getOriginHost(origin) {
  try {
    return normalizeHost(new URL(origin).host);
  } catch (_) {
    return '';
  }
}

function isOriginAllowed(origin, requestHost, allowedOrigins) {
  if (!origin) return false;
  if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) return true;

  const normalizedRequestHost = normalizeHost(requestHost);
  const normalizedOriginHost = getOriginHost(origin);
  return !!(normalizedRequestHost && normalizedOriginHost && normalizedRequestHost === normalizedOriginHost);
}

function createCorsOptionsDelegate(allowedOrigins) {
  return (req, callback) => {
    const origin = req.headers.origin;
    const requestHost = getRequestHost(req);

    if (isOriginAllowed(origin, requestHost, allowedOrigins)) {
      return callback(null, { origin: true });
    }

    return callback(new Error('CORS origin not allowed'));
  };
}

module.exports = {
  createCorsOptionsDelegate,
  getOriginHost,
  getRequestHost,
  isOriginAllowed,
  parseAllowedOrigins
};
