---
estimated_steps: 7
estimated_files: 5
---

# T01: Implement AnalyticsAggregationJob + queue + worker wiring + pm2 entry

**Slice:** S03 — Daily Aggregation Cron
**Milestone:** M005

## Description

Create the `AnalyticsAggregationJob` class with full aggregation logic, register its queue in `queue.ts`, wire it into `worker.ts`, export the queue from `index.ts`, and add the pm2 worker entry to `ecosystem.config.js`. This is the complete backend infrastructure for the aggregation cron — after this task, starting `node packages/agents/dist/worker.js` causes the 2am repeat scheduler to be registered in Redis, and jobs can be manually enqueued.

## Steps

1. **Create `packages/agents/src/jobs/analytics-aggregation.ts`:**
   - Define `AnalyticsAggregationPayload { targetDate?: string }` interface
   - Implement `AnalyticsAggregationJob` class with two methods:
     - `register(): Worker` — creates a `new Worker<AnalyticsAggregationPayload>('analytics-aggregation', handler, { connection: new Redis(createRedisOptions()) })`; adds `worker.on('failed', ...)` error log; returns the worker
     - `async registerScheduler(): Promise<void>` — creates a fresh queue via `createAnalyticsAggregationQueue()` and calls `await queue.upsertJobScheduler('analytics-daily-aggregation', { pattern: '0 2 * * *', tz: 'UTC' }, { name: 'aggregate', data: {} })`; logs `[AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)`
   - Handler logic:
     - Compute `targetDate`: if `job.data.targetDate === 'yesterday'` or undefined → `new Date(Date.now() - 86400000).toISOString().slice(0, 10)`; otherwise use the provided ISO date string directly
     - Compute `dayStart = targetDate + 'T00:00:00.000Z'` and `dayEnd = targetDate + 'T23:59:59.999Z'`
     - Fetch all `analytics_events` for that date range: `supabase.from('analytics_events').select('site_id, event_type, page_path, referrer, visitor_hash').gte('created_at', dayStart).lte('created_at', dayEnd)` — throw on error
     - Log fetched count; early-return with log if zero events
     - Aggregate in-memory using `Map<string, AccumRow>` keyed by `${siteId}::${pagePath ?? ''}`:
       - `pageviews`: count `event_type === 'pageview'`
       - `affiliate_clicks`: count `event_type === 'click_affiliate'`
       - `uniqueVisitors`: `Set<string>` of non-null `visitor_hash` values → `.size`
       - `top_countries`: `Record<string, number>` grouped by `country ?? 'unknown'` — but since country is always null in Phase 1, store `{}` (skip null/unknown entries to avoid noise)
       - `top_referrers`: `Record<string, number>` grouped by referrer origin — use `new URL(ref).origin` with try/catch fallback to `ref || ''`; skip empty string referrers
     - Build upsert rows array: `{ site_id, date: targetDate, page_path, pageviews, unique_visitors, affiliate_clicks, top_countries, top_referrers }`
     - Upsert: `supabase.from('analytics_daily').upsert(rows, { onConflict: 'site_id,date,page_path' })` — throw on error
     - Log success: `[AnalyticsAggregationJob] upserted N rows for date YYYY-MM-DD`

2. **Update `packages/agents/src/queue.ts`:** Add `createAnalyticsAggregationQueue()` (same pattern as `createDeployQueue`) and `analyticsAggregationQueue()` singleton. Queue name: `'analytics-aggregation'`.

3. **Update `packages/agents/src/worker.ts`:** Import `AnalyticsAggregationJob`; instantiate it; call `await analyticsJob.registerScheduler()`; call `analyticsJob.register()` to get the worker; add to SIGTERM/SIGINT shutdown `Promise.all` arrays; add console.log for the queue name.

4. **Update `packages/agents/src/index.ts`:** Export `analyticsAggregationQueue` and `createAnalyticsAggregationQueue` so the admin server action can enqueue jobs without importing the job class (which would pull in Astro via generate-site transitive imports).

5. **Update `ecosystem.config.js`:** Add a `monster-worker` pm2 app entry: `script: 'node'`, `args: 'packages/agents/dist/worker.js'`, `cwd: '/home/daniel/monster'`, `env_file: '/home/daniel/monster/.env'` (or inline env), `out_file`/`error_file` pointing to `logs/pm2-worker-out.log` / `logs/pm2-worker-error.log`, `autorestart: true`, `kill_timeout: 10000`.

6. **Build and verify:** `pnpm --filter @monster/agents build`

## Must-Haves

- [ ] `AnalyticsAggregationJob.register()` creates a BullMQ Worker on queue `'analytics-aggregation'`
- [ ] `AnalyticsAggregationJob.registerScheduler()` calls `upsertJobScheduler` with `jobSchedulerId: 'analytics-daily-aggregation'` and `pattern: '0 2 * * *'` — NOT `queue.add` with repeat
- [ ] Aggregation groups by `(site_id, page_path)` — one row per site×path per day (matches `UNIQUE(site_id, date, page_path)` constraint)
- [ ] Upsert uses `onConflict: 'site_id,date,page_path'` (comma-separated string, not array)
- [ ] `top_countries` stores `{}` when all country values are null (Phase 1); no `null` in the jsonb column
- [ ] `top_referrers` groups by URL origin (`new URL(ref).origin`) with try/catch fallback; direct/empty referrers omitted
- [ ] Early return with log when event count is zero — no upsert called
- [ ] `analyticsAggregationQueue` exported from `packages/agents/src/index.ts`
- [ ] `monster-worker` entry added to `ecosystem.config.js`
- [ ] `pnpm --filter @monster/agents build` exits 0

## Verification

```bash
pnpm --filter @monster/agents build
# → ESM Build success, exit 0

# Confirm export is present
node -e "const m = require('./packages/agents/dist/index.js'); console.log(typeof m.analyticsAggregationQueue)"
# → function

# Confirm worker registers the scheduler and job
node packages/agents/dist/worker.js &
# Console should include:
#   [AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)
#   [worker] AnalyticsAggregationJob listening on queue "analytics-aggregation"
kill %1
```

## Observability Impact

- Signals added: `[AnalyticsAggregationJob] running for date YYYY-MM-DD`, `fetched N events`, `upserted R rows`, `no events for date YYYY-MM-DD — skipping`
- How a future agent inspects: `SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 20` in Supabase; pm2 logs via `pm2 logs monster-worker`
- Failure state exposed: BullMQ marks job as failed; `[AnalyticsAggregationJob] ERROR:` log with date context before the throw

## Inputs

- `packages/agents/src/queue.ts` — `createRedisOptions()`, `createRedisConnection()` patterns to copy
- `packages/agents/src/jobs/ssl-poller.ts` — headless job pattern (no ai_jobs tracking, console.log only)
- `packages/agents/src/worker.ts` — existing registration/shutdown pattern
- `packages/agents/src/index.ts` — existing export list (don't export the job class, only the queue)
- `packages/db/supabase/migrations/20260313000003_analytics.sql` — exact column names and `UNIQUE(site_id, date, page_path)` constraint
- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — `computeMetrics()` grouping logic as reference

## Expected Output

- `packages/agents/src/jobs/analytics-aggregation.ts` — new job class, ~100 lines
- `packages/agents/src/queue.ts` — `createAnalyticsAggregationQueue` + `analyticsAggregationQueue` added
- `packages/agents/src/worker.ts` — `AnalyticsAggregationJob` registered, scheduler awaited, shutdown wired
- `packages/agents/src/index.ts` — `analyticsAggregationQueue`, `createAnalyticsAggregationQueue` exported
- `ecosystem.config.js` — `monster-worker` pm2 entry added
- `pnpm --filter @monster/agents build` exits 0
