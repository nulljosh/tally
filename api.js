const express = require('express');
const cors = require('cors');
const { checkPaymentStatus } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

let lastCheckResult = null;
let isChecking = false;

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'BC Self-Serve Payment Checker API',
    endpoints: {
      '/check': 'Trigger a new payment check',
      '/status': 'Get last check results',
      '/health': 'Health check'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/status', (req, res) => {
  if (!lastCheckResult) {
    return res.json({
      checked: false,
      message: 'No checks performed yet. Use /check to run a check.'
    });
  }

  res.json(lastCheckResult);
});

app.get('/check', async (req, res) => {
  if (isChecking) {
    return res.status(429).json({
      error: 'Check already in progress',
      message: 'Please wait for the current check to complete'
    });
  }

  isChecking = true;

  try {
    console.log('[API] Starting payment check...');
    const result = await checkPaymentStatus();

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
