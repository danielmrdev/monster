# M006: Product Refresh Pipeline — Research

**Date:** 2026-03-13

## Summary

M006 adds an autonomous maintenance loop: a BullMQ scheduled job fetches fresh product data from DataForSEO for each live site, diffs against the DB, conditionally triggers a rebuild+redeploy, and surfaces alerts when products degrade. The architecture fits cleanly into existing patterns — a `ProductRefreshJob` follows exactly the same BullMQ Worker + phase-tracking pattern established in `AnalyticsAggregationJob` and `GenerateSiteJob`. No new infrastructure is needed; the worker, queue, and pm2 ecosystem entry already exist.

The biggest design risk is **cost accumulation at scale**. The hybrid refresh strategy (keyword search + ASIN lookup) makes sense on paper but is expensive if applied naively: refreshing 30 products per site × $0.0015/ASIN = $0.045/site/cycle. At 100 sites × 3 refreshes/week that's ~$13.50/week in DataForSEO costs alone, before keyword searches. The implementation must default to keyword-search-only for broad change detection, with ASIN lookups triggered selectively (only for products that look anomalous in the SERP data). Phase 1 with 1–5 sites makes this affordable; cost governance must be designed in from the start.

The second risk is the **pre-existing `node-ssh` ERR_MODULE_NOT_FOUND** that blocks `monster-worker` from starting. This must be fixed as S01/T01 before any refresh infrastructure can be validated. The fix is a `pnpm install` in `packages/agents/node_modules/.pnpm` hoisting context or adding `node-ssh` as a direct dep of `packages/agents` — since tsup externalizes it, it needs to be resolvable from the worker's runtime directory.

## Recommendation

Build in three slices: (1) fix worker boot + refresh job scaffold with cron scheduler; (2) diff engine + conditional rebuild triggering; (3) alert creation + dashboard surface. Keep the initial refresh strategy as **keyword-search only** (same `searchProducts()` already implemented). The ASIN-level lookup endpoint (`/merchant/amazon/asin/task_post`) is confirmed in DataForSEO and can be added as an optional second pass later — the diff logic works identically regardless of data source.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| BullMQ rate limiting for DataForSEO API | `limiter: { max: N, duration: ms }` on `Worker` options (BullMQ v5 native) | Already in dependencies. No separate token bucket needed. |
| Scheduled cron job | `queue.upsertJobScheduler(id, { pattern: '0 */48 * * *' }, ...)` | Already used for analytics aggregation (D082). Stable job ID → idempotent on worker restart. |
| Per-site job staggering | BullMQ `concurrency: 3` on `ProductRefreshWorker` | Queue already has `setGlobalConcurrency` available. Prevents parallel hammering of DataForSEO. |
| Product keyword search | `DataForSEOClient.searchProducts()` | Already implemented with full task_post → poll → task_get flow and exponential backoff. Reuse directly. |
| Image download + WebP conversion | `processImages()` in `packages/agents/src/pipeline/images.ts` | Already implemented with p-limit concurrency and idempotency (`existsSync` check). |
| Conditional Astro rebuild | `GenerateSiteJob` build phase | Programmatic `build()` already works. `ProductRefreshJob` calls it with same pattern. |
| Deploy after rebuild | `runDeployPhase()` in `jobs/deploy-site.ts` | Extracted shared helper — call directly after detecting changes. |
| Alert count on dashboard | `supabase.from('product_alerts').select('*', { count: 'exact', head: true }).eq('status', 'open')` | Already wired in `dashboard/page.tsx`. Alert card shows live count once rows are inserted. |

## Existing Code and Patterns

- `packages/agents/src/queue.ts` — Queue factory pattern. Add `createProductRefreshQueue()` + `productRefreshQueue()` singleton following the exact same pattern as `createAnalyticsAggregationQueue()`. Named queue: `'product-refresh'`.
- `packages/agents/src/worker.ts` — Worker entrypoint. Import `ProductRefreshJob`, instantiate, register `registerScheduler()` in the async startup block (same pattern as `analyticsJob.registerScheduler()`), add to `Promise.all` in graceful shutdown.
- `packages/agents/src/jobs/analytics-aggregation.ts` — The scheduler registration pattern to follow exactly (`upsertJobScheduler` with stable ID, own queue instance opened and closed in finally block — D087).
- `packages/agents/src/jobs/generate-site.ts` — Phase tracking pattern (`ai_jobs.payload = { phase, done, total }`). ProductRefreshJob should use `job_type: 'product_refresh'` and the same phase tracking.
- `packages/agents/src/jobs/deploy-site.ts` — `runDeployPhase()` is the deploy call to use after diff detects rebuild-triggering changes. Already handles site status transitions, deployments table, ai_jobs updates.
- `packages/agents/src/clients/dataforseo.ts` — `DataForSEOClient.searchProducts()` is directly reusable for the keyword-search refresh pass. For ASIN-level lookups (Phase 2 hybrid), add `lookupAsin(asin, market)` method on the same class using `/merchant/amazon/asin/task_post`.
- `packages/shared/src/constants/index.ts` — `REBUILD_TRIGGERS = ['price', 'availability', 'images']` is already defined (D008). Diff engine should import this to drive rebuild decision.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — Already queries `product_alerts` count. Nothing to add for the count KPI to work once alerts are inserted.
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Site detail page already has slots for additional cards. Add "Product Refresh" card (last_refreshed timestamp, product availability summary, open alerts for this site, "Refresh Now" button).
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — Server action pattern is established. Add `enqueueProductRefresh(siteId)` following `enqueueSiteGeneration()`.

## Constraints

**Schema gaps (require migrations):**
- `sites` table has no `last_refreshed_at`, `refresh_interval_hours`, or `next_refresh_at` columns. These are needed for "Last refreshed: X hours ago" display and per-site frequency config. Add in M006/S01.
- `product_alerts` has no deduplication guard — a new alert will be created on every refresh cycle if a product stays unavailable. Need `UNIQUE(site_id, product_id, alert_type)` where status is `open`, or a check-before-insert pattern.

**Worker boot blocker:**
- `node-ssh` is externalized from the `packages/agents` tsup bundle but is not directly installed in `packages/agents` deps. It's only in `packages/deployment`. The worker runtime (`node packages/agents/dist/worker.js` from monorepo root) can't resolve `node-ssh` because pnpm doesn't hoist it to the root `node_modules/`. Fix: add `"node-ssh": "^13.2.1"` as a direct dep in `packages/agents/package.json`. This is a copy of what `packages/deployment` declares; pnpm dedupes it in the store.

**Site status during refresh:**
- `SITE_STATUS_FLOW` has `live → ['paused', 'generating']`. Refresh-triggered rebuilds must transition `live → generating` then back to `deploying → ... → live`. The `runDeployPhase` function already handles the `deploying` transition but doesn't reset from `live`. Product refresh should set `status: 'generating'` before enqueuing the rebuild, same as `GenerateSiteJob` does.
- Alternatively: skip the status machine for refresh-only cycles and let the rebuild run in place. Simpler and avoids the site appearing offline during a routine refresh.

**DataForSEO cost:**
- Keyword search: $0.001/SERP. Each site has 2 keywords × $0.001 = $0.002/site/refresh. For 100 sites × 3/week = $0.60/week ($2.60/month) — cheap.
- ASIN lookup: $0.0015/ASIN. Each site has ~30 ASINs × $0.0015 = $0.045/site/refresh. Same 100 sites × 3/week = $13.50/week ($58/month) — expensive at scale.
- **Decision needed:** Phase 1 implementation should use keyword-search-only for diff. ASIN lookups are Phase 2 hybrid enhancement.

**BullMQ rate limiting:**
- BullMQ v5 `Worker` accepts `limiter: { max: number, duration: number }`. For DataForSEO API safety: `max: 3, duration: 60000` (3 jobs per minute) is a reasonable default to avoid rate limit errors. This is different from the `concurrency` setting — `limiter` throttles across all workers; `concurrency` controls per-worker parallelism.

**Astro rebuild from refresh context:**
- `GenerateSiteJob` calls `process.chdir(GENERATOR_ROOT)` before `build()` and restores it after (D049). `ProductRefreshJob` must do the same. If both jobs can run concurrently (different sites), there's a race on `process.cwd()`. But concurrency on the `generate` queue is 1 (D036), and refresh is a separate queue. Need to ensure both queues don't build simultaneously — either share the `generate` queue or add a mutex. **Recommendation:** enqueue refresh-triggered rebuilds on the existing `generate` queue (concurrency=1) rather than running Astro build inline in the refresh job. ProductRefreshJob detects changes, enqueues GenerateSiteJob, exits. This cleanly decouples detection from rebuild.

## Common Pitfalls

- **Rebuilding on rating changes** — D008 is explicit: ratings are deferred. The diff engine must skip `rating`/`review_count` changes as rebuild triggers. Only `price`, `availability`, `images` fire immediate rebuild.
- **Alerting on every cycle for a persistent problem** — Without deduplication, a product that stays unavailable for 7 days creates a new alert on every refresh. Fix: before inserting an `'unavailable'` alert, check for an existing `open` alert with the same `site_id, product_id, alert_type` and skip if found.
- **Site degradation percentage calculation** — The "site degraded >30%" threshold requires knowing total product count. Don't count only unavailable products detected in the current cycle; compare against total products in the site (`SELECT COUNT(*) FROM tsa_products WHERE site_id = ?`).
- **Keyword search returning different products** — A keyword refresh won't return the same ASIN set as the initial generation if Amazon rotates catalog. Diff logic must be ASIN-keyed; products not seen in the new SERP should be treated as "not returned" (not necessarily unavailable — they may still exist on Amazon but didn't rank). Treat SERP absence as a candidate for ASIN-level validation before marking unavailable.
- **Price history JSONB size** — Context says max 30 entries rolling. Implement the rolling window cap in the update logic: read existing `price_history`, prepend new entry, slice to 30. Don't let it grow unbounded.
- **Refresh cron for non-live sites** — Scheduler fires globally; the refresh job must skip sites that are not `status: 'live'`. Add `WHERE status = 'live'` to the site fetch at the start of each refresh job.
- **Worker startup crash blocking all queues** — The worker registers all queues at startup. If `registerScheduler()` for the product refresh queue fails (Redis connectivity), it will crash the worker and take down analytics aggregation too. Wrap `registerScheduler()` in try/catch with error logging — same defensive pattern needed for analytics.
- **Rebuild loop** — If content generation is still idempotent-gated by `focus_keyword !== null`, a refresh rebuild won't re-run content generation (products already have focus_keyword). This is correct behavior — refresh should not regenerate AI content. Confirm that `GenerateSiteJob` skips content generation for products with existing `focus_keyword`.

## Open Risks

- **DataForSEO task polling timeout at scale** — `MAX_POLL_ATTEMPTS: 12` with exponential backoff starting at 5s. For 100 sites refreshing simultaneously (if concurrency is misconfigured), all tasks submitted at once could exceed the 45-minute standard queue turnaround. Rate limiter must prevent this.
- **Astro build time per refresh** — Current GenerateSiteJob is full pipeline (fetch + images + content + build + score + deploy). For refresh, rebuilding is the same Astro build. If 10 sites need rebuilds simultaneously, they must queue on the `generate` queue (concurrency=1). This means refresh-triggered rebuilds wait behind pending generate jobs.
- **Image drift during refresh** — If a product's Amazon image URL changes (CDN rotation), the old local WebP remains but the new URL would produce a new image. The diff engine needs to check image URLs against what's currently downloaded, not just whether `images[]` is non-empty.
- **node-ssh ERR_MODULE_NOT_FOUND** — Confirmed: `node-ssh` is not resolvable from monorepo root. This blocks monster-worker from starting entirely. Must be the very first task in S01.

## Candidate Requirements

These findings suggest additional behavior worth discussing before slicing:

- **CR-M006-01 (advisory):** Add `last_refreshed_at` and `refresh_interval_hours` columns to `sites` table. `refresh_interval_hours` defaults to 48 (2 days). Scheduler enqueues one job per live site using `last_refreshed_at` to skip sites refreshed recently. Without per-site config, all sites refresh on the same fixed cron — less flexible and wastes API calls for new sites with no traffic.
- **CR-M006-02 (advisory):** SERP-absence → ASIN validation, not direct unavailability. Products not returned in the keyword SERP should be validated via the ASIN endpoint before being marked unavailable. Skip for Phase 1 (too expensive); mark SERP-absent products as `'limited'` availability instead of `'unavailable'`, triggering a softer alert.
- **CR-M006-03 (scope risk):** Alert resolution UI. Context says alerts have `open → acknowledged → resolved` states (D017). Dashboard shows count. S03 should include a minimal resolution action (mark acknowledged / resolved) in the alert list — without it, the alert count is noise that operators can't act on.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| BullMQ | none found | none |
| DataForSEO | none found | none |

## Sources

- DataForSEO ASIN endpoint confirmed: `POST /v3/merchant/amazon/asin/task_post`, GET `task_get/advanced/{id}`. Returns `price_from`, `rating`, `is_amazon_choice`, availability context, `image_url`. Cost: $0.0015/product standard queue. (source: [DataForSEO ASIN docs](https://docs_v3.dataforseo.com/v3/merchant-amazon-asin-task_get-advanced/))
- DataForSEO Products+Sellers: $0.001/SERP standard queue. Keywords search already implemented in `DataForSEOClient.searchProducts()`. (source: [DataForSEO Merchant API pricing](https://dataforseo.com/apis/merchant-api-amazon))
- BullMQ v5 `RateLimiterOptions`: `{ max: number, duration: number }` on Worker options. Confirmed in `/node_modules/.pnpm/bullmq@5.71.0/node_modules/bullmq/dist/esm/interfaces/rate-limiter-options.d.ts`
- `upsertJobScheduler` confirmed in BullMQ v5 Queue class. Pattern established in `AnalyticsAggregationJob.registerScheduler()`.
- `node-ssh` not in monorepo root `node_modules/` — only in pnpm store at `.pnpm/node-ssh@13.2.1/`. Confirmed as root cause of worker boot failure.
