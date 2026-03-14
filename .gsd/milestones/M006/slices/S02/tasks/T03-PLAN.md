---
estimated_steps: 7
estimated_files: 1
---

# T03: Alert Creation with Deduplication

**Slice:** S02 — Diff Engine + Conditional Rebuild + Alert Creation
**Milestone:** M006

## Description

Extends the `ProductRefreshJob` handler with the `create_alerts` phase after the diff + DB update phase from T02. Creates deduplicated `product_alerts` rows for three conditions:
- Per-product: SERP-absent (availability='limited') → `alert_type='unavailable'`, `severity='warning'`
- Per-category: zero available products remaining → `alert_type='category_empty'`, `severity='critical'`
- Per-site: >30% products limited/unavailable → `alert_type='site_degraded'`, `severity='critical'`

Deduplication is check-before-insert: one open alert per `(site_id, product_id, alert_type)` triple (D093). A resolved alert followed by a new occurrence creates a fresh row — no DB-level unique constraint.

All alert_type values use the existing check constraint values: `'unavailable'`, `'category_empty'`, `'site_degraded'` (not `'product_unavailable'` — the boundary map docs are wrong per S02 research).

## Steps

1. **Add `create_alerts` phase log** at the start of the alert block: `[ProductRefreshJob] site ${siteId} phase=create_alerts started`.

2. **Per-product alerts (SERP-absent)** — for each ASIN in `result.serpAbsentAsins`:
   - Fetch `tsa_products` row by `(site_id, asin)` to get the UUID `id` field. (These rows exist after T02's upsert.)
   - Check-before-insert: `SELECT id FROM product_alerts WHERE site_id=$1 AND product_id=$2 AND alert_type='unavailable' AND status='open' LIMIT 1`
   - If open alert exists: log `[ProductRefreshJob] site ${siteId} alert dedup skipped type=unavailable asin=${asin}` and continue
   - If no open alert: insert `{ site_id: siteId, product_id: productRow.id, alert_type: 'unavailable', severity: 'warning', status: 'open', details: { reason: 'serp_absent', asin } }`
   - Log: `[ProductRefreshJob] site ${siteId} alert created type=unavailable asin=${asin}`

3. **Category empty check** — re-query DB (not in-memory — D "category empty check" pitfall) for current availability counts per category after all product updates:
   ```sql
   SELECT cp.category_id, COUNT(*) FILTER (WHERE p.availability = 'available') AS available_count
   FROM category_products cp
   JOIN tsa_products p ON cp.product_id = p.id
   WHERE p.site_id = $1
   GROUP BY cp.category_id
   ```
   Run this via Supabase RPC or raw query. For each category with `available_count = 0`:
   - Check-before-insert: `product_alerts WHERE site_id=$1 AND product_id IS NULL AND alert_type='category_empty' AND status='open'` — use `details->>'category_id'` if you need per-category dedup. For simplicity in Phase 1: dedup on `(site_id, NULL product_id, 'category_empty')` without per-category granularity (one open category_empty alert per site max).
   - If no open alert: insert `{ site_id, product_id: null, alert_type: 'category_empty', severity: 'critical', status: 'open', details: { category_id } }`
   - Log: `[ProductRefreshJob] site ${siteId} alert created type=category_empty`

   **Implementation note**: Supabase client doesn't support arbitrary GROUP BY queries. Use two separate queries: (1) fetch `category_products` joined with `tsa_products` via `.select('category_id, tsa_products!inner(availability)')` or equivalent, (2) compute counts in JavaScript. Alternatively use a simple approach: for each category, count available products via `.eq('site_id', siteId).eq('availability', 'available')` after joining through category_products. Keep it simple — correctness over cleverness.

4. **Site degraded check** — query total product count and limited/unavailable count for site:
   ```ts
   const { data: allProds } = await supabase
     .from('tsa_products')
     .select('availability')
     .eq('site_id', siteId);
   
   const total = allProds?.length ?? 0;
   const degraded = allProds?.filter(p => p.availability === 'limited' || p.availability === 'unavailable').length ?? 0;
   const pct = total > 0 ? degraded / total : 0;
   ```
   If `pct > 0.30`:
   - Check-before-insert: `product_alerts WHERE site_id=$1 AND product_id IS NULL AND alert_type='site_degraded' AND status='open'`
   - If no open alert: insert `{ site_id, product_id: null, alert_type: 'site_degraded', severity: 'critical', status: 'open', details: { degraded_count: degraded, total, pct: Math.round(pct * 100) } }`
   - Log: `[ProductRefreshJob] site ${siteId} alert created type=site_degraded pct=${Math.round(pct*100)}%`

5. **Phase complete log**: `[ProductRefreshJob] site ${siteId} phase=create_alerts complete`.

6. **Verify alert_type constraint**: Before finalizing, grep the code to confirm no instance of `'product_unavailable'` appears — only `'unavailable'`.

7. **Full build + typecheck**: `pnpm --filter @monster/agents build` and `pnpm --filter @monster/agents typecheck` and `cd apps/admin && npx tsc --noEmit`. Then restart monster-worker and check pm2 logs for clean boot.

## Must-Haves

- [ ] `alert_type` uses `'unavailable'` (not `'product_unavailable'`) — matches check constraint in migration 007
- [ ] `severity` field included in all inserts (`'warning'` for unavailable, `'critical'` for category_empty and site_degraded)
- [ ] Dedup check performed before every insert — no duplicate open alerts
- [ ] Category empty check re-queries DB after product updates (not computed from in-memory diff result)
- [ ] Site degraded threshold: strictly >30% (not >=30%)
- [ ] `details` JSONB included in all inserts with diagnostic context
- [ ] `product_id: null` for category_empty and site_degraded alerts
- [ ] `product_id` is the `tsa_products.id` UUID (not the ASIN string) for per-product alerts
- [ ] All log lines present: `phase=create_alerts started/complete`, `alert created`, `alert dedup skipped`
- [ ] `pnpm --filter @monster/agents build` exit 0
- [ ] `pnpm --filter @monster/agents typecheck` exit 0
- [ ] `cd apps/admin && npx tsc --noEmit` exit 0
- [ ] `pm2 restart monster-worker` → worker boots cleanly, no ERR_MODULE_NOT_FOUND

## Verification

- `pnpm --filter @monster/agents build` → exit 0
- `pnpm --filter @monster/agents typecheck` → exit 0
- `cd apps/admin && npx tsc --noEmit` → exit 0
- `pm2 restart monster-worker && sleep 5 && pm2 logs monster-worker --nostream --lines 10` → `ProductRefreshJob listening` present, no crash
- `grep -n "product_unavailable" packages/agents/src/jobs/product-refresh.ts` → no matches

## Observability Impact

- Signals added: `[ProductRefreshJob] site <id> phase=create_alerts started/complete`, `[ProductRefreshJob] site <id> alert created type=<type>`, `[ProductRefreshJob] site <id> alert dedup skipped type=<type> asin=<asin>`
- How a future agent inspects this: `SELECT * FROM product_alerts WHERE status='open' ORDER BY created_at DESC` — open alerts visible directly; `pm2 logs monster-worker` shows per-run alert creation/dedup decisions
- Failure state exposed: Supabase insert errors thrown (BullMQ marks job failed); check constraint violation on wrong alert_type surfaces as Supabase error in job failed log

## Inputs

- `packages/agents/src/jobs/product-refresh.ts` (T02) — handler with diff phase complete; `result.serpAbsentAsins` available
- `packages/db/src/types/supabase.ts` (T01) — `severity` field in product_alerts Insert type

## Expected Output

- `packages/agents/src/jobs/product-refresh.ts` — `create_alerts` phase added to handler: per-product unavailable alerts with dedup, category_empty alerts with dedup, site_degraded alert with dedup, all with correct severity and details JSONB
