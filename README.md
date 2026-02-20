# Tally

Track BC Self-Serve benefits with a secure login, per-user cache, and fast dashboard reads.

**Live:** https://tally-production.vercel.app
**Version:** 1.4.0-beta

## What It Does

Tally pulls your BC Self-Serve data — payments, messages, notifications — and shows it in plain English. No government portal maze required.

Built for BC residents. Not affiliated with the Government of British Columbia.

## Current Status (2026-02-19)

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
5. Dashboard at `/app` reads latest data for that user scope
6. Local scraper can upload fresh results to the same user blob

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
- Session-based auth (httpOnly, secure cookies)
- Encrypted session credential storage (AES-256-CBC)
- Puppeteer scraping via `@sparticuz/chromium` (works on Vercel)
- Per-user Vercel Blob cache separation
- Unified dashboard: payments, messages, notifications, service requests

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
│   ├── index.html         # Dashboard (app)
│   └── ...
├── .github/
│   └── workflows/
│       └── deploy.yml     # CI: install + syntax check
└── vercel.json
```

## Changelog

### v1.4.0-beta — 2026-02-19
- Add benefits screener at `/screen` (public, no auth) — retirement + disability programs
- Add `/api/info` endpoint (auth required) — structured payment summary JSON
- Add `npm run info` + `scripts/tally-info.sh` local test shortcut
- Add bouncy spring hover animations to screener cards and buttons
- Add MIT License footer to landing page and screener
- Bump version 1.3.0 → 1.4.0-beta

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
