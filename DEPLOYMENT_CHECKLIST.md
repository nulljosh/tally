# ChequeCheck Vercel Deployment Checklist

**Status:** Ready for production deployment
**Version:** v1.1.0 (with retirement benefits)
**Time Estimate:** 30 minutes

## Pre-Deployment Verification

### Code Status ✅
- [x] All API endpoints implemented (6 endpoints)
- [x] Multi-user authentication working
- [x] Blob storage integration complete
- [x] DTC Navigator implemented
- [x] Error handling and logging
- [x] Security measures: encryption, rate limiting, session timeouts
- [x] Local testing confirmed working

### Repository Status ✅
- [x] All code committed to git
- [x] .env file in .gitignore (won't leak credentials)
- [x] No secrets in codebase
- [x] Documentation complete (README, CLAUDE.md, PLAN.md, JOURNAL.md)

### Vercel Account ✅
- [x] Project created in Vercel dashboard
- [x] Domain: chequecheck.vercel.app (or verify in settings)
- [x] GitHub connected for auto-deploys
- [x] Blob storage available (visible in Storage tab)

## Deployment Steps

### Step 1: Set Environment Variables (5 min)
```
Vercel Dashboard → chequecheck project → Settings → Environment Variables
```

**Required:**
- [ ] `UPLOAD_SECRET` = [your-random-secret-from-.env]
  - Scope: Production, Preview, Development
  - Generate with: `openssl rand -hex 32` if needed

**Auto-generated (by Vercel):**
- [ ] `BLOB_READ_WRITE_TOKEN` should exist
  - If missing: Settings → Storage → Blob → Enable

**Optional:**
- [ ] `SESSION_SECRET` = [random-string] (auto-generated if not set)

### Step 2: Verify Domain (2 min)
```
Vercel Dashboard → Settings → Domains
```
- [ ] Primary domain is `chequecheck.vercel.app`
- [ ] No old domains like `selfserve-rose.vercel.app`
- [ ] HTTPS enabled (automatic)

### Step 3: Deploy (2 min)
Option A: Automatic (GitHub push)
```bash
git push origin main  # Auto-deploys to Vercel
```

Option B: Manual from CLI
```bash
npm install -g vercel
vercel --prod
```

Option C: Vercel Dashboard
- Click "Deploy" button
- Confirm environment variables are set
- Wait for build to complete (~1-2 min)

### Step 4: Verify Deployment (5 min)
1. Wait for Vercel build to complete
2. Visit https://chequecheck.vercel.app
3. Check that page loads (may see blank/login page)
4. Check browser console for errors (F12)

### Step 5: Test Upload Flow (10 min)

**Local Machine:**
```bash
cd ~/Documents/Code/checkcheck

# 1. Run scraper locally
npm run check
# Should save results to data/latest.json

# 2. Upload to Vercel Blob
npm run upload-blob
# Should return: { ok: true, url: "https://..." }
```

**Verify Upload:**
```bash
# Check that Blob endpoint works
curl https://chequecheck.vercel.app/api/latest
# Should return JSON with market/stock/commodity data
```

### Step 6: Enable Auto-Scraping (Optional, 5 min)

Set up Vercel Cron to scrape automatically:

**Option A: Vercel.json (Recommended)**
```json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 2 * * *"
  }]
}
```
Then: `git add vercel.json && git commit && git push`

**Option B: Vercel Dashboard**
- Settings → Crons
- Add cron: Path `/api/cron`, Schedule `0 2 * * *` (2 AM daily)

## Testing Checklist

### API Endpoints
- [ ] `POST /api/login` - Returns 200 with session cookie
- [ ] `GET /api/latest` - Returns 200 with cached data (after first upload)
- [ ] `POST /api/logout` - Clears session
- [ ] `POST /api/upload` - Returns 200 with blob URL (with valid UPLOAD_SECRET)
- [ ] `GET /api/check` - Runs scraper (if on localhost) or returns message

### Security
- [ ] No .env file exposed in Vercel build
- [ ] Credentials not logged anywhere
- [ ] HTTPS enabled (lock icon in browser)
- [ ] CORS headers present
- [ ] Rate limiting active

### Blob Storage
- [ ] `/api/latest` loads data from Blob (fast load, <100ms)
- [ ] `/api/upload` successfully writes to Blob
- [ ] Old Blob data readable from dashboard
- [ ] Blob size reasonable (<10MB)

## Rollback Plan

If something breaks:

```bash
# 1. Check Vercel deployment logs
#    Vercel Dashboard → Deployments → Latest → Logs

# 2. Revert to previous working version
vercel rollback

# 3. Or redeploy main branch
git push origin main

# 4. Debug locally first
npm run check
npm start  # Verify on localhost:3000
```

## Post-Deployment Notes

### Dashboard Load Time
- **First load:** ~500ms (reads from Blob cache)
- **Subsequent loads:** ~100-200ms
- If slow, check Vercel Blob storage status

### Scraper Limitations
- **Cannot run on Vercel** - Puppeteer timeout (60s limit)
- **Must run locally** - npm run check
- **Then upload** - npm run upload-blob
- This is by design (Vercel serverless ≠ long-running processes)

### Monitoring
Check these regularly:
- Vercel Dashboard → Analytics (response time, errors)
- Blob storage usage (shouldn't exceed 100MB)
- Error logs in Vercel function logs
- Email alerts if configured

### Troubleshooting

**Problem:** Dashboard shows old data
- **Solution:** Run local scraper + upload blob
  ```bash
  npm run check && npm run upload-blob
  ```

**Problem:** "Unauthorized" on /api/upload
- **Solution:** Check UPLOAD_SECRET in Vercel settings
  ```bash
  curl -X POST https://chequecheck.vercel.app/api/upload \
    -H "Authorization: Bearer YOUR_UPLOAD_SECRET" \
    -d '...'
  ```

**Problem:** Blob endpoint returns 404
- **Solution:** Ensure Blob storage is enabled in Vercel
  - Settings → Storage → Blob → Enable
  - Redeploy after enabling

## Success Criteria

Deployment is complete when:
- [x] Code pushed to Vercel main branch
- [x] All environment variables configured
- [x] Vercel build succeeds (green checkmark)
- [x] Dashboard loads at chequecheck.vercel.app
- [x] /api/latest returns cached data
- [x] Local scraper can upload via /api/upload
- [x] No sensitive data exposed in logs

## Next Steps

1. **Immediate:** Deploy to Vercel (this checklist)
2. **Short-term:** Set up cron for automatic scraping
3. **Medium-term:** Add multi-tenant storage (per-user Blob keys)
4. **Long-term:** T2201 form pre-filler + notifications

---

**Last Updated:** 2026-02-10
**Deployment Status:** Ready ✅
**Estimated Time:** 30 minutes
