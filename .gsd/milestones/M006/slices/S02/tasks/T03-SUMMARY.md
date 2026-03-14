---
id: T03
parent: S02
milestone: M006
provides:
  - create_alerts phase in ProductRefreshJob — per-product unavailable alerts, category_empty alerts, site_degraded alerts, all with check-before-insert deduplication
key_files:
  - packages/agents/src/jobs/product-refresh.ts
key_decisions:
  - category_empty dedup is per-site (one open category_empty alert per site max), not per-category — plan allowed this simplification for Phase 1
  - siteProductsForAlerts query (id+availability) is fetched once and reused for both category empty check and site degraded check — eliminates one redundant DB query
  - category_products JOIN computed in JS (two queries + Map) rather than raw SQL GROUP BY — Supabase client constraint, matches plan guidance
  - productIdList.length > 0 guard before category_products query — avoids Supabase `.in()` with empty array (which would return all rows or error)
patterns_established:
  - check-before-insert dedup pattern: .select('id').eq(...).eq('status','open').limit(1).maybeSingle() — if data non-null, skip; else insert
  - fetch once, reuse: single tsa_products select covers both downstream alert checks
observability_surfaces:
  - "[ProductRefreshJob] site <id> phase=create_alerts started/complete"
  - "[ProductRefreshJob] site <id> alert created type=unavailable asin=<asin>"
  - "[ProductRefreshJob] site <id> alert dedup skipped type=unavailable asin=<asin>"
  - "[ProductRefreshJob] site <id> alert created type=category_empty"
  - "[ProductRefreshJob] site <id> alert dedup skipped type=category_empty"
  - "[ProductRefreshJob] site <id> alert created type=site_degraded pct=<N>%"
  - "[ProductRefreshJob] site <id> alert dedup skipped type=site_degraded"
  - "SELECT * FROM product_alerts WHERE status='open' ORDER BY created_at DESC" — inspect open alerts
duration: ~20min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Alert Creation with Deduplication

**`create_alerts` phase added to `ProductRefreshJob`: three alert types (unavailable/category_empty/site_degraded) with check-before-insert dedup, correct severity levels, and details JSONB — all typechecks pass, worker boots clean.**

## What Happened

Extended `ProductRefreshJob` handler with Step 8 (`create_alerts` phase) inserted before the sites timestamp update.

**Per-product alerts (8a):** For each ASIN in `result.serpAbsentAsins`, fetch the `tsa_products` UUID (rows guaranteed to exist from T02's SERP-absent upsert), then dedup-check before inserting `alert_type='unavailable'`, `severity='warning'`, `details={reason:'serp_absent',asin}`.

**Category empty check (8b):** Single `tsa_products` select (`id, availability`) covers all downstream alert checks. Product IDs passed to `category_products.in()` with an explicit empty-array guard (avoids Supabase returning all rows on empty `.in()`). Category availability counts computed in JS via Map. First category with `available_count=0` triggers dedup check and insert; one alert per site max (plan allows this simplification).

**Site degraded check (8c):** Reuses the same `siteProductsForAlerts` array — no extra DB query. Threshold: strictly `> 0.30`. Dedup checks for open `site_degraded` alert before insert.

**Inline `await` fix:** Initial draft had `await` inside `.in()` parameter (invalid). Refactored to fetch `siteProductIds` first, then pass to `.in()`.

## Verification

```bash
# No 'product_unavailable' anywhere
grep -n "product_unavailable" packages/agents/src/jobs/product-refresh.ts
# → exit 1, no matches ✓

pnpm --filter @monster/agents build
# → ESM ⚡️ Build success (index.js 477KB, worker.js 2.73MB) ✓

pnpm --filter @monster/agents typecheck
# → exit 0, no output ✓

cd apps/admin && npx tsc --noEmit
# → exit 0, no output ✓

pm2 restart monster-worker && sleep 5 && pm2 logs monster-worker --nostream --lines 10
# → "ProductRefreshJob listening on queue 'product-refresh'" present, no crash ✓
```

## Diagnostics

- Open alerts: `SELECT * FROM product_alerts WHERE status='open' ORDER BY created_at DESC`
- Per-type: `SELECT alert_type, severity, COUNT(*) FROM product_alerts WHERE site_id='<id>' GROUP BY alert_type, severity`
- Worker logs: `pm2 logs monster-worker --nostream --lines 50 | grep create_alerts`
- Dedup behavior: `pm2 logs monster-worker | grep "alert dedup skipped"`
- Failure: alert insert errors throw (BullMQ marks job failed); check constraint violation on wrong alert_type surfaces as Supabase error in job failed event log

## Deviations

- **`siteProductsForAlerts` query consolidation**: Plan had separate `allSiteProds` query for site degraded check. Consolidated with the category check query to save one DB round-trip. No behavioral change.
- **category_empty dedup on (site_id, NULL, 'category_empty')**: Plan explicitly allowed per-site dedup as Phase 1 simplification — implemented as planned.

## Known Issues

None.

## Files Created/Modified

- `packages/agents/src/jobs/product-refresh.ts` — `create_alerts` phase (Steps 8a/8b/8c) added between GenerateSiteJob enqueue and sites timestamp update
