# Tally - Claude Development Guide

## Design Rules
- **NO EMOJIS** — strictly none anywhere in UI or code
- **Color palette**: BC government blue (#1a5a96 primary, #2472b2 mid, #4e9cd7 light), navy bg (#0c1220), amber accents (#d4a843). No green.
- **No heavy shadows** — max `box-shadow: 0 4px 16px rgba(0,0,0,0.2)`. No `box-shadow` glow on hover.
- **No gradients on backgrounds** — use solid colors or ultra-subtle radial (opacity 0.08 max). Nav background: flat semi-transparent, not gradient.
- **Animations**: Spring hover on all buttons/cards — `transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)`

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

### Puppeteer on Vercel
Puppeteer works on Vercel via `@sparticuz/chromium`. Both `src/api.js` and `src/scraper.js` detect the `VERCEL` env and use the bundled Chromium instead of a local Chrome path.

```js
const isVercel = !!process.env.VERCEL || !!process.env.LAMBDA_TASK_ROOT;
const executablePath = isVercel
  ? await chromium.executablePath()
  : (process.env.PUPPETEER_EXECUTABLE_PATH || '/Applications/Google Chrome.app/...');
```

### Blob Storage (for large scrape results)
Blob = cloud storage for scraped data when live scraping isn't practical:
1. **Local:** Run scraper → get results
2. **Upload:** `npm run upload-blob` → push to Vercel Blob
3. **Vercel:** `/api/latest` reads from Blob instantly

Blob keys: `tally-cache/<userId>/results.json`

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
- `web/landing.html` - Public landing page (served at `/`)
- `web/login.html` - Login page (BC Self-Serve credentials)
- `web/unified.html` - Dashboard UI (served at `/app`, auth required)
- `web/index.html` - Legacy dashboard (not served)
- `api/upload.js` - Vercel Blob upload endpoint
- `api/latest.js` - Vercel Blob read endpoint
- `scripts/upload-to-blob.js` - Local upload script

## Multi-User Flow
1. User enters BC Self-Serve credentials (or leaves blank for .env defaults)
2. Backend validates by attempting login with attemptBCLogin()
3. Credentials encrypted and stored in session
4. Scraper uses session credentials (or .env fallback)
5. Data cached in Vercel Blob for instant dashboard load

## Environment Variables
**Local (.env — copy from .env.example):**
```
BCEID_USERNAME=your_username
BCEID_PASSWORD=your_password
SESSION_SECRET=random_string
UPLOAD_SECRET=random_string
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

### 2026-02-19 — v1.3.0 (Vercel fix + landing page)
- Fixed: `api.js` had macOS hardcoded Chrome path — crashed on Vercel Linux. Now uses `@sparticuz/chromium` when `VERCEL` env is set (`scraper.js` already had this right)
- Fixed: CI workflow was "Deploy to GitHub Pages" (Pages never enabled, failed every push since Feb 16). Replaced with proper Node.js CI
- Added: public landing page `web/landing.html` — Fraunces serif, dark green/amber, explains product to laymen
- Updated: `vercel.json` routes `/` → `web/landing.html` (was api.js redirect)
- Tested: login with real BCEID creds locally → `{"success":true}` HTTP 200 confirmed
- Git: local repo had mmap EDEADLK corruption; rebuilt via GitHub API push + fresh clone

### 2026-02-09 — Auto-Login + OpenClaw Integration
- Fixed server-side auto-login with .env credentials
- Added `/api/summary` endpoint for OpenClaw integration (token-authenticated)
- Security fix: rotated UPLOAD_SECRET after accidental exposure
- OpenClaw can now query "how much am I getting?" and receive payment data

### 2026-02-21 — v1.5.0 (Minimal dashboard)
- Single large income number centered in viewport (clamp 64-120px)
- Next payment date with weekday + countdown (25th each month)
- Messages/notifications as dropdown menus below nav bar
- Parsed pipe-delimited tableData, title-cased ALL CAPS, skip empty fields
- Hidden Security Testing/Tools tabs, removed stat grid/card wrappers/buttons
- Cache-Control: no-cache for HTML files

### Key Learnings
- Server-side auth checks happen before client JS loads
- Never commit secrets (always check git diff)
- Browser cache requires hard refresh (Cmd+Shift+R) when testing
- API keys go in launchd env vars, not config files
- `@sparticuz/chromium` is the correct way to run Puppeteer on Vercel — detect with `!!process.env.VERCEL`
- Git mmap EDEADLK on macOS: don't waste time fixing it, just push via GitHub API and re-clone

## Token Efficiency
- Don't re-read files you just wrote/edited unless a write failed or something external changed.
- Don't re-run deterministic commands just to "double-check."
- Don't paste large code/file dumps unless asked; summarize diffs + outcomes.
- Batch related reads/commands; avoid redundant tool calls.
- Keep updates tight: what changed, why, what's left.

## Naming
Project name: **tally**
- **check** = American spelling (verify/review)
- **cheque** = Canadian spelling (payment)
- "tally" = playful pun combining both
- Decision finalized: "tally" (lowercase), display as "Tally" where appropriate
