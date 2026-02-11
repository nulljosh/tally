# AI Agents & Automation

Strategic suggestions for automating Chequecheck with AI agents.

## Implemented Agents

### 1. BC Self-Serve Scraper 
**Status:** Complete
**What it does:** Automated scraping of BC benefits portal
**Tech:** Puppeteer, Express, AES-256 encryption
**Trigger:** `/api/check` or "Check Now" button

**Flow:**
1. User logs in with BCeID credentials
2. Credentials encrypted in session
3. Puppeteer scrapes 4 sections (Notifications, Messages, Payment Info, Service Requests)
4. Results cached to Vercel Blob
5. Dashboard displays benefits data

---

## Proposed Agents

### 2. DTC Application Assistant (High Priority)
**What it does:** AI-powered T2201 form pre-filler
**Tech:** GPT-4, PDF generation
**Trigger:** DTC Navigator tab

**Flow:**
1. User answers eligibility questions
2. GPT-4 generates medical narrative from user's symptoms
3. Pre-fills T2201 form with appropriate medical language
4. Exports PDF ready for doctor signature
5. Estimates refund amount and approval odds

**Why this matters:**
- T2201 rejections often due to poor wording
- Doctors don't know how to fill forms properly
- Worth $5-25k per claim
- Founder has lived experience (autism diagnosis at 26)

**Revenue potential:** $49-99/mo SaaS for consultants

---

### 3. Auto-Scraping Scheduler (Medium Priority)
**What it does:** Daily automated checks for benefit updates
**Tech:** Vercel Cron, GitHub Actions, or macOS LaunchAgent
**Trigger:** Daily at 9am PST

**Flow:**
1. Cron triggers scraper with stored credentials
2. Compares new data vs previous scrape
3. Detects changes (new messages, payment updates)
4. Sends notification via email/SMS/push
5. Updates Blob cache automatically

**Implementation:**
```javascript
// vercel.json
{
  "crons": [{
    "path": "/api/cron-scrape",
    "schedule": "0 9 * * *"  // 9am daily
  }]
}
```

---

### 4. Multi-User Session Manager (High Priority)
**What it does:** Handles concurrent scraping for multiple users
**Tech:** Job queue (Bull/BullMQ), Redis
**Trigger:** User clicks "Check Now"

**Flow:**
1. User request added to job queue
2. Worker picks up job (rate limited per user)
3. Launches isolated browser session
4. Scrapes user-specific data
5. Saves to user's Blob namespace
6. WebSocket notifies user when complete

**Why needed:**
- Current: One scrape at a time
- With 10+ users: Need concurrent sessions
- Prevents blocking/timeouts

---

### 5. PWD Application Bot (Low Priority, High Impact)
**What it does:** Automates BC PWD (disability) application
**Tech:** Puppeteer form automation, OCR
**Trigger:** PWD Navigator tab

**Flow:**
1. User uploads medical documents (JPG/PDF)
2. OCR extracts relevant text
3. GPT-4 generates application narrative
4. Auto-fills BC PWD online form
5. Submits application on behalf of user

**Challenges:**
- Government may block automation (TOS violations)
- High stakes (legal concerns)
- Better as "draft generator" than auto-submit

---

### 6. Benefit Change Detector (Medium Priority)
**What it does:** Alerts users to benefit amount changes
**Tech:** Diff algorithm, push notifications
**Trigger:** After each scrape

**Flow:**
1. Compare current scrape vs previous
2. Detect changes:
   - Support amount changed ($560 → $570)
   - New message from ministry
   - Service request status updated
3. Calculate net change (increased/decreased)
4. Send push notification with summary
5. Log change history for audit trail

**Example alerts:**
- " Support increased by $10 (now $570)"
- " New message from Ministry"
- "⚠️ Payment delayed - contact ministry"

---

### 7. RDSP Contribution Optimizer (Low Priority)
**What it does:** Calculates optimal RDSP contribution strategy
**Tech:** Financial modeling, GPT-4
**Trigger:** RDSP tab (future)

**Flow:**
1. User enters income, DTC status, age
2. Calculate government matching (3:1 up to $3,500/yr)
3. Model growth scenarios (20-40 year horizon)
4. Recommend contribution amounts
5. Show tax savings vs TFSA/RRSP

**Why valuable:**
- RDSP is massively underutilized (awareness problem)
- Government matches are free money
- Proper strategy = $100k+ difference at retirement

---

### 8. Ministry Communication Bot (Low Priority)
**What it does:** Drafts emails/calls to BC ministry
**Tech:** GPT-4, email templates
**Trigger:** "Contact Ministry" button

**Flow:**
1. User selects issue (delayed payment, missing form, etc.)
2. GPT-4 generates professional email draft
3. Fills in user-specific details
4. Provides phone script for calls
5. Tracks communication history

**Templates:**
- "My payment hasn't arrived"
- "How do I upload a medical form?"
- "I need to report income change"

---

## Architecture

### Orchestration Layer
```
┌─────────────────────────────────────┐
│       Agent Orchestrator            │
│  (Vercel Functions + Job Queue)     │
└─────────────────────────────────────┘
         │
         ├─> Scraper (Puppeteer)
         ├─> DTC Assistant (GPT-4)
         ├─> Notification System (Resend)
         ├─> Change Detector (Diff)
         └─> Form Filler (Puppeteer + GPT-4)
```

### Storage
- **Vercel Blob** - Scraped data cache, user documents
- **Supabase** - User accounts, settings, history
- **Redis** - Job queue, session cache
- **S3** - Long-term document storage (optional)

---

## Revenue Model (Future)

### Free Tier
- Manual scraping only
- Basic DTC eligibility calculator
- 5 scrapes/month limit

### Pro ($49/mo)
- Auto-scraping with notifications
- DTC form pre-filler
- Unlimited scrapes
- Email support

### Business ($99/mo)
- Multi-client management (for consultants)
- API access
- White-label option
- Priority support

### Enterprise (Custom)
- Custom integrations
- Dedicated support
- SLA guarantees

**Target market:** Disability consultants, accountants, advocacy orgs

---

## Technical Debt & Risks

### Security
- ⚠️ Storing encrypted BCeID credentials (is this legal?)
- ⚠️ Session hijacking risks
- ⚠️ Government may block automation (IP bans)
- ⚠️ GDPR/PIPEDA compliance (user data storage)

### Scalability
- Puppeteer sessions are resource-heavy (max ~10 concurrent)
- Vercel free tier = 10s function timeout (not enough)
- Need dedicated scraping infrastructure (Railway, Fly.io)

### Reliability
- BC Self-Serve UI changes break selectors
- Need screenshot-based fallback (OCR)
- Headless detection (some sites block Puppeteer)

---

## Next Steps

1.  Complete multi-user authentication
2.  Deploy to Vercel with Blob storage
3. ⏳ Build DTC form assistant (v3.0)
4. ⏳ Add change detection & notifications
5. ⏳ Test with real users (5-10 beta testers)
6. ⏳ Launch SaaS with Stripe billing

---

**Last updated:** 2026-02-09
