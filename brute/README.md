# Brute Force Education Lab

> **EDUCATION ONLY:** This folder contains educational materials and tools for learning about brute force attacks, authentication security, and defensive security measures. Only use on systems you own or have written authorization to test.

## Folder Structure

```
brute-force/
├── docs/               # Educational documentation
│   ├── hack.md        # Pentesting guide and methodology
│   └── legal.md       # Legal framework and boundaries
├── tools/             # Testing tools
│   ├── test-security.js        # Security test suite
│   ├── brute-force-login.js    # Brute forcer for ASP.NET login
│   └── brute-force-cli.js      # CLI wrapper with rate limiting
├── mock-targets/      # Local test environments
│   ├── aspnet-login.html       # Mock ASP.NET login page
│   ├── mock-server.js          # Local server for testing
│   └── README.md               # Setup instructions
└── wordlists/         # Password lists for testing
    ├── common-passwords.txt    # Top 100 passwords
    ├── test-passwords.txt      # Small test list
    └── rockyou-top1000.txt     # Top 1000 from RockYou

```

## Learning Path

### 1. Start Local (TODAY)
- Set up mock-targets/mock-server.js
- Test brute forcer on localhost
- Learn how defenses work (rate limiting, lockouts)
- Safe, legal, educational

### 2. Practice on Labs (WEEK 1-4)
- TryHackMe: https://tryhackme.com
- HackTheBox: https://hackthebox.com
- PortSwigger Academy: https://portswigger.net/web-security
- These platforms are designed for practice

### 3. Build Educational Materials (MONTH 1-2)
- Document findings in writeups
- Create security test suites
- Share knowledge with community
- Build portfolio

### 4. Authorized Testing ONLY (MONTH 3+)
- Only test systems with written authorization
- Bug bounty programs with clear scope
- Penetration testing contracts
- Never test without permission

## Ethical Guidelines

### DO
- Practice on your own systems (localhost, VMs)
- Use legal practice platforms (THM, HTB)
- Learn defensive security measures
- Report vulnerabilities responsibly
- Get written authorization before testing

### DON'T
- Test third-party systems without authorization
- Share exploits publicly before patches
- Access data beyond proof-of-concept
- Use anonymity tools to hide illegal activity
- Assume "good intentions" = authorization

## Quick Start

### Run Mock Server
```bash
cd mock-targets
node mock-server.js
# Server runs on http://localhost:8080
```

### Test Brute Forcer Locally
```bash
cd tools
node brute-force-login.js --target http://localhost:8080/login --username admin --wordlist ../wordlists/test-passwords.txt
```

### Run Security Tests
```bash
cd tools
node test-security.js
```

## Authorization Checklist

Before testing ANY system (even with your own credentials), verify:

- [ ] I own this system OR
- [ ] I have a signed contract with defined scope OR
- [ ] This is an official bug bounty program
- [ ] I know exactly what's in scope
- [ ] I know what's out of scope
- [ ] I have a point of contact
- [ ] I have proof of authorization saved
- [ ] The authorization is current (not expired)

**If you can't check EVERY box: DON'T TEST IT**

## Legal Disclaimer

Unauthorized access to computer systems is illegal under:
- US: Computer Fraud and Abuse Act (CFAA) - 18 USC § 1030 (10-20 years prison)
- Canada: Criminal Code Section 342.1 (10 years prison)
- UK: Computer Misuse Act 1990 (10 years prison)

Using your own credentials on a third-party system does NOT grant authorization to perform security testing.

See [docs/legal.md](docs/legal.md) for full legal guide.

## Resources

**Practice Platforms:**
- TryHackMe: https://tryhackme.com
- HackTheBox: https://hackthebox.com
- PortSwigger Academy: https://portswigger.net/web-security

**Learning:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Web Security Academy: https://portswigger.net/web-security/all-materials

**Tools:**
- Burp Suite: https://portswigger.net/burp
- OWASP ZAP: https://www.zaproxy.org

---

**Remember:** The difference between a security professional and a criminal is authorization.
