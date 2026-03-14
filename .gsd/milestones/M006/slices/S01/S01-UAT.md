# S01: Worker Fix + Refresh Job Scaffold + Cron Scheduler — UAT

**Milestone:** M006
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (live-runtime + human-experience)
- Why this mode is sufficient: The slice's primary proof is operational — the worker must boot cleanly, schedulers must register, and the admin panel button must enqueue a real BullMQ job that writes to the DB. These require the actual pm2 process and admin panel to be running.

## Preconditions

1. `monster-worker` pm2 process is running (verify: `pm2 describe monster-worker` → `status: online`)
2. `monster-admin` pm2 process is running (verify: `pm2 describe monster-admin` → `status: online`)
3. Supabase Cloud is reachable (verify: `SELECT 1` via Supabase dashboard or psql)
4. Upstash Redis is reachable (verify: `pm2 logs monster-worker --nostream --lines 5` shows scheduler registration, no Redis connection errors)
5. At least one site exists in the `sites` table (any status — "Refresh Now" works regardless of site status; scheduler picks up `live` sites only)
6. Admin panel accessible at `http://localhost:3004` (Tailscale-accessible VPS1)

## Smoke Test

Navigate to `http://localhost:3004/sites/<any-site-id>`. The page must render without 500 error. Scroll to the **Product Refresh** card — it must show either "Never refreshed" (if `last_refreshed_at` is null) or a relative timestamp. If this card is missing entirely, T03 wiring is broken.

## Test Cases

### 1. Worker boots cleanly — no ERR_MODULE_NOT_FOUND, ProductRefreshJob registered

1. On VPS1 terminal: `pm2 restart monster-worker`
2. Wait 5 seconds: `sleep 5`
3. Check worker status: `pm2 describe monster-worker | grep -E "status|unstable"`
4. Check stdout: `pm2 logs monster-worker --nostream --lines 15 | grep -v "^$"`
5. **Expected stdout contains all of:**
   - `[worker] ProductRefreshJob scheduler registered (N sites)` (N may be 0 if no live sites)
   - `[worker] ProductRefreshJob listening on queue "product-refresh"`
   - `[AnalyticsAggregationJob] scheduler registered`
   - `[worker] GenerateSiteJob listening on queue "generate"`
6. **Expected:** `status: online`, `unstable restarts: 0`
7. Check stderr: `pm2 logs monster-worker --nostream --lines 10 2>&1 | grep stderr` — must be empty or only show the `punycode` deprecation warning (not a real error)

### 2. "Refresh Now" button enqueues a BullMQ job

1. In browser, navigate to `http://localhost:3004/sites/<site-id>`
2. Locate the **Product Refresh** card — confirms "Last refreshed: Never" (or a relative time)
3. Click the **Refresh Now** button
4. **Expected:** button shows spinner and becomes disabled immediately
5. Within 3 seconds: **Expected:** button re-enables, a green success message appears: "Refresh queued (job: <jobId>)"
6. After 3 more seconds: **Expected:** success message auto-clears
7. On VPS1: `redis-cli KEYS 'bull:product-refresh:*'`
8. **Expected:** one or more keys like `bull:product-refresh:wait:<id>` or `bull:product-refresh:active:<id>` visible briefly, then gone as job processes

### 3. ProductRefreshJob runs and writes last_refreshed_at to DB

1. After clicking "Refresh Now" (from test case 2), wait 10–30 seconds for the job to complete
2. In browser, click "Refresh Now" again — or navigate away and back to the site detail page
3. **Expected:** "Last refreshed" now shows a relative time like "Last refreshed: X minutes ago"
4. Cross-check in Supabase dashboard: `SELECT id, last_refreshed_at, next_refresh_at FROM sites WHERE id = '<siteId>'`
5. **Expected:** `last_refreshed_at` is a recent timestamp (within last 5 minutes); `next_refresh_at` is approximately `last_refreshed_at + 48 hours`
6. On VPS1: `pm2 logs monster-worker --nostream --lines 20 | grep ProductRefreshJob`
7. **Expected log output contains:**
   - `[ProductRefreshJob] site <id> phase=fetch_products started`
   - `[ProductRefreshJob] site <id> fetched <N> products` (N may be 0 if DataForSEO returns empty for the site's niche)
   - `[ProductRefreshJob] site <id> phase=fetch_products complete` (or similar completion signal)

### 4. tsa_products.last_checked_at updated for fetched ASINs

1. Requires: at least one product exists in `tsa_products` for the tested site, and DataForSEO returned results for the site's niche/market
2. After a successful refresh (test case 3), query Supabase: `SELECT asin, last_checked_at FROM tsa_products WHERE site_id = '<siteId>' LIMIT 5`
3. **Expected:** `last_checked_at` on matching rows is updated to within the last 5 minutes
4. Note: if DataForSEO returns 0 products for the niche (new/empty niche), no rows are upserted — this is correct behavior, not a failure

### 5. Refresh Now with no DataForSEO credentials — graceful error

1. Temporarily clear `DATAFORSEO_EMAIL` or `DATAFORSEO_PASSWORD` from the Settings page (or from `.env` directly)
2. Click "Refresh Now" on site detail
3. **Expected:** button completes (returns jobId — the enqueue succeeds regardless of job outcome)
4. On VPS1: `pm2 logs monster-worker --nostream --lines 20 | grep -i "error\|ProductRefreshJob"`
5. **Expected:** job logs an error message mentioning authentication or DataForSEO failure — does NOT log the raw credential string `email:password`, only the error description
6. **Expected:** `sites.last_refreshed_at` is NOT updated (job failed before write)
7. Restore credentials after this test

### 6. Per-site scheduler registers on worker start (with a live site)

1. Requires: a site with `status = 'live'` in the DB (if none exist, skip to the "Notes" below)
2. On VPS1: `pm2 restart monster-worker && sleep 5`
3. `pm2 logs monster-worker --nostream --lines 5 | grep ProductRefreshJob`
4. **Expected:** `[worker] ProductRefreshJob scheduler registered (N sites)` where N matches the count of live sites
5. In Redis: `redis-cli KEYS 'bull:product-refresh:*scheduler*'` or `redis-cli KEYS 'bull:product-refresh:repeat:*'`
6. **Expected:** one repeating job key per live site with jobId pattern `product-refresh-scheduler-<siteId>`

### 7. Worker graceful shutdown — SIGINT handled cleanly

1. On VPS1: `pm2 stop monster-worker`
2. Check logs: `pm2 logs monster-worker --nostream --lines 5`
3. **Expected:** `[worker] SIGINT received — closing workers` line appears before shutdown
4. `pm2 start ecosystem.config.js --only monster-worker && sleep 5 && pm2 describe monster-worker | grep status`
5. **Expected:** `status: online`

## Edge Cases

### Site with null last_refreshed_at displays "Never refreshed"

1. Ensure the site has `last_refreshed_at = NULL` in the DB (reset it: `UPDATE sites SET last_refreshed_at = NULL WHERE id = '<siteId>'`)
2. Navigate to the site detail page
3. **Expected:** Product Refresh card shows "Never refreshed" (not a date, not an error, not a relative time)

### Rapid double-click on Refresh Now

1. Navigate to site detail
2. Click "Refresh Now" rapidly twice in quick succession
3. **Expected:** button is disabled after first click (spinner shows), so second click has no effect — only one job is enqueued
4. Verify: `redis-cli LLEN bull:product-refresh:wait` — should show 1, not 2

### Worker restart does not create duplicate schedulers

1. With a live site in the DB, restart the worker three times in a row:
   `pm2 restart monster-worker && sleep 5 && pm2 restart monster-worker && sleep 5 && pm2 restart monster-worker && sleep 5`
2. In Redis: `redis-cli KEYS 'bull:product-refresh:repeat:*'`
3. **Expected:** exactly one repeating scheduler key per live site — not N copies after N restarts
4. This confirms `registerScheduler()` upsert logic is idempotent

## Failure Signals

- `ERR_MODULE_NOT_FOUND` in `pm2 logs monster-worker` error output → new dep missing from `packages/agents/package.json` (follow D094/D096 pattern)
- `Dynamic require of "X" is not supported` in worker error log → CJS/ESM compat regression — check if a new package was added that has Node built-in deps (banner fix pattern from D097)
- `[worker] ProductRefreshJob scheduler registered` absent from startup logs → `product-refresh.ts` import or `worker.ts` wiring broken
- "Refresh Now" button stays disabled indefinitely → server action throwing; check browser console for error; check `pm2 logs monster-admin` for `enqueueProductRefresh` error line
- `sites.last_refreshed_at` not updated after job completes → DataForSEO fetch phase threw before DB write; check `pm2 logs monster-worker | grep ProductRefreshJob` for error
- Product Refresh card missing from site detail page → `RefreshCard` import missing from `page.tsx`; check `pnpm --filter @monster/admin build` output

## Requirements Proved By This UAT

- R007 (product refresh pipeline) — partially: BullMQ infrastructure, per-site cron schedulers, DataForSEO fetch, and DB writes are proven. Diff engine + conditional rebuild (S02) still needed for full validation.

## Not Proven By This UAT

- R007 full validation — diff engine, price/availability/image change detection, conditional `GenerateSiteJob` enqueue (S02)
- R008 (product availability alerts) — alert creation not yet implemented (S02)
- Alert deduplication invariant (D093) — S02
- Rebuild correctly triggered on price change (S02)
- SERP-absence treated as `limited` not `unavailable` (D092) — S02
- Dashboard alert KPI card (S03)
- Alert resolution UI (S03)

## Notes for Tester

- If no sites exist yet in the DB, test cases 3–6 are not exercisable end-to-end. The smoke test and test case 2 (enqueue + Redis key confirmation) work with any site. Create a site via the Sites admin page before running the full suite.
- The worker restart count in `pm2 describe` will show 46+ — this is historical from the T01 crash loop debugging and is not a current problem. The signal to watch is `unstable restarts: 0`.
- DataForSEO fetches take 2–10 seconds. If you navigate back to the site detail page immediately after clicking "Refresh Now", the timestamp may not be updated yet — wait 15–30 seconds before checking the DB.
- `libnspr4.so` is missing on this machine, so the admin panel cannot be opened in a headed browser via the dev machine. Access via Tailscale from a machine with a browser (`http://<vps1-tailscale-ip>:3004`).
