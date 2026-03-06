# Tally - Claude Development Guide

## Design Rules
- **NO EMOJIS** -- strictly none anywhere in UI or code
- **Aesthetic**: Minimal monochrome, cloned from heyitsmejosh.com portfolio
- **Color palette**: Monochrome. Light: #ffffff bg, #f5f5f5 secondary, #171717 text, #737373 muted, #e5e5e5 border. Dark: #0a0a0a bg, #171717 secondary, #fafafa text, #a3a3a3 muted, #262626 border.
- **Typography**: System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif`). No Fraunces, no DM Sans, no Google Fonts.
- **Layout**: 640px max-width container, centered. Single-column, text-first.
- **Theme toggle**: Sun/moon SVG button, View Transitions API (`document.startViewTransition()`), `[data-theme="dark"]` on `<html>`, localStorage + system preference detection.
- **Links**: Underline-hover animation (`::after` pseudo-element, `width: 0 -> 100%`, `0.3s cubic-bezier(0.4, 0, 0.2, 1)`). No pill CTAs.
- **Lists**: Bordered `.items` list (`border-top: 1px solid var(--border)` between items).
- **No glass morphism** -- no `backdrop-filter`, no frosted glass, no `rgba` backgrounds. Solid colors only.
- **No noise texture** -- no SVG fractalNoise overlays.
- **No gradients** -- solid backgrounds only.
- **Shadows**: Minimal. `0 1px 2px rgba(0,0,0,0.05)` max.
- **Animations**: Spring hover on interactive elements -- `transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)`

## Project Overview
Multi-user BC Self-Serve scraper with DTC Navigator + D2L school grade dashboard. Benefits tracking with BCEID login, plus Playwright-based D2L Brightspace integration for grades, PDF download, auto-fill, and dropbox submission.

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
- `tools/school/scrape_pdfs.py` - D2L PDF scraper + dropbox submitter (Playwright, iframe dialog + file chooser)
- `web/school.html` - School grade dashboard

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

### 2026-03-01 -- v2.0.0 (Portfolio vibe clone overhaul)
- Full design overhaul: replaced Dark Editorial / BC gov blue / Apple Liquid Glass with minimal monochrome aesthetic cloned from heyitsmejosh.com portfolio
- Color system: monochrome light (#ffffff/#171717/#737373/#e5e5e5) and dark (#0a0a0a/#fafafa/#a3a3a3/#262626)
- Typography: system font stack, removed Fraunces + DM Sans + Google Fonts entirely
- Layout: 640px max-width container, single-column, text-first
- Theme toggle: sun/moon SVG button with View Transitions API on all pages (landing, login, dashboard, screen)
- Landing page: complete rebuild as portfolio-style minimal page with bordered item lists
- Login page: monochrome restyle, no card shadow, clean inputs
- Dashboard (unified.html): replaced glass morphism vars with solid monochrome, SVG theme toggle
- Benefits checker (screen.html): monochrome vars, removed noise texture, added theme toggle
- design-tokens.css: complete rewrite with monochrome token system
- manifest.json: updated theme_color and background_color
- Added /vibeclone Claude Code slash command for extracting design tokens from any URL

### 2026-02-19 -- v1.3.0 (Vercel fix + landing page)
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

## User Benefits Status
- PWD designation: documents submitted 2026-03-04, pending approval
- Current: Income Assistance (~$1000/mo) -> Expected: PWD (~$1500-1700/mo)
- Dashboard should reflect PWD payment amounts once approved

## Roadmap
- [x] D2L grade scraper + PDF auto-fill
- [x] School grade dashboard (school.html)
- [x] D2L dropbox submission (iframe dialog automation)
- [ ] PWD payment tracking (update income display when designation approved)
- [ ] iOS companion app (tally-ios)
- [ ] Auto-fill monthly reports end-to-end
- [x] ~~Push notifications~~ (dropped -- browser notifs not useful)
- [ ] DTC application automation
- [ ] Offline mode with cached data
- [ ] Multi-province support
