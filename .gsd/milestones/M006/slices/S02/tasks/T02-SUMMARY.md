---
id: T02
parent: S02
milestone: M006
provides:
  - ProductRefreshJob extended with diff_products phase — DB product fetch, diffProducts() call, tsa_products upsert (price/availability/source_image_url/price_history), conditional generateQueue enqueue
  - SERP-absent products upserted with availability='limited' only — current_price and source_image_url not overwritten
  - Price history read-prepend-slice(30)-write implemented; only prepended when p.price !== null
  - GenerateSiteJob product upsert now writes source_image_url — baseline established for future image diffs
  - @monster/db rebuilt — dist/index.d.ts now includes source_image_url column types
key_files:
  - packages/agents/src/jobs/product-refresh.ts
  - packages/agents/src/jobs/generate-site.ts
  - packages/db/dist/index.d.ts (rebuilt)
key_decisions:
  - price_history is fetched as part of the DB product select (separate from DbProduct type) using a raw row map — avoids adding price_history to the diff-engine DbProduct type which only needs diff-relevant fields
  - @monster/db must be rebuilt (pnpm --filter @monster/db build) whenever supabase.ts is manually updated — dist/index.d.ts is what downstream packages use for typecheck, not the source file
patterns_established:
  - DB select includes price_history alongside diff fields; raw rows stored in a separate Map<string, DbProductRow> for O(1) price_history access during upsert construction
  - Upsert rows for SERP-absent products contain only {site_id, asin, availability, last_checked_at} — explicit minimal update to avoid overwriting price/image data
  - generateQueue() singleton called inside the handler (not at module scope) — consistent with D021 pattern (read env at call time)
observability_surfaces:
  - "[ProductRefreshJob] site <id> phase=diff_products started" — marks diff phase entry
  - "[ProductRefreshJob] site <id> changes=<N> rebuild=<bool> serpAbsent=<N>" — diff result summary
  - "[ProductRefreshJob] site <id> phase=diff_products complete" — marks diff phase exit
  - "[ProductRefreshJob] site <id> rebuild enqueued reason=<type>" — rebuild trigger logged
  - "[ProductRefreshJob] site <id> rebuild skipped — site status=<status>" — non-live site skip logged
  - "pm2 logs monster-worker --nostream --lines 50 | grep diff_products" — inspect diff phase execution
  - BullMQ 'generate' queue in Redis — inspect enqueued GenerateSiteJob
duration: ~25min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Wire Diff Engine into ProductRefreshJob + Price History + Source Image URL

**`ProductRefreshJob` extended with a `diff_products` phase: DB product fetch, `diffProducts()` call, full `tsa_products` upsert (price/availability/source_image_url/price_history), conditional `GenerateSiteJob` enqueue; plus `source_image_url` baseline write added to `GenerateSiteJob`.**

## What Happened

Extended `product-refresh.ts` handler with Steps 3–7 of the S02 diff phase, inserted between the DataForSEO fetch and the sites timestamp update:

1. **DB fetch**: Added `price_history` to the `tsa_products` select. The `DbProduct[]` array (diff-engine types) is built from these rows; a separate `dbRowMap` (raw row map) holds the full rows including `price_history` for upsert construction.

2. **Diff call**: `diffProducts(dbProducts, dfsProducts)` called after mapping DFS results to `DfsProduct[]`. Result logged with `changes=N rebuild=bool serpAbsent=N`.

3. **SERP-present upsert**: For each DFS product, upserts `current_price`, `availability='available'`, `source_image_url`, `price_history` (read-prepend-slice(30)-write; only prepended when `p.price !== null`), and `last_checked_at`. Uses `onConflict: 'site_id,asin'`.

4. **SERP-absent upsert**: Only when `serpAbsentAsins.length > 0`. Minimal rows: `{site_id, asin, availability: 'limited', last_checked_at}` — does not touch `current_price` or `source_image_url`.

5. **Conditional rebuild enqueue**: `generateQueue().add(...)` called only when `shouldRebuild && site.status === 'live'`. Site select updated to include `status` column.

Added `source_image_url: p.imageUrl ?? null` to `GenerateSiteJob`'s product upsert — establishes the baseline needed for image diff on subsequent refreshes.

## Verification

- `pnpm --filter @monster/agents build` → exit 0, `dist/worker.js` emitted ✓
- `pnpm --filter @monster/agents typecheck` → exit 0 (after rebuilding `@monster/db`) ✓
- `pnpm --filter @monster/agents test` → 10/10 diff-engine tests pass ✓
- `cd apps/admin && npx tsc --noEmit` → exit 0 ✓
- Grep confirmed: `phase=diff_products` (lines 164, 243), `rebuild enqueued` (line 254), `rebuild skipped` (line 258) in product-refresh.ts ✓
- Grep confirmed: `source_image_url` at line 247 in generate-site.ts ✓

## Diagnostics

```bash
# Inspect diff phase execution in production
pm2 logs monster-worker --nostream --lines 50 | grep diff_products

# Check enqueued GenerateSiteJobs in BullMQ
# (via admin panel → BullMQ dashboard → 'generate' queue)

# Verify tsa_products price_history + source_image_url after a refresh
psql $SUPABASE_DB_URL -c "SELECT asin, current_price, availability, source_image_url, jsonb_array_length(price_history::jsonb) AS history_entries FROM tsa_products WHERE site_id = '<siteId>' LIMIT 5;"
```

## Deviations

- **`@monster/db` rebuild required**: The `supabase.ts` was updated manually in T01, but `dist/index.d.ts` was not rebuilt. Typecheck on `@monster/agents` failed with `SelectQueryError` for `source_image_url` until `pnpm --filter @monster/db build` was run. This is a process gap — future manual supabase.ts edits must be followed by a db package rebuild.

- **Raw row map for price_history**: The plan said "read existing `price_history` from DB for this ASIN (can use the dbProducts map)". Since `DbProduct` (diff-engine type) doesn't have `price_history`, a separate `dbRowMap` was created from the raw Supabase select rows. This is cleaner than extending `DbProduct` with a field the diff engine doesn't use.

## Known Issues

None. Alert creation is T03.

## Files Created/Modified

- `packages/agents/src/jobs/product-refresh.ts` — Extended handler with diff_products phase (Steps 3–7): DB fetch, diffProducts() call, SERP-present upsert with price/availability/source_image_url/price_history, SERP-absent upsert (availability=limited only), conditional generateQueue enqueue
- `packages/agents/src/jobs/generate-site.ts` — Added `source_image_url: p.imageUrl ?? null` to product upsert object
- `packages/db/dist/index.d.ts` — Rebuilt (source_image_url now visible to downstream typecheck)
