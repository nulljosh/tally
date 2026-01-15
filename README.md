# BC Self-Serve Payment Checker

Automated scraper to check payment status on the BC government self-serve portal (myselfserve.gov.bc.ca).

## Features

- Automated login with BCeID credentials
- Cookie persistence for faster subsequent runs
- Persistent Chrome profile (stays logged in between runs)
- Automatic payment status detection
- Screenshot capture
- Visual browser mode (watch it work)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure your credentials in `.env`:
   ```env
   BCEID_USERNAME=your_username
   BCEID_PASSWORD=your_password
   ```

3. Run the scraper:
   ```bash
   node scraper.js
   ```

## How It Works

1. Opens Chrome browser (visible window)
2. Attempts to load saved cookies/session
3. If not logged in, navigates to the login page at `logon7.gov.bc.ca`
4. Tries automated login with credentials from `.env`
5. Falls back to manual login if automated login fails
6. Saves cookies and Chrome profile for next run
7. Searches for payment-related keywords on the page
8. Takes a timestamped screenshot
9. Keeps browser open for manual inspection

## Login Flow

The login URL is: `https://logon7.gov.bc.ca/clp-cgi/capBceid/logon.cgi...`

After successful login, you'll be redirected to: `https://myselfserve.gov.bc.ca/Auth/Login`

## Files

- `scraper.js` - Main scraper script
- `.env` - Your credentials (not committed to git)
- `cookies.json` - Saved session cookies (auto-generated)
- `chrome-data/` - Persistent Chrome profile (auto-generated)
- `payment-status-*.png` - Screenshots with timestamps

## Running on a Schedule

To check automatically, you can set up a cron job or Task Scheduler:

```bash
# Run every hour
0 * * * * cd /path/to/selfserve && node scraper.js
```

## Future Enhancements

- [ ] Push notifications (Pushover, Twilio, etc.)
- [ ] SMS notifications when payment status changes
- [ ] Deploy to Vercel serverless function
- [ ] Store payment history
- [ ] Email alerts
- [ ] Headless mode for server deployment
- [ ] More robust payment status parsing

## Troubleshooting

- **Browser won't open**: Make sure Puppeteer is properly installed
- **Login fails**: Check your credentials in `.env`
- **Cookies expired**: Delete `cookies.json` and `chrome-data/` folder to start fresh
- **No payment info found**: The scraper keeps the browser open - manually navigate to payment page

## Security Notes

- Never commit `.env` file
- Keep `cookies.json` private
- Consider using environment variables for production deployment
