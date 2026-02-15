# Tally - Claude Development Guide

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

### Why We Need Blob Storage (ELI5)
**Problem:** Vercel = serverless (no hard drive, can't save files)
- Puppeteer scraping takes 30-60 seconds
- Vercel free tier times out after 60 seconds
- Can't run scraper on Vercel → no data to show

**Solution:** Blob = Cloud storage (like Dropbox for your app)
1. **Local:** Run scraper → get results ($560 support, $500 shelter, etc.)
2. **Upload:** Push results to Vercel Blob (cloud storage)
3. **Vercel:** Read from Blob (instant, no scraping needed)

### How It Works
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
VERCEL_URL=https://tally.vercel.app
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

## Development History

### 2026-02-09 - Auto-Login + OpenClaw Integration
- Fixed server-side auto-login with .env credentials
- Added `/api/summary` endpoint for OpenClaw integration (token-authenticated)
- Security fix: rotated UPLOAD_SECRET after accidental exposure
- OpenClaw can now query "how much am I getting?" and receive payment data

### Key Learnings
- Server-side auth checks happen before client JS loads
- Never commit secrets (always check git diff)
- Browser cache requires hard refresh (Cmd+Shift+R) when testing
- API keys go in launchd env vars, not config files

## Naming
Project name: **tally**
- **check** = American spelling (verify/review)
- **cheque** = Canadian spelling (payment)
- "tally" = playful pun combining both
- Decision finalized: "tally" (lowercase), display as "Tally" where appropriate
