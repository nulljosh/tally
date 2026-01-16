# TODO - BC Self-Serve Scraper

## KEY DISCOVERY - Jan 16, 2026 (Network Analysis)

**FOUND THE BUG!** Network traffic analysis revealed the exact issue:

1. ✅ Login to BCeID succeeds properly
2. ✅ BCeID redirects back to myselfserve.gov.bc.ca
3. ❌ **Site IMMEDIATELY calls these endpoints:**
   - `GET /Auth/SessionTimeout`
   - `GET /Auth/SessionTimeout/ShowError`
   - `GET /Auth/Signout`
4. ❌ **Session cookie gets cleared:** `ASP.NET_SessionId=; path=/; secure`
5. ❌ All subsequent requests get `?SMSESSION=NO` parameter
6. ❌ Everything redirects (302) back to login

**Root Cause:** The site has an automatic session timeout/signout bug that fires immediately after successful login. This is a legacy ASP.NET session management issue with their SiteMinder (SM) configuration.

**Solution:** Re-login before scraping each section, or stay on the landing page after login without navigation.

## Progress Checklist (71% Complete)

### ✅ What's Working (40%)
- ✅ Node.js + Puppeteer setup
- ✅ GitHub repo with proper .gitignore
- ✅ Automated headless browser
- ✅ Navigate to homepage
- ✅ Click "Sign in" button
- ✅ Find BCeID login form
- ✅ Clear pre-filled form fields
- ✅ Type username & password
- ✅ Submit login form
- ✅ Detect login errors
- ✅ Retry logic (5 attempts)
- ✅ **LOGIN SUCCEEDS** (usually attempt 2-3)
- ✅ Save 4 cookies
- ✅ JSON output files
- ✅ Screenshot capture
- ✅ Express API scaffolded
- ✅ npm scripts (test, start, api)
- ✅ Runs fully headless

### ❌ What's Broken (60%)
- ❌ **Navigate to `/Auth` → KICKED BACK TO LOGIN**
- ❌ **Navigate to `/Auth/Messages` → KICKED BACK TO LOGIN**
- ❌ **Navigate to `/Auth/PaymentInfo` → KICKED BACK TO LOGIN**
- ❌ **Navigate to `/Auth/ServiceRequests` → KICKED BACK TO LOGIN**
- ❌ Extract notifications (blocked by sessions)
- ❌ Extract messages (blocked by sessions)
- ❌ Extract payment info (blocked by sessions)
- ❌ Extract service requests (blocked by sessions)
- ❌ Monthly reports scraping
- ❌ Employment plans scraping
- ❌ Account info scraping

**Root Cause:** BC gov backend doesn't maintain sessions even with valid cookies. Not our bug - affects manual users too (especially mobile).

## The Problem

**What's happening:**
1. We successfully log in to BCeID (`logon7.gov.bc.ca`)
2. BCeID redirects back to `myselfserve.gov.bc.ca`
3. We save 4 cookies from the session
4. We try to navigate to `/Auth/Messages` or any protected page
5. **BC gov immediately kicks us back to the login page**
6. Even though we have valid cookies from 2 seconds ago

**Why it happens:**
- BC government's session management is broken/strict
- Cookies aren't being validated properly on protected routes
- Sessions expire on page navigation (even manual users have this issue)
- Likely a backend configuration problem with their authentication middleware

## Potential Fixes (Easiest to Hardest)

### 1. Stay on Same Page After Login (EASIEST)
- Don't navigate to different URLs
- After login, check what page we land on
- If it has data, scrape it there
- Use browser console/network tab to find API endpoints
- Call APIs directly instead of navigating

### 2. Re-Login for Each Section
- Log in once
- Scrape Notifications
- Log out and log back in
- Scrape Messages
- Repeat for each section
- Inefficient but might work

### 3. Inspect Network Traffic
- Use browser DevTools to watch what the site does manually
- Find the actual API calls for data
- Bypass the navigation entirely
- Call the API endpoints directly with our cookies

### 4. Single Page Scraping
- After login, stay on landing page
- Use JavaScript to click tabs/sections without page navigation
- Scrape data as it loads dynamically
- Might work if tabs use AJAX instead of full page loads

### 5. Cookie Domain Investigation
- Check if cookies are set for wrong domain
- BC might be using `myselfserve.gov.bc.ca` but redirecting through `logon7.gov.bc.ca`
- Try setting cookies for both domains
- Check cookie `SameSite`, `Secure`, `Path` attributes

### 6. Session Token Extraction
- Find where BC stores the actual session token
- Might be in localStorage, sessionStorage, or hidden form field
- Extract and manually include in requests

### 7. Reverse Engineer Their JS
- Look at the site's JavaScript files
- Find how they maintain sessions
- Replicate their exact authentication flow

### 8. Contact BC Gov IT (HARDEST/POINTLESS)
- Report the session bug
- Wait 5-10 business years for response
- They probably won't fix it

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
