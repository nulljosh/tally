# Project Context for Claude

## Project Overview
This is a web scraper for checking payment status on the BC government self-serve portal (myselfserve.gov.bc.ca). Built with Node.js and Puppeteer to automate the login and payment checking process.

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
