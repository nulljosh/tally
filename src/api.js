const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const { checkAllSections } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || 'hunter2';

app.use(cors());
app.use(express.json());
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET || 'selfserve-secret-key-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.authenticated) {
    next();
  } else {
    res.status(401).sendFile(path.join(__dirname, '../web/login.html'));
  }
};

// Login endpoint - simple password check
app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (password === DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
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

// Get default credentials from .env (for pre-filling login form)
app.get('/api/default-credentials', (req, res) => {
  res.json({
    username: process.env.BCEID_USERNAME || '',
    password: process.env.BCEID_PASSWORD || ''
  });
});

app.get('/api/latest', (req, res) => {
  try {
    // Return in-memory result first (from auto-scrape or manual check)
    if (lastCheckResult && lastCheckResult.success) {
      return res.json({ file: 'in-memory', data: lastCheckResult });
    }

    // On Vercel, no persistent disk — only in-memory results
    if (process.env.VERCEL) {
      if (lastCheckResult) {
        return res.json({ file: 'in-memory', data: lastCheckResult });
      }
      return res.status(404).json({ error: 'No results yet. Click "Check Now" to scrape.' });
    }

    // Fall back to latest results file on disk (local dev only)
    const dataDir = path.join(__dirname, '../data');
    const files = fs.readdirSync(dataDir)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(dataDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      // Fall back to sample-data.json if no results files exist
      const samplePath = path.join(dataDir, 'sample-data.json');
      if (fs.existsSync(samplePath)) {
        const data = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
        return res.json({ file: 'sample-data.json', data });
      }
      return res.status(404).json({ error: 'No results files found. Click "Check Now" to scrape.' });
    }

    const latestFile = files[0].name;
    const data = JSON.parse(fs.readFileSync(path.join(dataDir, latestFile), 'utf8'));

    res.json({
      file: latestFile,
      data: data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

    // Use session credentials if available, otherwise fall back to .env
    const username = req.session.username;
    const password = req.session.password;

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
// Local: start the server with auto-scrape
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`[API] Server running on http://localhost:${PORT}`);
    console.log(`[API] Endpoints:`);
    console.log(`  GET /check  - Run payment check`);
    console.log(`  GET /status - Get last results`);
    console.log(`  GET /health - Health check`);

    // Auto-scrape on startup so dashboard has data immediately
    console.log('[API] Starting auto-scrape...');
    isChecking = true;
    checkAllSections({ headless: true })
      .then(result => {
        lastCheckResult = { ...result, checkedAt: new Date().toISOString() };
        isChecking = false;
        console.log('[API] Auto-scrape complete — dashboard data ready');
      })
      .catch(error => {
        lastCheckResult = { success: false, error: error.message, checkedAt: new Date().toISOString() };
        isChecking = false;
        console.log('[API] Auto-scrape failed:', error.message);
      });
  });
}
