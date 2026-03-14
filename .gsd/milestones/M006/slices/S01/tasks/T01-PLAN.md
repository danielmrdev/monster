---
estimated_steps: 5
estimated_files: 4
---

# T01: node-ssh fix + DB migration + queue infrastructure

**Slice:** S01 — Worker Fix + Refresh Job Scaffold + Cron Scheduler
**Milestone:** M006

## Description

The `monster-worker` process currently crashes with ERR_MODULE_NOT_FOUND for `node-ssh` because the package is only declared in `packages/deployment`, not in `packages/agents`. pnpm does not hoist it to the root `node_modules/`. This task fixes that and lays the queue infrastructure that T02 needs.

Three things:
1. Add `node-ssh` as a direct dep of `packages/agents` (D094 — runtime resolution fix, not a bundling change — tsup external list already covers it).
2. Write the DB migration adding `last_refreshed_at`, `refresh_interval_hours`, `next_refresh_at` to `sites`.
3. Add `createProductRefreshQueue()` + `productRefreshQueue()` singleton to `queue.ts`, export from `index.ts`.

## Steps

1. Add `"node-ssh": "^13.2.1"` to `dependencies` in `packages/agents/package.json`. Run `pnpm install` from monorepo root to update lockfile.

2. Add `createProductRefreshQueue()` and `productRefreshQueue()` singleton to `packages/agents/src/queue.ts` — follow the `createAnalyticsAggregationQueue` / `analyticsAggregationQueue` pattern exactly.

3. Export `productRefreshQueue` and `createProductRefreshQueue` from `packages/agents/src/index.ts`.

4. Write migration `packages/db/supabase/migrations/20260314000003_refresh.sql`:
   ```sql
   ALTER TABLE sites
     ADD COLUMN IF NOT EXISTS last_refreshed_at    timestamptz,
     ADD COLUMN IF NOT EXISTS refresh_interval_hours int4 NOT NULL DEFAULT 48,
     ADD COLUMN IF NOT EXISTS next_refresh_at       timestamptz;
   ```
   No RLS needed — `sites` RLS is already enabled; column additions inherit it.

5. Build `packages/agents` and verify worker starts cleanly.

## Must-Haves

- [ ] `"node-ssh": "^13.2.1"` present in `packages/agents/package.json` dependencies
- [ ] `pnpm install` succeeds and lockfile updated
- [ ] `createProductRefreshQueue()` and `productRefreshQueue()` in `queue.ts`
- [ ] Both exported from `index.ts`
- [ ] Migration file exists with correct ALTER TABLE statements
- [ ] `pnpm --filter @monster/agents build` exits 0
- [ ] `pm2 restart monster-worker && pm2 describe monster-worker` shows `online`, 0 restarts, no ERR_MODULE_NOT_FOUND in error log

## Verification

- `pnpm --filter @monster/agents build` — exits 0
- `pm2 restart monster-worker` then `pm2 logs monster-worker --nostream --lines 20` — should show existing scheduler registration logs and NO `ERR_MODULE_NOT_FOUND`
- `pm2 describe monster-worker` — status `online`

## Observability Impact

- Failure state exposed: If node-ssh still missing after this task, pm2 error log will show ERR_MODULE_NOT_FOUND — clear diagnostic. Build failure would appear in tsup output.

## Inputs

- D094 — rationale for why `node-ssh` must be a direct dep of `packages/agents`
- `packages/agents/src/queue.ts` — existing patterns to follow (`analyticsAggregationQueue`)
- `packages/agents/src/index.ts` — existing export list to extend
- `packages/db/supabase/migrations/20260313000001_core.sql` — `sites` table definition to verify column names don't conflict

## Expected Output

- `packages/agents/package.json` — `node-ssh` in dependencies
- `packages/agents/src/queue.ts` — `createProductRefreshQueue` + `productRefreshQueue` added
- `packages/agents/src/index.ts` — both exported
- `packages/db/supabase/migrations/20260314000003_refresh.sql` — new migration file
- `monster-worker` pm2 process: online, 0 restarts, no module resolution errors
