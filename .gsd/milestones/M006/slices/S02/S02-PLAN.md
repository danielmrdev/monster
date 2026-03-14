# S02: Diff Engine + Conditional Rebuild + Alert Creation

**Goal:** `ProductRefreshJob` detects product changes (price/availability/image), enqueues `GenerateSiteJob` when rebuild-triggering changes are found, and creates deduplicated `product_alerts` rows.

**Demo:** Simulate a price change in the DB for a site, trigger `enqueueProductRefresh(siteId)` from the admin panel, observe a `GenerateSiteJob` appearing in the BullMQ `generate` queue and exactly one open `product_alerts` row (SERP-absent product) — second refresh produces no additional alert.

## Must-Haves

- Diff engine: categorizes price/availability/image changes as rebuild-triggering; rating changes as not
- SERP-absent products: `availability = 'limited'`, alert_type `'unavailable'`, severity `'warning'`
- Price history: read-prepend-slice(30)-write on every refresh cycle (D095)
- `GenerateSiteJob` enqueued only when `shouldRebuild === true` AND `site.status === 'live'`
- Alert deduplication: two consecutive refreshes with same SERP-absent product → exactly one open alert
- `category_empty` alert (severity `'critical'`) when a category drops to zero `'available'` products
- `site_degraded` alert (severity `'critical'`) when >30% of site products are `'limited'` or `'unavailable'`
- `product_alerts.severity` column added via migration (NOT NULL DEFAULT `'warning'`, check `IN ('warning','critical')`)
- `tsa_products.source_image_url` column added via migration (nullable text)
- `source_image_url` written by `GenerateSiteJob` during initial product upsert
- Unit tests for diff engine covering all categorization rules (vitest, no external deps)
- `pnpm --filter @monster/agents build` exit 0; `tsc --noEmit` exit 0 on all packages

## Proof Level

- This slice proves: integration (diff engine logic unit-tested + job handler exercises real DB paths)
- Real runtime required: no (unit tests prove categorization; DB path verified by build + typecheck)
- Human/UAT required: yes (dedup proof requires two actual refresh runs against a live site — deferred to human UAT)

## Verification

- `pnpm --filter @monster/agents test` → all diff engine unit tests pass
- `pnpm --filter @monster/agents build` → exit 0, dist/worker.js emitted
- `pnpm --filter @monster/agents typecheck` → exit 0
- `cd apps/admin && npx tsc --noEmit` → exit 0
- `pm2 logs monster-worker --nostream --lines 5` → no new crashes, `ProductRefreshJob listening` line present
- Migrations applied to Supabase Cloud (confirm via psql or supabase.ts type check)

## Observability / Diagnostics

- Runtime signals: `[ProductRefreshJob] site <id> phase=diff_products started/complete`, `[ProductRefreshJob] site <id> changes=<N> rebuild=<true|false>`, `[ProductRefreshJob] site <id> alert created type=<type> product=<asin|null>`, `[ProductRefreshJob] site <id> alert dedup skipped type=<type>`
- Inspection surfaces: Supabase `product_alerts` table (open alerts), BullMQ `generate` queue (enqueued jobs), `tsa_products.price_history` JSONB column, `tsa_products.availability` column, `tsa_products.source_image_url` column
- Failure visibility: job `failed` event logs site id + error message; alert insert failures logged + rethrown; rebuild enqueue failures logged + rethrown
- Redaction constraints: never log full `source_image_url` (Amazon CDN URL, can be very long) — log only asin or truncated domain

## Integration Closure

- Upstream surfaces consumed: `productRefreshQueue()` singleton (S01), `generateQueue().add('generate-site', ...)` (queue.ts), `DataForSEOProduct[]` from `searchProducts()` (S01 fetch phase), `REBUILD_TRIGGERS` constant (packages/shared)
- New wiring introduced: `diffProducts()` pure function called in handler after fetch; `generateQueue().add()` called on rebuild decision; alert insert called per SERP-absent product
- What remains before milestone end-to-end: S03 (dashboard alert KPI card, alert list with resolve UI)

## Tasks

- [x] **T01: Migrations + Diff Engine + Unit Tests** `est:45m`
  - Why: The diff engine is the business logic core of this slice. Establishing it as pure functions with unit tests before wiring ensures the categorization rules are correct and testable independently of BullMQ/Supabase. The two schema migrations are prerequisites for T02's DB writes.
  - Files: `packages/db/supabase/migrations/20260314000004_alerts_severity.sql`, `packages/db/supabase/migrations/20260314000005_product_source_image.sql`, `packages/db/src/types/supabase.ts`, `packages/agents/package.json`, `packages/agents/src/diff-engine.ts`, `packages/agents/src/diff-engine.test.ts`
  - Do: Write two migrations. Add vitest to agents devDeps (copy seo-scorer pattern). Implement `diffProducts()` pure function with typed `ProductChange` and `DiffResult` return types — zero external imports (no `@monster/shared`). Write unit tests covering: price change triggers rebuild, rating change does not, SERP-absent → `serpAbsentAsins`, image URL change triggers rebuild, null price handling, float epsilon comparison. Apply migrations to Supabase Cloud via `postgres` npm package (SUPABASE_DB_URL pattern from S01). Update `supabase.ts` types manually.
  - Verify: `pnpm --filter @monster/agents test` → all tests pass
  - Done when: diff engine tests pass; migrations applied; supabase.ts updated with severity + source_image_url fields

- [x] **T02: Wire Diff Engine into ProductRefreshJob + Price History + Source Image URL** `est:40m`
  - Why: Connects the pure diff logic to the live job: runs diff after fetch, updates DB fields (current_price, availability, source_image_url, price_history), and enqueues GenerateSiteJob when shouldRebuild is true and site is live. Also updates GenerateSiteJob's product upsert to write source_image_url.
  - Files: `packages/agents/src/jobs/product-refresh.ts`, `packages/agents/src/jobs/generate-site.ts`, `packages/agents/src/queue.ts` (verify generateQueue import)
  - Do: Import `diffProducts`, `generateQueue` in product-refresh.ts. After fetch phase: call `diffProducts(dbProducts, dfsProducts)`, log changes count + rebuild decision. Update `tsa_products` rows: write `current_price`, `availability`, `source_image_url`, `price_history` (rolling window: read existing, prepend `{price, date}`, slice to 30, write back) for all fetched products. If `shouldRebuild && site.status === 'live'`: call `generateQueue().add('generate-site', { siteId }, { removeOnComplete: false, removeOnFail: false })`. Log enqueue confirmation. In generate-site.ts product upsert: add `source_image_url: p.imageUrl ?? null` field.
  - Verify: `pnpm --filter @monster/agents build` exit 0; `pnpm --filter @monster/agents typecheck` exit 0
  - Done when: build + typecheck pass; handler extends fetch_products phase with diff + DB updates + conditional enqueue

- [x] **T03: Alert Creation with Deduplication** `est:35m`
  - Why: Completes the slice goal — creates product_alerts rows for SERP-absent products, category_empty, and site_degraded, with deduplication on (site_id, product_id, alert_type) where status='open'.
  - Files: `packages/agents/src/jobs/product-refresh.ts`
  - Do: In handler, after DB field updates: for each SERP-absent product (availability='limited'), look up `tsa_products.id` by `(site_id, asin)`, check-before-insert on `product_alerts` (D093), insert if no open alert exists with severity='warning', details `{reason:'serp_absent',asin}`. After per-product alerts: re-query category availability counts from DB (not in-memory — avoids staleness). Insert `category_empty` alert (severity='critical', product_id=null) for each category with 0 available products, with same dedup check. Check site-level degradation (>30% limited/unavailable): insert `site_degraded` alert (severity='critical', product_id=null) with dedup check. Log each insert and each skipped dedup. Confirm alert_type uses `'unavailable'` (not `'product_unavailable'` — constraint check).
  - Verify: `pnpm --filter @monster/agents build` exit 0; `pnpm --filter @monster/agents typecheck` exit 0; `cd apps/admin && npx tsc --noEmit` exit 0; `pm2 logs monster-worker --nostream --lines 5` shows no crashes
  - Done when: all builds and typechecks pass; worker boots cleanly; alert insertion logic with dedup implemented

## Files Likely Touched

- `packages/db/supabase/migrations/20260314000004_alerts_severity.sql` — new
- `packages/db/supabase/migrations/20260314000005_product_source_image.sql` — new
- `packages/db/src/types/supabase.ts` — add severity + source_image_url fields
- `packages/agents/package.json` — add vitest devDep
- `packages/agents/src/diff-engine.ts` — new: pure diff functions
- `packages/agents/src/diff-engine.test.ts` — new: unit tests
- `packages/agents/src/jobs/product-refresh.ts` — extend handler with diff + alert phases
- `packages/agents/src/jobs/generate-site.ts` — add source_image_url to product upsert
