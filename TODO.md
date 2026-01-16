# TODO - BC Self-Serve Scraper

## Current Status: v1.5.0 ✅

**All 4 sections working:**
- ✅ Notifications
- ✅ Messages (10 found)
- ✅ Payment Info
- ✅ Service Requests (1 active: "Shelter Update" from Jan 08)

---

## Next Features (Prioritized)

### P1 - High Priority

#### 1. Make Dashboard Interactive
**Current:** Messages/items are just text, not clickable
**Want:** Click messages to expand full content, click service requests for details

**Implementation:**
- Parse message IDs from BC gov site
- Make messages clickable → expand to show full text
- Add "View on BC Self-Serve" link for each item
- Maybe scrape full message content when clicked

---

#### 2. Improve Message Parsing
**Current:** Only scrapes message titles and dates
**Want:** Click into each message and get full content

**Implementation:**
- After getting messages list, click each one
- Extract full message body
- Parse sender, date, subject, body separately
- Save structured JSON:
  ```json
  {
    "id": "msg-123",
    "date": "2026-01-06",
    "subject": "Information Required",
    "body": "Full message text here...",
    "read": true/false
  }
  ```

**Benefits:**
- See full message content without logging in
- Search through messages
- Track read/unread status

---

#### 2. CLI Tool (`ss` command)
**Goal:** Quick command-line access to data

**Commands:**
```bash
ss messages              # List all messages
ss messages 1            # View specific message
ss notifications         # Check notifications
ss payment               # View payment info
ss requests              # View service requests
ss check                 # Run scraper now
ss --help                # Show help
```

**Implementation:**
- Create `bin/ss` executable
- Parse command + args
- Read latest results JSON
- Pretty-print output with colors

**Installation:**
```bash
npm link
# Now 'ss' command available globally
```

---

### P2 - Medium Priority

#### 3. Push Notifications
**Goal:** Get notified of new messages without checking manually

**Options:**
- **Pushover** (easiest, $5 one-time)
- **Twilio SMS** (pay per message)
- **Email** (free, but might go to spam)
- **Webhook** (Discord, Slack, custom)

**Implementation:**
- Track previous results
- Compare with new scrape
- If new message found, send notification
- Run on cron (every hour)

---

#### 4. Better Message Display in Dashboard
**Improvements:**
- Show newest messages first (chronological)
- Highlight unread messages
- Click to expand full message content
- Mark as read/unread
- Filter by date range

---

### P3 - Nice to Have

- [ ] Search functionality across all sections
- [ ] Export to CSV/PDF
- [ ] Historical tracking (store all past scrapes)
- [ ] Email digest (daily/weekly summary)
- [ ] Mobile-friendly dashboard
- [ ] Dark mode for dashboard
- [ ] Desktop app (Electron wrapper)

---

## Technical Debt

- [ ] Clean up old result files (auto-delete after 30 days)
- [ ] Add better error messages in dashboard when JSON load fails
- [ ] Optimize bundle size (Tailwind CDN → local build)
- [ ] Add tests for message parsing
- [ ] Document API endpoints in README

---

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

**Root Cause:** The site has an automatic session timeout/signout bug that fires immediately after successful login. This is a legacy ASP.NET session management issue with their SiteMinder (SM) configuration (circa 2005-2008, ~18 years old).

**Solution:** Re-login before scraping each section with 20-second delays to avoid rate limiting.

---

## Completed (v1.5.0 - Jan 16, 2026)

- [x] Fix session timeout bug with re-login strategy
- [x] Successfully scrape all 4 sections
- [x] Add 20s delays between sections to avoid rate limiting
- [x] Improve error handling and rate limit detection
- [x] Create test suite with auto-grading
- [x] Add comprehensive README with API docs
- [x] Create web dashboard (index.html)
- [x] Add SKILL.md reference guide
- [x] Tag v1.0.0 and push to GitHub
- [x] All sections working (Notifications, Messages, Payment, Service Requests)

---

## Completed (v1.0.0 - Jan 16, 2026)

- [x] Network debugging tool (network-debug.js)
- [x] Document session bug in TODO.md
- [x] Build Express API with /check, /status, /health endpoints
- [x] Add countdown timer for wait periods
- [x] Navigate to about:blank between sections
- [x] Update package.json to v1.0.0

---

## Known Limitations

- No real-time updates (must run scraper manually or via cron)
- BC gov rate limits rapid logins (20s delays required)
- Session bug is on BC's side (can't fix their 18-year-old code)
- Message content requires clicking into each message (not implemented yet)

---

**Next Session:** Implement message parsing improvements and/or CLI tool
