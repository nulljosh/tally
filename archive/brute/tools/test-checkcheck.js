#!/usr/bin/env node

/**
 * CheckCheck Bruteforce Test Case
 * Educational pentesting exercise - testing own application
 *
 * Tests:
 * - Rate limiting effectiveness (5 attempts per 15 min)
 * - Login endpoint security
 * - Password pattern analysis
 *
 * AUTHORIZATION: Testing own application (checkcheck) on localhost
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const TARGET_URL = 'http://localhost:3000';
const USERNAME = 'joshuatrommel';
const WORDLIST_PATH = path.join(__dirname, '../wordlists/top-100.txt');
const LOG_FILE = path.join(__dirname, '../logs/test-checkcheck.log');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Clear previous log
fs.writeFileSync(LOG_FILE, `=== CheckCheck Bruteforce Test ===\n`);
fs.appendFileSync(LOG_FILE, `Started: ${new Date().toISOString()}\n`);
fs.appendFileSync(LOG_FILE, `Target: ${TARGET_URL}\n`);
fs.appendFileSync(LOG_FILE, `Username: ${USERNAME}\n\n`);

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

async function attemptLogin(username, password, attemptNumber) {
  log(`\n--- Attempt ${attemptNumber} ---`);
  log(`Testing password: ${password.substring(0, 10)}...`);

  try {
    const response = await fetch(`${TARGET_URL}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const status = response.status;
    const data = await response.json().catch(() => ({}));

    log(`Response status: ${status}`);
    log(`Response data: ${JSON.stringify(data)}`);

    if (status === 200) {
      log(`SUCCESS: Password found: ${password}`);
      return { success: true, password };
    } else if (status === 429) {
      log(`RATE LIMITED: Too many attempts`);
      return { rateLimited: true };
    } else if (status === 401) {
      log(`FAILED: Invalid credentials`);
      return { success: false };
    } else {
      log(`UNKNOWN: Unexpected status ${status}`);
      return { success: false };
    }
  } catch (error) {
    log(`ERROR: ${error.message}`);
    return { error: true, message: error.message };
  }
}

async function runTest() {
  log('Loading wordlist...');

  if (!fs.existsSync(WORDLIST_PATH)) {
    log(`ERROR: Wordlist not found at ${WORDLIST_PATH}`);
    return;
  }

  const passwords = fs.readFileSync(WORDLIST_PATH, 'utf8')
    .split('\n')
    .map(p => p.trim())
    .filter(p => p.length > 0);

  log(`Loaded ${passwords.length} passwords from wordlist`);
  log(`Testing first 5 passwords (rate limit protection)`);
  log('');

  for (let i = 0; i < Math.min(5, passwords.length); i++) {
    const result = await attemptLogin(USERNAME, passwords[i], i + 1);

    if (result.success) {
      log('\n=== TEST COMPLETE: Password found ===');
      log(`Attempts: ${i + 1}`);
      log(`Password: ${result.password}`);
      break;
    }

    if (result.rateLimited) {
      log('\n=== RATE LIMIT TRIGGERED ===');
      log(`Rate limiting is working correctly`);
      log(`Stopped after ${i + 1} attempts`);
      break;
    }

    // Small delay between attempts
    if (i < Math.min(5, passwords.length) - 1) {
      log('Waiting 1 second before next attempt...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  log('\n=== Test Summary ===');
  log(`Total attempts: ${Math.min(5, passwords.length)}`);
  log(`Log saved to: ${LOG_FILE}`);
  log('');
}

// Run test
log('Starting CheckCheck bruteforce test...');
log('Target: Own application (localhost)');
log('Authorization: Owner of application\n');

runTest().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  log(error.stack);
});
