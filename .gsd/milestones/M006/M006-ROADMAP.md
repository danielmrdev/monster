# M006: Product Refresh Pipeline

**Vision:** Autonomous maintenance loop — BullMQ scheduled jobs fetch updated product data from DataForSEO, diff against DB, trigger conditional rebuilds, create alerts when products degrade, and surface all of this in the admin panel. Sites never go silently stale.

## Success Criteria

- Admin panel site detail shows "Last refreshed: X hours ago" with accurate timestamp
- Manually triggering a refresh for a live site fetches real DataForSEO data and updates `products.last_checked_at`
- Editing a product's price in DB directly then triggering a refresh causes a `GenerateSiteJob` to be enqueued
- A product marked unavailable in DataForSEO response creates a `product_alerts` row (open) with no duplicate on re-run
- Dashboard KPI card shows live count of open product alerts
- Alert list in admin panel allows marking alerts acknowledged/resolved
- `monster-worker` pm2 process starts cleanly (no ERR_MODULE_NOT_FOUND), registers both the analytics and product-refresh schedulers on startup
- Refresh cron fires automatically on schedule (visible in pm2 logs)

## Key Risks / Unknowns

- `node-ssh` ERR_MODULE_NOT_FOUND blocks the worker entirely — must be first task in S01; nothing else can be verified without it
- SERP-absence ≠ unavailability — products not returned in a keyword SERP may simply not rank; treating absence as unavailable would produce false alerts at high volume
- Alert deduplication — without a guard, every refresh cycle creates a new alert for persistent problems, flooding the dashboard
- `process.cwd()` race on concurrent Astro builds — refresh job must not build Astro inline; must enqueue `GenerateSiteJob` on the existing `generate` queue (concurrency=1) to avoid the race

## Proof Strategy

- `node-ssh` blocker → retire in S01/T01 by confirming `pm2 start ecosystem.config.js` brings monster-worker online with scheduler log lines
- SERP-absence handling → retire in S02/T02 by confirming diff engine marks SERP-absent products as `'limited'` (not `'unavailable'`) in tests and in a manual dry-run log
- Alert deduplication → retire in S02/T03 by running two consecutive refresh cycles against the same site and confirming the `product_alerts` count does not grow on the second run
- `process.cwd()` race → retired by design (S02 enqueues `GenerateSiteJob` instead of calling `build()` inline — no Astro build happens in the refresh worker)

## Verification Classes

- Contract verification: `pnpm --filter @monster/agents build` exit 0; `tsc --noEmit` exit 0 across all packages; pm2 log grep for scheduler registration lines; unit test for diff engine categorization
- Integration verification: manual trigger of `enqueueProductRefresh(siteId)` → BullMQ job runs → `sites.last_refreshed_at` updated → DataForSEO API called (verify via job log); simulate price change → `GenerateSiteJob` enqueued
- Operational verification: pm2 process starts without ERR_MODULE_NOT_FOUND; scheduler fires on cron; worker survives restart with no duplicate scheduler registrations
- UAT / human verification: visit admin panel → trigger refresh → see "Last refreshed: X minutes ago" → check dashboard alert count increments on simulated unavailability → resolve alert → count decrements

## Milestone Definition of Done

This milestone is complete only when all are true:

- [ ] `monster-worker` starts cleanly — no ERR_MODULE_NOT_FOUND, both analytics and product-refresh schedulers registered in pm2 logs
- [ ] `ProductRefreshJob` runs end-to-end: fetches from DataForSEO, writes `last_refreshed_at`, logs detected changes
- [ ] Diff engine correctly categorizes price/availability/image changes as rebuild-triggering; rating changes as deferred (unit tested)
- [ ] Alert deduplication confirmed — two consecutive refreshes on a persistently unavailable product produce exactly one open alert
- [ ] Admin panel site detail shows refresh timestamp, product availability summary, open alert count, and "Refresh Now" button
- [ ] Dashboard alert KPI card shows live open alert count
- [ ] Alert list with acknowledge/resolve actions functional
- [ ] All builds (`pnpm -r build`) exit 0; `tsc --noEmit` exit 0
- [ ] R007 and R008 validated

## Requirement Coverage

- **Covers:** R007 (product refresh pipeline), R008 (product availability alerts)
- **Partially covers:** R001 (end-to-end pipeline — refresh is the maintenance loop of the same pipeline)
- **Leaves for later:** all other active requirements (R003, R006, R009, R010, R011, R012 — separate milestones)
- **Orphan risks:** none — all active requirements are mapped to milestones

## Slices

- [x] **S01: Worker Fix + Refresh Job Scaffold + Cron Scheduler** `risk:high` `depends:[]`
  > After this: `monster-worker` starts without errors, `ProductRefreshJob` runs on BullMQ on a configurable schedule (default 48h per site), fetches DataForSEO product data for a live site, writes `last_refreshed_at` to DB, and the admin panel site detail shows "Last refreshed: X hours ago" with a working "Refresh Now" button — verified by manual trigger from the admin panel and pm2 log confirmation.

- [x] **S02: Diff Engine + Conditional Rebuild + Alert Creation** `risk:high` `depends:[S01]`
  > After this: the refresh job diffs fetched products against DB, enqueues `GenerateSiteJob` when price/availability/image changes are detected (ratings deferred), and creates deduplicated `product_alerts` rows — verified by simulating a price change in the DB then triggering a refresh and confirming a `GenerateSiteJob` appears in the BullMQ queue and a single open alert exists.

- [x] **S03: Dashboard Alert Surface + Alert Resolution UI** `risk:low` `depends:[S02]`
  > After this: the dashboard KPI card shows live open alert count, the site detail page shows a product availability summary with per-product alert status, and the alert list lets the operator mark alerts acknowledged or resolved — fully exercisable through the admin panel without touching the DB directly.

## Boundary Map

### S01 → S02

Produces:
- `ProductRefreshJob` class with phase tracking (`fetch_products` phase only in S01)
- `productRefreshQueue()` singleton + `createProductRefreshQueue()` factory (follows `analyticsAggregationQueue` pattern)
- DB migration: `sites.last_refreshed_at timestamptz`, `sites.refresh_interval_hours int4 default 48`, `sites.next_refresh_at timestamptz`
- `enqueueProductRefresh(siteId)` server action in `apps/admin`
- Site detail "Product Refresh" card (refresh timestamp, "Refresh Now" button) — stub availability summary (S02 fills in)
- `node-ssh` fixed in `packages/agents` deps — worker boots cleanly
- Verified pm2 startup with scheduler registration log line

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- `sites.last_refreshed_at` column (S03 reads this for the site detail card)
- `product_alerts` table already exists from M001 schema (S03 reads it for the alert surface)
- `enqueueProductRefresh(siteId)` server action (S03 adds no new queue infrastructure)

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- Populated `product_alerts` rows with `site_id`, `product_id`, `alert_type` (`product_unavailable`, `category_empty`, `site_degraded`), `severity` (`warning`, `critical`), `status` (`open`)
- Alert deduplication invariant: exactly one open alert per `(site_id, product_id, alert_type)` triple
- `ProductChange` typed diff result (`{ type: 'price' | 'availability' | 'image' | 'rating', asin, old, new }`)
- Rebuild decision typed result (`{ shouldRebuild: boolean, reason: string, changes: ProductChange[] }`)
- `tsa_products.last_checked_at` and `tsa_products.price_history` (JSONB, rolling 30-entry cap) written on every refresh

Consumes:
- `product_alerts` table (M001 schema)
- `productRefreshQueue()` singleton (S01)
- `GenerateSiteJob` on `generate` queue (M003)
