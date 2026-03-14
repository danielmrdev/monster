---
id: M006
provides:
  - monster-worker starts cleanly (ERR_MODULE_NOT_FOUND fixed via direct deps in packages/agents; createRequire banner for CJS builtins in ESM bundle)
  - ProductRefreshJob with fetch_products + diff_products + create_alerts phases
  - productRefreshQueue singleton + createProductRefreshQueue factory + per-site cron schedulers (stable jobId pattern)
  - DB migrations — sites.last_refreshed_at/refresh_interval_hours/next_refresh_at, product_alerts.severity, tsa_products.source_image_url
  - diffProducts() pure function — price/availability/image rebuild-triggering; rating deferred; SERP-absent → serpAbsentAsins
  - Price history JSONB rolling window (max 30 entries, read-prepend-slice-write on each refresh)
  - Conditional GenerateSiteJob enqueue when shouldRebuild && site.status='live'
  - Alert deduplication — check-before-insert on (site_id, product_id, alert_type) WHERE status='open'
  - Three alert types — unavailable (severity=warning), category_empty (severity=critical), site_degraded >30% (severity=critical)
  - enqueueProductRefresh server action (fire-and-forget, returns { ok, jobId })
  - RefreshCard client component — relative timestamp, Refresh Now button, useTransition + router.refresh()
  - Global /alerts page — open alerts with sites+tsa_products join, per-row acknowledge/resolve actions
  - acknowledgeAlert / resolveAlert server actions — { ok, error? } return, revalidatePath on /alerts + /dashboard
  - AlertList client component — per-row useTransition isolation (AlertRowActions sub-component)
  - SiteAlerts per-site component in site detail — reuses same server actions
  - Alerts nav entry in nav-sidebar.tsx
  - Dashboard Open Alerts KPI card — amber border+text when count > 0
  - 10 unit tests for diff engine — all passing
key_decisions:
  - D092 — SERP-absence = 'limited' availability, not 'unavailable' — avoids false-positive alert flood
  - D093 — Alert dedup: check-before-insert on (site_id, product_id, alert_type) WHERE status='open'
  - D094 — node-ssh as direct dep of packages/agents (pnpm hoisting fix)
  - D095 — Price history: JSONB rolling window read-prepend-slice(30)-write on every refresh
  - D096 — cloudflare npm package as direct dep of packages/agents (same pnpm hoisting pattern)
  - D097 — banner:createRequire in worker tsup config (CJS builtins in ESM bundle fix)
  - D098 — @monster/db must be rebuilt after manual supabase.ts edits (dist/index.d.ts drives downstream typecheck)
patterns_established:
  - Any package in tsup's external list originating from a non-agents workspace package must be mirrored as direct dep in packages/agents (pnpm hoisting invariant)
  - ESM bundle + bundled CJS packages with Node built-in deps → banner:createRequire fix in tsup config
  - JSDoc comments with glob patterns (e.g. */2) cause esbuild parse errors — avoid special regex chars in JSDoc text
  - check-before-insert dedup: .select('id').eq(...).eq('status','open').limit(1).maybeSingle() — if data non-null, skip; else insert
  - Per-row action isolation via extracted sub-component owning its own useTransition state
  - Amber border+text on KPI card as visual severity signal when count > 0
  - PostgREST join syntax for multi-table queries: select('*, sites(name), tsa_products(asin, title)')
  - 'use server' actions return { ok: boolean; error?: string } — never throw to the client
observability_surfaces:
  - pm2 logs monster-worker — "[worker] ProductRefreshJob scheduler registered (N sites)" on startup
  - pm2 logs monster-worker — "[worker] ProductRefreshJob listening on queue 'product-refresh'" on startup
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> phase=fetch_products/diff_products/create_alerts started/complete"
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> changes=N rebuild=bool serpAbsent=N" — diff result summary
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> rebuild enqueued reason=<type>" or "rebuild skipped — site status=<status>"
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> alert created type=unavailable asin=<asin>" — per-product alert inserted
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> alert dedup skipped type=unavailable asin=<asin>"
  - Supabase sites table — last_refreshed_at + next_refresh_at populated after each run
  - Supabase product_alerts — SELECT alert_type, severity, status, COUNT(*) FROM product_alerts GROUP BY 1,2,3
  - redis-cli KEYS 'bull:product-refresh:*' — shows pending/active jobs
  - acknowledgeAlert/resolveAlert return { ok: false, error } on DB failure; client logs console.error
requirement_outcomes:
  - id: R007
    from_status: active
    to_status: active
    proof: M006/S01+S02 deliver the full fetch+diff+rebuild pipeline. ProductRefreshJob fetches DataForSEO products, writes last_refreshed_at, diffs against DB, enqueues GenerateSiteJob when shouldRebuild && site.status='live'. Per-site cron schedulers registered on worker startup. Admin panel shows refresh timestamp with Refresh Now button. All builds and typechecks exit 0. End-to-end runtime proof (live DataForSEO → real DB diff → actual GenerateSiteJob enqueue) deferred to human UAT — no live sites exist yet. Status remains active until live runtime proof is confirmed.
  - id: R008
    from_status: active
    to_status: active
    proof: M006/S02+S03 deliver alert creation (three types, severity levels, check-before-insert dedup) and full admin surface (global /alerts page, per-site SiteAlerts, acknowledge/resolve actions, dashboard amber KPI card). All builds and typechecks exit 0. Alert dedup live runtime proof (two consecutive refresh cycles producing exactly one open alert) deferred to human UAT — no live sites exist yet. Status remains active until live dedup proof is confirmed.
duration: ~3h (S01: ~80min, S02: ~65min, S03: ~40min)
verification_result: passed
completed_at: 2026-03-14
---

# M006: Product Refresh Pipeline

**Autonomous maintenance loop delivered: monster-worker now boots cleanly, ProductRefreshJob fetches DataForSEO products on a per-site cron schedule, diffs against DB, triggers conditional rebuilds and creates deduplicated alerts — all visible and actionable through the admin panel.**

## What Happened

Three slices built in strict dependency order, each unblocking the next.

**S01** tackled the root blocker first: ERR_MODULE_NOT_FOUND crashes preventing monster-worker from starting at all (accumulated since M005). The worker crash loop traced to `node-ssh` (from `packages/deployment`) not being resolvable from the worker's module resolution chain — pnpm only hoists packages declared in a package's own dependency graph, not siblings'. Fixing `node-ssh` revealed a second crash from `cloudflare` (same pnpm hoisting pattern, from `packages/domains`), then a third: `Dynamic require of "buffer" is not supported` caused by `iconv-lite` (a CJS package transitively pulled through `@monster/seo-scorer → cheerio → encoding-sniffer`) calling `require('buffer')` in ESM context. The fix: a `createRequire(import.meta.url)` banner injected into the worker tsup config — now D097 and the standard pattern for any future CJS dep with Node built-in deps. With the worker healthy, S01 added the `ProductRefreshJob` scaffold (fetch_products phase only: DataForSEO fetch → `tsa_products.last_checked_at` upsert → `sites.last_refreshed_at` / `next_refresh_at` write), per-site BullMQ cron schedulers with stable jobIds, a DB migration for three new `sites` columns, and the admin panel `RefreshCard` with a working "Refresh Now" button.

**S02** built the diff engine and wired it into the live job. `diffProducts()` is a zero-dependency pure function: price changes beyond epsilon (0.01), availability transitions, and image URL changes are rebuild-triggering; rating changes are deferred; SERP-absent products go into `serpAbsentAsins` (treated as `'limited'` availability per D092, not hard unavailable). Two more DB migrations were applied (severity column on `product_alerts`, `source_image_url` on `tsa_products`). The job handler gained two new phases: `diff_products` (DB product fetch, diff call, upsert with price_history rolling window, conditional `GenerateSiteJob` enqueue) and `create_alerts` (per-product unavailable alerts, category_empty alerts, site_degraded alerts — all with check-before-insert dedup per D093). A key process finding: manually editing `supabase.ts` requires an explicit `pnpm --filter @monster/db build` to propagate types downstream (now D098). The 10 unit tests covering all diff categorization rules pass clean.

**S03** surfaced everything into the admin panel. The global `/alerts` page is a server component querying open `product_alerts` with a PostgREST join across `sites` and `tsa_products`. `AlertList` renders a shadcn Table with per-row action isolation — `AlertRowActions` is extracted as a sub-component so each row owns its own `useTransition` state, preventing the entire list from disabling on a single action. `acknowledgeAlert` and `resolveAlert` are `'use server'` functions returning `{ ok, error? }` with `revalidatePath` on both `/alerts` and `/dashboard`. The per-site `SiteAlerts` component follows the identical pattern and reuses the same server actions. The Alerts nav entry was added between Finances and Settings. The dashboard Open Alerts KPI card gains amber styling when `alertCount > 0` — a clear visual severity signal without a separate "critical" UI layer.

## Cross-Slice Verification

All success criteria verified at slice completion; confirmed again at milestone close:

**monster-worker starts cleanly (no ERR_MODULE_NOT_FOUND, both schedulers registered):**
```
pm2 logs monster-worker --nostream --lines 20
→ [worker] ProductRefreshJob scheduler registered (0 sites)   ✓
→ [worker] ProductRefreshJob listening on queue "product-refresh"  ✓
→ [AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)  ✓
→ No ERR_MODULE_NOT_FOUND in stderr  ✓
pm2 describe monster-worker → status: online, unstable restarts: 0  ✓
```

**Diff engine correctly categorizes changes (unit tested):**
```
pnpm --filter @monster/agents test
→ 10/10 passed (price epsilon, null price, rating non-trigger, image null-guard, SERP-absent,
  compound scenarios) ✓
```

**ProductRefreshJob runs end-to-end (code path correct; live DataForSEO call deferred):**
- fetch_products phase: DataForSEO fetch → last_checked_at upsert → last_refreshed_at write (code verified, DB columns confirmed in Supabase Cloud)
- diff_products phase: DB fetch → diffProducts() call → tsa_products upsert with price_history rolling window → conditional GenerateSiteJob enqueue (code verified, shouldRebuild && site.status='live' guard present)
- create_alerts phase: per-product unavailable, category_empty, site_degraded alerts with check-before-insert dedup (code verified, all three types implemented)

**Alert deduplication confirmed (code-level; live runtime proof deferred):**
- check-before-insert: `.select('id').eq(...).eq('status','open').limit(1).maybeSingle()` — if `data` non-null, skip; else insert. Pattern applied to all three alert types.
- Two-consecutive-refresh dedup proof requires a live site — deferred to human UAT.

**Admin panel surfaces all required elements:**
- Site detail "Product Refresh" card: relative timestamp + "Refresh Now" button → `RefreshCard.tsx` ✓
- Site detail "Product Alerts" card: `SiteAlerts.tsx` with per-row acknowledge/resolve ✓
- Global `/alerts` page: `AlertList.tsx` with Type/Severity/Site/Product columns + row actions ✓
- Dashboard Open Alerts KPI: amber border+text when `alertCount > 0` ✓
- Alerts nav entry (between Finances and Settings) ✓

**All builds and typechecks exit 0:**
```
pnpm --filter @monster/agents build   → ESM ⚡️ Build success (dist/worker.js 2.73 MB)  ✓
pnpm --filter @monster/agents typecheck → exit 0  ✓
pnpm --filter @monster/admin build    → exit 0 (/alerts route present)  ✓
cd apps/admin && npx tsc --noEmit     → exit 0  ✓
```

**Requirement validation status (R007, R008):**
Both R007 and R008 remain `active` — code is complete and verified, but end-to-end live proof (real DataForSEO call → actual DB diff → actual GenerateSiteJob enqueue, and two consecutive refreshes confirming the dedup invariant) requires a live site in `status='live'` with real DataForSEO credentials in Settings. No such site exists yet. This is documented as the primary human UAT gate for both requirements.

## Requirement Changes

- R007: active → active — Code-complete (pipeline implemented, builds pass, scheduler registers), but end-to-end runtime proof with live DataForSEO data deferred to human UAT. No status elevation.
- R008: active → active — Code-complete (alert creation + admin surface implemented, builds pass), but live dedup proof deferred to human UAT. No status elevation.

## Forward Intelligence

### What the next milestone should know
- The product refresh pipeline is complete and correct but has never run against a live site — the first real end-to-end proof will be human UAT. The critical path is: create a site → generate → deploy → enter DataForSEO credentials → trigger refresh from admin panel → watch pm2 logs for `phase=fetch_products` → confirm `last_refreshed_at` updated in Supabase → simulate price change in DB → trigger again → confirm `GenerateSiteJob` appears in BullMQ generate queue.
- Alert dedup live proof: run two consecutive refreshes against a persistently unavailable product → confirm `SELECT COUNT(*) FROM product_alerts WHERE status='open'` returns 1, not 2.
- `product_alerts` rows now have `severity` (warning/critical), `alert_type` (unavailable/category_empty/site_degraded), `status` (open → acknowledged → resolved), and `details` JSONB. The full lifecycle is implemented; the `/alerts` page only shows `status='open'` — no filter UI for historical alerts yet.
- `source_image_url` is the baseline for future image diffs. `GenerateSiteJob` now writes it on product upsert; `ProductRefreshJob` diffs against it on each refresh cycle.
- `monster-worker` restart count is 47 — accumulated from M006/S01 crash-loop debugging. `unstable restarts: 0` is the signal to watch; total count is misleading. Run `pm2 reset monster-worker` to zero it before production monitoring starts.
- The worker shows `ProductRefreshJob scheduler registered (0 sites)` because no sites currently have `status='live'`. This is expected. Schedulers populate automatically on worker restart once sites are live.

### What's fragile
- `supabase.ts` manual edits (D098) — running `supabase gen types` without proper CLI auth (`SUPABASE_ACCESS_TOKEN` + `supabase link`) will overwrite the three M006 columns (severity, source_image_url, last_refreshed_at, etc.). The columns are in Supabase Cloud (migrations applied), so a proper `supabase gen types` run would include them. But until CLI auth is set up, the manual edits must be preserved.
- `@monster/db` rebuild requirement — if any agent edits `supabase.ts` without running `pnpm --filter @monster/db build`, downstream typechecks fail with cryptic `SelectQueryError` messages. The rebuild is a manual step because it bypasses the normal migration→generate→build flow.
- SERP-absent product detection (D092) depends on DataForSEO returning at least one non-empty keyword result. If a site has no stored keywords or DataForSEO returns an empty result, all products become `serpAbsentAsins` and could trigger category_empty/site_degraded alerts. The guard: ensure at least one non-empty keyword search result before treating absence as meaningful.
- Alert dedup (D093) is check-before-insert — not race-safe under concurrent refresh jobs for the same site. The partial unique index `WHERE status='open'` described in D093 would be the production fix if concurrent refreshes are ever enabled.
- `/alerts` page filter: only `status='open'` is shown. Operators must query DB directly to inspect resolved/acknowledged historical alerts. No filter UI exists.

### Authoritative diagnostics
- Worker health: `pm2 logs monster-worker --nostream --lines 30` — look for both scheduler registration lines and no ERR_MODULE_NOT_FOUND in stderr
- New dep crash loop: `pm2 logs monster-worker --nostream --lines 30 2>&1 | grep "MODULE_NOT_FOUND"` — if non-empty, add that package as direct dep in `packages/agents/package.json` (D094/D096 pattern)
- Refresh phase execution: `pm2 logs monster-worker --nostream --lines 100 | grep "ProductRefreshJob"` — covers fetch/diff/alert phases
- Open alerts state: `SELECT alert_type, severity, status, COUNT(*) FROM product_alerts GROUP BY 1,2,3`
- Dedup invariant: `SELECT site_id, product_id, alert_type, COUNT(*) FROM product_alerts WHERE status='open' GROUP BY 1,2,3 HAVING COUNT(*) > 1` — should return zero rows
- Price history: `SELECT asin, jsonb_array_length(price_history::jsonb) FROM tsa_products WHERE site_id='<id>'`

### What assumptions changed
- Originally assumed `node-ssh` was the only ERR_MODULE_NOT_FOUND — `cloudflare` was also missing (same hoisting issue). The diagnostic pattern: fix one → new one surfaces → add that package too. Any new `packages/*` that declares its own deps and gets imported by `packages/agents` may trigger this again.
- Originally assumed `DbProduct` map could hold `price_history` for the rolling window — `DbProduct` only holds diff-relevant fields, so a separate raw row map was needed. This is the correct separation: diff engine stays pure, job handler manages DB-specific fields.
- S01 plan assumed JSDoc could safely use `*/2` cron notation — esbuild parse error proved otherwise. Special regex chars in JSDoc text are unsafe.

## Files Created/Modified

### S01 — Worker Fix + Refresh Job Scaffold + Cron Scheduler
- `packages/agents/package.json` — added `node-ssh` + `cloudflare` as direct deps
- `packages/agents/tsup.config.ts` — `platform: 'node'`, `target: 'node22'`, `banner: createRequire` for worker config
- `packages/agents/src/queue.ts` — `createProductRefreshQueue()` + `productRefreshQueue()` singleton
- `packages/agents/src/index.ts` — exported `productRefreshQueue` + `createProductRefreshQueue`
- `packages/agents/src/jobs/product-refresh.ts` — new: ProductRefreshJob class (fetch_products phase + registerScheduler)
- `packages/agents/src/worker.ts` — ProductRefreshJob import, live-sites fetch, scheduler registration, graceful shutdown
- `packages/db/src/types/supabase.ts` — added last_refreshed_at, refresh_interval_hours, next_refresh_at to sites Row/Insert/Update
- `packages/db/supabase/migrations/20260314000003_refresh.sql` — new: ALTER TABLE sites adds three refresh columns
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — added `enqueueProductRefresh` server action
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — new: relative time + Refresh Now button
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Product Refresh card section added

### S02 — Diff Engine + Conditional Rebuild + Alert Creation
- `packages/db/supabase/migrations/20260314000004_alerts_severity.sql` — new: severity column on product_alerts
- `packages/db/supabase/migrations/20260314000005_product_source_image.sql` — new: source_image_url on tsa_products
- `packages/db/src/types/supabase.ts` — severity added to product_alerts; source_image_url added to tsa_products
- `packages/db/dist/index.d.ts` — rebuilt after supabase.ts edits
- `packages/agents/package.json` — vitest devDep + test script added
- `packages/agents/src/diff-engine.ts` — new: pure diffProducts() with ProductChange + DiffResult types
- `packages/agents/src/diff-engine.test.ts` — new: 10 unit tests, all passing
- `packages/agents/src/jobs/product-refresh.ts` — diff_products phase + create_alerts phase added
- `packages/agents/src/jobs/generate-site.ts` — source_image_url added to product upsert

### S03 — Dashboard Alert Surface + Alert Resolution UI
- `apps/admin/src/app/(dashboard)/alerts/actions.ts` — new: acknowledgeAlert + resolveAlert server actions
- `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` — new: per-row action client component
- `apps/admin/src/app/(dashboard)/alerts/page.tsx` — new: async server component querying open alerts
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx` — new: per-site scoped alert client component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — parallel alert query + SiteAlerts card added
- `apps/admin/src/components/nav-sidebar.tsx` — Alerts nav entry added
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — Open Alerts KPI card with amber styling
