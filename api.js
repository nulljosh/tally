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
    res.status(401).sendFile(path.join(__dirname, 'login.html'));
  }
};

// Login endpoint
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

// Serve static files (dashboard, results, screenshots) - protected
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    // Allow login.html to be accessed without auth
    if (filePath.endsWith('login.html')) {
      return;
    }
  }
}));

let lastCheckResult = null;
let isChecking = false;

// Serve dashboard or login page
app.get('/', (req, res) => {
  if (req.session.authenticated) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.sendFile(path.join(__dirname, 'login.html'));
  }
});

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

app.get('/api/latest', requireAuth, (req, res) => {
  const errors = [];

  try {
    // Try multiple methods to load data (Vercel serverless is picky about file paths)
    const filenames = ['sample-data.json', 'results-2026-01-16T23-06-39-292Z.json'];
    let data = null;

    for (const filename of filenames) {
      // Method 1: Try require()
      try {
        data = require('./' + filename);
        return res.json({ file: filename, data: data, method: 'require' });
      } catch (e) {
        errors.push(`require(./${filename}): ${e.message}`);
      }

      // Method 2: Try readFileSync with __dirname
      try {
        data = JSON.parse(fs.readFileSync(path.join(__dirname, filename), 'utf8'));
        return res.json({ file: filename, data: data, method: '__dirname' });
      } catch (e) {
        errors.push(`readFileSync(__dirname/${filename}): ${e.message}`);
      }

      // Method 3: Try process.cwd()
      try {
        data = JSON.parse(fs.readFileSync(path.join(process.cwd(), filename), 'utf8'));
        return res.json({ file: filename, data: data, method: 'cwd' });
      } catch (e) {
        errors.push(`readFileSync(cwd/${filename}): ${e.message}`);
      }
    }

    // If all methods failed, return debug info
    return res.status(500).json({
      error: 'Could not load data file',
      attempts: errors,
      __dirname: __dirname,
      cwd: process.cwd(),
      files: fs.readdirSync(__dirname).filter(f => f.includes('json'))
    });

  } catch (error) {
    res.status(500).json({
      error: error.message,
      stack: error.stack,
      attempts: errors
    });
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

app.get('/api/check', requireAuth, async (req, res) => {
  if (isChecking) {
    return res.status(429).json({
      error: 'Check already in progress',
      message: 'Please wait for the current check to complete'
    });
  }

  isChecking = true;

  try {
    console.log('[API] Starting check for all sections...');
    const result = await checkAllSections({ headless: true });

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

app.listen(PORT, () => {
  console.log(`[API] Server running on http://localhost:${PORT}`);
  console.log(`[API] Endpoints:`);
  console.log(`  GET /check  - Run payment check`);
  console.log(`  GET /status - Get last results`);
  console.log(`  GET /health - Health check`);
});
