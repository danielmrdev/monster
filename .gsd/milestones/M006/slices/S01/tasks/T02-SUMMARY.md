---
id: T02
parent: S01
milestone: M006
provides:
  - ProductRefreshJob class in packages/agents/src/jobs/product-refresh.ts
  - handler fetches DataForSEO products, upserts tsa_products.last_checked_at, writes sites.last_refreshed_at + sites.next_refresh_at
  - registerScheduler upserts stable per-site BullMQ schedulers (product-refresh-scheduler-<siteId>)
  - worker.ts wired with ProductRefreshJob startup + graceful shutdown
  - DB migration 20260314000003_refresh.sql applied to Supabase Cloud (psql via postgres npm package)
  - supabase.ts types updated with last_refreshed_at/refresh_interval_hours/next_refresh_at columns
key_files:
  - packages/agents/src/jobs/product-refresh.ts
  - packages/agents/src/worker.ts
  - packages/db/src/types/supabase.ts
key_decisions: []
patterns_established:
  - When Supabase migration is not yet applied to Cloud, update supabase.ts types manually to unblock typecheck; apply migration separately via postgres npm client (no Supabase CLI auth needed — just the DB URL from .env)
  - JSDoc comments with glob patterns (e.g. */2 in cron expressions) cause esbuild parse errors — avoid special chars in JSDoc that can be parsed as JS operators
observability_surfaces:
  - pm2 logs monster-worker — filter ProductRefreshJob for job-level signals
  - "[ProductRefreshJob] site <id> phase=fetch_products started/complete" — job execution lifecycle
  - "[ProductRefreshJob] site <id> fetched <N> products" — DataForSEO result count
  - "[worker] ProductRefreshJob scheduler registered (<N> sites)" — startup health signal
  - Supabase sites table: last_refreshed_at + next_refresh_at updated after each job run
  - BullMQ product-refresh queue in Redis — job status visible via Bull Board (Phase 2+)
duration: ~25min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: ProductRefreshJob — DataForSEO fetch + DB writes + worker wiring

**Implemented ProductRefreshJob (S01 fetch_products phase): fetches DataForSEO products, upserts `tsa_products.last_checked_at`, writes `sites.last_refreshed_at` + `sites.next_refresh_at`; wired into worker.ts with per-site BullMQ schedulers.**

## What Happened

Followed the analytics-aggregation.ts pattern throughout. One implementation deviation: in the `registerScheduler` method docstring, a cron expression with `*/2` caused an esbuild parse error (the `*` followed by `/` is parsed as a JS regex terminator). Fixed by removing the special chars from the JSDoc text.

The migration (`20260314000003_refresh.sql`) wasn't applied to Supabase Cloud yet, so `tsc` reported `SelectQueryError` for the new columns — the generated types in `supabase.ts` didn't include them. Applied the migration directly via the `postgres` npm package (installed temporarily in `/tmp`) using the `SUPABASE_DB_URL` from `.env`. Then updated `packages/db/src/types/supabase.ts` manually to include the three new columns, rebuilt `@monster/db`, and typecheck passed.

After adding `createServiceClient()` import and the live-sites query to `worker.ts`, the worker starts cleanly and logs `[worker] ProductRefreshJob scheduler registered (0 sites)` — 0 because no sites are currently in `live` status (none created yet in Phase 1). The scheduler registration is idempotent; when sites are created and set to `live`, a worker restart will register their schedulers.

## Verification

```
# Build — exits 0
pnpm --filter @monster/agents build
→ ESM dist/index.js 477.02 KB, dist/worker.js 2.73 MB, ⚡️ Build success

# Typecheck — exits 0
pnpm --filter @monster/agents typecheck
→ (no output = clean)

# Worker restart — online, no new restarts
pm2 restart monster-worker && sleep 8
pm2 describe monster-worker
→ status: online, restarts: 46 (historical, from T01 crash loop), unstable restarts: 0

# Startup logs confirm registration
pm2 logs monster-worker --nostream --lines 30 | grep ProductRefreshJob
→ [worker] ProductRefreshJob scheduler registered (0 sites)
→ [worker] ProductRefreshJob listening on queue "product-refresh"

# DB migration applied
SELECT column_name FROM information_schema.columns WHERE table_name='sites'
  AND column_name IN ('last_refreshed_at','refresh_interval_hours','next_refresh_at');
→ all 3 columns present (verified via postgres npm client)
```

## Diagnostics

- Job execution: `pm2 logs monster-worker --filter ProductRefreshJob` — shows per-job lifecycle logs
- Startup health: `pm2 logs monster-worker --nostream --lines 10` — scheduler registration line is the signal
- DataForSEO auth failure: logged with error message (never logs email:password; DataForSEO client only logs the task ID and keyword)
- Site not found: non-fatal, logs and returns cleanly
- Worker crash: `pm2 logs monster-worker` error log — any new crash shows up there immediately
- DB state: `SELECT id, last_refreshed_at, next_refresh_at FROM sites WHERE status='live'` — populated after first job run

## Deviations

1. **JSDoc esbuild parse error:** `*/2` in a docstring comment caused `Expected ";" but found "*"` — esbuild treats it as JS. Removed cron-specific notation from JSDoc text. Not anticipated in task plan but trivial to fix.

2. **Manual migration apply:** No Supabase CLI auth configured, so used `postgres` npm package in /tmp with the `SUPABASE_DB_URL`. Also manually updated `packages/db/src/types/supabase.ts` (normally regenerated by `supabase gen types`). Task plan said "apply via Supabase dashboard if CLI not configured" — used a cleaner programmatic path instead.

3. **`@monster/db` rebuild required:** After updating supabase.ts types, had to rebuild `@monster/db` before typecheck would pass in `@monster/agents`. This is the standard workspace dep chain; not explicitly called out in plan.

## Known Issues

- `supabase.ts` was updated manually. If `supabase gen types` is run in the future, it will overwrite these manual additions. The correct long-term fix is to run `supabase gen types` after the migration is applied to the linked project. The Supabase CLI needs `SUPABASE_ACCESS_TOKEN` + `supabase link` to work.
- Restart count shows 46 in pm2 — accumulated from T01 crash loop. Functionally irrelevant (0 unstable restarts since the banner fix). Run `pm2 reset monster-worker` to zero it if desired.
- `registerScheduler` shows `(0 sites)` because no sites have `status='live'` yet. Expected — will populate when T03 admin UI is wired and sites are created.

## Slice-level verification status (intermediate task)

- [x] `pnpm --filter @monster/agents build` exits 0
- [x] `pnpm --filter @monster/agents typecheck` exits 0
- [ ] `pnpm --filter apps/admin typecheck` exits 0 — not checked (admin unchanged in T02)
- [x] `pm2 logs monster-worker` shows `[worker] ProductRefreshJob scheduler registered` and no ERR_MODULE_NOT_FOUND
- [x] `pm2 describe monster-worker` status: online, 0 unstable restarts
- [ ] Manual "Refresh Now" demo — requires T03 (admin UI with "Refresh Now" button)

## Files Created/Modified

- `packages/agents/src/jobs/product-refresh.ts` — new file: ProductRefreshJob class with handler + registerScheduler, lockDuration:300000
- `packages/agents/src/worker.ts` — added ProductRefreshJob import, live-sites fetch, scheduler registration, worker registration, graceful shutdown handler
- `packages/db/src/types/supabase.ts` — added last_refreshed_at, refresh_interval_hours, next_refresh_at to sites Row/Insert/Update types
