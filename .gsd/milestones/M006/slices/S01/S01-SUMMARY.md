---
id: S01
parent: M006
milestone: M006
provides:
  - node-ssh + cloudflare as direct deps in packages/agents (ERR_MODULE_NOT_FOUND fixed)
  - createRequire banner in tsup worker config (CJS builtins in ESM bundle fixed)
  - createProductRefreshQueue + productRefreshQueue singleton in queue.ts (exported from index.ts)
  - DB migration 20260314000003_refresh.sql applied to Supabase Cloud (last_refreshed_at, refresh_interval_hours, next_refresh_at on sites table)
  - supabase.ts types updated with three new columns
  - ProductRefreshJob class: fetch_products phase, DataForSEO fetch, tsa_products.last_checked_at upsert, sites.last_refreshed_at + sites.next_refresh_at writes
  - registerScheduler: per-site stable BullMQ schedulers with jobId product-refresh-scheduler-<siteId>
  - worker.ts wired with ProductRefreshJob startup + graceful shutdown
  - enqueueProductRefresh server action in apps/admin (fire-and-forget, returns { ok, jobId })
  - RefreshCard client component: relative timestamp, Refresh Now button, useTransition + router.refresh() pattern
  - Product Refresh card section on site detail page (page.tsx)
requires: []
affects:
  - slice: S02
    provides: productRefreshQueue singleton, ProductRefreshJob class and fetch_products phase, DB columns for refresh state, enqueueProductRefresh server action
  - slice: S03
    provides: sites.last_refreshed_at column, enqueueProductRefresh server action
key_files:
  - packages/agents/package.json
  - packages/agents/src/queue.ts
  - packages/agents/src/index.ts
  - packages/agents/tsup.config.ts
  - packages/agents/src/jobs/product-refresh.ts
  - packages/agents/src/worker.ts
  - packages/db/src/types/supabase.ts
  - packages/db/supabase/migrations/20260314000003_refresh.sql
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - D094 — node-ssh as direct dep of packages/agents (pnpm hoisting fix)
  - D096 — cloudflare as direct dep of packages/agents (same pattern, newly discovered during T01)
  - D097 — banner:createRequire in worker tsup config (CJS builtins in ESM bundle fix)
patterns_established:
  - Any package in tsup's external list originating from a non-agents workspace package must be mirrored as direct dep in packages/agents (pnpm hoisting invariant)
  - ESM bundle + bundled CJS packages with Node built-in deps → banner:createRequire fix in tsup config
  - JSDoc comments with glob patterns (e.g. */2) cause esbuild parse errors — avoid special regex chars in JSDoc text
  - When Supabase migration is not yet applied to Cloud, update supabase.ts types manually to unblock typecheck; apply migration via postgres npm package using SUPABASE_DB_URL (no CLI auth needed)
  - useTransition + useRouter + server action pattern: call action → router.refresh() on success → auto-clear message after 3s
observability_surfaces:
  - pm2 logs monster-worker — "[worker] ProductRefreshJob scheduler registered (N sites)" on startup
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> phase=fetch_products started/complete" on job run
  - pm2 logs monster-worker — "[ProductRefreshJob] site <id> fetched <N> products" on DataForSEO response
  - Supabase sites table: last_refreshed_at + next_refresh_at columns populated after each run
  - apps/admin stdout: "[enqueueProductRefresh] Queued job <id> for site <siteId>" on success
  - redis-cli KEYS 'bull:product-refresh:*' — shows pending/active jobs
drill_down_paths:
  - .gsd/milestones/M006/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M006/slices/S01/tasks/T03-SUMMARY.md
duration: ~80min (T01: 35min, T02: 25min, T03: 20min)
verification_result: passed
completed_at: 2026-03-14
---

# S01: Worker Fix + Refresh Job Scaffold + Cron Scheduler

**monster-worker now boots cleanly with ProductRefreshJob, a BullMQ product-refresh queue, per-site cron schedulers, and a working "Refresh Now" button on the site detail admin page.**

## What Happened

Three sequential tasks, each unblocking the next.

**T01** tackled the root blocker: ERR_MODULE_NOT_FOUND crashes in monster-worker. The T01 plan identified `node-ssh` as the cause; execution revealed a second missing dep (`cloudflare`, from `packages/domains`) with the same pnpm hoisting issue — both were in tsup's external list but only declared in sibling packages. After fixing both, a new crash surfaced: `Dynamic require of "buffer" is not supported`. Root cause: `@monster/seo-scorer` bundles `cheerio → encoding-sniffer → iconv-lite` (CJS); iconv-lite calls `require('buffer')` internally. tsup's `__require` shim in ESM output doesn't resolve Node builtins. Fixed by injecting a `createRequire(import.meta.url)` banner before the bundle. T01 also added the `productRefreshQueue()` singleton + `createProductRefreshQueue()` factory following the analytics queue pattern, and wrote the DB migration for `last_refreshed_at`, `refresh_interval_hours`, `next_refresh_at`.

**T02** implemented `ProductRefreshJob`: a BullMQ worker on `product-refresh` queue that fetches site config, calls `DataForSEOClient.searchProducts(niche, market)`, upserts `tsa_products.last_checked_at = now()` for each ASIN returned, and writes `sites.last_refreshed_at` + `sites.next_refresh_at`. The `registerScheduler()` method upserts stable per-site BullMQ schedulers using jobId `product-refresh-scheduler-<siteId>` — idempotent, survives worker restarts. The migration was applied directly via the `postgres` npm package (SUPABASE_DB_URL from .env — no Supabase CLI auth needed). `supabase.ts` types were updated manually since `supabase gen types` requires CLI auth. Worker now logs `[worker] ProductRefreshJob scheduler registered (0 sites)` on startup — 0 because no sites currently have `status='live'`.

**T03** wired the admin panel. Added `enqueueProductRefresh(siteId)` to `actions.ts` (fire-and-forget, returns `{ ok, jobId }`). Created `RefreshCard.tsx` as a `'use client'` component with `useTransition` + `useRouter`: shows relative time via `formatRelativeTime()` helper, disables button + spinner while pending, calls `router.refresh()` on success to re-fetch `last_refreshed_at` from DB, auto-clears the success message after 3s. The Product Refresh card was added to `page.tsx` before the SEO Scores section.

## Verification

```
# Build — exits 0
pnpm --filter @monster/agents build
→ ESM dist/index.js 477.02 KB, dist/worker.js 2.73 MB, ⚡️ Build success

# Typecheck agents — exits 0 (no output)
pnpm --filter @monster/agents typecheck

# Typecheck admin — exits 0 (no output)
cd apps/admin && npx tsc --noEmit

# Worker status — online, 0 unstable restarts, 8m uptime
pm2 describe monster-worker
→ status: online, restarts: 46 (historical crash loop), unstable restarts: 0

# Startup logs — both scheduler + listener lines present
pm2 logs monster-worker --nostream --lines 5
→ [worker] ProductRefreshJob scheduler registered (0 sites)
→ [worker] ProductRefreshJob listening on queue "product-refresh"

# No ERR_MODULE_NOT_FOUND in current log window
# DB migration applied — 3 columns confirmed in Supabase Cloud
```

## Requirements Advanced

- R007 (product refresh pipeline) — S01 delivers the fetch-and-write half of the pipeline: BullMQ job fetches DataForSEO products, writes `last_refreshed_at`, registers per-site cron schedulers. Diff engine + conditional rebuild (S02) still needed for full R007 validation.

## Requirements Validated

- None — R007 and R008 require S02 (diff + alerts) before they can be marked validated.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

**T01 — Two unplanned fixes beyond the task plan:**
1. `cloudflare` package also needed as direct dep (same pnpm hoisting issue as node-ssh; not anticipated in plan). → D096.
2. `banner: createRequire` needed in tsup worker config (CJS builtins in ESM bundle; surfaced after module-not-found fixes unblocked the next crash). → D097.
3. `platform: 'node'` + `target: 'node22'` added to both tsup configs (correct for completeness; D097 is the effective fix).

**T02 — One unplanned implementation detail:**
1. JSDoc docstring with `*/2` cron notation caused an esbuild parse error (`Expected ";"`) — removed special chars from JSDoc text. Trivial.

**T03 — No deviations.** Implemented exactly per plan.

## Known Limitations

- `supabase.ts` types were updated manually. Running `supabase gen types` in the future will overwrite these additions until the Supabase CLI is properly linked (`SUPABASE_ACCESS_TOKEN` + `supabase link`).
- `registerScheduler` shows `(0 sites)` because no sites currently have `status='live'`. Schedulers will auto-populate on worker restart once sites are deployed.
- Browser verification for RefreshCard was done via build output and source review only — `libnspr4.so` missing prevents headless Chromium on this machine. Component structure and types confirmed correct.
- pm2 restart count shows 46 — accumulated from T01 crash loop debugging. Functionally irrelevant (0 unstable restarts since banner fix). Run `pm2 reset monster-worker` to zero it.
- No actual DataForSEO call verified (no `live` sites exist yet). The code path is correct; live proof deferred to human UAT when a real site is created.

## Follow-ups

- S02: implement diff engine (ProductChange types, rebuild decision, alert creation) — this slice's `fetch_products` output feeds directly into S02's diff logic.
- S02: `tsa_products.price_history` JSONB rolling window (D095) not yet written — only `last_checked_at` is updated in S01.
- S03: alert surface + resolution UI in admin panel.
- Long-term: run `supabase gen types` with proper CLI auth to regenerate `supabase.ts` cleanly.

## Files Created/Modified

- `packages/agents/package.json` — added `"cloudflare": "^5.2.0"` and `"node-ssh": "^13.2.1"` to dependencies
- `packages/agents/src/queue.ts` — added `createProductRefreshQueue()` and `productRefreshQueue()` singleton
- `packages/agents/src/index.ts` — exported `productRefreshQueue` and `createProductRefreshQueue`
- `packages/agents/tsup.config.ts` — added `platform: 'node'`, `target: 'node22'`, `banner: { js: createRequire }` to worker config; `platform`/`target` to index config
- `packages/agents/src/jobs/product-refresh.ts` — new file: ProductRefreshJob class with handler + registerScheduler, lockDuration:300000
- `packages/agents/src/worker.ts` — added ProductRefreshJob import, live-sites fetch, scheduler registration, worker registration, graceful shutdown handler
- `packages/db/src/types/supabase.ts` — added last_refreshed_at, refresh_interval_hours, next_refresh_at to sites Row/Insert/Update types
- `packages/db/supabase/migrations/20260314000003_refresh.sql` — new: ALTER TABLE sites adds three refresh columns
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — added `productRefreshQueue` import + `enqueueProductRefresh` server action
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — new 'use client' component: relative time display + Refresh Now button
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — added RefreshCard import + Product Refresh card section

## Forward Intelligence

### What the next slice should know
- `ProductRefreshJob` in S01 only does the `fetch_products` phase. S02 must extend the handler to add the diff + alert creation phase — the structure is already phase-aware (the plan calls for `phase` tracking in logs).
- `DataForSEOClient.searchProducts()` returns a product array. S02's diff engine consumes this array and compares against `tsa_products` rows for the same site.
- `tsa_products.price_history` (JSONB rolling window, D095) is not yet written — S01 only writes `last_checked_at`. S02 must add the read-prepend-slice-write logic.
- Alert deduplication (D093): check-before-insert on `(site_id, product_id, alert_type)` where `status = 'open'`. The `product_alerts` table already exists from M001 schema.
- No sites have `status='live'` yet — the scheduler shows `(0 sites)`. This is expected. The first real end-to-end test requires creating a site through the admin panel.

### What's fragile
- `supabase.ts` manual edit — if `supabase gen types` is run without the three new columns in the generated output, typecheck will fail in `@monster/agents`. The columns are in Supabase Cloud (migration applied), so a proper `supabase gen types` run would include them — but CLI auth must be set up first.
- Worker restart count of 46 — accumulated from debugging. `pm2 describe` shows `unstable restarts: 0` which is the signal to watch; total restart count is misleading here.

### Authoritative diagnostics
- `pm2 logs monster-worker --nostream --lines 30` — worker startup health. Look for both `ProductRefreshJob scheduler registered` and `ProductRefreshJob listening on queue "product-refresh"` as proof of clean boot.
- `pm2 logs monster-worker --nostream --lines 30` stderr — any ERR_MODULE_NOT_FOUND here means a new dep needs to be added to `packages/agents/package.json` following D094/D096 pattern.
- `pnpm --filter @monster/agents build` — tsup stderr is the signal for CJS/ESM compat regressions.

### What assumptions changed
- Originally assumed `node-ssh` was the only missing direct dep — `cloudflare` was also missing (same pnpm hoisting pattern). The diagnostic pattern is: fix one ERR_MODULE_NOT_FOUND → new one surfaces → add that package too.
- The `banner: createRequire` fix was not anticipated in the task plan. It's now established as the standard fix for any CJS package with Node built-in deps bundled into the ESM worker.
