#!/usr/bin/env node
/**
 * Mock ASP.NET Login Server (Educational)
 * Simulates an old ASP.NET login page for brute force testing practice
 * Run: node mock-server.js
 * Target: http://localhost:8080/login
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const HOST = 'localhost';

// Mock credentials (for testing)
const VALID_CREDENTIALS = {
  'admin': 'password123',
  'ralph.wiggum': 'ilovecats',
  'testuser': 'Test1234',
  'bceid_user': 'Welcome2024'
};

// Rate limiting (simulate real-world defenses)
const loginAttempts = new Map(); // IP -> { count, firstAttempt }
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_ATTEMPTS = 5; // Max attempts per window

// Account lockout
const lockedAccounts = new Set();
const LOCKOUT_THRESHOLD = 10; // Lock after 10 failed attempts
const LOCKOUT_DURATION = 300000; // 5 minutes

// Request logging
const requestLog = [];

function logRequest(ip, username, password, success) {
  const entry = {
    timestamp: new Date().toISOString(),
    ip,
    username,
    password: password ? '***' : null,
    success,
    userAgent: null
  };
  requestLog.push(entry);

  // Keep last 1000 requests
  if (requestLog.length > 1000) {
    requestLog.shift();
  }
}

function checkRateLimit(ip) {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  if (!attempt) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Reset if window expired
  if (now - attempt.firstAttempt > RATE_LIMIT_WINDOW) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true;
  }

  // Check if rate limited
  if (attempt.count >= MAX_ATTEMPTS) {
    return false;
  }

  // Increment counter
  attempt.count++;
  return true;
}

function checkAccountLockout(username) {
  return !lockedAccounts.has(username);
}

function recordFailedAttempt(username) {
  const key = `failed_${username}`;
  const count = (loginAttempts.get(key) || 0) + 1;
  loginAttempts.set(key, count);

  if (count >= LOCKOUT_THRESHOLD) {
    lockedAccounts.add(username);
    console.log(`[LOCKOUT] Account locked: ${username} (${count} failed attempts)`);

    // Auto-unlock after duration
    setTimeout(() => {
      lockedAccounts.delete(username);
      loginAttempts.delete(key);
      console.log(`[UNLOCK] Account unlocked: ${username}`);
    }, LOCKOUT_DURATION);
  }
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const ip = req.socket.remoteAddress;

  // CORS headers (for testing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Serve login page
  if (pathname === '/login' && req.method === 'GET') {
    const html = fs.readFileSync(path.join(__dirname, 'aspnet-login.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
    return;
  }

  // Handle login POST
  if (pathname === '/login' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      // Parse form data or JSON
      let username, password;

      try {
        // Try JSON first
        const json = JSON.parse(body);
        username = json.user || json.username;
        password = json.password;
      } catch (e) {
        // Parse URL-encoded form data
        const params = new URLSearchParams(body);
        username = params.get('user') || params.get('username');
        password = params.get('password');
      }

      console.log(`[LOGIN] Attempt from ${ip}: username=${username}`);

      // Check rate limiting
      if (!checkRateLimit(ip)) {
        console.log(`[RATE LIMIT] IP blocked: ${ip}`);
        logRequest(ip, username, password, false);
        res.writeHead(429, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Too Many Requests</h1>
              <p>You have been rate limited. Please try again later.</p>
              <p>Max ${MAX_ATTEMPTS} attempts per ${RATE_LIMIT_WINDOW / 1000} seconds</p>
            </body>
          </html>
        `);
        return;
      }

      // Check account lockout
      if (!checkAccountLockout(username)) {
        console.log(`[LOCKOUT] Blocked attempt for locked account: ${username}`);
        logRequest(ip, username, password, false);
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Account Locked</h1>
              <p>This account has been locked due to too many failed login attempts.</p>
              <p>Please try again in 5 minutes.</p>
            </body>
          </html>
        `);
        return;
      }

      // Check credentials
      if (VALID_CREDENTIALS[username] === password) {
        console.log(`[SUCCESS] Login successful: ${username}`);
        logRequest(ip, username, password, true);

        // Simulate ASP.NET redirect
        res.writeHead(302, {
          'Location': '/dashboard',
          'Set-Cookie': 'ASP.NET_SessionId=abc123; Path=/; Secure'
        });
        res.end();
      } else {
        console.log(`[FAIL] Invalid credentials: ${username}`);
        recordFailedAttempt(username);
        logRequest(ip, username, password, false);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <html>
            <body>
              <h1>Login Failed</h1>
              <p>Invalid username or password.</p>
              <a href="/login">Try again</a>
            </body>
          </html>
        `);
      }
    });

    return;
  }

  // Dashboard (after successful login)
  if (pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body>
          <h1>Welcome to the Dashboard!</h1>
          <p>You have successfully logged in.</p>
        </body>
      </html>
    `);
    return;
  }

  // Stats endpoint (for monitoring)
  if (pathname === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalRequests: requestLog.length,
      successfulLogins: requestLog.filter(r => r.success).length,
      failedLogins: requestLog.filter(r => !r.success).length,
      rateLimitedIPs: Array.from(loginAttempts.entries()).filter(([k, v]) => !k.startsWith('failed_') && v.count >= MAX_ATTEMPTS).map(([ip]) => ip),
      lockedAccounts: Array.from(lockedAccounts),
      recentAttempts: requestLog.slice(-10)
    }, null, 2));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, HOST, () => {
  console.log('\n Mock ASP.NET Login Server (Educational)\n');
  console.log('='.repeat(50));
  console.log(`Server running at http://${HOST}:${PORT}/`);
  console.log(`Login page: http://${HOST}:${PORT}/login`);
  console.log(`Stats: http://${HOST}:${PORT}/stats`);
  console.log('='.repeat(50));
  console.log('\n Valid Test Credentials:');
  Object.entries(VALID_CREDENTIALS).forEach(([user, pass]) => {
    console.log(`  - ${user} : ${pass}`);
  });
  console.log('\n  Security Features:');
  console.log(`  - Rate limiting: ${MAX_ATTEMPTS} attempts per ${RATE_LIMIT_WINDOW / 1000}s per IP`);
  console.log(`  - Account lockout: ${LOCKOUT_THRESHOLD} failed attempts = 5 min lock`);
  console.log(`  - Request logging: Last 1000 requests tracked`);
  console.log('\n[WARNING]  For educational use only. Practice on localhost only.\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n[STATS] Final Stats:');
  console.log(`  Total requests: ${requestLog.length}`);
  console.log(`  Successful logins: ${requestLog.filter(r => r.success).length}`);
  console.log(`  Failed logins: ${requestLog.filter(r => !r.success).length}`);
  console.log('\n Server stopped\n');
  process.exit(0);
});
