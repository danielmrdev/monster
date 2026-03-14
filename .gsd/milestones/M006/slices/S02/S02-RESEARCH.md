# S02: Diff Engine + Conditional Rebuild + Alert Creation — Research

**Date:** 2026-03-14

## Summary

S02 extends `ProductRefreshJob` beyond the `fetch_products` phase S01 established. The diff engine compares DataForSEO-fetched product data against DB rows, drives conditional rebuild enqueueing, writes price history, and creates deduplicated alerts. All infrastructure is already in place — this is pure business logic on top of S01's foundation.

Three non-obvious constraints shape the implementation: (1) the `product_alerts` schema is missing a `severity` column that the S02 boundary map says to produce — a migration is needed; (2) `DataForSEOProduct` has no explicit availability/stock field, so "availability change" can only be detected as SERP absence, which D092 says to treat as `'limited'`, not `'unavailable'` — but the milestone success criteria still require alerts to be created, so SERP-absent products must trigger an `'unavailable'` alert at the `'warning'` severity level (soft signal, not a hard outage claim); (3) image diff can't compare Amazon CDN URLs against local WebP paths (D054 says imageUrl is never persisted) — the diff engine must add a `source_image_url` column to `tsa_products` to enable meaningful image change detection in S02.

The rebuild path is already designed: `ProductRefreshJob` calls `generateQueue().add('generate-site', { siteId })` on detecting rebuild-triggering changes. No inline Astro build — fully decoupled from the `generate` queue's concurrency control (D091). Unit tests for the diff engine require adding `vitest` as a devDependency in `packages/agents`, following the identical pattern from `packages/seo-scorer`.

## Recommendation

Split S02 into three tasks:
- **T01:** Migrations + diff engine (`packages/agents/src/diff-engine.ts`) with unit tests. Pure functions only — no Supabase, no BullMQ. Vitest added to `packages/agents`. Migration adds `severity text` to `product_alerts` and `source_image_url text` to `tsa_products`.
- **T02:** Wire diff engine into `ProductRefreshJob` handler: diff phase, price history write (D095 rolling window), DB updates (`current_price`, `availability`, `source_image_url`), rebuild enqueue via `generateQueue().add()`.
- **T03:** Alert creation with deduplication (D093 check-before-insert), `category_empty` / `site_degraded` aggregation logic, and verification (two-cycle dedup test).

Keep T01 entirely test-driven — the diff engine logic is complex enough that writing tests first validates the categorization rules before they're wired into the live job.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Enqueueing GenerateSiteJob from within refresh worker | `generateQueue().add('generate-site', { siteId }, { removeOnComplete: false, removeOnFail: false })` | Same pattern `sslPollerQueue().add(...)` in `deploy-site.ts:187`. Import `generateQueue` from `../queue.js`. No new infrastructure. |
| Rebuild decision rule | `REBUILD_TRIGGERS = ['price', 'availability', 'images']` from `@monster/shared` | Already defined (D008). Diff engine imports this constant rather than hardcoding the array. |
| Price history rolling window | Read `price_history` JSONB from DB, prepend `{ price, date }`, slice to 30, write back | D095. Straightforward array manipulation. `tsa_products.price_history` column exists (nullable jsonb). |
| Alert deduplication | Check-before-insert: `SELECT id FROM product_alerts WHERE site_id=? AND product_id=? AND alert_type=? AND status='open'` | D093. No DB unique constraint (allows re-alerting after resolution). One read per ASIN before insert. |
| Unit test runner | `vitest` — already used in `packages/seo-scorer` | Copy `"test": "vitest run --reporter verbose"` script and `vitest` devDep from seo-scorer's `package.json`. No monorepo root config needed. |
| Alert count KPI on dashboard | Already queries `product_alerts` where `status='open'` | `apps/admin/src/app/(dashboard)/dashboard/page.tsx` line 16. Dashboard KPI card auto-reflects new rows — no S02 UI changes needed. |

## Existing Code and Patterns

- `packages/agents/src/jobs/product-refresh.ts` — The S01 handler ends after `last_refreshed_at` write. S02 adds the `diff_products` phase immediately after `fetch_products`: compute diff, update DB fields, enqueue rebuild, create alerts. Phase log pattern: `[ProductRefreshJob] site ${siteId} phase=diff_products started`.
- `packages/agents/src/jobs/deploy-site.ts:187` — `sslPollerQueue().add(...)` shows the canonical pattern for enqueueing from inside a worker. Use `generateQueue().add('generate-site', { siteId })` identically.
- `packages/agents/src/clients/dataforseo.ts` — `DataForSEOProduct` interface: `{ asin, title, imageUrl, price, rating, reviewCount, isPrime, isBestSeller }`. No availability field. SERP absence (product in DB but not in new fetch result) is the only Phase 1 signal.
- `packages/agents/src/queue.ts` — `generateQueue()` singleton and `createGenerateQueue()` factory both exported. Import `generateQueue` in `product-refresh.ts` from `'../queue.js'`.
- `packages/shared/src/constants/index.ts` — `REBUILD_TRIGGERS` and `RebuildTrigger` type. Import to drive the rebuild decision without hardcoding.
- `packages/seo-scorer/package.json` — Exact pattern to copy for vitest setup in `packages/agents`: add `vitest: ^3.0.0` devDep, add `"test": "vitest run --reporter verbose"` script.
- `packages/db/src/types/supabase.ts` — `product_alerts` Row type is the insert target. After adding `severity` column via migration, update the manual type (S01 pattern — `supabase gen types` deferred until CLI auth is set up).
- `packages/db/supabase/migrations/20260313000007_alerts.sql` — Defines check constraint: `alert_type IN ('unavailable','category_empty','site_degraded')`. Note: boundary map docs say `'product_unavailable'` but the actual DB constraint uses `'unavailable'`. **Use `'unavailable'` in code** — no constraint change needed.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — Queries `product_alerts` for `status='open'` count already. No S02 UI changes needed for dashboard KPI to work.

## Constraints

**Schema gaps requiring migrations:**
- `product_alerts` has no `severity` column. The S02 boundary map explicitly says `severity ('warning', 'critical')` is produced. Add `severity text NOT NULL DEFAULT 'warning'` with check constraint `IN ('warning', 'critical')`. This requires a new migration file (e.g. `20260314000004_alerts_severity.sql`).
- `tsa_products` has no `source_image_url` column. Without it, image diff is impossible (D054 says imageUrl is never written to `images[]`). Add `source_image_url text` (nullable) to `tsa_products`. Update `GenerateSiteJob` to write it during upsert (the imageUrl from DataForSEO is already in memory — add one line to the existing upsert). Migration: `20260314000005_product_source_image.sql`.
- **Manual `supabase.ts` type edits required** (same pattern as S01) until `supabase gen types` with CLI auth is available.

**`product_alerts` alert_type constraint:**
- Existing check constraint: `alert_type IN ('unavailable','category_empty','site_degraded')`.
- Boundary map docs say `'product_unavailable'` — this is incorrect in the boundary map. **Use `'unavailable'` in all code and tests.** No migration change to the constraint.

**SERP absence vs hard unavailability:**
- `DataForSEOProduct` has no availability field — no explicit out-of-stock signal from keyword SERP.
- D092: SERP-absent products → `availability = 'limited'`, no Phase 1 alert.
- **But milestone success criteria require alerts**: "A product marked unavailable in DataForSEO response creates a `product_alerts` row."
- Resolution: D092 and the success criteria are partially in tension. Practical Phase 1 approach: SERP-absent products get `availability = 'limited'` AND create an `'unavailable'` alert with `severity = 'warning'` (not `'critical'`). This satisfies the deduplication proof requirement without overclaiming hard unavailability. Alert details JSONB should include `{ reason: 'serp_absent' }` so S03 can display the distinction.
- `'critical'` severity is reserved for `'category_empty'` and `'site_degraded'` alerts.

**Price diff threshold:**
- No threshold defined in PRD or decisions. Any price change triggers rebuild. Comparison: `Math.abs(dfsPrice - dbCurrentPrice) > 0.01` (epsilon for float equality). `null` → `non-null` or `non-null` → `null` also counts as a price change.

**Image diff mechanism:**
- Phase 1: compare `DataForSEOProduct.imageUrl` vs `tsa_products.source_image_url`. If they differ and the product had images, flag as image change. If `source_image_url` is null (never refreshed), skip image diff for that product.
- `GenerateSiteJob` must be updated in T02 to write `source_image_url` during the `fetch_products` upsert (currently only writes `images: []` initially, then updates with local paths — add `source_image_url: p.imageUrl` to the initial upsert).

**Rebuild enqueue from worker context:**
- Import `generateQueue` from `'../queue.js'` inside `product-refresh.ts`. The singleton is safe for use from the worker process (same Redis connection strategy as `sslPollerQueue()` in `deploy-site.ts`).
- Enqueue options: `{ removeOnComplete: false, removeOnFail: false }` — matching `enqueueSiteGeneration` in admin actions. No `jobId` from within the refresh worker (no ai_jobs row created for refresh-triggered rebuilds in S02; S03 can add if needed).
- Only enqueue if `shouldRebuild === true` AND site `status === 'live'` — don't trigger rebuild for draft/paused/error sites.

**Price history write (D095):**
- Read `tsa_products.price_history` (nullable jsonb), parse as `Array<{ price: number; date: string }>`.
- Prepend `{ price: dfsPrice, date: isoNow }` only if `dfsPrice !== null`.
- Slice to 30 entries: `history.slice(0, 30)`.
- Write back in the product upsert row.

**Alert deduplication (D093):**
- Before inserting, query: `SELECT id FROM product_alerts WHERE site_id=$1 AND product_id=$2 AND alert_type=$3 AND status='open' LIMIT 1`.
- `product_id` is the `tsa_products.id` UUID (not the ASIN). Must fetch `tsa_products.id` by `site_id + asin` first.
- If an open alert exists: skip insert. If none: insert new row.

**`category_empty` alert:**
- After marking individual products limited, check if any category has zero `available` products remaining.
- Query: `SELECT category_id, COUNT(*) FILTER (WHERE p.availability = 'available') as available_count FROM category_products cp JOIN tsa_products p ON cp.product_id = p.id WHERE p.site_id = $1 GROUP BY category_id`.
- If a category drops to 0 available products: create `'category_empty'` alert with `severity = 'critical'`, `product_id = null`.

**`site_degraded` alert:**
- Threshold: >30% of total site products are `'limited'` or `'unavailable'`.
- Query: total count vs limited/unavailable count for the site.
- Alert: `alert_type = 'site_degraded'`, `severity = 'critical'`, `product_id = null`.

**`ProductRefreshJob` lockDuration:**
- Already 300000ms (5 min) from S01. S02 adds more DB work but doesn't significantly extend execution time — the DataForSEO poll is still the bottleneck. No change needed.

**Vitest isolation:**
- The diff engine (`diff-engine.ts`) must have zero external imports (`@monster/*`, `bullmq`, `ioredis`) to be vitest-testable without mocking. All Supabase and queue interactions stay in the handler. The diff engine takes plain data in, returns typed results out.

## Common Pitfalls

- **Using `'product_unavailable'` alert_type** — The check constraint allows `'unavailable'` only. Boundary map docs are wrong. Use `'unavailable'` or the Supabase insert will fail silently (check violation returns an error that must be checked).
- **Comparing float prices without epsilon** — `3.99 !== 3.99` in floating point is possible after JSONB round-trips. Use `Math.abs(a - b) > 0.01` as equality guard.
- **Forgetting to import `generateQueue` in product-refresh.ts** — Currently only `createProductRefreshQueue` and `createRedisConnection` are imported from `queue.js`. Add `generateQueue` to the import line.
- **ASIN lookup for alert `product_id`** — `product_alerts.product_id` is a UUID FK to `tsa_products.id`, not an ASIN string. Must look up the `tsa_products` row by `(site_id, asin)` to get the UUID. These rows already exist after S01's `last_checked_at` upsert.
- **Enqueuing rebuild for non-live sites** — Check `site.status === 'live'` before calling `generateQueue().add()`. Refresh jobs run for any site that has a scheduler (registered at startup from live sites), but between scheduler creation and job execution a site may have been paused or errored.
- **Category empty check using stale in-memory state** — Don't check category emptiness based on the in-memory diff result alone. Re-query the DB after updating `availability` columns to get accurate counts, because other refresh jobs may have run concurrently.
- **Price history null handling** — `tsa_products.price_history` starts as `null`. Parse defensively: `const history: PriceEntry[] = (existing ?? []) as PriceEntry[]`. Don't assume it's an initialized array.
- **Logging imageUrl (CDN URL)** — Don't log the full Amazon CDN URL as it may be very long. Log only the domain or a truncated form.
- **`GenerateSiteJob` re-runs content generation** — When a refresh-triggered rebuild re-runs `GenerateSiteJob`, the content generation phase is idempotent-gated: it only generates for products where `focus_keyword === null`. Products already generated skip that phase. Confirm this behavior is still correct — it should be, per S01 summary Forward Intelligence.

## Open Risks

- **`product_alerts` check constraint update if alert_type must change** — If a future requirement adds `'price_spike'` or other types, the check constraint needs migration. For Phase 1, `'unavailable'`, `'category_empty'`, `'site_degraded'` are sufficient.
- **GenerateSiteJob full pipeline on refresh trigger** — When `ProductRefreshJob` enqueues a `GenerateSiteJob`, that job runs the full pipeline: DataForSEO fetch + images + content + build + score + deploy. For a refresh-triggered rebuild, re-fetching DataForSEO is redundant (just did it). This is wasteful but correct — no short-circuit GenerateSiteJob variant exists. Phase 2 optimization: add a `refreshOnly` flag to skip the DataForSEO fetch phase.
- **Race: two refresh jobs for the same site** — If a manual "Refresh Now" is triggered while the scheduled refresh is running, both may enqueue a `GenerateSiteJob`. The `generate` queue at concurrency=1 serializes them harmlessly, but two builds run. Low probability, no correctness issue.
- **`source_image_url` update in `GenerateSiteJob`** — Adding `source_image_url` to the `generate-site.ts` upsert is a small change but touches the generation pipeline. Must confirm it doesn't break the existing `(site_id, asin)` upsert conflict resolution.

## Schema Changes Summary

Two new migrations needed:

**`20260314000004_alerts_severity.sql`:**
```sql
ALTER TABLE product_alerts
  ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'warning';
ALTER TABLE product_alerts
  ADD CONSTRAINT product_alerts_severity_check CHECK (severity IN ('warning', 'critical'));
```

**`20260314000005_product_source_image.sql`:**
```sql
ALTER TABLE tsa_products
  ADD COLUMN IF NOT EXISTS source_image_url text;
```

Apply both via the `postgres` npm package (SUPABASE_DB_URL from .env) — same pattern as S01/T02.

Manual `supabase.ts` additions after migrations:
- `product_alerts.Row`: add `severity: string`
- `product_alerts.Insert`: add `severity?: string`
- `product_alerts.Update`: add `severity?: string`
- `tsa_products.Row`: add `source_image_url: string | null`
- `tsa_products.Insert`: add `source_image_url?: string | null`
- `tsa_products.Update`: add `source_image_url?: string | null`

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| BullMQ | none found | none |
| Vitest | none found | none |

## Sources

- `packages/db/supabase/migrations/20260313000007_alerts.sql` — alert_type check constraint confirmed: `'unavailable'`, `'category_empty'`, `'site_degraded'`. No severity column.
- `packages/db/supabase/migrations/20260313000002_tsa.sql` — `tsa_products` columns confirmed. No `source_image_url`. `price_history jsonb` exists.
- `packages/agents/src/clients/dataforseo.ts` — `DataForSEOProduct` interface: no availability field. Price is `price_from`, nullable.
- `packages/agents/src/jobs/deploy-site.ts:187` — `sslPollerQueue().add(...)` enqueue-from-worker pattern.
- `packages/shared/src/constants/index.ts` — `REBUILD_TRIGGERS = ['price', 'availability', 'images']` confirmed.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx:16` — open alert count query already wired.
- D091, D092, D093, D094, D095 — architectural decisions governing this slice.
