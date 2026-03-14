---
id: T01
parent: S03
milestone: M005
provides:
  - AnalyticsAggregationJob class with handler, register(), and registerScheduler()
  - analyticsAggregationQueue singleton + createAnalyticsAggregationQueue factory in queue.ts
  - analytics-aggregation worker wired into worker.ts with scheduler + SIGTERM/SIGINT shutdown
  - analyticsAggregationQueue exported from packages/agents/src/index.ts
  - monster-worker pm2 entry in ecosystem.config.js
key_files:
  - packages/agents/src/jobs/analytics-aggregation.ts
  - packages/agents/src/queue.ts
  - packages/agents/src/worker.ts
  - packages/agents/src/index.ts
  - ecosystem.config.js
key_decisions:
  - registerScheduler() closes the queue after upsertJobScheduler to avoid a hanging connection (fresh queue per call, closed in finally block)
  - top_countries stores {} in Phase 1 because all country values are null; no null keys stored in jsonb
  - top_referrers groups by URL origin using new URL(ref).origin with try/catch fallback to raw ref; empty/direct referrers omitted
  - page_path key uses :: separator (site UUIDs contain only hex+hyphen, :: cannot collide)
  - handler early-returns with structured log when event count is zero — no upsert called
patterns_established:
  - Analytics aggregation follows the same headless job pattern as SslPollerJob (no ai_jobs tracking, console.log only, worker returned from register())
  - registerScheduler() creates and closes its own queue; register() creates its own Redis connection — no shared state
observability_surfaces:
  - "[AnalyticsAggregationJob] running for date YYYY-MM-DD" — job start
  - "[AnalyticsAggregationJob] fetched N events for date YYYY-MM-DD" — fetch result
  - "[AnalyticsAggregationJob] no events for date YYYY-MM-DD — skipping" — zero-event early return
  - "[AnalyticsAggregationJob] upserted R rows for date YYYY-MM-DD" — success
  - "[AnalyticsAggregationJob] ERROR: fetch failed for date YYYY-MM-DD: <message>" — fetch error (re-thrown)
  - "[AnalyticsAggregationJob] ERROR: upsert failed for date YYYY-MM-DD (N events): <message>" — upsert error (re-thrown)
  - "[AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)" — scheduler registration
  - BullMQ marks failed jobs; inspect via Redis: KEYS bull:analytics-aggregation:failed:*
  - pm2 logs: pm2 logs monster-worker --lines 50
duration: 30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Implement AnalyticsAggregationJob + queue + worker wiring + pm2 entry

**Shipped `AnalyticsAggregationJob` with full aggregation logic, wired into worker.ts with upsertJobScheduler, exported from index.ts, and pm2 entry added — `pnpm --filter @monster/agents build` exits 0, `analyticsAggregationQueue` confirmed as `function`.**

## What Happened

Created `packages/agents/src/jobs/analytics-aggregation.ts` with the `AnalyticsAggregationJob` class. The handler fetches all `analytics_events` for the target date (defaulting to yesterday UTC), aggregates in-memory with a `Map<string, AccumRow>` keyed by `${siteId}::${pagePath}`, then upserts into `analytics_daily` with `onConflict: 'site_id,date,page_path'`.

Added `createAnalyticsAggregationQueue` + `analyticsAggregationQueue` singleton to `queue.ts` following the existing deploy/ssl-poller pattern.

Updated `worker.ts` to import `AnalyticsAggregationJob`, call `await analyticsJob.registerScheduler()` (which calls `upsertJobScheduler` with stable ID `analytics-daily-aggregation` and pattern `0 2 * * *`), then `analyticsJob.register()` to get the worker. Worker added to both SIGTERM and SIGINT shutdown arrays.

Exported `analyticsAggregationQueue` and `createAnalyticsAggregationQueue` from `index.ts` so the admin server action (T02) can enqueue without importing the job class.

Added `monster-worker` pm2 app entry to `ecosystem.config.js` with `env_file`, log files pointing to `logs/pm2-worker-*.log`, `autorestart: true`, `kill_timeout: 10000`.

Also applied the S03-PLAN.md pre-flight fix: added a failure-path verification step documenting how to inspect BullMQ failed jobs via Redis and pm2 logs.

## Verification

```bash
# Build
pnpm --filter @monster/agents build
# → ESM Build success in ~300ms, exit 0

# Export check
node -e "const m = require('./packages/agents/dist/index.js'); console.log(typeof m.analyticsAggregationQueue)"
# → function

# Built output grep confirms all observability signals present in worker.js
grep "[AnalyticsAggregationJob]" packages/agents/dist/worker.js
# → all 8 log/error patterns found

# upsertJobScheduler call confirmed with correct args:
#   "analytics-daily-aggregation", { pattern: "0 2 * * *", tz: "UTC" }, { name: "aggregate", data: {} }
```

## Diagnostics

- `pm2 logs monster-worker --lines 50` — runtime output including scheduler registration and per-job signals
- `SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 20` in Supabase — inspect aggregated rows
- `KEYS bull:analytics-aggregation:failed:*` via Redis — list failed job IDs
- BullMQ marks failed jobs when handler throws; error includes date and event count for traceability

## Deviations

- `registerScheduler()` creates a fresh queue and closes it in a `finally` block rather than using the singleton. This avoids a hanging connection since `registerScheduler()` is a one-shot startup call and the singleton is reserved for the admin panel's `add()` calls. Not in the plan but clean and necessary.

## Known Issues

- `node packages/agents/dist/worker.js` fails at startup with `ERR_MODULE_NOT_FOUND: Cannot find package 'node-ssh'` — this is a pre-existing issue in `@monster/deployment`, present before this task. All built code for `AnalyticsAggregationJob` is confirmed in the bundle; the worker will function once `node-ssh` is installed or `@monster/deployment` is moved to optional deps. Runtime verification of scheduler registration must wait for that fix.

## Files Created/Modified

- `packages/agents/src/jobs/analytics-aggregation.ts` — new job class with handler, register(), registerScheduler(); ~150 lines
- `packages/agents/src/queue.ts` — added createAnalyticsAggregationQueue + analyticsAggregationQueue singleton
- `packages/agents/src/worker.ts` — imported AnalyticsAggregationJob, called registerScheduler(), register(); added to shutdown arrays
- `packages/agents/src/index.ts` — exported analyticsAggregationQueue and createAnalyticsAggregationQueue
- `ecosystem.config.js` — added monster-worker pm2 app entry
- `.gsd/milestones/M005/slices/S03/S03-PLAN.md` — added failure-path verification step (pre-flight fix)
