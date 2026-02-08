# Claimcheck - Claude Development Guide

## Project Overview
Multi-user BC Self-Serve scraper with DTC Navigator. Each user logs in with their own BC Self-Serve credentials to view their benefits data.

## Security Model
- Users authenticate with BC Self-Serve username/password
- Credentials encrypted in session (never logged)
- Session timeout: 2 hours (activity timeout: 1 hour)
- Rate limiting: 5 login attempts per 15 min
- HTTPS only, httpOnly cookies, SameSite strict
- .env file for local admin convenience (NOT committed to git)

## Vercel Deployment
- Blob storage for cached data (instant load)
- Scrape locally, upload to Blob via /api/upload
- No Puppeteer on Vercel (timeout issues)
- Dashboard reads from Blob cache

## Local Development
```bash
npm install
npm start  # Runs on localhost:3000
npm run check  # Run scraper
npm run upload-blob  # Upload to Vercel Blob
```

## Key Files
- `src/api.js` - Express API, auth, session handling, encryption
- `src/scraper.js` - Puppeteer BC Self-Serve scraper
- `web/unified.html` - Dashboard UI
- `web/login.html` - Login page (BC Self-Serve credentials)
- `api/upload.js` - Vercel Blob upload endpoint
- `scripts/upload-to-blob.js` - Local upload script

## Multi-User Flow
1. User enters BC Self-Serve credentials (or leaves blank for .env defaults)
2. Backend validates by attempting login with attemptBCLogin()
3. Credentials encrypted and stored in session
4. Scraper uses session credentials (or .env fallback)
5. Data cached in Vercel Blob for instant dashboard load

## Environment Variables
**Local (.env):**
```
BCEID_USERNAME=your_username
BCEID_PASSWORD=your_password
SESSION_SECRET=random_string
UPLOAD_SECRET=random_string
VERCEL_URL=https://claimcheck.vercel.app
```

**Vercel Dashboard:**
- `UPLOAD_SECRET` - Random token for /api/upload auth
- `SESSION_SECRET` - Encryption key for sessions
- `BLOB_READ_WRITE_TOKEN` - Auto-provided by Vercel

## API Endpoints
- `POST /api/login` - Validate BC Self-Serve credentials, create session (rate limited)
- `POST /api/logout` - Destroy session
- `GET /api/latest` - Get cached dashboard data (requires auth)
- `GET /api/check` - Trigger scrape (uses session or .env credentials)
- `POST /api/upload` - Upload data to Vercel Blob (requires UPLOAD_SECRET)
- `POST /api/dtc/screen` - DTC eligibility calculator

## Security Notes
- ⚠️ Never commit .env files
- ⚠️ Change BC Self-Serve password if credentials were exposed
- ⚠️ All data endpoints require authentication
- ⚠️ Credentials are encrypted in session storage (AES-256-CBC)
- ⚠️ Session timeout prevents stale sessions

## TODO
- [ ] Add vercel.json config (env vars, build settings)
- [ ] Test Vercel deployment end-to-end
- [ ] Set up Vercel environment variables
- [ ] (Optional) Set up local cron job for automatic scraping
- [ ] Consider multi-tenant storage (per-user Blob keys or database)
- [ ] Add session persistence (currently in-memory, won't work multi-instance)

## Naming
Project is being renamed from "selfserve" to "claimcheck" or "chequecheck" (TBD)
- **check** = American spelling (verify/review)
- **cheque** = Canadian spelling (payment)
- "chequecheck" = playful pun combining both
