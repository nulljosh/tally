# Pentesting: When It's Legal vs Illegal

## Quick Answer

**Legal:** You have explicit written authorization
**Illegal:** Everything else

---

## When Pentesting is LEGAL ✅

### 1. You Own the System
- Your own website, server, or application
- Your own code running on your infrastructure
- Example: Testing your selfserve dashboard on localhost

### 2. Written Authorization
Requires ALL of these:
- **Signed contract** (Statement of Work, Bug Bounty agreement)
- **Defined scope** (IP ranges, domains, systems allowed)
- **Time window** (when you're allowed to test)
- **Rules of engagement** (what's off-limits)
- **Point of contact** (who to call if something breaks)

Example: Company hires you with contract specifying:
- Test staging.example.com only
- Between 9 PM - 6 AM
- No DoS attacks
- Contact: security@example.com

### 3. Bug Bounty Programs
- HackerOne, Bugcrowd, Intigriti
- Company explicitly invites testing
- Scope defined in program rules
- Safe Harbor clause (won't prosecute if you follow rules)
- Must follow all program rules exactly

### 4. Legal Practice Platforms
- TryHackMe, HackTheBox, PentesterLab
- Explicitly designed for learning/testing
- No real systems, isolated environments

### 5. Capture The Flag (CTF) Competitions
- DEF CON CTF, PicoCTF, etc.
- Competition organizers provide systems to attack
- Clear rules and boundaries

---

## When Pentesting is ILLEGAL ❌

### 1. No Authorization (Criminal)
**Illegal:** Testing ANY system without explicit permission

Examples:
- "I'll test my school's website to show them it's vulnerable"
- "I found a bug while using the site, let me test further"
- "I'm doing it to help them" (not authorization)
- "I'll report it afterward" (still illegal to test first)

**Laws Violated:**
- **US:** Computer Fraud and Abuse Act (CFAA) - 18 USC § 1030
  - Up to 10 years prison for first offense
  - Up to 20 years for repeat offenses
- **Canada:** Criminal Code Section 342.1
  - Up to 10 years prison
- **UK:** Computer Misuse Act 1990
  - Up to 10 years prison
- **EU:** Directive 2013/40/EU (varies by country)

### 2. Exceeding Authorization
**Illegal:** Going beyond what you're authorized to do

Examples:
- Bug bounty says "web app only" but you test their email server
- Contract says "staging environment" but you test production
- Scope says "no DoS" but you run a load test anyway
- Authorization expires but you keep testing

**Penalty:** Same as no authorization (10+ years prison)

### 3. "Grey Hat" Testing
**Illegal (but sometimes tolerated):** Finding bugs without permission, then reporting

Example:
- You find SQL injection on a website
- You test it to confirm (ILLEGAL)
- You report it to the company

**Reality:**
- Technically illegal
- Some companies appreciate it
- Others prosecute
- NOT worth the risk

**Better approach:**
- Find bug while using site normally
- Report immediately without testing
- Let company decide if they want to hire you

### 4. Accessing Data Beyond Proof-of-Concept
**Illegal:** Viewing/stealing data even if you report it

Examples:
- SQL injection lets you see 1 user - OK to prove it exists
- Downloading entire user database - ILLEGAL
- Viewing one credit card - OK for proof
- Copying all credit cards - ILLEGAL

**Rule:** Minimal access to prove vulnerability, nothing more

### 5. Public Disclosure Without Consent
**Illegal (sometimes):** Publishing vulnerabilities before patch

Example:
- You find bug, report it
- Company ignores you
- You publish full exploit details
- Someone uses it to hack them

**Laws:**
- Some jurisdictions consider this aiding criminals
- Civil liability for damages
- Possible criminal charges

**Safe approach:**
- 90-day disclosure timeline (industry standard)
- Redacted public disclosure (don't give full exploit)
- Coordinate with company

---

## Real-World Case Studies

### Case 1: Weev (Andrew Auernheimer) - 2010
**What happened:** Found AT&T iPad email leak, downloaded 114,000 emails, reported it, got arrested
**Outcome:** Convicted, 41 months prison (later overturned on technicality)
**Lesson:** Even "responsible disclosure" can get you arrested

### Case 2: David Schuchman - 2013
**What happened:** High school student pentested school website, reported vulnerabilities, arrested
**Outcome:** Felony charges, expelled, criminal record
**Lesson:** Good intentions don't matter without authorization

### Case 3: Khalil Shreateh - 2013
**What happened:** Found Facebook bug, reported it, got ignored, exploited Zuckerberg's wall to prove it
**Outcome:** Bug fixed, banned from bug bounty, no reward
**Lesson:** Exceeding authorization = consequences even if you're right

### Case 4: Marcus Hutchins (MalwareTech) - 2017
**What happened:** Stopped WannaCry ransomware, then got arrested for making malware years earlier
**Outcome:** Pled guilty, time served, supervised release
**Lesson:** Past "grey hat" activities can come back to haunt you

---

## Authorization Checklist

Before testing ANY system, check ALL boxes:

- [ ] I own this system OR
- [ ] I have a signed contract with defined scope OR
- [ ] This is an official bug bounty program
- [ ] I know exactly what's in scope (IP ranges, domains, systems)
- [ ] I know what's out of scope (production, sensitive data, DoS)
- [ ] I have a point of contact if something goes wrong
- [ ] I have proof of authorization (email/contract saved)
- [ ] The authorization is current (not expired)
- [ ] I understand the rules of engagement

**If you can't check EVERY box: DON'T TEST IT**

---

## What "Authorization" Actually Looks Like

### Example: Real Bug Bounty Program
```
Company: Example Corp
Program: https://hackerone.com/examplecorp

IN SCOPE:
- *.example.com (all subdomains)
- api.example.com
- mobile.example.com

OUT OF SCOPE:
- partners.example.com
- Any third-party services
- Physical security
- Social engineering
- Denial of Service

REWARDS:
- Critical: $5,000 - $20,000
- High: $1,000 - $5,000
- Medium: $500 - $1,000
- Low: $100 - $500

SAFE HARBOR:
We will not pursue legal action against researchers who:
1. Follow these rules
2. Report vulnerabilities promptly
3. Don't access user data beyond proof-of-concept
4. Don't publicly disclose before patch
```

### Example: Written Contract
```
PENETRATION TESTING AGREEMENT

Client: ABC Corporation
Tester: John Doe Security Consulting

SCOPE:
- IP Ranges: 192.168.1.0/24, 10.0.0.0/8
- Domains: staging.abc.com, dev.abc.com
- Excluded: production.abc.com, database servers

TIMELINE:
- Start: January 15, 2026
- End: January 22, 2026
- Hours: 9 PM - 6 AM only

METHODS AUTHORIZED:
- Vulnerability scanning
- Web application testing
- Network penetration testing

METHODS PROHIBITED:
- Denial of Service attacks
- Physical security testing
- Social engineering
- Production system testing

CONTACT:
- Primary: security@abc.com
- Emergency: +1-555-123-4567

LIABILITY:
[Insurance and liability clauses]

SIGNATURES:
[Both parties sign]
```

---

## "But I'm Just Learning" Defense

**Does NOT Work:**

- "I'm a student learning cybersecurity"
- "I was just curious"
- "I didn't mean any harm"
- "I was going to report it"
- "I didn't steal any data"

**Courts Don't Care About:**
- Your intentions
- Whether you caused damage
- Whether you're a white hat
- Whether you reported it

**Courts Only Care About:**
- Did you have authorization?
- Did you exceed authorization?

**If no authorization = guilty**

---

## Safe Ways to Practice

### 1. Your Own Systems
- Build vulnerable apps (DVWA, WebGoat)
- Set up local labs (Docker, VMs)
- Test your own projects
- Break your own code

### 2. Legal Platforms
- TryHackMe ($10/month, 100% legal)
- HackTheBox (free/paid tiers)
- PortSwigger Academy (free)
- PentesterLab (paid)
- VulnHub (free VMs)

### 3. Bug Bounties (with rules)
- HackerOne (1000s of programs)
- Bugcrowd
- Intigriti
- YesWeHack
- Read scope carefully
- Follow rules exactly
- Don't test out-of-scope assets

### 4. CTF Competitions
- DEF CON CTF
- picoCTF
- CyberPatriot
- Collegiate Cyber Defense Competition

### 5. Professional Training
- SANS courses ($6,000-8,000)
- Offensive Security (OSCP, $1,649)
- eLearnSecurity (eJPT, $200)
- Many provide legal labs

---

## Red Flags That Testing is Illegal

**STOP if you're thinking:**
- "I'll just test a little bit..."
- "They'll thank me afterward..."
- "No one will notice..."
- "I'm doing them a favor..."
- "It's for educational purposes..."
- "I'll use Tor so they can't trace me..."
- "Other hackers do it all the time..."

**If you need anonymity = you know it's illegal**

---

## What To Do If You Find a Vulnerability

### While Using a Site Normally (Legal)
1. **Stop immediately** - Don't test further
2. **Document what you found** (screenshot, URL, description)
3. **Report it:**
   - security@company.com
   - HackerOne program (if they have one)
   - LinkedIn message to CISO
4. **Wait for response**
5. **Don't publish details**

### While Pentesting With Authorization
1. **Document everything** (screenshots, commands, timestamps)
2. **Report immediately** if critical
3. **Stay within scope**
4. **Don't access sensitive data** beyond proof-of-concept
5. **Include remediation advice**

---

## Bottom Line

**The law is simple:**

1. **Authorization = legal**
2. **No authorization = illegal**
3. **"I was helping" is not authorization**
4. **Good intentions don't matter**
5. **Ignorance is not a defense**

**When in doubt, don't test it.**

**Want to be a white hat? Get authorization first.**

---

## Useful Resources

**Legal Info:**
- EFF (Electronic Frontier Foundation): https://eff.org
- CFAA text: https://www.law.cornell.edu/uscode/text/18/1030
- Bug Bounty Guidelines: https://bugcrowd.com/resources/legal

**Legal Testing:**
- TryHackMe: https://tryhackme.com
- HackTheBox: https://hackthebox.com
- HackerOne: https://hackerone.com

**Responsible Disclosure:**
- Google's Vulnerability Disclosure Policy (example): https://g.co/vulnz
- ISO 29147 (standard for disclosure): https://www.iso.org/standard/72311.html
