const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { checkAllSections } = require('./scraper');
const puppeteer = require('puppeteer-core');

const app = express();
const PORT = process.env.PORT || 3000;
const ENCRYPTION_KEY = process.env.SESSION_SECRET || 'selfserve-secret-key-change-me';

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
    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1920, height: 1080 },
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
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

app.use(cors());
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
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 2 * 60 * 60 * 1000 // 2 hours
  }
}));

// Session timeout middleware
app.use((req, res, next) => {
  if (req.session && req.session.authenticated) {
    const lastActivity = req.session.lastActivity || Date.now();
    const now = Date.now();
    const timeout = 60 * 60 * 1000; // 1 hour

    if (now - lastActivity > timeout) {
      req.session.destroy();
      return res.status(401).json({ error: 'Session expired' });
    }

    req.session.lastActivity = now;
  }
  next();
});

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).sendFile(path.join(__dirname, '../web/login.html'));
  }
};

// Login endpoint - validate BC Self-Serve credentials
app.post('/api/login', loginLimiter, async (req, res) => {
  let { username, password } = req.body;

  // Fall back to .env credentials if not provided
  username = username || process.env.BCEID_USERNAME;
  password = password || process.env.BCEID_PASSWORD;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password required (or configure .env file)'
    });
  }

  try {
    // Validate credentials by attempting actual BC Self-Serve login
    console.log('[LOGIN] Validating credentials...');
    const result = await attemptBCLogin(username, password);

    if (!result.success) {
      console.log('[LOGIN] Invalid credentials');
      return res.status(401).json({
        success: false,
        error: 'Invalid BC Self-Serve credentials'
      });
    }

    // Store encrypted credentials in session
    req.session.authenticated = true;
    req.session.bceidUsername = username;
    req.session.bceidPassword = encrypt(password);
    req.session.lastActivity = Date.now();

    console.log('[LOGIN] Login successful');
    res.json({ success: true });
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
  req.session.destroy();
  res.json({ success: true });
});

let lastCheckResult = null;
let isChecking = false;

// Serve dashboard directly (no login)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/unified.html'));
});

// Serve static files AFTER route handlers (prevents index.html from bypassing auth)
app.use('/data', express.static(path.join(__dirname, '../data')));
app.use(express.static(path.join(__dirname, '../web'), {
  index: false, // Don't serve index.html as default
  setHeaders: (res, filePath) => {
    // Allow specific files through
    if (filePath.endsWith('login.html')) {
      return;
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


app.get('/api/latest', requireAuth, async (req, res) => {
  try {
    console.log('[API] /api/latest called');

    // On Vercel: try to read from Blob first
    if (process.env.VERCEL) {
      try {
        const { list } = require('@vercel/blob');
        const { blobs } = await list({ prefix: 'claimcheck-cache/results.json' });

        if (blobs && blobs.length > 0) {
          const blobUrl = blobs[0].url;
          const response = await fetch(blobUrl);
          const data = await response.json();

          console.log('[API] Returning data from Vercel Blob');
          return res.json({ file: 'vercel-blob', data });
        }
      } catch (blobError) {
        console.log('[API] Blob read failed, falling back:', blobError.message);
      }
    }

    // Return in-memory result if it's good data
    if (lastCheckResult && lastCheckResult.success && !hasErrors(lastCheckResult)) {
      console.log('[API] Returning cached in-memory result');
      return res.json({ file: 'in-memory', data: lastCheckResult });
    }

    // If in-memory data has errors, log it
    if (lastCheckResult && hasErrors(lastCheckResult)) {
      console.log('[API] WARNING: In-memory result has errors, falling back to file');
    }

    // On Vercel, no persistent disk — only in-memory results
    if (process.env.VERCEL) {
      if (lastCheckResult && !hasErrors(lastCheckResult)) {
        return res.json({ file: 'in-memory', data: lastCheckResult });
      }
      return res.status(404).json({ error: 'No results yet. Click "Check Now" to scrape.' });
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
          console.log(`[API] Returning good file: ${file.name}`);
          return res.json({ file: file.name, data });
        } else {
          console.log(`[API] Skipping ${file.name} (has errors)`);
        }
      } catch (e) {
        console.log(`[API] Failed to read ${file.name}:`, e.message);
      }
    }

    // No good files found, fall back to sample data
    const samplePath = path.join(dataDir, 'sample-data.json');
    if (fs.existsSync(samplePath)) {
      const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
      console.log('[API] No good results, returning sample-data.json');
      return res.json({ file: 'sample-data.json', data });
    }

    console.log('[API] ERROR: No data files found at all');
    return res.status(404).json({ error: 'No results files found. Click "Check Now" to scrape.' });
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

app.get('/api/check', async (req, res) => {
  if (isChecking) {
    return res.status(429).json({
      error: 'Check already in progress',
      message: 'Please wait for the current check to complete'
    });
  }

  isChecking = true;

  try {
    console.log('[API] Starting check for all sections...');

    // Use session credentials if authenticated, otherwise fall back to .env
    let username = process.env.BCEID_USERNAME;
    let password = process.env.BCEID_PASSWORD;

    if (req.session && req.session.authenticated) {
      username = req.session.bceidUsername;
      password = decrypt(req.session.bceidPassword);
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

// Vercel: export the Express app as a serverless function
// Local: start the server
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`[API] Server running on http://localhost:${PORT}`);
    console.log(`[API] Endpoints:`);
    console.log(`  GET /                - Dashboard`);
    console.log(`  POST /api/login      - Login`);
    console.log(`  GET /api/check       - Run scraper`);
    console.log(`  GET /api/latest      - Get latest data`);
    console.log(`  GET /api/status      - Get scrape status`);
    console.log(`  GET /api/health      - Health check`);
    console.log(`[API] Dashboard will load data from latest good file`);
  });
}
