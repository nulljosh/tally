# BC Self-Serve Portal Scraper

Automated scraper for BC government self-serve portal (myselfserve.gov.bc.ca). Scrapes notifications, messages, payment info, and service requests with automated BCeID login.

**Version:** 1.0.0

## Features

- ✅ Automated BCeID login with retry logic
- ✅ Scrapes 4 sections: Notifications, Messages, Payment Info, Service Requests
- ✅ Handles BC gov's broken session management (re-login strategy)
- ✅ Rate limiting protection (20s delays between sections)
- ✅ Screenshots of each section
- ✅ JSON output with structured data
- ✅ Express API for on-demand checks
- ✅ Comprehensive test suite
- ✅ Cookie persistence between runs

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Credentials
Create a `.env` file with your BCeID credentials:
```env
BCEID_USERNAME=your_username
BCEID_PASSWORD=your_password
```

### 3. Run the Scraper
```bash
npm run check
# or
node scraper.js
```

### 4. Start the API Server
```bash
npm start
# Server runs on http://localhost:3000
```

## API Usage

The Express API provides on-demand scraping via HTTP endpoints:

### Endpoints

#### `GET /`
Get API information
```bash
curl http://localhost:3000/
```

#### `GET /check`
Trigger a new scrape of all sections
```bash
curl http://localhost:3000/check
```

Response:
```json
{
  "success": true,
  "data": {
    "timestamp": "2026-01-16T...",
    "sections": {
      "Notifications": {
        "success": true,
        "allText": ["item1", "item2"],
        "screenshot": "notifications-....png"
      },
      "Messages": { ... },
      "Payment Info": { ... },
      "Service Requests": { ... }
    }
  }
}
```

#### `GET /status`
Get last check results (cached)
```bash
curl http://localhost:3000/status
```

#### `GET /health`
Health check endpoint
```bash
curl http://localhost:3000/health
```

## NPM Scripts

```bash
npm run check         # Run scraper once
npm test              # Run test suite
npm start             # Start API server
npm run api           # Alias for npm start
npm run dev           # Development mode (same as start)
```

## How It Works

### The Session Bug

BC government's site has a legacy ASP.NET session management bug:
1. Login succeeds on BCeID (`logon7.gov.bc.ca`)
2. Redirected back to `myselfserve.gov.bc.ca`
3. Site immediately calls `/Auth/SessionTimeout` → `/Auth/Signout`
4. Session gets killed, all cookies cleared

### Our Solution

**Re-login strategy:** Log in fresh before scraping each section
- Navigate to homepage
- Click "Sign in"
- Fill credentials
- Submit form
- Immediately navigate to target section
- Scrape data before session expires
- Clear cookies and wait 20s before next section

This works around BC's broken session management.

## Project Structure

```
/selfserve
├── scraper.js          # Main scraper (re-login strategy)
├── api.js              # Express API server
├── test.js             # Test suite with auto-grading
├── network-debug.js    # Network traffic debugging tool
├── package.json        # Dependencies and scripts
├── .env                # Credentials (gitignored)
├── cookies.json        # Saved cookies (auto-generated)
├── chrome-data/        # Persistent Chrome profile
├── results-*.json      # Scraping results
└── *.png               # Screenshots

```

## Testing

Run the test suite:
```bash
npm test
```

The test suite validates:
- Scraper execution
- Result structure
- Section coverage
- Data extraction
- File outputs (screenshots, JSON)
- Auto-grades performance

## Troubleshooting

### Login Fails
- Verify credentials in `.env`
- Check if BCeID account is locked
- BC's site is flaky - scraper retries 3x per section

### Rate Limited
- BC gov blocks rapid logins
- Scraper waits 20s between sections
- For manual runs, wait a few minutes between attempts

### Session Expires
- This is normal - BC's bug, not ours
- Scraper handles it with re-login strategy
- See `TODO.md` for technical details

### Browser Won't Close
- Kill with: `pkill -f "node scraper.js"`
- Or: `pkill -f "Chromium.*chrome-data"`

## Development

### Debug Network Traffic
```bash
node network-debug.js
```
Opens browser and logs all HTTP requests/responses to help debug session issues.

### Fresh Start
```bash
rm cookies.json
rm -rf chrome-data/
npm run check
```

## Deployment

### Vercel / Serverless
- Update scraper to use `headless: true`
- May need `@sparticuz/chromium` package
- Consider timeout limits (scraping takes ~2-3 minutes)

### Cron Job / VPS
```bash
# Run every hour
0 * * * * cd /path/to/selfserve && node scraper.js
```

### Docker
```dockerfile
FROM node:18
# Install Chrome dependencies
RUN apt-get update && apt-get install -y chromium
# ... copy files, npm install
CMD ["node", "api.js"]
```

## Future Enhancements

- [ ] Push notifications (Twilio SMS, Pushover)
- [ ] Email alerts via SendGrid/Mailgun
- [ ] Webhook support
- [ ] Historical data tracking (SQLite/PostgreSQL)
- [ ] Status change detection (only notify on changes)
- [ ] Multiple account support
- [ ] Web UI dashboard
- [ ] Scheduled cron in production

## Technical Notes

### Session Management
- BC uses SiteMinder (SM) for auth
- Sessions timeout on navigation (design flaw)
- Cookies: `ASP.NET_SessionId`, `SMSESSION`, etc.
- See `network-log-*.json` for full traffic analysis

### Rate Limiting
- BC gov limits rapid logins (anti-bot)
- 20s delays between sections
- Consider exponential backoff for failures

### Sections Scraped
1. **Notifications**: `https://myselfserve.gov.bc.ca/Auth`
2. **Messages**: `https://myselfserve.gov.bc.ca/Auth/Messages`
3. **Payment Info**: `https://myselfserve.gov.bc.ca/Auth/PaymentInfo`
4. **Service Requests**: `https://myselfserve.gov.bc.ca/Auth/ServiceRequests`

## Security

- `.env` file gitignored (never commit credentials)
- `cookies.json` gitignored (session tokens)
- Use environment variables in production
- Consider rotating credentials regularly
- BC gov site uses HTTPS (secure)

## Contributing

This is a personal project but improvements welcome:
- Better rate limiting strategies
- More robust scraping selectors
- Additional sections support
- Notification integrations

## License

ISC

---

**Note:** This scraper is for personal use only. Respect BC government's terms of service and rate limits. The session bug is on BC's end - we're just working around it.
