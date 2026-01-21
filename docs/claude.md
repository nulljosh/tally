# Project Context for Claude

## Project Overview
Web scraper for BC government self-serve portal (myselfserve.gov.bc.ca) to check notifications, messages, payment info, and service requests. Built with Node.js + Puppeteer for fully automated headless scraping.

**Security Research Project:** Also includes educational pentesting materials, security test suites, and white hat hacking resources.

## Security Ethics & Scope

### What We Do [DONE]
- **Defensive Security:** Test OUR OWN systems (selfserve dashboard)
- **Education:** Learn white hat pentesting concepts, methodologies, frameworks
- **Legal Practice:** TryHackMe, HackTheBox, bug bounties with authorization
- **Research:** Study vulnerabilities, attack patterns, mitigation strategies

### What We Don't Do [SKIP]
- **NO unauthorized testing** of third-party systems (including BC gov site)
- **NO exploit development** for malicious purposes
- **NO anonymity/evasion guidance** for illegal activities
- **NO "grey hat" testing** without explicit written authorization

### Authorization Requirements
Before testing ANY system (except our own):
- Written contract or bug bounty agreement
- Defined scope (what's in/out of bounds)
- Point of contact
- Rules of engagement
- Safe harbor clause

**Rule:** Authorization = Legal. No authorization = Illegal (10+ years prison).

### Project Files
- `hack.md` - Pentesting education, career path, legal practice platforms
- `legal.md` - When pentesting is legal vs illegal, case studies, laws
- `test-security.js` - Automated security tests for OUR dashboard
- NEVER use these for unauthorized testing

## Critical Breadcrumbs

### Login Flow (WORKING)
1. Navigate to homepage → click "Sign in" button
2. Gets redirected to BCeID login: `logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi...`
3. Clear form fields (pre-filled values cause issues)
4. Type credentials: `input[name="user"]` and `input[name="password"]`
5. Submit: `input[name="btnSubmit"]`
6. Retry 5x because BC site is flaky (usually succeeds attempt 2-3)
7. **Working reliably as of v1.0.0**

### Session Issue (BC GOV BUG)
- Login succeeds, cookies saved (4 cookies)
- But sessions expire immediately when navigating to `/Auth/*` pages
- **This is a BC government backend issue, not our code**
- Workaround: Re-login for each section (inefficient but works)

### Sections to Scrape
1. **Notifications**: `https://myselfserve.gov.bc.ca/Auth`
2. **Messages**: `https://myselfserve.gov.bc.ca/Auth/Messages`
3. **Payment Info**: `https://myselfserve.gov.bc.ca/Auth/PaymentInfo`
4. **Service Requests**: `https://myselfserve.gov.bc.ca/Auth/ServiceRequests`
5. Monthly Reports: `https://myselfserve.gov.bc.ca/Auth/MonthlyReports` (not implemented)
6. Employment Plans: `https://myselfserve.gov.bc.ca/Auth/EmploymentPlans` (not implemented)
7. Account Info: `https://myselfserve.gov.bc.ca/Auth/AccountInfo` (not implemented)

## Key Information

### Login Details
- Login URL: `https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi?flags=1001:1,8&TYPE=33554433&REALMOID=06-80814a39-7ee0-4112-9af6-a9d04ed7d77a&GUID=&SMAUTHREASON=0&METHOD=GET&SMAGENTNAME=$SM$ySOYll%2bn7fL%2fyHU7CWC1ui%2ffR%2bcHcwYYQ85UtuOvAj9uEqeiVgv8tmlZUfIIKLw5&TARGET=$SM$HTTPS%3a%2f%2fmyselfserve%2egov%2ebc%2eca%2fAuth%2fLogin`
- Post-login redirect: `https://myselfserve.gov.bc.ca/Auth/Login`
- Authentication: BCeID username/password

### Tech Stack
- Node.js
- Puppeteer (browser automation)
- dotenv (environment variables)
- Chromium (persistent profile for session management)

### Current Features
1. Cookie persistence (`cookies.json`)
2. Chrome profile persistence (`chrome-data/`)
3. Automated login with fallback to manual
4. Payment keyword detection
5. Screenshot capture with timestamps
6. Visual browser mode (headless: false)

### File Structure
```
/selfserve
├── scraper.js          # Main scraper script
├── .env                # Credentials (gitignored)
├── package.json        # Node dependencies
├── cookies.json        # Saved session (auto-generated)
├── chrome-data/        # Persistent Chrome profile
├── payment-status-*.png # Screenshots
└── README.md           # Documentation
```

## Future Roadmap

### Notifications (Next Phase)
- [ ] Twilio SMS integration
- [ ] Pushover push notifications
- [ ] Email alerts via SendGrid/Mailgun
- [ ] Webhook support for custom integrations

### Deployment Options
- [ ] Vercel serverless function
  - Pros: Free tier, easy deployment, cron jobs
  - Cons: May need headless mode, consider Vercel's time limits
- [ ] Railway/Render with cron
- [ ] AWS Lambda with EventBridge
- [ ] Self-hosted on Raspberry Pi/VPS

### Enhanced Features
- [ ] Payment history tracking (store in JSON/SQLite)
- [ ] Status change detection (only notify on changes)
- [ ] More robust HTML parsing for payment details
- [ ] Support for multiple payment types
- [ ] Retry logic with exponential backoff
- [ ] Logging system (Winston or Pino)
- [ ] Health check endpoint
- [ ] Rate limiting to avoid detection

## Useful Skills for This Project

### Notification Skills
1. **SMS Integration**
   - Twilio API setup
   - Phone number formatting
   - Message templating

2. **Push Notifications**
   - Pushover integration
   - Push notification services (OneSignal, Firebase)
   - iOS/Android notification handling

3. **Email Alerts**
   - SendGrid/Mailgun setup
   - Email templating
   - HTML email formatting

### Deployment Skills
4. **Vercel Deployment**
   - Serverless function structure
   - Cron job configuration
   - Environment variable management
   - Edge functions vs serverless

5. **Docker Containerization**
   - Dockerfile for Puppeteer
   - Chrome/Chromium in containers
   - Docker Compose for local dev

6. **CI/CD Pipeline**
   - GitHub Actions for deployment
   - Automated testing
   - Environment promotion

### Data & Monitoring Skills
7. **Database Integration**
   - SQLite for simple storage
   - PostgreSQL for production
   - Redis for caching

8. **Logging & Monitoring**
   - Winston/Pino logging
   - Error tracking (Sentry)
   - Uptime monitoring (UptimeRobot)

9. **Web Scraping Advanced**
   - CAPTCHA handling
   - Anti-bot detection avoidance
   - Proxy rotation
   - User-agent randomization

### API & Webhooks
10. **Webhook Implementation**
    - Express.js webhook server
    - Signature verification
    - Retry handling

11. **REST API Creation**
    - Express API for manual checks
    - Authentication (API keys)
    - Rate limiting

## Common Commands

```bash
# Run scraper
node scraper.js

# Install dependencies
npm install

# Clear session (fresh login)
rm cookies.json && rm -rf chrome-data/

# Run in background (for testing headless)
nohup node scraper.js &

# Watch for changes during development
nodemon scraper.js
```

## Technical Considerations

### Puppeteer in Production
- Headless mode may be required for serverless
- Chrome binary size (~170MB) affects cold starts
- Consider `puppeteer-core` with bundled Chrome
- Vercel may require `@sparticuz/chromium` package

### Session Management
- Cookies expire after inactivity
- Chrome profile helps with 2FA/remember-me
- May need to handle session timeouts gracefully

### Error Handling
- Network timeouts
- Login failures
- Payment page structure changes
- Rate limiting by BC government

## Questions to Consider

1. How often should we check? (hourly, daily, on-demand?)
2. What constitutes a "paid" status?
3. Should we store historical data?
4. What notification channels are most important?
5. Do we need a web UI for manual checks?
