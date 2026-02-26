const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { checkAllSections, runSubmitMonthlyReport } = require('./scraper');
const { createCorsOptionsDelegate, parseAllowedOrigins } = require('./cors-utils');
const { parseCookies, unsealAuthPayload, setAuthCookie, clearAuthCookie } = require('./auth-cookie');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
const PORT = process.env.PORT || 3000;
const ENCRYPTION_KEY = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const DEBUG = process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development';
const IS_PRODUCTION = !!process.env.VERCEL;
const DEFAULT_SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
const REMEMBER_ME_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SESSION_IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// Debug logging helper
const log = (...args) => DEBUG && console.log(...args);

function getUaHash(req) {
  return crypto.createHash('sha256').update(req.headers['user-agent'] || '').digest('hex');
}

function getSessionMaxAgeMs(req) {
  const maxAgeMs = Number(req?.session?.cookie?.maxAge);
  if (Number.isFinite(maxAgeMs) && maxAgeMs > 0) return maxAgeMs;
  return DEFAULT_SESSION_MAX_AGE_MS;
}

function persistAuthCookie(req, res) {
  if (!req?.session?.authenticated || !process.env.SESSION_SECRET) return;
  const maxAgeMs = getSessionMaxAgeMs(req);
  const payload = {
    authenticated: true,
    bceidUsername: req.session.bceidUsername,
    bceidPassword: req.session.bceidPassword,
    userId: req.session.userId,
    uaHash: req.session.uaHash,
    lastActivity: req.session.lastActivity || Date.now(),
    maxAgeMs,
    exp: Date.now() + maxAgeMs
  };
  setAuthCookie(res, payload, ENCRYPTION_KEY, {
    maxAgeMs,
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/'
  });
}

function clearAllAuthState(req, res, done) {
  clearAuthCookie(res, {
    secure: IS_PRODUCTION,
    httpOnly: true,
    sameSite: 'Strict',
    path: '/'
  });
  if (!req.session) {
    if (typeof done === 'function') done();
    return;
  }
  req.session.destroy((err) => {
    if (typeof done === 'function') done(err);
  });
}

// Encryption helpers for session credential storage
function encrypt(text) {
  if (!text) return '';
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted) {
  if (!encrypted) return '';
  const algorithm = 'aes-256-cbc';
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const parts = encrypted.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Validate BC Self-Serve credentials by attempting login
async function attemptBCLogin(username, password) {
  let browser;
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.LAMBDA_TASK_ROOT;
    const executablePath = isVercel
      ? await chromium.executablePath()
      : (process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    const launchArgs = isVercel
      ? chromium.args
      : ['--no-sandbox', '--disable-setuid-sandbox'];

    browser = await puppeteer.launch({
      headless: isVercel ? chromium.headless : true,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath,
      args: launchArgs
    });

    const page = await browser.newPage();

    // Navigate to BC Self-Serve
    await page.goto('https://myselfserve.gov.bc.ca', {
      waitUntil: 'networkidle2',
      timeout: 15000
    });

    // Click sign in button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('a, button'));
      for (const btn of buttons) {
        const text = btn.innerText?.toLowerCase() || '';
        if (text.includes('sign in') || text.includes('log in')) {
          btn.click();
          return true;
        }
      }
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Wait for login form
    await page.waitForSelector('input[name="user"], input[id="user"]', {
      timeout: 10000
    });

    // Fill credentials
    await page.evaluate((user, pass) => {
      const userField = document.querySelector('input[name="user"], input[id="user"]');
      const passField = document.querySelector('input[name="password"], input[id="password"]');
      if (userField) userField.value = user;
      if (passField) passField.value = pass;
    }, username, password);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Submit form
    await page.evaluate(() => {
      const submitBtn = document.querySelector('input[type="submit"], button[type="submit"]');
      if (submitBtn) submitBtn.click();
    });

    // Wait for navigation
    await page.waitForNavigation({ timeout: 10000 }).catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if login succeeded (not on login page)
    const currentUrl = page.url();
    const success = !currentUrl.includes('logon') && !currentUrl.includes('Login');

    await browser.close();
    return { success };
  } catch (error) {
    if (browser) await browser.close().catch(() => {});
    return { success: false, error: error.message };
  }
}

const allowedOrigins = parseAllowedOrigins(
  process.env.CORS_ORIGINS,
  'http://localhost:3000,http://127.0.0.1:3000,https://tally-production.vercel.app'
);

app.use(cors(createCorsOptionsDelegate(allowedOrigins)));
app.use(express.json());
app.set('trust proxy', 1);

// Rate limiting for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many login attempts, please try again in 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: IS_PRODUCTION, // HTTPS-only on Vercel, HTTP OK on localhost
    httpOnly: true,
    sameSite: 'strict',
    maxAge: DEFAULT_SESSION_MAX_AGE_MS
  }
  // No store needed - defaults to MemoryStore locally, cookies on Vercel serverless
}));

if (IS_PRODUCTION && !process.env.SESSION_SECRET) {
  console.error('[SESSION] SESSION_SECRET is missing. Persistent auth cookie is disabled.');
}

// Rehydrate server session from encrypted auth cookie (serverless-safe fallback)
app.use((req, res, next) => {
  if (req.session?.authenticated) return next();
  if (!process.env.SESSION_SECRET) return next();

  const cookies = parseCookies(req.headers.cookie);
  const authToken = cookies.tally_auth;
  if (!authToken) return next();

  const payload = unsealAuthPayload(authToken, ENCRYPTION_KEY);
  if (!payload || !payload.authenticated) {
    clearAuthCookie(res, { secure: IS_PRODUCTION, httpOnly: true, sameSite: 'Strict', path: '/' });
    return next();
  }

  if (payload.exp && Date.now() > payload.exp) {
    clearAuthCookie(res, { secure: IS_PRODUCTION, httpOnly: true, sameSite: 'Strict', path: '/' });
    return next();
  }

  const currentUaHash = getUaHash(req);
  if (payload.uaHash && payload.uaHash !== currentUaHash) {
    clearAuthCookie(res, { secure: IS_PRODUCTION, httpOnly: true, sameSite: 'Strict', path: '/' });
    return next();
  }

  req.session.authenticated = true;
  req.session.bceidUsername = payload.bceidUsername;
  req.session.bceidPassword = payload.bceidPassword;
  req.session.userId = payload.userId;
  req.session.lastActivity = payload.lastActivity || Date.now();
  req.session.uaHash = payload.uaHash || currentUaHash;
  req.session.cookie.maxAge = Number(payload.maxAgeMs) || DEFAULT_SESSION_MAX_AGE_MS;
  return next();
});

// Session timeout middleware
app.use((req, res, next) => {
  if (req.session && req.session.authenticated) {
    const lastActivity = req.session.lastActivity || Date.now();
    const now = Date.now();
    const timeout = SESSION_IDLE_TIMEOUT_MS;

    if (now - lastActivity > timeout) {
      return clearAllAuthState(req, res, () => {
        return res.status(401).json({ error: 'Session expired. Please login again.' });
      });
    }

    req.session.lastActivity = now;
    persistAuthCookie(req, res);
  }
  next();
});

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    // Session fingerprint check — detect token theft
    if (req.session.uaHash) {
      const currentUaHash = getUaHash(req);
      if (currentUaHash !== req.session.uaHash) {
        return clearAllAuthState(req, res, () => {
          return res.status(401).json({ error: 'Session invalid. Please login again.' });
        });
      }
    }
    next();
  } else {
    res.status(401).sendFile(path.join(__dirname, '../web/login.html'));
  }
};

// Login endpoint - validate BC Self-Serve credentials
app.post('/api/login', loginLimiter, async (req, res) => {
  let { username, password, rememberMe } = req.body;
  let usedLocalEnvFallback = false;

  // Input validation
  if (username && (typeof username !== 'string' || username.length > 200)) {
    return res.status(400).json({ success: false, error: 'Invalid credentials' });
  }
  if (password && (typeof password !== 'string' || password.length > 200)) {
    return res.status(400).json({ success: false, error: 'Invalid credentials' });
  }
  if (username) username = username.trim();
  if (password) password = password.trim();

  // Local-only convenience: allow empty login to use .env credentials
  if ((!username || !password) && !process.env.VERCEL) {
    username = process.env.BCEID_USERNAME;
    password = process.env.BCEID_PASSWORD;
    usedLocalEnvFallback = !!(username && password);
  }

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password required'
    });
  }

  try {
    if (!process.env.VERCEL && !usedLocalEnvFallback) {
      // Local dev: if creds match .env, skip live validation
      const envUser = process.env.BCEID_USERNAME;
      const envPass = process.env.BCEID_PASSWORD;
      if (envUser && envPass && username === envUser && password === envPass) {
        log('[LOGIN] Local: Credentials match .env, skipping live validation');
      } else {
        log('[LOGIN] Local: Validating credentials with BC Self-Serve...');
        const result = await attemptBCLogin(username, password);
        if (!result.success) {
          log('[LOGIN] Invalid credentials');
          return res.status(401).json({
            success: false,
            error: 'Invalid BC Self-Serve credentials'
          });
        }
      }
    } else if (!process.env.VERCEL && usedLocalEnvFallback) {
      log('[LOGIN] Local: Using .env credentials fallback (no live validation)');
    } else {
      log('[LOGIN] Vercel: Using submitted credentials (session-scoped)');
    }

    // Store encrypted credentials in session
    req.session.authenticated = true;
    req.session.bceidUsername = username;
    req.session.bceidPassword = encrypt(password);
    const userId = crypto.createHash('sha256').update(username).digest('hex').slice(0, 16);
    req.session.userId = userId;
    req.session.lastActivity = Date.now();
    req.session.uaHash = getUaHash(req);

    // If "Remember Me" checked, extend session to 30 days
    if (rememberMe) {
      req.session.cookie.maxAge = REMEMBER_ME_MAX_AGE_MS;
      log('[LOGIN] Remember Me enabled - session extended to 30 days');
    } else {
      req.session.cookie.maxAge = DEFAULT_SESSION_MAX_AGE_MS;
    }

    req.session.save((saveError) => {
      if (saveError) {
        console.error('[LOGIN] Session save error:', saveError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create session. Please try again.'
        });
      }
      persistAuthCookie(req, res);
      log('[LOGIN] Login successful');
      res.json({ success: true });
    });
  } catch (error) {
    console.error('[LOGIN] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Login validation failed'
    });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  clearAllAuthState(req, res, (error) => {
    if (error) {
      console.error('[LOGOUT] Session destroy error:', error);
      return res.status(500).json({ success: false, error: 'Logout failed. Please retry.' });
    }
    res.json({ success: true });
  });
});

// Get current user info
app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    username: req.session.bceidUsername || 'User'
  });
});

let lastCheckResult = null;
let isChecking = false;

// Benefits screener (public, no auth)
app.get('/screen', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/screen.html'));
});

// Public info summary endpoint — reads from Blob cache (auth required)
app.get('/api/info', requireAuth, async (req, res) => {
  try {
    const userId = req.session?.userId;
    let data = null;

    if (process.env.VERCEL) {
      if (!userId) return res.status(401).json({ error: 'Missing user session' });
      try {
        const { list } = require('@vercel/blob');
        const prefix = `tally-cache/${userId}/`;
        const { blobs } = await list({ prefix });
        if (blobs && blobs.length > 0) {
          const targetBlob = blobs.find(b => b.pathname === `${prefix}results.json`) || blobs[0];
          const response = await fetch(targetBlob.url);
          data = (await response.json()).data || await response.json();
        }
      } catch (err) {
        log('[INFO] Blob read failed:', err.message);
      }
    }

    // Local: use in-memory or file fallback
    if (!data && lastCheckResult && lastCheckResult.success) {
      data = lastCheckResult;
    }

    if (!data) {
      const dataDir = path.join(__dirname, '../data');
      try {
        const files = fs.readdirSync(dataDir)
          .filter(f => f.startsWith('results-') && f.endsWith('.json'))
          .map(f => ({ name: f, path: path.join(dataDir, f), time: fs.statSync(path.join(dataDir, f)).mtime.getTime() }))
          .sort((a, b) => b.time - a.time);
        for (const file of files) {
          const d = JSON.parse(fs.readFileSync(file.path, 'utf8'));
          if (!hasErrors(d)) { data = d; break; }
        }
      } catch (_) {}
    }

    if (!data || !data.sections) {
      return res.status(404).json({ error: 'No cached data available. Run a scrape first.' });
    }

    // Extract payment info
    const paymentSection = data.sections['Payment Info'];
    let nextAmount = null;
    let nextDate = null;

    if (paymentSection && paymentSection.tableData) {
      for (const row of paymentSection.tableData) {
        const amtMatch = row.match(/Amount:\s*(\$[\d,]+\.\d{2})/i);
        if (amtMatch) nextAmount = amtMatch[1];
        const dateMatch = row.match(/(\d{4}\s*\/\s*[A-Z]{3}\s*\/\s*\d{2})/);
        if (dateMatch && !nextDate) nextDate = dateMatch[1];
      }
      // Also check allText for date
      if (!nextDate && paymentSection.allText) {
        for (const line of paymentSection.allText) {
          const m = line.match(/(\d{4}\s*\/\s*[A-Z]{3}\s*\/\s*\d{2})/);
          if (m) { nextDate = m[1]; break; }
        }
      }
    }

    // Extract message count
    const messagesSection = data.sections['Messages'];
    const unreadCount = messagesSection && messagesSection.allText
      ? messagesSection.allText.filter(msg => msg.match(/^\d{4}\s*\/\s*[A-Z]{3}\s*\/\s*\d{2}/)).length
      : 0;

    // Extract active benefits from payment section
    const activeBenefits = [];
    if (paymentSection && paymentSection.allText) {
      for (const line of paymentSection.allText) {
        if (line.match(/income assistance/i)) activeBenefits.push('Income Assistance');
        if (line.match(/disability/i)) activeBenefits.push('Disability Assistance');
      }
    }
    if (activeBenefits.length === 0) activeBenefits.push('Income Assistance');

    // Extract monthly reports
    const reportsSection = data.sections['Monthly Reports'];
    let monthlyReports = null;
    if (reportsSection && reportsSection.success) {
      monthlyReports = {
        periods: reportsSection.periods || [],
        statuses: reportsSection.statuses || [],
        reportCount: (reportsSection.reportLinks || []).length,
        hasDetail: !!reportsSection.detailData
      };
    }

    res.set('Cache-Control', 'private, max-age=300');
    res.json({
      nextPayment: {
        amount: nextAmount || 'Unknown',
        date: nextDate || 'Unknown'
      },
      unreadMessages: unreadCount,
      activeBenefits: [...new Set(activeBenefits)],
      monthlyReports,
      lastUpdated: data.timestamp || data.checkedAt || new Date().toISOString()
    });
  } catch (error) {
    console.error('[INFO] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Root: auto-login on localhost if .env creds available, otherwise landing/login
app.get('/', async (req, res) => {
  // Already authenticated
  if (req.session && req.session.authenticated) {
    return res.redirect('/app');
  }

  // Local dev: auto-authenticate with .env credentials (skip browser validation)
  if (!process.env.VERCEL) {
    const username = process.env.BCEID_USERNAME;
    const password = process.env.BCEID_PASSWORD;
    if (username && password) {
      req.session.authenticated = true;
      req.session.bceidUsername = username;
      req.session.bceidPassword = encrypt(password);
      req.session.userId = crypto.createHash('sha256').update(username).digest('hex').slice(0, 16);
      req.session.lastActivity = Date.now();
      req.session.uaHash = getUaHash(req);
      req.session.cookie.maxAge = DEFAULT_SESSION_MAX_AGE_MS;
      log('[AUTO-LOGIN] Local dev: authenticated with .env credentials');
      return req.session.save((saveError) => {
        if (saveError) {
          console.error('[AUTO-LOGIN] Session save error:', saveError);
          return res.redirect('/login.html');
        }
        persistAuthCookie(req, res);
        return res.redirect('/app');
      });
    }
  }

  return res.redirect('/login.html');
});

// Serve dashboard (require login)
app.get('/app', async (req, res) => {
  if (!req.session || !req.session.authenticated) {
    return res.redirect('/login.html');
  }
  res.sendFile(path.join(__dirname, '../web/unified.html'));
});

// Serve static files AFTER route handlers (prevents index.html from bypassing auth)
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use(express.static(path.join(__dirname, '../web'), {
  index: false, // Don't serve index.html as default
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('/api', requireAuth, (req, res) => {
  res.json({
    status: 'ok',
    message: 'BC Self-Serve Scraper API',
    description: 'Scrapes all sections: Notifications, Messages, Payment Info, Service Requests',
    endpoints: {
      '/': 'Dashboard UI',
      '/api': 'API info',
      '/api/login': 'Login (POST)',
      '/api/logout': 'Logout (POST)',
      '/api/check': 'Trigger a new scrape of all sections',
      '/api/status': 'Get last check results',
      '/api/latest': 'Get latest results file',
      '/api/health': 'Health check'
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Summary endpoint for OpenClaw integration
app.get('/api/summary', async (req, res) => {
  try {
    // Check for API token (optional - for security)
    const apiToken = req.headers['x-api-token'] || req.query.token;
    const expectedToken = process.env.API_TOKEN;

    if (!expectedToken) {
      return res.status(503).json({ error: 'API token not configured on server' });
    }

    if (apiToken !== expectedToken) {
      return res.status(401).json({ error: 'Invalid API token' });
    }

    // Get latest data (same logic as /api/latest but simplified)
    let data = null;

    // Try Vercel Blob first
    if (process.env.VERCEL) {
      try {
        const { list } = require('@vercel/blob');
        const { blobs } = await list({ prefix: 'chequecheck-cache/results.json' });
        if (blobs && blobs.length > 0) {
          const response = await fetch(blobs[0].url);
          data = await response.json();
        }
      } catch (err) {
        log('[SUMMARY] Blob read failed:', err.message);
      }
    }

    // Fallback to local files
    if (!data) {
      const dataDir = path.join(__dirname, '../data');
      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('results-') && f.endsWith('.json'))
        .map(f => ({
          name: f,
          path: path.join(dataDir, f),
          time: fs.statSync(path.join(dataDir, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 0) {
        data = JSON.parse(fs.readFileSync(files[0].path, 'utf8'));
      }
    }

    if (!data || !data.sections) {
      return res.status(404).json({ error: 'No data available' });
    }

    // Extract payment info
    const paymentSection = data.sections['Payment Info'];
    let totalPayment = null;
    let supportAmount = null;
    let shelterAmount = null;

    if (paymentSection && paymentSection.tableData) {
      const totalRow = paymentSection.tableData.find(row => row.includes('Amount:'));
      if (totalRow) {
        const match = totalRow.match(/\$[\d,]+\.\d{2}/);
        if (match) totalPayment = match[0];
      }

      paymentSection.tableData.forEach(row => {
        if (row.includes('Support')) {
          const match = row.match(/\$[\d,]+\.\d{2}/);
          if (match) supportAmount = match[0];
        }
        if (row.includes('SHELTER')) {
          const match = row.match(/\$[\d,]+\.\d{2}/);
          if (match) shelterAmount = match[0];
        }
      });
    }

    // Extract messages count
    const messagesSection = data.sections.Messages;
    const messageCount = messagesSection && messagesSection.allText
      ? messagesSection.allText.filter(msg =>
          msg.match(/^\d{4} \/ [A-Z]{3} \/ \d{2}/)
        ).length
      : 0;

    // Extract notifications
    const notificationsSection = data.sections.Notifications;
    const hasNotifications = notificationsSection && notificationsSection.allText
      ? notificationsSection.allText.some(n => !n.includes('no notifications'))
      : false;

    // Extract service requests count
    const requestsSection = data.sections['Service Requests'];
    const requestCount = requestsSection && requestsSection.allText
      ? requestsSection.allText.filter(r => r.match(/^\d{4} \/ [A-Z]{3} \/ \d{2}/)).length
      : 0;

    // Build clean response
    const summary = {
      payment: {
        total: totalPayment,
        support: supportAmount,
        shelter: shelterAmount
      },
      counts: {
        messages: messageCount,
        notifications: hasNotifications ? 1 : 0,
        requests: requestCount
      },
      lastUpdated: data.timestamp,
      status: 'ok'
    };

    res.json(summary);
  } catch (error) {
    console.error('[SUMMARY] Error:', error);
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/latest', requireAuth, async (req, res) => {
  try {
    log('[API] /api/latest called');
    const userId = req.session?.userId;

    // On Vercel: try to read from Blob first
    if (process.env.VERCEL) {
      if (!userId) {
        return res.status(401).json({ error: 'Missing user session' });
      }

      try {
        const { list } = require('@vercel/blob');
        const prefix = `tally-cache/${userId}/`;
        const { blobs } = await list({ prefix });

        if (blobs && blobs.length > 0) {
          const targetBlob = blobs.find((b) => b.pathname === `${prefix}results.json`) || blobs[0];
          const blobUrl = targetBlob.url;
          const response = await fetch(blobUrl);
          const data = await response.json();

          log(`[API] Returning data from Vercel Blob: ${targetBlob.pathname}`);
          return res.json({ file: 'vercel-blob', data });
        }

        return res.status(404).json({
          cached: false,
          message: 'No cached results for this user. Run a scrape and upload first.',
        });
      } catch (blobError) {
        log('[API] Blob read failed:', blobError.message);
        return res.status(500).json({
          cached: false,
          error: 'Failed to read user cache from Blob',
          details: blobError.message,
          message: 'Check BLOB_READ_WRITE_TOKEN and ensure user-scoped cache exists.',
        });
      }
    }

    // Return in-memory result if it's good data
    if (lastCheckResult && lastCheckResult.success && !hasErrors(lastCheckResult)) {
      log('[API] Returning cached in-memory result');
      return res.json({ file: 'in-memory', data: lastCheckResult });
    }

    // If in-memory data has errors, log it
    if (lastCheckResult && hasErrors(lastCheckResult)) {
      log('[API] WARNING: In-memory result has errors, falling back to file');
    }

    // Fall back to latest GOOD results file on disk (local dev only)
    const dataDir = path.join(__dirname, '../data');
    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(dataDir, f),
        time: fs.statSync(path.join(dataDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    // Find first file without errors
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(file.path, 'utf8'));
        if (!hasErrors(data)) {
          log(`[API] Returning good file: ${file.name}`);
          return res.json({ file: file.name, data });
        } else {
          log(`[API] Skipping ${file.name} (has errors)`);
        }
      } catch (e) {
        log(`[API] Failed to read ${file.name}:`, e.message);
      }
    }

    // No good files found, fall back to sample data
    const samplePath = path.join(dataDir, 'sample-data.json');
    if (fs.existsSync(samplePath)) {
      const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
      log('[API] No good results, returning sample-data.json');
      return res.json({ file: 'sample-data.json', data });
    }

    // No data found anywhere - return demo data
    log('[API] No data found, returning hardcoded demo data');
    const sampleData = {
      success: true,
      timestamp: new Date().toISOString(),
      sections: {
        "Payment Info": {
          success: true,
          allText: ["Demo payment information"],
          tableData: [
            "Assistance",
            "Support | $560.00 | ",
            "SHELTER: RENT | $500.00 | ",
            "Paid to: Demo User | Payment Method: CHEQUE",
            "Amount: $1060.00 | Name of Bank: Demo Bank",
            "Cheque Number: 12345678 | Bank Account Number: ********",
            "Payment Distribution: OFFICE | Bank Account Name: Joshua Trommel"
          ],
          keywords: ["Payment", "Assistance"],
          pageTitle: "Payment Information"
        },
        "Messages": {
          success: true,
          allText: [
            "2026 / JAN / 21\nSample Message 1",
            "2026 / JAN / 06\nSample Message 2",
            "2026 / JAN / 05\nSample Message 3"
          ],
          tableData: [],
          keywords: ["Messages"],
          pageTitle: "Messages"
        },
        "Notifications": {
          success: true,
          allText: ["Sample notification - Scrape locally to see real data"],
          tableData: [],
          keywords: ["Notifications"],
          pageTitle: "Notifications"
        },
        "Service Requests": {
          success: true,
          allText: ["Sample Service Request"],
          tableData: ["1-12345678 | Shelter Update\nCreated for Joshua Trommel\n2026 / JAN / 08 | Closed"],
          keywords: ["Service Requests"],
          pageTitle: "Service Requests"
        }
      }
    };
    return res.json({ file: 'demo-data (hardcoded)', data: sampleData });
  } catch (error) {
    console.error('[API] /api/latest error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to check if scraped data has errors
function hasErrors(data) {
  if (!data || !data.sections) return true;
  const sections = Object.values(data.sections);
  return sections.some(section => section && section.error);
}

app.get('/api/status', requireAuth, (req, res) => {
  if (!lastCheckResult) {
    return res.json({
      checked: false,
      message: 'No checks performed yet. Use /check to run a check.'
    });
  }

  res.json(lastCheckResult);
});

// DTC Eligibility Screener endpoint
app.post('/api/dtc/screen', (req, res) => {
  const { answers } = req.body;

  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Missing or invalid answers' });
  }

  try {
    const results = calculateDTCEligibility(answers);
    res.json(results);
  } catch (err) {
    console.error('[API] DTC screening error:', err);
    res.status(500).json({ error: 'Failed to calculate eligibility' });
  }
});

function calculateDTCEligibility(answers) {
  let dtcScore = 0;
  let pwdScore = 0;
  let flags = [];
  let programs = [];

  // Q1: Has diagnosis
  if (answers.q1 === 'yes') { dtcScore += 20; pwdScore += 20; }
  else { flags.push({ type: 'warning', text: 'A formal diagnosis is typically required.' }); }

  // Q2: Condition type
  const conditions = answers.q2 || [];
  if (conditions.includes('autism')) {
    dtcScore += 15; pwdScore += 15;
    flags.push({ type: 'info', text: 'Autism is commonly approved for DTC under "Mental Functions." Late diagnosis does not affect eligibility.' });
  }
  if (conditions.includes('adhd')) { dtcScore += 10; }
  if (conditions.includes('physical') || conditions.includes('vision') || conditions.includes('hearing')) { dtcScore += 15; pwdScore += 15; }

  // Q3: Duration
  if (answers.q3 === 'yes') { dtcScore += 15; pwdScore += 15; }
  else { dtcScore -= 30; pwdScore -= 30; flags.push({ type: 'warning', text: 'DTC requires impairment lasting at least 12 continuous months.' }); }

  // Q4: Province
  if (answers.q4 === 'BC') {
    pwdScore += 10;
    programs.push({ name: 'BC PWD Designation', description: 'Higher monthly assistance ($1,358.50/mo), extended health benefits, bus pass.', eligible: pwdScore > 30 });
  }

  // Q5: Daily activity impact
  if (answers.q5 === 'yes') { dtcScore += 15; pwdScore += 15; }
  else { dtcScore -= 20; }

  // Q6: Specific activities
  const activities = answers.q6 || [];
  if (activities.length >= 4) { dtcScore += 15; pwdScore += 10; }
  else if (activities.length >= 2) { dtcScore += 10; pwdScore += 5; }

  // Q7: Time taken
  if (answers.q7 === 'always') dtcScore += 15;
  else if (answers.q7 === 'usually') dtcScore += 10;
  else if (answers.q7 === 'sometimes') dtcScore += 5;

  // Q8: Need for help
  if (answers.q8 === 'always') { dtcScore += 15; pwdScore += 10; }
  else if (answers.q8 === 'frequently') { dtcScore += 10; pwdScore += 5; }
  else if (answers.q8 === 'occasionally') dtcScore += 5;

  // Q11: Diagnosis timing → retroactive years
  let retroYears = 0;
  const timingMap = { childhood: 10, '10+': 10, '5-10': 7, '3-5': 4, '1-3': 2, recent: 1 };
  retroYears = timingMap[answers.q11] || 0;

  // Calculate refund estimate
  let minRefund = 0, maxRefund = 0;
  dtcScore = Math.max(0, Math.min(100, dtcScore));
  pwdScore = Math.max(0, Math.min(100, pwdScore));

  if (dtcScore > 50 && answers.q10 === 'yes') {
    minRefund = Math.min(retroYears, 10) * 1500;
    maxRefund = Math.min(retroYears, 10) * 2500;
    if (answers.q11 === 'childhood' || answers.q11 === '10+') maxRefund = 25000;
  }

  // DTC program
  programs.unshift({
    name: 'Disability Tax Credit (T2201)',
    description: 'Federal non-refundable tax credit. Can claim retroactively up to 10 years.',
    eligible: dtcScore > 50
  });

  // RDSP
  const existing = answers.q12 || [];
  if (!existing.includes('rdsp') && dtcScore > 50) {
    programs.push({ name: 'RDSP', description: 'Government matches savings up to $3,500/year. Requires DTC approval.', eligible: true });
  }

  const dtcEligibility = dtcScore >= 70 ? 'Likely' : dtcScore >= 50 ? 'Possible' : dtcScore >= 30 ? 'Unlikely' : 'No';
  const pwdEligibility = answers.q4 === 'BC' ? (pwdScore >= 60 ? 'Likely' : pwdScore >= 40 ? 'Possible' : 'Unlikely') : 'N/A (BC only)';

  // Next steps
  const nextSteps = [];
  if (answers.q11 === 'not_yet') nextSteps.push({ priority: 1, title: 'Get a Formal Diagnosis', description: 'Book an assessment with a psychologist or psychiatrist.', action: 'Search for diagnostic assessments in your area' });
  if (dtcScore > 40 && !existing.includes('dtc')) nextSteps.push({ priority: 2, title: 'Apply for the DTC', description: 'Download Form T2201 from CRA. Have your doctor complete Part B.', action: 'Download T2201 form' });
  if (answers.q4 === 'BC' && pwdScore > 30 && !existing.includes('pwd')) nextSteps.push({ priority: 3, title: 'Apply for BC PWD', description: 'Contact your Employment and Assistance Worker.', action: 'Call 1-866-866-0800' });
  if (answers.q9 === 'no') nextSteps.push({ priority: 1, title: 'File Your Tax Returns', description: 'File returns for past years to receive DTC refunds.', action: 'File through CRA My Account' });
  nextSteps.push({ priority: 5, title: 'Document Daily Limitations', description: 'Write specific examples of how your condition affects daily activities.', action: 'Start a daily impact journal' });
  nextSteps.sort((a, b) => a.priority - b.priority);

  return {
    dtc: { score: dtcScore, eligibility: dtcEligibility, estimatedRefund: { min: minRefund, max: maxRefund }, retroYears },
    pwd: { score: pwdScore, eligibility: pwdEligibility, monthlyIncrease: answers.q4 === 'BC' ? '$423.50/mo' : 'N/A' },
    programs, flags, nextSteps
  };
}

// Dev-only: serve .env submission credentials for auto-fill
app.get('/api/submit-creds', requireAuth, (req, res) => {
  if (process.env.VERCEL) return res.json({});
  res.json({
    sin: process.env.BC_SIN || '',
    phone: process.env.BC_PHONE || '',
    pin: process.env.BC_PIN || ''
  });
});

// Submit monthly report
let isSubmitting = false;
app.post('/api/submit-report', requireAuth, async (req, res) => {
  if (isSubmitting) {
    return res.status(429).json({ error: 'Submission already in progress' });
  }
  isSubmitting = true;

  try {
    const { sin, phone, pin, dryRun } = req.body || {};

    // Resolve values: body > .env fallback
    const resolvedSin = sin || process.env.BC_SIN;
    const resolvedPhone = phone || process.env.BC_PHONE;
    const resolvedPin = pin || process.env.BC_PIN;

    if (!resolvedSin || !resolvedPhone || !resolvedPin) {
      isSubmitting = false;
      return res.status(400).json({ error: 'SIN, phone, and PIN are required' });
    }

    // Get login credentials from session
    let username, password;
    if (req.session && req.session.authenticated) {
      username = req.session.bceidUsername;
      password = decrypt(req.session.bceidPassword);
    } else if (!process.env.VERCEL) {
      username = process.env.BCEID_USERNAME;
      password = process.env.BCEID_PASSWORD;
    }

    if (!username || !password) {
      isSubmitting = false;
      return res.status(401).json({ error: 'No login credentials available' });
    }

    const result = await runSubmitMonthlyReport({
      username,
      password,
      sin: resolvedSin,
      phone: resolvedPhone,
      pin: resolvedPin,
      dryRun: !!dryRun,
      headless: true
    });

    isSubmitting = false;
    res.json(result);
  } catch (error) {
    isSubmitting = false;
    console.error('[API] submit-report error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/check', requireAuth, async (req, res) => {
  if (isChecking) {
    return res.status(429).json({
      error: 'Check already in progress',
      message: 'Please wait for the current check to complete'
    });
  }

  isChecking = true;

  try {
    log('[API] Starting check for all sections...');

    let username;
    let password;

    if (process.env.VERCEL) {
      // Production: only use credentials supplied at login and stored in session.
      if (!req.session || !req.session.authenticated) {
        return res.status(401).json({ error: 'Not authenticated. Please login first.' });
      }
      username = req.session.bceidUsername;
      password = decrypt(req.session.bceidPassword);
      if (!username || !password) {
        return res.status(400).json({ error: 'Missing login credentials in session. Please login again.' });
      }
    } else if (req.session && req.session.authenticated) {
      // Local: authenticated session takes priority.
      username = req.session.bceidUsername;
      password = decrypt(req.session.bceidPassword);
    } else {
      // Local-only fallback for quick testing.
      username = process.env.BCEID_USERNAME;
      password = process.env.BCEID_PASSWORD;
      if (!username || !password) {
        return res.status(400).json({ error: 'Missing local .env credentials' });
      }
    }

    const result = await checkAllSections({
      headless: true,
      username: username,
      password: password
    });

    lastCheckResult = {
      ...result,
      checkedAt: new Date().toISOString()
    };

    if (!result || !result.success) {
      isChecking = false;
      const scrapeError = (result && result.error) ? result.error : 'Scrape failed';
      console.error('[API] Scrape failed:', scrapeError);
      return res.status(502).json({
        success: false,
        error: scrapeError,
        data: lastCheckResult
      });
    }

    if (process.env.VERCEL && req.session?.userId && result && result.success) {
      try {
        const { put } = require('@vercel/blob');
        const blobPath = `tally-cache/${req.session.userId}/results.json`;
        await put(blobPath, JSON.stringify(lastCheckResult), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false
        });
        log(`[API] Saved scrape result to Blob: ${blobPath}`);
      } catch (blobWriteError) {
        console.error('[API] Failed to write scrape result to Blob:', blobWriteError.message);
      }
    }

    isChecking = false;

    res.json({
      success: true,
      data: lastCheckResult
    });
  } catch (error) {
    isChecking = false;

    const errorResult = {
      success: false,
      error: error.message,
      checkedAt: new Date().toISOString()
    };

    lastCheckResult = errorResult;

    res.status(500).json(errorResult);
  }
});

// 404 handler — must be last
app.use((req, res) => {
  res.status(404).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>404 — Tally</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0c1220; color: #e8e4da; font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .wrap { text-align: center; }
    h1 { font-size: 5rem; color: #4e9cd7; font-weight: 700; letter-spacing: -0.04em; }
    p { color: #8a9e90; margin: 1rem 0 2rem; font-size: 1rem; }
    a { display: inline-block; padding: 0.6rem 1.6rem; background: #1a5a96; color: #e8e4da; text-decoration: none; border-radius: 100px; font-size: 0.9rem; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s; }
    a:hover { background: #2472b2; transform: translateY(-2px); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>404</h1>
    <p>Page not found.</p>
    <a href="/">Go home</a>
  </div>
</body>
</html>`);
});

// Vercel: export the Express app as a serverless function
// Local: start the server
const isServerlessRuntime = !!process.env.LAMBDA_TASK_ROOT;
if (isServerlessRuntime) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    log(`[API] Server running on http://localhost:${PORT}`);
    log(`[API] Endpoints:`);
    log(`  GET /                - Dashboard`);
    log(`  POST /api/login      - Login`);
    log(`  GET /api/check       - Run scraper`);
    log(`  GET /api/latest      - Get latest data`);
    log(`  GET /api/status      - Get scrape status`);
    log(`  GET /api/health      - Health check`);
    log(`[API] Dashboard will load data from latest good file`);
  });
}
