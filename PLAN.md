# DTC Navigator — Product Plan

## Vision
Turn the pain of navigating Canadian disability benefits (DTC, PWD, RDSP, CPP-D) into a SaaS product for consultants, accountants, and advocacy orgs. Target: $1M ARR.

## What We've Done (Past)

### v1.0 - BC Self-Serve Scraper (Jan 2026)
- [x] Puppeteer scraper for myselfserve.gov.bc.ca
- [x] All 4 sections working (Notifications, Messages, Payment Info, Service Requests)
- [x] Express API with auth
- [x] Web dashboard (unified.html) with dark/light mode
- [x] Deployed to Vercel (static data)

### v2.0 - Control Panel (Feb 2026)
- [x] Unified dashboard with tabs (Dashboard, Security Testing, Tools)
- [x] Brute force testing tool (educational)
- [x] Session-based auth
- [x] Auto-refresh data

## What We're Doing (Present) — v3.0 DTC Navigator

### Phase 1: MVP in Current Stack (THIS WEEK)
- [x] DTC knowledge base (data/dtc-knowledge.json)
- [ ] DTC Navigator tab in unified.html with eligibility screener
- [ ] /api/dtc/screen endpoint for eligibility assessment
- [ ] Results page with recommendations, estimated refund, next steps
- [ ] Test cases and error handling
- [ ] Document experience going through DTC/PWD process today

### Phase 2: Validation (Week of Feb 10)
- [ ] Find 5-10 disability consultants/accountants online
- [ ] Send outreach: "Building software to streamline DTC applications"
- [ ] Document feedback and pain points
- [ ] Iterate screener based on real feedback

## What We're Going to Do (Future)

### Phase 3: Next.js Migration (Week of Feb 17)
- [ ] Scaffold Next.js app (App Router)
- [ ] Migrate dashboard to React components
- [ ] Add Supabase for database (user accounts, saved assessments)
- [ ] Proper auth (NextAuth.js or Supabase Auth)
- [ ] Deploy to Vercel with custom domain

### Phase 4: Full MVP (March 2026)
- [ ] T2201 form pre-filler (input data → generate form fields)
- [ ] Client tracker dashboard for consultants
- [ ] PDF generation for completed forms
- [ ] Claude API integration for form assistance
- [ ] Stripe billing ($49-99/mo per seat)

### Phase 5: Growth (April-June 2026)
- [ ] Free eligibility quiz as lead magnet (SEO play)
- [ ] Blog content targeting DTC/PWD keywords
- [ ] Consultant directory (generates inbound leads)
- [ ] Partner with disability advocacy groups
- [ ] Reddit/Facebook community engagement
- [ ] Target: 10 paying customers

### Phase 6: Scale (July-Dec 2026)
- [ ] Expand to CPP-D, RDSP, provincial programs
- [ ] Per-application pricing model
- [ ] API for accountants to integrate into their workflow
- [ ] White-label option for large consultancies
- [ ] Target: 100+ paying customers, $100k+ ARR

### Phase 7: $1M ARR (2027)
- [ ] 500 consultants x $99/mo = $594k base
- [ ] Per-application fees at volume = additional revenue
- [ ] National expansion (all provinces)
- [ ] Enterprise tier for large firms
- [ ] Potential: acquisition target for tax software companies

## Tech Stack Evolution

### Now (Phase 1-2)
- Express.js + vanilla HTML/CSS/JS
- JSON files for data
- Deployed on localhost / Vercel (static)

### Next.js Migration (Phase 3-4)
- Next.js 14+ (App Router)
- Supabase (Postgres + Auth + Realtime)
- Tailwind CSS
- Stripe for billing
- Claude API for form assistance
- Vercel deployment

### Scale (Phase 5+)
- Add Redis for caching
- Background jobs (Inngest or similar)
- Email (Resend)
- Analytics (PostHog)
- Error tracking (Sentry)

## Revenue Model
- **Free tier**: Eligibility screener (lead gen)
- **Pro**: $49/mo - Form pre-filler, client tracker (5 clients/mo)
- **Business**: $99/mo - Unlimited clients, PDF export, priority support
- **Enterprise**: Custom - API access, white-label, dedicated support

## Key Insight
Joshua has lived experience (diagnosed autism at 26, currently navigating DTC + PWD). This is the strongest possible founder-market fit. The process is confusing, bureaucratic, and underserved by software. The money flowing through disability benefits is real ($5-25k per DTC claim, $1,060/mo PWD).
