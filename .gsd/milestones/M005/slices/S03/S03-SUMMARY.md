---
id: S03
parent: M005
milestone: M005
provides:
  - AnalyticsAggregationJob class with handler(), register(), and registerScheduler()
  - analyticsAggregationQueue singleton + createAnalyticsAggregationQueue factory in queue.ts
  - BullMQ repeat job registered via upsertJobScheduler (stable ID, cron 0 2 * * * UTC) on worker startup
  - monster-worker pm2 entry in ecosystem.config.js
  - enqueueAnalyticsAggregation server action in apps/admin analytics/actions.ts
  - AggregationTrigger client component with pending state and inline status
  - "Run Aggregation" button wired into analytics page header
requires:
  - slice: S01
    provides: analytics_events rows (site_id, event_type, page_path, referrer, visitor_hash, created_at) consumed by aggregation job
affects:
  - slice: S02
    provides: analytics_daily rows that S02 reads for the aggregated stats card
key_files:
  - packages/agents/src/jobs/analytics-aggregation.ts
  - packages/agents/src/queue.ts
  - packages/agents/src/worker.ts
  - packages/agents/src/index.ts
  - apps/admin/src/app/(dashboard)/analytics/actions.ts
  - apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx
  - apps/admin/src/app/(dashboard)/analytics/page.tsx
  - ecosystem.config.js
key_decisions:
  - D087: registerScheduler() creates and closes its own fresh queue (not the singleton) — avoids hanging connection on startup
  - D088: accumulator map keyed by ${siteId}::${pagePath} — :: is UUID-safe, collision-free separator
  - D089: AggregationTrigger extracted as separate 'use client' file — RSC boundary requires file-level separation
  - D090: enqueueAnalyticsAggregation returns { ok, jobId, date, error } with date included — confirms which date was queued
patterns_established:
  - Headless aggregation jobs (no ai_jobs tracking) use console.log only; register() returns the Worker; registerScheduler() is a one-shot startup call with its own queue lifecycle
  - 'use client' interactive leaves within async server component pages are extracted to separate files and imported as leaf components
observability_surfaces:
  - "[AnalyticsAggregationJob] running for date YYYY-MM-DD" — job start
  - "[AnalyticsAggregationJob] fetched N events for date YYYY-MM-DD" — fetch result
  - "[AnalyticsAggregationJob] no events for date YYYY-MM-DD — skipping" — zero-event early return
  - "[AnalyticsAggregationJob] upserted R rows for date YYYY-MM-DD" — success
  - "[AnalyticsAggregationJob] ERROR: fetch failed / upsert failed for date YYYY-MM-DD: <message>" — failure (re-thrown)
  - "[AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)" — scheduler registration
  - Inline UI: "Queued for YYYY-MM-DD" (success) or "Error: <message>" (failure) in analytics page
  - BullMQ failed jobs: KEYS bull:analytics-aggregation:failed:* in Redis
  - pm2 logs: pm2 logs monster-worker --lines 50
drill_down_paths:
  - .gsd/milestones/M005/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S03/tasks/T02-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-13
---

# S03: Daily Aggregation Cron

**BullMQ repeat job aggregates `analytics_events` → `analytics_daily` nightly at 02:00 UTC; manually triggerable from the admin analytics page via a "Run Aggregation" button with inline status feedback.**

## What Happened

**T01** created `AnalyticsAggregationJob` in `packages/agents/src/jobs/analytics-aggregation.ts`. The handler fetches all `analytics_events` for a target date (defaulting to yesterday UTC) from Supabase using the service role client, then aggregates in memory with a `Map<string, AccumRow>` keyed by `${siteId}::${pagePath}`. Per key it accumulates: pageview count, a `Set<string>` of `visitor_hash` values for unique visitors, affiliate click count, country frequency map, and referrer frequency map (grouped by URL origin). The result is upserted into `analytics_daily` with conflict target `(site_id, date, page_path)` — idempotent on re-runs for the same date. Zero-event days short-circuit with a structured log and no upsert call.

`registerScheduler()` creates a dedicated queue, calls `upsertJobScheduler('analytics-daily-aggregation', { pattern: '0 2 * * *', tz: 'UTC' })` with a stable ID to prevent duplicate registration on worker restart, then closes the queue in a `finally` block (D087). `register()` returns a `Worker` that processes jobs — the same headless pattern used by `SslPollerJob`.

`queue.ts` gained `createAnalyticsAggregationQueue` + `analyticsAggregationQueue` singleton. `worker.ts` calls `registerScheduler()` then `register()` on startup and adds the worker to both SIGTERM/SIGINT shutdown arrays. `index.ts` exports the queue singleton and factory (not the job class, per D048 pattern — avoids bundling heavy deps into the admin bundle). `ecosystem.config.js` gained the `monster-worker` pm2 app entry with `autorestart: true`, `kill_timeout: 10000`, and log files under `logs/`.

**T02** added the manual trigger surface. `actions.ts` has `'use server'` + `enqueueAnalyticsAggregation(targetDate?)` which defaults to yesterday UTC, calls `analyticsAggregationQueue().add('run-now', ...)` with `removeOnComplete: true`, and returns `{ ok, jobId, date, error }`. `AggregationTrigger.tsx` is a separate `'use client'` file (D089 — RSC boundary at file level) using `useTransition` for pending state and `useState` for the result. It shows "Queuing…" while in-flight, then "Queued for YYYY-MM-DD" on success or "Error: …" on failure. `page.tsx` renders `<AggregationTrigger />` in the page header alongside `<AnalyticsFilters />`.

## Verification

```bash
# Both build targets exit 0
pnpm --filter @monster/agents build   # ESM build success ~266ms
pnpm --filter @monster/admin build    # /analytics route ƒ (Dynamic), exit 0

# analyticsAggregationQueue export confirmed as function
node -e "const m = require('./packages/agents/dist/index.js'); console.log(typeof m.analyticsAggregationQueue)"
# → function

# 'use server' directive and correct export
head -3 apps/admin/src/app/(dashboard)/analytics/actions.ts
# → 'use server'; [blank line] import { analyticsAggregationQueue } from '@monster/agents';

# AggregationTrigger wired into page
grep "AggregationTrigger" apps/admin/src/app/(dashboard)/analytics/page.tsx
# → import + JSX render at line 12 and 59

# pm2 worker entry confirmed
grep "monster-worker" ecosystem.config.js
# → name: 'monster-worker' at line 24

# 8 observability log strings in built worker bundle
grep -c "[AnalyticsAggregationJob]" packages/agents/dist/worker.js  # → 8

# upsertJobScheduler call with correct args in built output
grep "analytics-daily-aggregation\|0 2 \* \* \*" packages/agents/dist/worker.js
# → both strings present with correct scheduler args
```

## Requirements Advanced

- R009 (Analytics: lightweight GDPR-friendly tracking) — S03 completes the aggregation layer: nightly cron produces `analytics_daily` rows; manual trigger enables on-demand backfill; analytics page now has a trigger button. Combined with S01 (tracker) + S02 (dashboard), the full analytics pipeline is implemented. Remaining gap: human UAT (live site visit → event rows → aggregation → dashboard confirmation).

## Requirements Validated

- none — R009 moves to validated only after human UAT confirms end-to-end flow (visit live site → events in Supabase → run aggregation → analytics_daily row → dashboard shows data)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `registerScheduler()` uses a fresh queue instance (create + close in finally) rather than the singleton. Not in the plan, but necessary to avoid a hanging Redis connection — the singleton is reserved for admin panel `add()` calls (D087).
- `enqueueAnalyticsAggregation` returns `{ ok, jobId, date, error }` with `date` included (plan only specified ok/error). Adds debuggability at no cost (D090).

## Known Limitations

- `node packages/agents/dist/worker.js` fails at startup with `ERR_MODULE_NOT_FOUND: node-ssh` — pre-existing issue in `@monster/deployment` (present since M004). The `AnalyticsAggregationJob` code is fully in the bundle; the worker will function once `node-ssh` is installed or `@monster/deployment` is moved to optional dependencies in the tsup external list. End-to-end runtime verification of the cron and scheduler registration must wait for this fix.
- `analytics_daily` conflict target is `(site_id, date, page_path)` — requires a unique constraint on this composite in the DB. Constraint was defined in the M001 migration; if it's missing the upsert will fail with a PostgreSQL error.

## Follow-ups

- Fix `node-ssh` / `@monster/deployment` ERR_MODULE_NOT_FOUND on worker startup — required before pm2 `monster-worker` can run in production.
- Human UAT: visit live site 5× → confirm `analytics_events` rows → click "Run Aggregation" → confirm `analytics_daily` row → confirm admin /analytics shows updated counts.
- Validate that `analytics_daily` unique constraint `(site_id, date, page_path)` exists in the production Supabase schema (check M001 migration SQL).
- R009 → move to `validated` after human UAT passes.

## Files Created/Modified

- `packages/agents/src/jobs/analytics-aggregation.ts` — new; AnalyticsAggregationJob with handler, register(), registerScheduler(); ~150 lines
- `packages/agents/src/queue.ts` — added createAnalyticsAggregationQueue + analyticsAggregationQueue singleton
- `packages/agents/src/worker.ts` — imported AnalyticsAggregationJob; wired registerScheduler() + register() + shutdown arrays
- `packages/agents/src/index.ts` — exported analyticsAggregationQueue and createAnalyticsAggregationQueue
- `apps/admin/src/app/(dashboard)/analytics/actions.ts` — new; 'use server'; enqueueAnalyticsAggregation server action
- `apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx` — new; 'use client' button with pending state and inline status
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — added AggregationTrigger import + JSX placement in header
- `ecosystem.config.js` — added monster-worker pm2 app entry

## Forward Intelligence

### What the next slice should know
- The `node-ssh` ERR_MODULE_NOT_FOUND is the only blocker between the current codebase and a running `monster-worker` pm2 process. It's the first thing to fix in M006 or any slice that needs the worker live.
- `analytics_daily` upsert conflict target is `(site_id, date, page_path)`. Before running the aggregation job for the first time, verify the M001 migration created this composite unique constraint — if it's a single-column `(site_id, date)` constraint the upsert will fail.
- The `analyticsAggregationQueue` singleton (not the job class) is the correct import for any new code that needs to enqueue aggregation jobs. The job class is internal to the worker process.

### What's fragile
- `registerScheduler()` fresh-queue pattern — if `createAnalyticsAggregationQueue()` throws (Redis down), the error propagates uncaught from `worker.ts` startup and pm2 will restart the process. This is the correct behavior but may cause restart loops if Redis is persistently down at startup time.
- `analyticsAggregationQueue` singleton is initialized lazily on first call. If the admin server action is invoked before Redis is reachable, it will throw and the AggregationTrigger will display "Error: …". No retry logic — operator must ensure Redis is up.

### Authoritative diagnostics
- Worker startup: `pm2 logs monster-worker --lines 50` — look for "[AnalyticsAggregationJob] scheduler registered" within the first 5 lines after start
- Job execution: same log source, filter for "[AnalyticsAggregationJob]" lines
- Failed jobs: `KEYS bull:analytics-aggregation:failed:*` in Redis — job data includes the target date
- DB state: `SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 20` in Supabase table editor

### What assumptions changed
- Plan assumed the worker would be verifiable by running `node packages/agents/dist/worker.js` — this is blocked by the pre-existing `node-ssh` ERR_MODULE_NOT_FOUND. Build-level verification (export type check, log string grep) substitutes for runtime verification of scheduler registration.
