const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { checkAllSections } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve static files (dashboard, results, screenshots)
app.use(express.static(__dirname));

let lastCheckResult = null;
let isChecking = false;

app.get('/api', (req, res) => {
  res.json({
    status: 'ok',
    message: 'BC Self-Serve Scraper API',
    description: 'Scrapes all sections: Notifications, Messages, Payment Info, Service Requests',
    endpoints: {
      '/': 'Dashboard UI',
      '/api': 'API info',
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

app.get('/api/latest', (req, res) => {
  try {
    // Find latest results file
    const files = fs.readdirSync(__dirname)
      .filter(f => f.startsWith('results-') && f.endsWith('.json'))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(__dirname, f)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time);

    if (files.length === 0) {
      return res.status(404).json({ error: 'No results files found. Run the scraper first.' });
    }

    const latestFile = files[0].name;
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, latestFile), 'utf8'));

    res.json({
      file: latestFile,
      data: data
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', (req, res) => {
  if (!lastCheckResult) {
    return res.json({
      checked: false,
      message: 'No checks performed yet. Use /check to run a check.'
    });
  }

  res.json(lastCheckResult);
});

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
