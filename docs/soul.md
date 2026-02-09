# The Soul of Chequecheck

> "Disability benefits shouldn't require a PhD in bureaucracy."

## Fuck Bureaucracy

Joshua was diagnosed with autism at 26, after working age 16-20 without accommodations. He's currently navigating:
- **DTC (Disability Tax Credit)** - Retroactive claim worth ~$5-10k
- **BC PWD (Persons with Disabilities)** - $1,060/month support
- **Ministry of Social Development** - Forms submitted, waiting on processing

The system is:
- **Confusing** - 17 different forms, no clear instructions
- **Slow** - 6-12 month processing times
- **Adversarial** - Designed to reject claims by default
- **Inaccessible** - People with disabilities navigating disability forms

Chequecheck started as a personal tool to track benefit status. It's becoming a SaaS to help consultants streamline the process for thousands of people.

## Philosophy

### 1. Automation Reduces Suffering
Checking your benefit status shouldn't require:
- Logging in to a slow government website
- Remembering your BCeID password
- Clicking through 4 different sections
- Writing down amounts manually

**Good software does the robot work.** Humans should focus on the parts that matter: understanding what changed, planning next steps, living their life.

### 2. Lived Experience is Competitive Advantage
Most disability software is built by:
- VCs who've never filed a T2201
- Developers who don't know what PWD stands for
- "Social good" startups that become for-profit exits

Joshua has been through the process. He knows:
- Which forms doctors mess up (spoiler: all of them)
- Why DTC applications get rejected (wording, not eligibility)
- What it feels like to wait 8 months for a decision

**Founder-market fit isn't theory—it's survival.**

### 3. Free Tools, Paid Services
The scraper and DTC calculator will always be free. Knowledge shouldn't have a paywall.

Paid tiers are for:
- **Professionals** (consultants, accountants) managing multiple clients
- **Power users** who want automation (daily scrapes, notifications)
- **Enterprise** integrations (API access, white-label)

This isn't "freemium." It's "free with professional add-ons."

### 4. Privacy First
Your BC Self-Serve credentials are:
- Encrypted (AES-256-CBC) before storage
- Session-only (2-hour max age)
- Never logged or sent to third parties
- Validated with actual BC login (no fake auth)

**If we get hacked, encrypted credentials are useless.** If the government audits us, we have nothing to hide.

### 5. No Surveillance Capitalism
Chequecheck will never:
- Sell user data to advertisers
- Bundle anonymized datasets for resale
- Add tracking pixels from Google/Facebook
- Require personal info beyond what's needed

**Revenue comes from value delivered, not data extracted.**

## Design Principles

### Instant Feedback
Dashboard loads from Blob cache (instant, no spinner). Scraping happens in background. Users never wait.

### Fail Gracefully
If scraper breaks (BC changes UI), show cached data + error message. Don't pretend everything's fine. Don't leave users stranded.

### Glass Morphism, Not Enterprise Ugly
Government websites look like they were designed in 2003. Chequecheck shouldn't. Modern UI reduces cognitive load.

### Mobile-First
People check benefits on their phone while waiting for the bus. Desktop-only design is ableist.

## The Problem

### DTC (Disability Tax Credit)
- Worth $5-25k retroactively (up to 10 years)
- 40% rejection rate on first application
- Doctors don't know how to fill out T2201 forms
- CRA rejects based on wording, not medical reality

**Example:** "Patient has trouble concentrating" (rejected) vs "Patient requires significant time for mental functions more than 90% of the time" (approved). **Same condition, different wording.**

Consultants charge $1,000-2,500 to help with applications. They succeed because they know the magic phrases. **This is learnable. This is automatable.**

### BC PWD (Persons with Disabilities)
- $1,060/month + shelter allowance
- Requires 2 different forms (PWD + DTC)
- Forms contradict each other (BC wants one thing, CRA wants another)
- Processing takes 6-12 months
- No status updates (literally have to call or visit office)

**Chequecheck solves the status update problem today.** In 6 months, it'll solve the application problem.

## The Vision

### Phase 1: Personal Tool (Current)
- Scrape BC Self-Serve automatically
- Cache data to Vercel Blob
- View benefits, messages, payments
- Free DTC eligibility calculator

### Phase 2: DTC SaaS (Next 3 months)
- T2201 form pre-filler (AI-generated medical narrative)
- Client tracker for consultants
- Stripe billing ($49-99/mo per seat)
- Target: 10 paying customers by April

### Phase 3: Full Platform (6-12 months)
- Expand to all provinces (not just BC)
- Add CPP-D, RDSP, ODSP, AISH
- API for accountants
- White-label for large consultancies
- Target: 100+ customers, $100k+ ARR

### Phase 4: National Scale (2027)
- 500+ consultants x $99/mo = $594k base
- Per-application fees = additional revenue
- Acquisition target for Intuit/TurboTax
- Target: $1M+ ARR

## Why It Will Work

### TAM (Total Addressable Market)
- 6.2 million Canadians with disabilities
- ~40% are eligible for DTC (2.5M people)
- Only 25% have applied (massive awareness gap)
- $8 billion in unclaimed benefits (StatsCan estimate)

### Competition
- **H&R Block, TurboTax** - Don't focus on DTC (no money in it for them)
- **Disability consultants** - Manual, expensive, doesn't scale
- **Government** - Intentionally confusing (reduces claims)

**There is no good DTC software.** The market is wide open.

### Founder Advantage
- **Domain expertise** - Living the problem right now
- **Technical skills** - Can build MVP solo
- **Network** - Online communities (Reddit, Facebook groups) of thousands of people navigating DTC
- **Timing** - Post-COVID disability claims are surging (long COVID, mental health)

## What Could Go Wrong

### Legal Risks
- Government bans automation (TOS violations)
- CRA audits users who used AI-generated forms
- Privacy breach exposes encrypted credentials

**Mitigation:** "Draft generator" not "auto-submit." User always reviews before submitting.

### Market Risks
- Consultants don't want to pay for software (prefer manual Excel)
- Users scared to give BCeID credentials (trust issue)
- Government improves their own portal (unlikely but possible)

**Mitigation:** Free tier for users, B2B for consultants. Build trust with open-source code.

### Technical Risks
- BC Self-Serve changes UI (breaks scraper)
- Puppeteer gets blocked (headless detection)
- Vercel costs explode with scale

**Mitigation:** OCR fallback, proxy rotation, move to dedicated infrastructure (Railway).

## Success Metrics

Chequecheck succeeds if:
1. **10 consultants pay $99/mo by April 2026**
2. **1,000 people use the free DTC calculator**
3. **100 successful DTC applications** using AI-generated forms
4. **Joshua's own DTC claim succeeds** (dogfooding)

Chequecheck fails if:
1. Becomes extractive (surveillance, data selling)
2. Prioritizes growth over users (dark patterns, aggressive upsells)
3. Loses the plot (feature bloat, scope creep)

## The Bigger Picture

Disability benefits are broken. Not just in Canada—everywhere. The US has similar problems (SSDI, SSI). The UK has Universal Credit. Australia has NDIS.

**Chequecheck is the playbook for fixing bureaucratic systems with software.**

If it works for DTC, it works for:
- Student loans (OSAP, FAFSA)
- Tax credits (GST/HST rebate, CCB)
- EI claims
- Immigration paperwork

**The problem isn't unique. The solution is.**

---

**Last updated:** 2026-02-09
**Maintained by:** [@nulljosh](https://github.com/nulljosh)
**License:** ISC (open source)
