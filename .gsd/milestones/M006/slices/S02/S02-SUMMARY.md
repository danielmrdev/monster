---
id: S02
parent: M006
milestone: M006
provides:
  - Diff engine (diffProducts() pure function) — categorizes price/availability/image changes as rebuild-triggering; rating changes as deferred; SERP-absent products into serpAbsentAsins
  - DB migrations applied — product_alerts.severity (NOT NULL DEFAULT 'warning', check IN ('warning','critical')); tsa_products.source_image_url (nullable text)
  - supabase.ts types updated and @monster/db rebuilt — severity + source_image_url visible to all downstream packages
  - ProductRefreshJob extended with diff_products phase — DB product fetch, diffProducts() call, tsa_products upsert (price/availability/source_image_url/price_history rolling window), conditional GenerateSiteJob enqueue
  - ProductRefreshJob extended with create_alerts phase — per-product unavailable alerts, category_empty alerts, site_degraded alerts, all with check-before-insert dedup
  - GenerateSiteJob product upsert writes source_image_url — baseline for future image diffs
  - 10 unit tests for diff engine — all passing
requires:
  - slice: S01
    provides: ProductRefreshJob scaffold + fetch_products phase + productRefreshQueue singleton + DB columns (last_refreshed_at, refresh_interval_hours, next_refresh_at) + worker boot fix
affects:
  - S03
key_files:
  - packages/db/supabase/migrations/20260314000004_alerts_severity.sql
  - packages/db/supabase/migrations/20260314000005_product_source_image.sql
  - packages/db/src/types/supabase.ts
  - packages/agents/package.json
  - packages/agents/src/diff-engine.ts
  - packages/agents/src/diff-engine.test.ts
  - packages/agents/src/jobs/product-refresh.ts
  - packages/agents/src/jobs/generate-site.ts
key_decisions:
  - D092 — SERP-absence = 'limited' availability, not 'unavailable' — avoids false-positive alert flood
  - D093 — Alert dedup: check-before-insert on (site_id, product_id, alert_type) WHERE status='open' — no DB unique constraint (allows re-alert after resolution)
  - D095 — Price history: JSONB rolling window read-prepend-slice(30)-write on every refresh
  - D098 — @monster/db must be rebuilt after manual supabase.ts edits (dist/index.d.ts drives downstream typecheck)
  - diffProducts() does not emit ProductChange for SERP-absent products — they go into serpAbsentAsins only; availability semantics handled entirely by the job handler
  - shouldRebuild triggers defined locally in diff engine as Set('price','availability','image') — avoids import from @monster/shared which uses 'images' (plural mismatch)
  - category_empty dedup is per-site (one open category_empty alert per site max) — Phase 1 simplification
  - siteProductsForAlerts query (id+availability) fetched once, reused for both category_empty and site_degraded checks — eliminates one DB round-trip
  - productIdList.length > 0 guard before .in() call — avoids Supabase returning all rows on empty array
patterns_established:
  - check-before-insert dedup: .select('id').eq(...).eq('status','open').limit(1).maybeSingle() — if data non-null, skip; else insert
  - DB select includes price_history alongside diff fields; raw rows stored in separate Map<string, DbProductRow> for O(1) price_history access during upsert construction
  - Upsert rows for SERP-absent products contain only {site_id, asin, availability, last_checked_at} — minimal update avoids overwriting price/image data
observability_surfaces:
  - "[ProductRefreshJob] site <id> phase=diff_products started/complete" — diff phase entry/exit
  - "[ProductRefreshJob] site <id> changes=<N> rebuild=<bool> serpAbsent=<N>" — diff result summary
  - "[ProductRefreshJob] site <id> rebuild enqueued reason=<type>" — rebuild trigger confirmed
  - "[ProductRefreshJob] site <id> rebuild skipped — site status=<status>" — non-live site skip
  - "[ProductRefreshJob] site <id> phase=create_alerts started/complete" — alert phase entry/exit
  - "[ProductRefreshJob] site <id> alert created type=unavailable asin=<asin>" — per-product alert inserted
  - "[ProductRefreshJob] site <id> alert dedup skipped type=unavailable asin=<asin>" — dedup working
  - "[ProductRefreshJob] site <id> alert created type=category_empty" — category alert inserted
  - "[ProductRefreshJob] site <id> alert created type=site_degraded pct=<N>%" — site alert inserted
  - "SELECT * FROM product_alerts WHERE status='open' ORDER BY created_at DESC" — open alert inspection
  - "SELECT asin, current_price, availability, source_image_url, jsonb_array_length(price_history::jsonb) AS history_entries FROM tsa_products WHERE site_id='<id>' LIMIT 5" — price history inspection
drill_down_paths:
  - .gsd/milestones/M006/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M006/slices/S02/tasks/T03-SUMMARY.md
duration: ~65min (T01: ~20min, T02: ~25min, T03: ~20min)
verification_result: passed
completed_at: 2026-03-14
---

# S02: Diff Engine + Conditional Rebuild + Alert Creation

**`ProductRefreshJob` now diffs fetched products against DB, enqueues `GenerateSiteJob` on rebuild-triggering changes, and creates deduplicated `product_alerts` rows — backed by a pure diff engine with 10 passing unit tests and all builds/typechecks clean.**

## What Happened

Three tasks built the slice in dependency order:

**T01** established the foundation: two DB migrations applied to Supabase Cloud (severity column on `product_alerts`, `source_image_url` column on `tsa_products`), `supabase.ts` types updated manually and `@monster/db` rebuilt, and the diff engine implemented as a pure function with zero external imports. The key design choice was that `diffProducts()` doesn't emit a `ProductChange` for SERP-absent products — it puts them in `serpAbsentAsins` and leaves availability semantics to the handler. 10 unit tests cover all categorization rules: price epsilon comparison, null price handling, rating non-trigger, image URL diff with null guard, and compound change scenarios.

**T02** wired the diff engine into the live job. After the existing DataForSEO fetch phase, the handler now: fetches DB products (including `price_history` in a separate raw row map, since `DbProduct` only holds diff-relevant fields), calls `diffProducts()`, upserts all `tsa_products` rows (price/availability/source_image_url/price_history rolling window for SERP-present products; minimal availability-only upsert for SERP-absent), and conditionally enqueues `GenerateSiteJob` when `shouldRebuild && site.status === 'live'`. `GenerateSiteJob`'s product upsert also gained `source_image_url` write to establish the baseline for future image diffs. A process gap was discovered: manual `supabase.ts` edits require a subsequent `pnpm --filter @monster/db build` — now captured as D098.

**T03** completed the slice by adding the `create_alerts` phase. For each SERP-absent ASIN, it fetches the product UUID and dedup-checks before inserting an `unavailable` alert (severity=warning). It then fetches all site product IDs + availability in a single query (reused for both downstream checks): computes category availability counts in JS via Map (Supabase `.in()` with empty-array guard), inserts a `category_empty` alert (severity=critical) for categories with zero available products, and checks site degradation (>30% limited/unavailable) for a `site_degraded` alert (severity=critical). All three alert types use the same check-before-insert dedup pattern.

## Verification

```bash
# All 10 diff engine unit tests pass
pnpm --filter @monster/agents test
# → 10/10 passed, 331ms

# Build exits 0, dist/worker.js emitted (2.73 MB)
pnpm --filter @monster/agents build
# → ESM ⚡️ Build success

# Typecheck clean
pnpm --filter @monster/agents typecheck
# → exit 0

# Admin panel typecheck clean
cd apps/admin && npx tsc --noEmit
# → exit 0

# Worker starts clean — ProductRefreshJob listening, no crashes
pm2 logs monster-worker --nostream --lines 10
# → "ProductRefreshJob scheduler registered (0 sites)"
# → "ProductRefreshJob listening on queue 'product-refresh'"
# → only harmless DEP0040 punycode deprecation warnings in stderr
```

## Requirements Advanced

- R007 (product refresh pipeline) — diff engine + conditional rebuild enqueue now implemented; refresh job detects price/availability/image changes and enqueues GenerateSiteJob when shouldRebuild && site.status === 'live'
- R008 (product availability alerts) — alert creation with deduplication implemented; three alert types (unavailable/category_empty/site_degraded) with correct severity levels and check-before-insert dedup

## Requirements Validated

- None validated this slice — end-to-end proof (live DataForSEO → DB diff → actual GenerateSiteJob enqueue → actual alert row) deferred to human UAT (two consecutive refresh runs required).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- **`siteProductsForAlerts` query consolidation** (T03): Plan had a separate `allSiteProds` query for site degraded check. Consolidated with the category check query to save one DB round-trip. No behavioral change.
- **category_empty dedup per-site** (T03): Plan explicitly allowed per-site dedup as Phase 1 simplification — one open `category_empty` alert per site max rather than per-category.
- **Raw row map for price_history** (T02): `DbProduct` (diff-engine type) doesn't include `price_history`. Plan said "use the dbProducts map" but since that map only holds diff-relevant fields, a separate `dbRowMap` was created from raw Supabase rows. Cleaner than extending `DbProduct` with a field the diff engine doesn't use.
- **`@monster/db` rebuild required after supabase.ts edit** (T02): Discovered gap — manually updated `supabase.ts` doesn't propagate to downstream typecheck until `pnpm --filter @monster/db build` is run. Captured as D098.

## Known Limitations

- Alert deduplication (check-before-insert) is not race-safe under concurrent refresh jobs for the same site. The plan acknowledges a partial unique index `WHERE status='open'` would be the fix if concurrency becomes an issue (D093).
- `category_empty` alert is per-site (one open alert max regardless of how many categories are empty). Per-category granularity deferred to Phase 2.
- SERP-absent = `'limited'` (not hard unavailable). True unavailability requires ASIN-level lookup (Phase 2). This is intentional (D092).
- Price history is a JSONB rolling window on the product row. Suitable for Phase 1 inspection; not queryable across products. A dedicated `price_history` table would be needed for historical trend analysis.

## Follow-ups

- Human UAT: run two consecutive refresh cycles against a live site to confirm dedup invariant (one open alert per ASIN/category/site-degradation, not two)
- Human UAT: simulate price change in DB → trigger refresh → confirm `GenerateSiteJob` appears in BullMQ `generate` queue
- S03: Dashboard alert KPI card + alert list with acknowledge/resolve UI — consumes `product_alerts` rows produced by this slice

## Files Created/Modified

- `packages/db/supabase/migrations/20260314000004_alerts_severity.sql` — migration: severity column on product_alerts
- `packages/db/supabase/migrations/20260314000005_product_source_image.sql` — migration: source_image_url column on tsa_products
- `packages/db/src/types/supabase.ts` — severity added to product_alerts; source_image_url added to tsa_products
- `packages/agents/package.json` — vitest devDep + test script added
- `packages/agents/src/diff-engine.ts` — new: pure diffProducts() function with ProductChange + DiffResult types
- `packages/agents/src/diff-engine.test.ts` — new: 10 unit tests, all passing
- `packages/agents/src/jobs/product-refresh.ts` — diff_products phase + create_alerts phase added
- `packages/agents/src/jobs/generate-site.ts` — source_image_url added to product upsert
- `packages/db/dist/index.d.ts` — rebuilt (source_image_url + severity now visible downstream)

## Forward Intelligence

### What the next slice should know
- `product_alerts` rows now have `severity` (warning/critical), `alert_type` (unavailable/category_empty/site_degraded), `status` (open), and `details` JSONB. S03 can query `WHERE status='open'` directly — no schema changes needed for alert surface.
- Alert dedup pattern: exactly one open alert per (site_id, product_id, alert_type). When resolving an alert, just update `status='resolved'` — a new open alert will be created on the next refresh if the problem persists.
- The `product_alerts` table has been in the schema since M001 — S03 is just surfacing what now gets written.
- `sites.last_refreshed_at` is written at the end of every successful refresh job run (S01 work). S03 can read it for the "Last refreshed X hours ago" display.

### What's fragile
- `price_history` JSONB read-modify-write: if a refresh job crashes mid-upsert, some products may have partial price_history state. Not harmful but worth knowing.
- SERP-absent product detection depends entirely on which keywords DataForSEO returns results for. If a site has no stored keywords or DataForSEO returns an empty result, all products will be marked `serpAbsentAsins` and trigger alerts. Guard: ensure at least one non-empty keyword search result before treating absence as meaningful.
- `@monster/db` dist must be kept in sync with manual supabase.ts edits (D098). If another agent edits supabase.ts without rebuilding db, downstream typechecks will fail with cryptic SelectQueryError messages.

### Authoritative diagnostics
- Open alerts: `SELECT alert_type, severity, status, COUNT(*) FROM product_alerts GROUP BY 1,2,3` — quick state snapshot
- Diff phase execution: `pm2 logs monster-worker --nostream --lines 100 | grep "diff_products\|create_alerts\|alert created\|alert dedup"` — covers both phases
- Price history state: `SELECT asin, jsonb_array_length(price_history::jsonb) FROM tsa_products WHERE site_id='<id>'` — confirms rolling window is working

### What assumptions changed
- Original plan assumed `DbProduct` map could be reused for price_history lookup — it can't, since DbProduct only holds diff-relevant fields. A separate raw row map is needed.
- Original plan assumed separate DB queries for category-empty and site-degraded checks — consolidated into one query in T03. The plan explicitly allowed this.
