# Tally

Track BC Self-Serve benefits with a secure login, per-user cache, and fast dashboard reads.

**Live:** https://tally-production.vercel.app
**Version:** 1.6.1

## What It Does

Tally pulls your BC Self-Serve data — payments, messages, notifications — and shows it in plain English. No government portal maze required.

Built for BC residents. Not affiliated with the Government of British Columbia.

## Current Status (2026-02-23)

- Public landing page at `/` (static, no auth required)
- Login-first flow enforced on `/app`
- Puppeteer runs on Vercel via `@sparticuz/chromium` (no timeout workaround needed)
- Per-user Blob cache: `tally-cache/<userId>/results.json`
- CI: passing on every push (Node.js syntax + install check)

## How It Works

1. User lands on `/` — public landing page explaining the product
2. User clicks "Get started" → `/login` with BCEID credentials
3. Server validates credentials via Puppeteer against BC Self-Serve
4. Session created, `userId` derived from SHA-256(username)
5. Encrypted persistent auth cookie keeps login stable even when serverless memory resets
6. Dashboard at `/app` reads latest data for that user scope
7. Local scraper can upload fresh results to the same user blob

## Routes

| Route | Destination | Auth |
|---|---|---|
| `GET /` | Landing page | No |
| `GET /login` | Login UI | No |
| `POST /api/login` | Authenticate | No |
| `GET /app` | Dashboard | Required |
| `GET /api/latest` | Latest cached data | Required |
| `GET /api/check` | Trigger live scrape | Required |
| `POST /api/upload` | Upload data to Blob | Token |
| `POST /api/logout` | Clear session | Required |
| `GET /api/me` | Auth state | No |
| `GET /screen` | Benefits screener | No |
| `GET /api/info` | Structured payment summary | Required |
| `POST /api/dtc/screen` | DTC eligibility | No |

## Core Features

- Benefits screener at `/screen` (public, no auth) — OAS, GIS, CPP, BC PWD, DTC, SAFER
- Structured `/api/info` endpoint — payment amount, next date, unread count, active benefits
- Public landing page with product explainer
- Secure login with rate limiting (5 attempts / 15 min)
- Session-based auth with encrypted persistent auth-cookie fallback (httpOnly, secure cookies)
- Encrypted session credential storage (AES-256-CBC)
- Puppeteer scraping via `@sparticuz/chromium` (works on Vercel)
- Per-user Vercel Blob cache separation
- Unified dashboard with payment hero, nav dropdowns for messages/notifications

## Local Development

```bash
npm install
npm run dev       # nodemon + browser-sync
# or
npm start         # node src/api.js
```

Open http://localhost:3000.

Copy `.env.example` to `.env` and fill in your credentials.

## Local Test Shortcut

Print your latest payment data from the terminal:

```bash
npm run info      # runs scripts/tally-info.sh
```

Reads `.env` for credentials, hits the local server, prints payment amount, next date, and message count. Requires `npm start` running first.

## Scrape + Upload

```bash
npm run check         # Run scraper locally
npm run upload-blob   # Push results to Vercel Blob
```

## Environment Variables

**Required for production (Vercel Dashboard):**
- `SESSION_SECRET` — encryption key for sessions
- `UPLOAD_SECRET` — token for `/api/upload`
- `BLOB_READ_WRITE_TOKEN` — auto-provided by Vercel

**Optional (local .env):**
- `BCEID_USERNAME` / `BCEID_PASSWORD` — default credentials
- `PUPPETEER_EXECUTABLE_PATH` — override Chrome path locally
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — optional advanced Redis session store (not required)

## Project Layout

```
tally/
├── api/
│   ├── latest.js          # Vercel: read blob data
│   └── upload.js          # Vercel: write blob data
├── scripts/
│   └── upload-to-blob.js  # Local: upload scrape results
├── src/
│   ├── api.js             # Express app (auth, routes, sessions)
│   └── scraper.js         # Puppeteer BC Self-Serve scraper
├── web/
│   ├── landing.html       # Public landing page
│   ├── login.html         # Login UI
│   ├── unified.html       # Dashboard (served at /app)
│   ├── index.html         # Legacy dashboard (unused)
│   └── ...
├── .github/
│   └── workflows/
│       └── deploy.yml     # CI: install + syntax check
└── vercel.json
```

## Changelog

### v1.6.1 — 2026-02-23
- Add encrypted persistent auth cookie fallback for session continuity on Vercel (no Redis required)
- Rehydrate `express-session` from auth cookie when server memory resets
- Improve login/logout/session-expiry error handling with explicit messages
- Add auth cookie unit tests (`npm run test:auth-cookie`)

### v1.5.0 — 2026-02-21
- Minimal dashboard: single large income number centered in viewport (clamp 64-120px)
- Next payment date with day-of-week countdown (25th each month)
- Messages and notifications as dropdown menus below nav
- Parsed pipe-delimited payment data, title-cased ALL CAPS, skip empty fields
- Hidden Security Testing and Tools tabs (dev-only)
- Cache-Control: no-cache for HTML files
- Removed stat grid, card wrappers, Check Now/Refresh buttons

### v1.4.2 — 2026-02-21
- Add monthly productivity check-in panel on `/app` with 1-tap presets (Strong/Steady/Recovering), 1-5 Mood/Focus/Energy selectors, and optional reflection note
- Add friction reducers: autosaved monthly draft, `Cmd/Ctrl + Enter` save shortcut, and "Reuse Last Month" copy action
- Add month-over-month delta visualization for Mood/Focus/Energy with clear positive/negative/flat badges and average trend summary
- Improve responsive behavior and style consistency for the new check-in + delta card (desktop split layout, mobile single-column)
- Add unit tests for monthly check-in logic and delta calculations in `tools/test-productivity.js`

### v1.4.1 — 2026-02-19
- Security: session fingerprinting (UA hash) — detects token theft
- Security: input validation on `/api/login` — reject malformed credentials before Puppeteer
- Add: styled 404 handler matching BC gov blue design
- Add: `Cache-Control: private, max-age=300` on `/api/info`
- Fix: dashboard error boundary shows "data unavailable" instead of loading spinner on network failure
- Fix: screener nav green gradient removed (now flat navy `rgba(12,18,32,0.95)`)
- Bump version 1.4.0 → 1.4.1

### v1.4.0 — 2026-02-19
- Add benefits screener at `/screen` (public, no auth) — retirement + disability programs
- Add `/api/info` endpoint (auth required) — structured payment summary JSON
- Add `npm run info` + `scripts/tally-info.sh` local test shortcut
- Add bouncy spring hover animations to screener cards and buttons
- Add MIT License footer to landing page and screener
- BC government blue color palette (#1a5a96 / #2472b2 / #4e9cd7), navy bg (#0c1220)
- Remove emojis, heavy shadows, gradient backgrounds
- Auto-login on localhost when .env credentials present
- Bump version 1.3.0 → 1.4.0

### v1.3.0 — 2026-02-19
- Add public landing page (`web/landing.html`) at `/`
- Fix: Puppeteer `executablePath` was hardcoded to macOS Chrome path — dead on Vercel Linux. Now uses `@sparticuz/chromium` when `VERCEL` env is set
- Fix: Replace broken GitHub Pages CI workflow with real Node.js CI
- Bump version 1.2.0 → 1.3.0

### v1.2.0 — 2026-02-16
- Per-user Blob cache separation
- Browser credential prefill from localStorage

### v1.0.0
- Initial launch: login, dashboard, Blob storage, DTC navigator

## Project Map

```svg
<svg viewBox="0 0 680 420" width="680" height="420" xmlns="http://www.w3.org/2000/svg" style="font-family:monospace;background:#f8fafc;border-radius:12px">
  <rect width="680" height="420" fill="#f8fafc" rx="12"/>
  <text x="340" y="24" font-size="13" font-weight="bold" fill="#0f172a" text-anchor="middle">tally — BC Benefits Tracker</text>

  <!-- Root -->
  <rect x="290" y="38" width="100" height="28" rx="6" fill="#0071e3"/>
  <text x="340" y="57" font-size="11" fill="white" text-anchor="middle">tally/</text>

  <!-- Connectors -->
  <line x1="340" y1="66" x2="340" y2="80" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>
  <line x1="80" y1="80" x2="600" y2="80" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>

  <!-- web/ -->
  <line x1="80" y1="80" x2="80" y2="94" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>
  <rect x="34" y="94" width="92" height="26" rx="6" fill="#6366f1"/>
  <text x="80" y="111" font-size="11" fill="white" text-anchor="middle">web/</text>
  <line x1="80" y1="120" x2="80" y2="134" stroke="#64748b" stroke-width="1"/>
  <rect x="22" y="134" width="116" height="22" rx="4" fill="#fef3c7"/>
  <text x="80" y="149" font-size="10" fill="#92400e" text-anchor="middle">landing.html</text>
  <line x1="80" y1="156" x2="80" y2="170" stroke="#64748b" stroke-width="1"/>
  <rect x="22" y="170" width="116" height="22" rx="4" fill="#fef3c7"/>
  <text x="80" y="185" font-size="10" fill="#92400e" text-anchor="middle">dashboard.html</text>
  <line x1="80" y1="192" x2="80" y2="206" stroke="#64748b" stroke-width="1"/>
  <rect x="22" y="206" width="116" height="22" rx="4" fill="#fef3c7"/>
  <text x="80" y="221" font-size="10" fill="#92400e" text-anchor="middle">login.html</text>
  <line x1="80" y1="228" x2="80" y2="242" stroke="#64748b" stroke-width="1"/>
  <rect x="22" y="242" width="116" height="22" rx="4" fill="#fef3c7"/>
  <text x="80" y="257" font-size="10" fill="#92400e" text-anchor="middle">benefits.html</text>
  <line x1="80" y1="264" x2="80" y2="278" stroke="#64748b" stroke-width="1"/>
  <rect x="22" y="278" width="116" height="22" rx="4" fill="#e0e7ff"/>
  <text x="80" y="293" font-size="10" fill="#3730a3" text-anchor="middle">css/</text>

  <!-- api/ -->
  <line x1="220" y1="80" x2="220" y2="94" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>
  <rect x="174" y="94" width="92" height="26" rx="6" fill="#6366f1"/>
  <text x="220" y="111" font-size="11" fill="white" text-anchor="middle">api/</text>
  <line x1="220" y1="120" x2="220" y2="134" stroke="#64748b" stroke-width="1"/>
  <rect x="162" y="134" width="116" height="22" rx="4" fill="#e0e7ff"/>
  <text x="220" y="149" font-size="10" fill="#3730a3" text-anchor="middle">latest.js</text>
  <line x1="220" y1="156" x2="220" y2="170" stroke="#64748b" stroke-width="1"/>
  <rect x="162" y="170" width="116" height="22" rx="4" fill="#e0e7ff"/>
  <text x="220" y="185" font-size="10" fill="#3730a3" text-anchor="middle">upload.js</text>

  <!-- src/ -->
  <line x1="340" y1="80" x2="340" y2="94" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>
  <rect x="294" y="94" width="92" height="26" rx="6" fill="#6366f1"/>
  <text x="340" y="111" font-size="11" fill="white" text-anchor="middle">src/</text>
  <line x1="340" y1="120" x2="340" y2="134" stroke="#64748b" stroke-width="1"/>
  <rect x="282" y="134" width="116" height="22" rx="4" fill="#e0e7ff"/>
  <text x="340" y="149" font-size="10" fill="#3730a3" text-anchor="middle">api.js</text>
  <line x1="340" y1="156" x2="340" y2="170" stroke="#64748b" stroke-width="1"/>
  <rect x="282" y="170" width="116" height="22" rx="4" fill="#e0e7ff"/>
  <text x="340" y="185" font-size="10" fill="#3730a3" text-anchor="middle">scraper.js</text>
  <text x="340" y="198" font-size="9" fill="#64748b" text-anchor="middle">Puppeteer / BC Self-Serve</text>

  <!-- data/ -->
  <line x1="460" y1="80" x2="460" y2="94" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>
  <rect x="414" y="94" width="92" height="26" rx="6" fill="#6366f1"/>
  <text x="460" y="111" font-size="11" fill="white" text-anchor="middle">data/</text>
  <line x1="460" y1="120" x2="460" y2="134" stroke="#64748b" stroke-width="1"/>
  <rect x="402" y="134" width="116" height="22" rx="4" fill="#dcfce7"/>
  <text x="460" y="149" font-size="10" fill="#166534" text-anchor="middle">sample-benefits.json</text>

  <!-- Config -->
  <line x1="600" y1="80" x2="600" y2="94" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4,3"/>
  <rect x="540" y="94" width="120" height="26" rx="6" fill="#6366f1"/>
  <text x="600" y="111" font-size="11" fill="white" text-anchor="middle">config files</text>
  <line x1="600" y1="120" x2="600" y2="134" stroke="#64748b" stroke-width="1"/>
  <rect x="540" y="134" width="120" height="22" rx="4" fill="#e0f2fe"/>
  <text x="600" y="149" font-size="10" fill="#0369a1" text-anchor="middle">vercel.json</text>
  <line x1="600" y1="156" x2="600" y2="170" stroke="#64748b" stroke-width="1"/>
  <rect x="540" y="170" width="120" height="22" rx="4" fill="#e0f2fe"/>
  <text x="600" y="185" font-size="10" fill="#0369a1" text-anchor="middle">package.json</text>
  <line x1="600" y1="192" x2="600" y2="206" stroke="#64748b" stroke-width="1"/>
  <rect x="540" y="206" width="120" height="22" rx="4" fill="#e0f2fe"/>
  <text x="600" y="221" font-size="10" fill="#0369a1" text-anchor="middle">nodemon.json</text>

  <!-- Blob cache note -->
  <rect x="150" y="340" width="380" height="36" rx="8" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1"/>
  <text x="340" y="357" font-size="10" fill="#475569" text-anchor="middle">Vercel Blob cache: tally-cache/&lt;userId&gt;/results.json</text>
  <text x="340" y="370" font-size="9" fill="#94a3b8" text-anchor="middle">SHA-256(username) scoped per user · &lt;100ms reads</text>

  <!-- Legend -->
  <rect x="20" y="395" width="14" height="14" rx="3" fill="#0071e3"/>
  <text x="40" y="406" font-size="9" fill="#64748b">root</text>
  <rect x="80" y="395" width="14" height="14" rx="3" fill="#6366f1"/>
  <text x="100" y="406" font-size="9" fill="#64748b">folder</text>
  <rect x="150" y="395" width="14" height="14" rx="3" fill="#e0e7ff"/>
  <text x="170" y="406" font-size="9" fill="#64748b">source</text>
  <rect x="220" y="395" width="14" height="14" rx="3" fill="#e0f2fe"/>
  <text x="240" y="406" font-size="9" fill="#64748b">config</text>
  <rect x="290" y="395" width="14" height="14" rx="3" fill="#fef3c7"/>
  <text x="310" y="406" font-size="9" fill="#64748b">HTML</text>
  <rect x="350" y="395" width="14" height="14" rx="3" fill="#dcfce7"/>
  <text x="370" y="406" font-size="9" fill="#64748b">data</text>
</svg>
```
