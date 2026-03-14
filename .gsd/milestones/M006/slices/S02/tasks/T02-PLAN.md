---
estimated_steps: 6
estimated_files: 3
---

# T02: Wire Diff Engine into ProductRefreshJob + Price History + Source Image URL

**Slice:** S02 — Diff Engine + Conditional Rebuild + Alert Creation
**Milestone:** M006

## Description

Extend `ProductRefreshJob`'s handler with a `diff_products` phase immediately after `fetch_products`. The phase: diffs fetched data against DB rows, updates `tsa_products` fields (current_price, availability, source_image_url, price_history), and enqueues a `GenerateSiteJob` when rebuild-triggering changes are found and the site is live.

Also adds `source_image_url: p.imageUrl ?? null` to `GenerateSiteJob`'s product upsert so future refreshes have a baseline to compare against.

Alert creation is T03 — this task only handles the diff, DB writes, and rebuild enqueue.

## Steps

1. **Add `generateQueue` import to `product-refresh.ts`**: The existing import line pulls from `'../queue.js'`. Add `generateQueue` to it. Also import `diffProducts` and the types from `'../diff-engine.js'`.

2. **Fetch DB products for diff** — before calling `diffProducts()`, query `tsa_products` for the site:
   ```ts
   const { data: dbProducts } = await supabase
     .from('tsa_products')
     .select('asin, current_price, availability, source_image_url, rating')
     .eq('site_id', siteId);
   ```
   Map to `DbProduct[]` (the type exported from diff-engine.ts).

3. **Call `diffProducts(dbProducts, dfsProducts)`** — map `DataForSEOProduct[]` to `DfsProduct[]` (asin, price, imageUrl, rating). Log: `[ProductRefreshJob] site ${siteId} phase=diff_products started`. Log result: `changes=${result.changes.length} rebuild=${result.shouldRebuild} serpAbsent=${result.serpAbsentAsins.length}`.

4. **Update `tsa_products` per fetched product** — for each DFS product, upsert:
   - `current_price: p.price ?? null`
   - `availability: 'available'` (it was returned by SERP)
   - `source_image_url: p.imageUrl ?? null`
   - `price_history`: read existing `price_history` from DB for this ASIN (can use the dbProducts map), parse as `Array<{price:number;date:string}>` (`const history = (existing ?? []) as PriceHistoryEntry[]`), if `p.price !== null` prepend `{price: p.price, date: now}` and slice to 30, write back
   - `last_checked_at: now`
   
   For SERP-absent products (in `serpAbsentAsins`): upsert `availability: 'limited'`, `last_checked_at: now`. Do NOT overwrite `current_price` or `source_image_url` — only update availability and timestamp.

   Batch the upserts using the same `onConflict: 'site_id,asin'` pattern as S01.

5. **Enqueue `GenerateSiteJob` if rebuild warranted**: After DB updates, if `result.shouldRebuild === true`:
   - Fetch `site.status` (already have `site` from Step 1 of the S01 handler — include `status` in the select)
   - If `site.status === 'live'`: call `await generateQueue().add('generate-site', { siteId }, { removeOnComplete: false, removeOnFail: false })`
   - Log: `[ProductRefreshJob] site ${siteId} rebuild enqueued reason=${result.rebuildReason}`
   - If not live: log `[ProductRefreshJob] site ${siteId} rebuild skipped — site status=${site.status}`

6. **Add `source_image_url` to `GenerateSiteJob`'s product upsert** — in `generate-site.ts` around line 241, add `source_image_url: p.imageUrl ?? null` to the upsert object. This is a one-liner but critical for enabling image diff in future refreshes.

   Verify the `onConflict: 'site_id,asin'` upsert conflict key is unchanged — `source_image_url` is just an additional field, not part of the conflict target.

## Must-Haves

- [ ] `generateQueue` imported from `'../queue.js'` in product-refresh.ts (not a new queue instance)
- [ ] `diffProducts()` called after fetch, before alert creation, with DB products and DFS products as separate typed arrays
- [ ] SERP-absent products upserted with `availability: 'limited'` only — `current_price` and `source_image_url` not overwritten
- [ ] Price history write: read-prepend-slice(30)-write; only prepended when `p.price !== null`; existing `null` history handled defensively as `[]`
- [ ] `generateQueue().add()` called only when `shouldRebuild && site.status === 'live'`
- [ ] `source_image_url: p.imageUrl ?? null` added to `GenerateSiteJob`'s product upsert
- [ ] Phase log lines present: `phase=diff_products started` and `phase=diff_products complete`
- [ ] `pnpm --filter @monster/agents build` exit 0
- [ ] `pnpm --filter @monster/agents typecheck` exit 0

## Verification

- `pnpm --filter @monster/agents build` → exit 0
- `pnpm --filter @monster/agents typecheck` → exit 0
- Grep for new log strings in product-refresh.ts: `phase=diff_products`, `rebuild enqueued`, `rebuild skipped`
- Confirm `source_image_url` appears in generate-site.ts upsert object

## Observability Impact

- Signals added: `[ProductRefreshJob] site <id> phase=diff_products started/complete`, `[ProductRefreshJob] site <id> changes=<N> rebuild=<bool> serpAbsent=<N>`, `[ProductRefreshJob] site <id> rebuild enqueued reason=<type>`, `[ProductRefreshJob] site <id> rebuild skipped — site status=<status>`
- How a future agent inspects this: `pm2 logs monster-worker --nostream --lines 50 | grep diff_products` shows diff phase execution; BullMQ `generate` queue in Redis shows enqueued job
- Failure state exposed: job `failed` event (registered in `register()`) logs site + error; upsert errors are thrown (BullMQ marks job failed + logs)

## Inputs

- `packages/agents/src/diff-engine.ts` (T01) — `diffProducts()`, `DbProduct`, `DfsProduct`, `DiffResult` types
- `packages/agents/src/queue.ts` — `generateQueue()` singleton (already exported)
- `packages/agents/src/jobs/product-refresh.ts` (S01) — existing handler structure to extend
- `packages/agents/src/jobs/generate-site.ts` — product upsert location (~line 235)
- `packages/db/src/types/supabase.ts` (T01) — updated types including `source_image_url`

## Expected Output

- `packages/agents/src/jobs/product-refresh.ts` — handler extended with diff phase: DB product fetch, diffProducts() call, tsa_products upsert (price/availability/source_image_url/price_history), conditional generateQueue enqueue
- `packages/agents/src/jobs/generate-site.ts` — `source_image_url: p.imageUrl ?? null` added to product upsert
