# Tally

Track BC Self-Serve benefits with a secure login, per-user cache, and fast dashboard reads.

Live: https://tally-production.vercel.app

![Workflow Diagram](docs/workflow.svg)

## Current Status (2026-02-16)

- Login-first flow is enforced on `/`.
- Dashboard is served at `/app` after authentication.
- Per-user Blob cache keys are enabled: `tally-cache/<userId>/results.json`.
- Browser credential prefill is enabled from `localStorage`/`sessionStorage`.
- Manual production deploy is configured via Vercel CLI.

## How It Works

1. User opens `/` and is redirected to `/login.html`.
2. User signs in with BC Self-Serve credentials.
3. Server validates credentials and creates a secure session.
4. Session stores a deterministic `userId` derived from username hash.
5. Dashboard reads latest data for that user scope.
6. Local scraper can upload fresh results to that same user scope.

## Core Features

- Secure login with rate limiting (`5 attempts / 15 min`)
- Session-based auth (httpOnly, secure cookies)
- Encrypted session credential storage (AES-256-CBC)
- Per-user Vercel Blob cache separation
- Unified dashboard for payment, messages, notifications, requests
- DTC navigator endpoints in the same app

## Routes

- `GET /` -> redirects to `/login.html`
- `GET /login.html` -> login UI
- `GET /app` -> authenticated dashboard
- `POST /api/login` -> authenticate
- `POST /api/logout` -> clear session
- `GET /api/me` -> auth state
- `GET /api/latest` -> latest cached data (auth required)
- `POST /api/upload` -> upload data to Blob (token + user id required)

## Per-User Blob Storage

- Upload target: `tally-cache/<userId>/results.json`
- `userId` is the first 16 chars of SHA-256(username)
- Upload API accepts user id from `X-User-ID` header or query

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Scrape + Upload

```bash
npm run check
npm run upload-blob
```

`upload-to-blob.js` sends:
- `Authorization: Bearer $UPLOAD_SECRET`
- `X-User-ID: <hashed BCEID username>`

## Environment Variables

Required for production:

- `SESSION_SECRET`
- `UPLOAD_SECRET`
- `BLOB_READ_WRITE_TOKEN`

Optional/local:

- `BCEID_USERNAME`
- `BCEID_PASSWORD`
- `API_TOKEN`

## Journaling and Auto Push

Project journaling location (centralized):
- `~/Documents/Code/JOURNAL.md`

Auto-push hook:
- `.githooks/post-commit`

Enable hooks locally:

```bash
git config core.hooksPath .githooks
```

After that, each commit auto-runs `git push origin <current-branch>`.

## Project Layout

```text
tally/
├── api/
│   ├── latest.js
│   └── upload.js
├── docs/
│   └── workflow.svg
├── scripts/
│   └── upload-to-blob.js
├── src/
│   ├── api.js
│   └── scraper.js
├── web/
│   ├── login.html
│   └── unified.html
├── architecture.svg
└── vercel.json
```
