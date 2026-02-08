# TODO - BC Self-Serve Scraper

## 🔥 PRIORITY: Fix Vercel — Dashboard loads with no data

**Problem:** On Vercel, dashboard shows "Scraping BC Self-Serve... This takes ~30-60 seconds" forever. Locally it works because `auto-scrape` runs on startup and populates `lastCheckResult` in memory. On Vercel (serverless), there's no persistent memory between requests.

**Fix:** Same pattern as bread (see `~/Documents/Code/bread/api/cron.js`):
1. `npm install @vercel/blob` — persistent JSON storage between requests
2. Run scraper locally (or via external cron), write results to Vercel Blob
3. Update `/api/latest` to read from Blob first — instant data on page load
4. Remove "Check Now" button / scrape-on-demand pattern from dashboard
5. Cron can't run Puppeteer on Vercel (too heavy), so scrape locally + push to Blob

**Why Puppeteer can't run on Vercel cron:**
- @sparticuz/chromium cold start is ~10-15s
- BC gov login + 4 section scrape takes 30-60s total
- Vercel hobby plan: 60s max function duration, often times out
- Solution: scrape from local machine on a schedule, upload results to Blob

**Steps:**
1. Add `@vercel/blob` dependency
2. Create `api/upload.js` — endpoint to receive scrape results and write to Blob (secured with secret)
3. Update `api/latest.js` — read from Blob instead of in-memory `lastCheckResult`
4. Create local script: `npm run scrape-and-upload` — runs scraper, POSTs results to `/api/upload`
5. Schedule locally with cron/launchd (weekly or on-demand)
6. Set env vars on Vercel: `BLOB_READ_WRITE_TOKEN`, `UPLOAD_SECRET`

---

## ✅ COMPLETED: Multi-User Login System (v2.3.0)

**Goal:** Replace simple password ("hunter2") with BC Self-Serve credentials. Each user logs in with their own username/password and sees their own data.

### Checklist

#### Phase 1: Frontend Login ✅
- [x] Update `web/login.html`: Add username + password fields for BC Self-Serve
- [x] Update login form to send both username + password to `/api/login`
- [x] Allow blank fields to use .env defaults (admin convenience)

#### Phase 2: Backend Auth ✅
- [x] Update `/api/login` endpoint to accept username + password
- [x] Validate credentials by attempting BC Self-Serve login (attemptBCLogin())
- [x] Store credentials in session with AES-256-CBC encryption
- [x] Add session timeout (2 hour max age, 1 hour activity timeout)
- [x] Secure cookies (httpOnly, sameSite strict, secure in production)

#### Phase 3: Dynamic Scraping ✅
- [x] Modify `checkAllSections()` to accept username/password parameters (already supported)
- [x] Update `/api/check` to use session credentials with .env fallback
- [x] Keep .env credentials as fallback for admin auto-login
- [x] Scraper dynamically uses session or .env credentials

#### Phase 4: Security & Polish ✅
- [x] Add rate limiting to `/api/login` (5 attempts per 15 min)
- [x] Add "Logout" button in dashboard nav
- [x] Destroy session on logout (POST /api/logout)
- [x] Delete insecure `/api/default-credentials` endpoint
- [x] Add auth to `/api/latest` endpoint
- [x] .env excluded from git (.gitignore)

#### Phase 5: Vercel Blob Integration ✅
- [x] Install `@vercel/blob` dependency
- [x] Create `api/upload.js` — secure upload endpoint (requires UPLOAD_SECRET)
- [x] Update `/api/latest` — read from Blob on Vercel, fall back to files locally
- [x] Create `scripts/upload-to-blob.js` — local upload script
- [x] Add `npm run upload-blob` script to package.json

#### Remaining Work 🔧
- [ ] Add `vercel.json` config with env var references
- [ ] Test Vercel deployment end-to-end
- [ ] Set Vercel env vars (UPLOAD_SECRET, SESSION_SECRET, BLOB_READ_WRITE_TOKEN)
- [ ] Test login with BC credentials end-to-end
- [ ] Test Blob upload/download workflow
- [ ] Update README with new login flow (DONE)
- [ ] Consolidate docs (9 markdown files → 4-6)
- [ ] Rename project from "selfserve" to "claimcheck"

**Status:** v2.3.0 implemented, pending testing & deployment
**Security fixes:** All critical vulnerabilities resolved
**Next:** Test locally, deploy to Vercel, configure env vars

---

## ✅ COMPLETED: UI Improvements (v2.2.1)

**Changes made:**
- [x] Increased max container width (1400px → 1600px)
- [x] Better spacing and whitespace (32px padding, 24px card padding)
- [x] Improved grid layout (360px min columns, better responsive)
- [x] Cleaner stat cards (removed unnecessary borders, better sizing)
- [x] Enhanced typography (better line-height, spacing)
- [x] Simplified card hover effects
- [x] Better mobile responsiveness
- [x] Removed redundant card borders in header
- [x] Stats now standalone (removed wrapping card)
- [x] Improved navigation layout with better spacing

**Result:** Cleaner, more spacious UI with better use of screen space while keeping all functionality intact.

---

## Current Status: v1.7.0 [DONE]

**All 4 sections working:**
- [DONE] Notifications
- [DONE] Messages (10 found)
- [DONE] Payment Info (FIXED - new URL: `/Auth/ChequeInfo`, shows $1,060 total)
- [DONE] Service Requests (1 active: "Shelter Update" from Jan 08)

**Dashboard:**
- [DONE] Password protected (hunter2)
- [DONE] Dark/light mode toggle
- [DONE] Deployed to Vercel: https://selfserve-c2cldmw48-nulljosh-9577s-projects.vercel.app
- [DONE] Mobile-first responsive design
- [DONE] Clickable links to BC Self-Serve

---

## Vercel Deployment Notes

**URL:** https://selfserve-c2cldmw48-nulljosh-9577s-projects.vercel.app
**Password:** hunter2

**Important:** Data on Vercel is static (from Jan 16, 2026). To update:
1. Run scraper locally: `npm run check`
2. Force-add latest results: `git add -f results-2026-01-16T*.json`
3. Commit and push: `git commit -m "Update data" && git push`
4. Vercel auto-deploys in ~30s

**Vercel Deployment Limitations:**
- [WARNING] **Sessions don't work on serverless** - Each request hits different server instance
- Password protection works on localhost but NOT on Vercel
- Options to fix Vercel:
  1. Use JWT tokens instead of sessions (complex)
  2. Use Redis/database for session storage (costs money)
  3. Remove password protection (insecure - anyone can see your data)
  4. **Recommended: Use localhost only**

**Why Localhost is Fine:**
- Password protected (`hunter2`)
- All data loads correctly
- Auto-refresh every 30 seconds
- Dark/light mode toggle
- Only you can access it (not exposed to internet)

---

## How to Actually Fix Vercel (If You Want To)

### Option 1: Remove Password Protection (Easiest but Insecure)

**What:** Just make it public, no auth
**Risk:** Anyone with the URL can see your BC Self-Serve data
**Steps:**
```bash
# Remove auth middleware from api.js
# Comment out requireAuth in routes
# Deploy
```

**Verdict:** [SKIP] Bad idea unless you're OK with data being public

---

### Option 2: Use Vercel Password Protection (Costs Money)

**What:** Vercel Pro feature ($20/month)
**How:**
1. Upgrade to Vercel Pro
2. Add password protection in Vercel dashboard
3. Anyone accessing the site must enter password first

**Verdict:** [WARNING] Works but $240/year is expensive for a side project

---

### Option 3: JWT Token Auth (Best Technical Solution)

**What:** Replace express-session with JWT tokens stored in cookies
**Why it works:** Serverless-compatible, no server-side session needed

**Implementation:**
```bash
npm install jsonwebtoken cookie-parser
```

Update `api.js`:
```javascript
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

app.use(cookieParser());

app.post('/api/login', (req, res) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
    const token = jwt.sign(
      { authenticated: true },
      process.env.SESSION_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('auth', token, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

const requireAuth = (req, res, next) => {
  const token = req.cookies.auth;

  if (!token) {
    return res.status(401).sendFile(path.join(__dirname, 'login.html'));
  }

  try {
    jwt.verify(token, process.env.SESSION_SECRET);
    next();
  } catch (err) {
    res.status(401).sendFile(path.join(__dirname, 'login.html'));
  }
};
```

**Verdict:** [DONE] Best option - works on Vercel, secure, free

---

### Option 4: Use Vercel KV (Redis) for Sessions (Costs Money)

**What:** Store sessions in Vercel's managed Redis
**Cost:** $0.25/100K requests (likely <$1/month for personal use)

**Implementation:**
```bash
npm install @vercel/kv connect-redis
```

Update `api.js`:
```javascript
const { kv } = require('@vercel/kv');
const RedisStore = require('connect-redis').default;

const redisClient = kv;

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
```

**Verdict:** [WARNING] Works but costs money, more complex than JWT

---

### Option 5: Use Environment Variable Check (Hacky but Free)

**What:** Require a secret query param or header
**Example:** `https://yourapp.vercel.app?secret=hunter2`

**Implementation:**
```javascript
const requireAuth = (req, res, next) => {
  if (req.query.secret === DASHBOARD_PASSWORD ||
      req.headers['x-auth'] === DASHBOARD_PASSWORD) {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
};
```

**Verdict:** [WARNING] Works but URL contains password (visible in browser history)

---

### Recommendation: JWT (Option 3)

**Why:**
- [DONE] Free
- [DONE] Serverless-compatible
- [DONE] Actually secure
- [DONE] Works on Vercel
- [DONE] Only ~20 lines of code

**Time to implement:** 30 minutes

**Let me know if you want me to implement this!**

---

## Next Features (Prioritized)

### P1 - High Priority

#### 0. Fix Vercel Auth with JWT ⏰ Tomorrow
**Goal:** Make password protection work on Vercel (currently broken due to serverless)
**Time:** 30 minutes
**Status:** Ready to implement

**Steps:**
1. Install dependencies: `npm install jsonwebtoken cookie-parser`
2. Replace express-session with JWT in `api.js`
3. Update login endpoint to issue JWT tokens
4. Update auth middleware to verify JWT
5. Test locally first
6. Deploy to Vercel
7. Verify login works on production

**Why JWT:**
- [DONE] Serverless-compatible (no server-side session storage needed)
- [DONE] Free (no Redis/database required)
- [DONE] Secure (httpOnly cookies, signed tokens)
- [DONE] Works on Vercel immediately

**Code already written** in "How to Actually Fix Vercel" section above.

---

#### 1. Make Dashboard Interactive
**Current:** Messages/items are just text, not clickable
**Want:** Click messages to expand full content, click service requests for details

**Implementation:**
- Parse message IDs from BC gov site
- Make messages clickable → expand to show full text
- Add "View on BC Self-Serve" link for each item
- Maybe scrape full message content when clicked

---

#### 2. Improve Message Parsing
**Current:** Only scrapes message titles and dates
**Want:** Click into each message and get full content

**Implementation:**
- After getting messages list, click each one
- Extract full message body
- Parse sender, date, subject, body separately
- Save structured JSON:
  ```json
  {
    "id": "msg-123",
    "date": "2026-01-06",
    "subject": "Information Required",
    "body": "Full message text here...",
    "read": true/false
  }
  ```

**Benefits:**
- See full message content without logging in
- Search through messages
- Track read/unread status

---

#### 2. CLI Tool (`ss` command)
**Goal:** Quick command-line access to data

**Commands:**
```bash
ss messages              # List all messages
ss messages 1            # View specific message
ss notifications         # Check notifications
ss payment               # View payment info
ss requests              # View service requests
ss check                 # Run scraper now
ss --help                # Show help
```

**Implementation:**
- Create `bin/ss` executable
- Parse command + args
- Read latest results JSON
- Pretty-print output with colors

**Installation:**
```bash
npm link
# Now 'ss' command available globally
```

---

### P2 - Medium Priority

#### 3. Monthly Report Submission from App
**Goal:** Submit monthly reports directly from the dashboard (no need to log into BC Self-Serve)

**Form Details:**
- 5 sections with Yes/No questions (radio buttons)
- Section 1: Eligibility (5 questions)
- Typical answers: "Yes" to "still need assistance", "No" to everything else
- Submitting gets you $1,060/month deposited

**Implementation:**
- Add "Submit Monthly Report" button in dashboard
- Navigate to monthly report page via Puppeteer
- Auto-fill all 5 sections with default answers
- Click through each section (Next/Continue buttons)
- Submit final form
- Show confirmation/success message
- Track submission date/status

**Benefits:**
- Never need to log into BC Self-Serve manually
- One-click monthly reporting (~30 seconds vs 5 minutes)
- Set reminders for report deadlines
- Never miss a month (automated submission)

---

#### 4. Deploy to Vercel with Security
**Goal:** Public dashboard but only you can access

**Security Options:**
- Add basic HTTP authentication (username/password)
- Use Vercel password protection (Pro feature - $20/mo)
- Add custom auth middleware (simple password in code)
- Use environment variable for password

**Implementation:**
- Add middleware to api.js to check password
- Set password as Vercel environment variable
- Test locally first
- Deploy to Vercel
- Add auth UI (simple password prompt)

---

#### 4. Push Notifications
**Goal:** Get notified of new messages without checking manually

**Options:**
- **Pushover** (easiest, $5 one-time)
- **Twilio SMS** (pay per message)
- **Email** (free, but might go to spam)
- **Webhook** (Discord, Slack, custom)

**Implementation:**
- Track previous results
- Compare with new scrape
- If new message found, send notification
- Run on cron (every hour)

---

#### 4. Better Message Display in Dashboard
**Improvements:**
- Show newest messages first (chronological)
- Highlight unread messages
- Click to expand full message content
- Mark as read/unread
- Filter by date range

---

### P3 - Nice to Have

- [ ] !!! Push notifications (Twilio SMS, Pushover)
- [ ] !!! Status change detection (only notify on changes)
- [ ] !! Email alerts via SendGrid/Mailgun
- [ ] !! Webhook support (Discord, Slack, custom)
- [ ] !! Scheduled cron in production
- [ ] !! Search functionality across all sections
- [ ] ! Historical data tracking (SQLite/PostgreSQL)
- [ ] ! Export to CSV/PDF
- [ ] ! Multiple account support
- [ ] ! Desktop app (Electron wrapper)

---

## Technical Debt

- [ ] Clean up old result files (auto-delete after 30 days)
- [ ] Add better error messages in dashboard when JSON load fails
- [ ] Optimize bundle size (Tailwind CDN → local build)
- [ ] Add tests for message parsing
- [ ] Document API endpoints in README

---

## KEY DISCOVERY - Jan 16, 2026 (Network Analysis)

**FOUND THE BUG!** Network traffic analysis revealed the exact issue:

1. [DONE] Login to BCeID succeeds properly
2. [DONE] BCeID redirects back to myselfserve.gov.bc.ca
3. [SKIP] **Site IMMEDIATELY calls these endpoints:**
   - `GET /Auth/SessionTimeout`
   - `GET /Auth/SessionTimeout/ShowError`
   - `GET /Auth/Signout`
4. [SKIP] **Session cookie gets cleared:** `ASP.NET_SessionId=; path=/; secure`
5. [SKIP] All subsequent requests get `?SMSESSION=NO` parameter
6. [SKIP] Everything redirects (302) back to login

**Root Cause:** The site has an automatic session timeout/signout bug that fires immediately after successful login. This is a legacy ASP.NET session management issue with their SiteMinder (SM) configuration (circa 2005-2008, ~18 years old).

**Solution:** Re-login before scraping each section with 20-second delays to avoid rate limiting.

---

## Completed (v1.5.0 - Jan 16, 2026)

- [x] Fix session timeout bug with re-login strategy
- [x] Successfully scrape all 4 sections
- [x] Add 20s delays between sections to avoid rate limiting
- [x] Improve error handling and rate limit detection
- [x] Create test suite with auto-grading
- [x] Add comprehensive README with API docs
- [x] Create web dashboard (index.html)
- [x] Add SKILL.md reference guide
- [x] Tag v1.0.0 and push to GitHub
- [x] All sections working (Notifications, Messages, Payment, Service Requests)

---

## Completed (v1.0.0 - Jan 16, 2026)

- [x] Network debugging tool (network-debug.js)
- [x] Document session bug in TODO.md
- [x] Build Express API with /check, /status, /health endpoints
- [x] Add countdown timer for wait periods
- [x] Navigate to about:blank between sections
- [x] Update package.json to v1.0.0

---

## Known Limitations

- No real-time updates (must run scraper manually or via cron)
- BC gov rate limits rapid logins (20s delays required)
- Session bug is on BC's side (can't fix their 18-year-old code)
- Message content requires clicking into each message (not implemented yet)

---

**Next Session:** Implement message parsing improvements and/or CLI tool

---
---

# Security Research & Pentesting Education

> **Scope:** Educational only. White/grey hat methodology. Legal, authorized testing only.

---

## Pentesting 101 (ELI5)

**What is Pentesting?**
You're hired to break into a system (legally) to find vulnerabilities before bad guys do.

**How It Works:**
1. **Get permission** (signed contract, scope document)
2. **Reconnaissance** - Learn about the target (public info only)
3. **Scanning** - Find open doors (ports, services)
4. **Exploitation** - Try to break in (controlled, documented)
5. **Report** - Tell the company what you found and how to fix it
6. **Get paid** - Companies pay $50-300/hr for this

**White Hat vs Grey Hat:**
- **White Hat:** 100% legal, authorized, contracted
- **Grey Hat:** Finds bugs without permission, reports them responsibly (legally risky)
- **Black Hat:** Criminal hacking (illegal, we don't do this)

---

## How to Get Into White Hat Hacking

### 1. Learn the Fundamentals
**Skills Needed:**
- Networking (TCP/IP, DNS, HTTP)
- Web technologies (HTML, JS, APIs)
- Linux command line
- Programming (Python, JavaScript, Bash)
- Databases (SQL, NoSQL)

**Free Learning Resources:**
- **TryHackMe** - Beginner-friendly, guided labs
- **HackTheBox** - Harder challenges, real-world scenarios
- **PortSwigger Web Security Academy** - Web vulnerabilities (free, excellent)
- **OWASP Top 10** - Most common web vulnerabilities

### 2. Practice Legally
**Legal Practice Platforms:**
- **TryHackMe** - Learn by doing, 100% legal
- **HackTheBox** - CTF challenges, penetration testing practice
- **PentesterLab** - Web penetration testing exercises
- **VulnHub** - Download vulnerable VMs, test locally
- **DVWA** (Damn Vulnerable Web Application) - Intentionally insecure app

**Your Own Projects:**
- Build vulnerable apps yourself
- Test your own code
- Set up local labs with Docker

### 3. Get Certifications
**Entry Level:**
- **eJPT** (eLearnSecurity Junior Penetration Tester) - $200, beginner-friendly
- **CompTIA Security+** - Good foundation, recognized

**Professional:**
- **OSCP** (Offensive Security Certified Professional) - Gold standard, hard, $1,649
- **CEH** (Certified Ethical Hacker) - Industry recognized, $1,199

### 4. Bug Bounties
**What is a Bug Bounty?**
Companies pay you to find bugs in their systems (legally authorized).

**Platforms:**
- **HackerOne** - Biggest platform, Netflix/Twitter/Uber use it
- **Bugcrowd** - Similar, lots of programs
- **Intigriti** - European focus
- **YesWeHack** - Growing platform

**Payouts:**
- Small bugs: $50-500
- Medium bugs: $500-5,000
- Critical bugs: $5,000-100,000+
- Top hackers make $100k-1M+/year

### 5. Get a Job
**Entry Roles:**
- Security Analyst ($60-90k/yr)
- Junior Pentester ($70-100k/yr)
- Security Consultant ($80-120k/yr)

**Senior Roles:**
- Senior Pentester ($120-180k/yr)
- Red Team Lead ($150-250k/yr)
- Security Architect ($180-300k/yr)

---

## Pentesting Methodology (High-Level)

### Phase 1: Reconnaissance
**Goal:** Gather information about the target

**What You Do:**
- Public info (Google, LinkedIn, job postings)
- DNS records (subdomains, mail servers)
- SSL certificates (find other domains)
- Technology stack (what frameworks they use)

**Legal:** Only public information, no intrusion

### Phase 2: Scanning
**Goal:** Find open services and potential entry points

**What You Do:**
- Port scanning (what services are running?)
- Service enumeration (what versions?)
- Vulnerability scanning (known CVEs?)
- Web application mapping (site structure)

**Legal:** Only on authorized systems in your scope

### Phase 3: Exploitation
**Goal:** Prove vulnerabilities are real by exploiting them (safely)

**What You Do:**
- Try to bypass authentication
- Test for SQL injection
- Check for XSS (cross-site scripting)
- Look for insecure file uploads
- Test API authentication

**Legal:** Only in controlled environments, document everything

### Phase 4: Post-Exploitation
**Goal:** See what an attacker could do with access

**What You Do:**
- Privilege escalation (can you become admin?)
- Lateral movement (can you access other systems?)
- Data exfiltration (what data could be stolen?)

**Legal:** Stop here, document findings, don't cause damage

### Phase 5: Reporting
**Goal:** Help the company fix vulnerabilities

**What You Provide:**
- Executive summary (non-technical)
- Detailed findings (technical)
- Proof of concept (screenshots/videos)
- Remediation steps (how to fix)
- Risk ratings (critical/high/medium/low)

---

## Common Vulnerabilities (OWASP Top 10)

### 1. Broken Access Control
**What:** Users can access things they shouldn't
**Example:** Change URL from `/user/123` to `/user/124` and see someone else's data
**Fix:** Check permissions server-side, never trust client

### 2. Cryptographic Failures
**What:** Sensitive data not encrypted properly
**Example:** Passwords stored in plain text, HTTP instead of HTTPS
**Fix:** Use strong encryption (AES-256), HTTPS everywhere, hash passwords (bcrypt)

### 3. Injection (SQL Injection, XSS)
**What:** Untrusted data sent to interpreter
**Example:** Username field: `admin' OR '1'='1` bypasses login
**Fix:** Use parameterized queries, input validation, output encoding

### 4. Insecure Design
**What:** Fundamental security flaw in architecture
**Example:** No rate limiting on login (can brute force passwords)
**Fix:** Threat modeling, security requirements from start

### 5. Security Misconfiguration
**What:** Default settings, unnecessary features enabled
**Example:** Default admin password, debug mode in production
**Fix:** Hardening guides, disable unused features, change defaults

### 6. Vulnerable Components
**What:** Using outdated libraries with known vulnerabilities
**Example:** Old jQuery version with XSS vulnerability
**Fix:** Keep dependencies updated, use tools like Dependabot

### 7. Authentication Failures
**What:** Weak login mechanisms
**Example:** No password complexity, session tokens don't expire
**Fix:** MFA, strong password policy, session timeout, rate limiting

### 8. Software & Data Integrity Failures
**What:** Code/data modified maliciously
**Example:** No integrity checks on updates/plugins
**Fix:** Code signing, checksum verification, trusted sources only

### 9. Security Logging Failures
**What:** Not logging security events or monitoring them
**Example:** Attacker tries 10,000 passwords, no one notices
**Fix:** Log authentication, monitor for anomalies, alerting

### 10. Server-Side Request Forgery (SSRF)
**What:** Attacker tricks server into making requests
**Example:** URL parameter: `fetch?url=http://internal-admin-panel`
**Fix:** Whitelist allowed URLs, validate/sanitize inputs

---

## Tools of the Trade (Educational)

### Reconnaissance
- **Shodan** - Search engine for internet-connected devices
- **theHarvester** - OSINT gathering (emails, names, subdomains)
- **Google Dorking** - Advanced Google search for info leaks
- **Recon-ng** - Reconnaissance framework

### Scanning
- **Nmap** - Port scanner, service detection
- **Masscan** - Fast port scanner
- **Nikto** - Web server vulnerability scanner
- **Burp Suite** - Web proxy, vulnerability scanner (industry standard)

### Exploitation
- **Metasploit** - Exploitation framework (automated exploits)
- **SQLmap** - Automated SQL injection tool
- **XSSer** - XSS vulnerability scanner
- **Hydra** - Brute force tool (for authorized testing only)

### Post-Exploitation
- **Mimikatz** - Extract passwords from Windows
- **BloodHound** - Active Directory attack paths
- **Empire** - Post-exploitation framework

### Reporting
- **Dradis** - Collaboration and reporting platform
- **Faraday** - Pentesting management
- **Markdown** - Simple reporting format

---

## Frameworks & Methodologies

### Atomic Red Team
**What:** Open-source library of adversary techniques
**Purpose:** Test your defenses by simulating attacks
**Use Case:** Blue team (defenders) test if their security tools work
**Legal:** 100% defensive, test your own systems
**Example:** "Can our antivirus detect this malware?"

**Breadcrumbs:**
- GitHub: `redcanaryco/atomic-red-team`
- Based on MITRE ATT&CK framework
- Small, atomic tests (one technique at a time)
- Focused on detection, not exploitation

### MITRE ATT&CK
**What:** Knowledge base of adversary tactics
**Purpose:** Understand how attackers operate
**Use Case:** Map your security controls to known attack techniques
**Example:** "Attackers use PowerShell for execution, do we monitor that?"

### PTES (Penetration Testing Execution Standard)
**What:** Standard methodology for pentesting
**Phases:**
1. Pre-engagement (scope, rules)
2. Intelligence gathering
3. Threat modeling
4. Vulnerability analysis
5. Exploitation
6. Post-exploitation
7. Reporting

### OWASP Testing Guide
**What:** Web application security testing methodology
**Focus:** Web apps, APIs, mobile apps
**Use Case:** Testing web applications systematically

---

## Quantum Computing & Cryptography (Educational)

### What Quantum Computing Threatens

**Vulnerable:**
- **RSA encryption** (used for HTTPS, SSH, VPNs)
- **Elliptic Curve Cryptography** (ECC)
- **Diffie-Hellman key exchange**

**Why:** Quantum computers can factor large numbers exponentially faster (Shor's algorithm)

**Safe (for now):**
- **AES-256** (symmetric encryption) - Still strong
- **SHA-256/SHA-3** (hashing) - Still strong
- **Quantum-resistant algorithms** (post-quantum crypto)

### ETA for Breaking Current Crypto

**Conservative Estimate:**
- **10-15 years** before quantum computers can break RSA-2048
- **20-30 years** for widespread quantum computing

**What's Happening Now:**
- NIST standardizing post-quantum algorithms (2024)
- Companies migrating to quantum-resistant crypto
- "Harvest now, decrypt later" threat (collect encrypted data now, decrypt later with quantum)

### Post-Quantum Cryptography

**NIST Selected Algorithms (2024):**
- **CRYSTALS-Kyber** - Encryption
- **CRYSTALS-Dilithium** - Digital signatures
- **FALCON** - Digital signatures
- **SPHINCS+** - Stateless signatures

**When to Worry:**
- Migrate critical systems now (sensitive long-term data)
- Most consumer apps: 5-10 years is fine
- Cryptocurrency: Varies (Bitcoin vulnerable, some alts already quantum-resistant)

---

## Legal & Ethical Boundaries

### [DONE] Legal (Do This)
- Pentest systems you own
- Pentest with signed contracts/authorization
- Bug bounties (within program rules)
- Practice on legal platforms (TryHackMe, HackTheBox)
- Responsible disclosure (find bug → report it → wait for fix)

### [SKIP] Illegal (Don't Do This)
- Pentest without authorization
- "Grey hat" unauthorized testing (legally risky)
- Brute forcing third-party logins
- Accessing data you're not authorized to see
- Selling exploits to criminals

### Responsible Disclosure Process
1. Find vulnerability in Product X
2. Report to company (security@company.com, HackerOne)
3. Give them 90 days to fix
4. If they don't respond, consider public disclosure (with redacted details)
5. Never disclose actively exploited vulnerabilities publicly

---

## Career Path Example

**Year 1-2: Learn Fundamentals**
- CompTIA Security+ certification
- TryHackMe/HackTheBox practice
- Build vulnerable apps, break them

**Year 3-4: Entry Role**
- Junior Pentester or Security Analyst
- $60-90k salary
- Work under senior pentesters
- Start bug bounties on weekends

**Year 5-7: Professional**
- OSCP certification
- Senior Pentester role
- $120-180k salary
- Lead pentests, manage junior staff

**Year 8+: Expert**
- Bug bounties ($50k-500k/yr)
- Red Team Lead
- $200k+ salary
- Conference speaker, publish research

---

## Next Steps for You

**Immediate (This Week):**
1. Sign up for TryHackMe (free tier)
2. Complete "Complete Beginner" path
3. Read OWASP Top 10

**Short Term (This Month):**
1. Build a vulnerable web app (DVWA or custom)
2. Practice finding vulnerabilities
3. Write up findings like a real report

**Medium Term (3-6 Months):**
1. Join a bug bounty platform (start with easy targets)
2. Study for CompTIA Security+ or eJPT
3. Network with other security folks (Twitter, Discord, local meetups)

**Long Term (1-2 Years):**
1. Get first security job or bounty payout
2. Work toward OSCP certification
3. Build portfolio of public writeups

---

## Resources

**Learning:**
- TryHackMe: https://tryhackme.com
- HackTheBox: https://hackthebox.com
- PortSwigger Academy: https://portswigger.net/web-security
- OWASP: https://owasp.org

**Community:**
- r/netsec (Reddit)
- r/AskNetsec (Reddit)
- InfoSec Twitter (#infosec)
- Security conferences (DEF CON, Black Hat)

**Tools:**
- Kali Linux (pentesting distro)
- Burp Suite Community (free web proxy)
- OWASP ZAP (free alternative to Burp)

---

**Remember:** With great power comes great responsibility. Only test systems you have explicit permission to test. One illegal action can end your career before it starts.
