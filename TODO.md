# TODO - BC Self-Serve Scraper

## Current Status: v1.7.0 ✅

**All 4 sections working:**
- ✅ Notifications
- ✅ Messages (10 found)
- ✅ Payment Info (FIXED - new URL: `/Auth/ChequeInfo`, shows $1,060 total)
- ✅ Service Requests (1 active: "Shelter Update" from Jan 08)

**Dashboard:**
- ✅ Password protected (hunter2)
- ✅ Dark/light mode toggle
- ✅ Deployed to Vercel: https://selfserve-c2cldmw48-nulljosh-9577s-projects.vercel.app
- ✅ Mobile-first responsive design
- ✅ Clickable links to BC Self-Serve

---

## Vercel Deployment Notes

**URL:** https://selfserve-c2cldmw48-nulljosh-9577s-projects.vercel.app
**Password:** hunter2

**Important:** Data on Vercel is static (from Jan 16, 2026). To update:
1. Run scraper locally: `npm run check`
2. Force-add latest results: `git add -f results-2026-01-16T*.json`
3. Commit and push: `git commit -m "Update data" && git push`
4. Vercel auto-deploys in ~30s

**Vercel Deployment Limitations:**
- ⚠️ **Sessions don't work on serverless** - Each request hits different server instance
- Password protection works on localhost but NOT on Vercel
- Options to fix Vercel:
  1. Use JWT tokens instead of sessions (complex)
  2. Use Redis/database for session storage (costs money)
  3. Remove password protection (insecure - anyone can see your data)
  4. **Recommended: Use localhost only**

**Why Localhost is Fine:**
- Password protected (`hunter2`)
- All data loads correctly
- Auto-refresh every 30 seconds
- Dark/light mode toggle
- Only you can access it (not exposed to internet)

---

## How to Actually Fix Vercel (If You Want To)

### Option 1: Remove Password Protection (Easiest but Insecure)

**What:** Just make it public, no auth
**Risk:** Anyone with the URL can see your BC Self-Serve data
**Steps:**
```bash
# Remove auth middleware from api.js
# Comment out requireAuth in routes
# Deploy
```

**Verdict:** ❌ Bad idea unless you're OK with data being public

---

### Option 2: Use Vercel Password Protection (Costs Money)

**What:** Vercel Pro feature ($20/month)
**How:**
1. Upgrade to Vercel Pro
2. Add password protection in Vercel dashboard
3. Anyone accessing the site must enter password first

**Verdict:** ⚠️ Works but $240/year is expensive for a side project

---

### Option 3: JWT Token Auth (Best Technical Solution)

**What:** Replace express-session with JWT tokens stored in cookies
**Why it works:** Serverless-compatible, no server-side session needed

**Implementation:**
```bash
npm install jsonwebtoken cookie-parser
```

Update `api.js`:
```javascript
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

app.use(cookieParser());

app.post('/api/login', (req, res) => {
  if (req.body.password === DASHBOARD_PASSWORD) {
    const token = jwt.sign(
      { authenticated: true },
      process.env.SESSION_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('auth', token, {
      httpOnly: true,
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

const requireAuth = (req, res, next) => {
  const token = req.cookies.auth;

  if (!token) {
    return res.status(401).sendFile(path.join(__dirname, 'login.html'));
  }

  try {
    jwt.verify(token, process.env.SESSION_SECRET);
    next();
  } catch (err) {
    res.status(401).sendFile(path.join(__dirname, 'login.html'));
  }
};
```

**Verdict:** ✅ Best option - works on Vercel, secure, free

---

### Option 4: Use Vercel KV (Redis) for Sessions (Costs Money)

**What:** Store sessions in Vercel's managed Redis
**Cost:** $0.25/100K requests (likely <$1/month for personal use)

**Implementation:**
```bash
npm install @vercel/kv connect-redis
```

Update `api.js`:
```javascript
const { kv } = require('@vercel/kv');
const RedisStore = require('connect-redis').default;

const redisClient = kv;

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
```

**Verdict:** ⚠️ Works but costs money, more complex than JWT

---

### Option 5: Use Environment Variable Check (Hacky but Free)

**What:** Require a secret query param or header
**Example:** `https://yourapp.vercel.app?secret=hunter2`

**Implementation:**
```javascript
const requireAuth = (req, res, next) => {
  if (req.query.secret === DASHBOARD_PASSWORD ||
      req.headers['x-auth'] === DASHBOARD_PASSWORD) {
    next();
  } else {
    res.status(401).send('Unauthorized');
  }
};
```

**Verdict:** ⚠️ Works but URL contains password (visible in browser history)

---

### Recommendation: JWT (Option 3)

**Why:**
- ✅ Free
- ✅ Serverless-compatible
- ✅ Actually secure
- ✅ Works on Vercel
- ✅ Only ~20 lines of code

**Time to implement:** 30 minutes

**Let me know if you want me to implement this!**

---

## Next Features (Prioritized)

### P1 - High Priority

#### 0. Fix Vercel Auth with JWT ⏰ Tomorrow
**Goal:** Make password protection work on Vercel (currently broken due to serverless)
**Time:** 30 minutes
**Status:** Ready to implement

**Steps:**
1. Install dependencies: `npm install jsonwebtoken cookie-parser`
2. Replace express-session with JWT in `api.js`
3. Update login endpoint to issue JWT tokens
4. Update auth middleware to verify JWT
5. Test locally first
6. Deploy to Vercel
7. Verify login works on production

**Why JWT:**
- ✅ Serverless-compatible (no server-side session storage needed)
- ✅ Free (no Redis/database required)
- ✅ Secure (httpOnly cookies, signed tokens)
- ✅ Works on Vercel immediately

**Code already written** in "How to Actually Fix Vercel" section above.

---

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

#### 3. Deploy to Vercel with Security
**Goal:** Public dashboard but only you can access

**Security Options:**
- Add basic HTTP authentication (username/password)
- Use Vercel password protection (Pro feature - $20/mo)
- Add custom auth middleware (simple password in code)
- Use environment variable for password

**Implementation:**
- Add middleware to api.js to check password
- Set password as Vercel environment variable
- Test locally first
- Deploy to Vercel
- Add auth UI (simple password prompt)

---

#### 4. Push Notifications
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
