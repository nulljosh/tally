# TODO - BC Self-Serve Scraper

## Current Status (v1.0.1)
- ✓ Automated headless login (working with retries)
- ✓ Multi-section scraping structure
- ✓ JSON output
- ✓ Express API endpoints
- ✗ Session persistence (BC gov backend issue)
- ✗ Actually retrieving section data

## Blocking Issues

### 1. BC Government Session Expiration
**Problem:** Login succeeds but sessions expire when navigating to protected pages
**Root Cause:** BC government backend - sessions not persisting properly
**Impact:** Can't scrape notifications, messages, payment info
**Possible Solutions:**
- [ ] Re-login before each section (inefficient but may work)
- [ ] Investigate cookie domains and paths
- [ ] Try staying on same page and using API calls instead
- [ ] Contact BC gov IT (lol)

### 2. Form Field Pre-filling
**Problem:** First login attempt fails with "incorrect credentials"
**Status:** Partially fixed with triple-clear but still happening sometimes
**Current:** Succeeds on retry #2-3
**Need:** Better field clearing or wait for page load

## Features to Complete

### Core Scraping (Priority 1)
- [ ] Fix session persistence to actually retrieve data
- [ ] Extract notifications from `/Auth`
- [ ] Extract messages from `/Auth/Messages`
- [ ] Extract payment info from `/Auth/PaymentInfo`
- [ ] Extract service requests from `/Auth/ServiceRequests`
- [ ] Parse structured data (not just grab all <li> elements)

### Additional Sections (Priority 2)
- [ ] Monthly Reports scraping
- [ ] Employment Plans scraping
- [ ] Account Info scraping

### Improvements (Priority 3)
- [ ] Interactive section selector (ask user which sections to check)
- [ ] Better notification parsing (detect actual notifications vs nav items)
- [ ] Payment status change detection
- [ ] Historical data tracking
- [ ] Headless mode works on first try (no retries needed)

### Notifications & Alerts (Priority 4)
- [ ] Twilio SMS integration
- [ ] Pushover push notifications
- [ ] Email alerts
- [ ] Webhook support
- [ ] Only notify on changes

### Deployment (Priority 5)
- [ ] Vercel serverless deployment
- [ ] Cron job setup for automated checks
- [ ] Environment variable configuration
- [ ] Production error handling
- [ ] Logging system (Winston/Pino)

## Known Workarounds

1. **Session Expiration**: Run scraper with `keepOpen: true` and manually navigate to verify what's happening
2. **Login Retries**: Already implemented (5 attempts)
3. **Field Clearing**: Triple-clear implemented but may need more robust solution

## Nice to Have

- [ ] Web UI for manual checks
- [ ] Docker containerization
- [ ] Multiple account support
- [ ] Proxy rotation (if BC starts rate limiting)
- [ ] CAPTCHA handling (not currently needed)
- [ ] 2FA support (if BC adds it)

## Questions for User

1. What specific data do you want from each section?
2. Should we re-login for each section as workaround?
3. Priority: fix session vs add more features?
4. Deploy timeline?
