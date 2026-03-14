# S03: Daily Aggregation Cron

**Goal:** A BullMQ repeat job aggregates yesterday's `analytics_events` into `analytics_daily` rows nightly at 02:00 UTC. The job is idempotent, registered via `upsertJobScheduler` on worker startup, manually triggerable from the admin panel, and runs under pm2 alongside the admin process.
**Demo:** Run `enqueueAnalyticsAggregation()` from the admin panel analytics page → `analytics_daily` rows appear in Supabase for each `(site_id, date, page_path)` combination with correct pageview, unique visitor, affiliate click counts, and referrer rollups.

## Must-Haves

- `AnalyticsAggregationJob` class in `packages/agents/src/jobs/analytics-aggregation.ts` with JS-level event aggregation and upsert into `analytics_daily` via service role client
- `analyticsAggregationQueue()` singleton + `createAnalyticsAggregationQueue()` factory in `packages/agents/src/queue.ts`, following the existing pattern
- `upsertJobScheduler('analytics-daily-aggregation', { pattern: '0 2 * * *' })` called on worker startup (idempotent via stable ID)
- Worker registration in `packages/agents/src/worker.ts` with SIGTERM/SIGINT shutdown
- pm2 worker entry in `ecosystem.config.js` so the scheduler fires in production
- Manual-trigger server action `enqueueAnalyticsAggregation(targetDate?)` in `apps/admin/src/app/(dashboard)/analytics/actions.ts`
- Trigger button wired into the analytics page
- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/admin build` exits 0

## Verification

```bash
# Build passes
pnpm --filter @monster/agents build
pnpm --filter @monster/admin build

# Manual trigger smoke test: start worker + trigger aggregation
node packages/agents/dist/worker.js &
# (run enqueueAnalyticsAggregation from admin panel or direct queue.add call)
# Then inspect analytics_daily in Supabase dashboard — rows should appear

# Idempotency check: run trigger twice for same date
# analytics_daily rows for that date should be the same count (upsert not insert)

# Failure-path / diagnostic check: verify structured error output and failure state
# Force a DB error by temporarily revoking service role access or passing a bad date,
# then confirm the worker logs [AnalyticsAggregationJob] ERROR: <message> with date context
# and BullMQ marks the job as failed (visible via Bull Board or direct Redis inspection):
#   KEYS bull:analytics-aggregation:failed:*
# pm2 logs surface the structured error with date context:
#   pm2 logs monster-worker --lines 50 | grep "ERROR"
```

## Observability / Diagnostics

- Runtime signals: `[AnalyticsAggregationJob] running for date YYYY-MM-DD`, `[AnalyticsAggregationJob] fetched N events`, `[AnalyticsAggregationJob] upserted R rows into analytics_daily`
- Inspection surfaces: Supabase table editor → `analytics_daily` for date rows; pm2 logs `logs/pm2-worker-out.log`; `SELECT * FROM analytics_daily ORDER BY date DESC LIMIT 20`
- Failure visibility: `[AnalyticsAggregationJob] ERROR: ...` logged with date and event count before the error; job marked failed by BullMQ (visible in Bull Board if present)
- Redaction constraints: no secrets in logs; Supabase service role key must not appear in console output

## Integration Closure

- Upstream surfaces consumed: `analytics_events` table rows (site_id, event_type, page_path, referrer, visitor_hash, created_at) produced by S01 tracker
- New wiring introduced: `AnalyticsAggregationJob` registered in `worker.ts`; `analyticsAggregationQueue` exported from `packages/agents/src/index.ts` for admin action import; pm2 `monster-worker` entry in `ecosystem.config.js`; trigger button in `/analytics` page
- What remains before milestone is truly usable end-to-end: human UAT (visit live site → events appear → run aggregation → confirm `analytics_daily` row)

## Tasks

- [x] **T01: Implement AnalyticsAggregationJob + queue + worker wiring + pm2 entry** `est:45m`
  - Why: The core slice deliverable — the BullMQ job that does the aggregation, its queue, and the infrastructure wiring that makes the 2am cron fire in production
  - Files: `packages/agents/src/jobs/analytics-aggregation.ts` (new), `packages/agents/src/queue.ts`, `packages/agents/src/worker.ts`, `packages/agents/src/index.ts`, `ecosystem.config.js`
  - Do: Create `AnalyticsAggregationJob` class with `register()` → `Worker` and `registerScheduler()` → `upsertJobScheduler`; fetch all events for `targetDate` (default yesterday UTC) from `analytics_events` using service role client; group by `(site_id, page_path)` in memory using a `Map`; compute pageviews, unique_visitors (Set of visitor_hash), affiliate_clicks, top_countries, top_referrers (origin-grouped); upsert into `analytics_daily` with `onConflict: 'site_id,date,page_path'`; add `createAnalyticsAggregationQueue` + `analyticsAggregationQueue` singleton to `queue.ts`; wire into `worker.ts` (register job + call `registerScheduler()` + add to shutdown arrays); export `analyticsAggregationQueue` from `index.ts`; add `monster-worker` pm2 entry to `ecosystem.config.js`
  - Verify: `pnpm --filter @monster/agents build` exits 0; `node -e "const {analyticsAggregationQueue} = require('./packages/agents/dist/index.js'); console.log(typeof analyticsAggregationQueue)"` prints `function`
  - Done when: build exits 0, `analyticsAggregationQueue` is exported from the package, ecosystem.config.js has the worker entry

- [x] **T02: Add manual-trigger server action + analytics page trigger button** `est:20m`
  - Why: Makes the aggregation job manually triggerable from the admin panel for testing and on-demand backfill — without having to wait for the 2am cron
  - Files: `apps/admin/src/app/(dashboard)/analytics/actions.ts` (new), `apps/admin/src/app/(dashboard)/analytics/page.tsx`
  - Do: Create `actions.ts` with `'use server'` and `enqueueAnalyticsAggregation(targetDate?: string)` that calls `analyticsAggregationQueue().add('run-now', { targetDate: targetDate ?? 'yesterday' }, { removeOnComplete: true })`; add a "Run Aggregation" button to the analytics page that calls the action with `yesterday` as targetDate; display a toast or inline message on success/failure
  - Verify: `pnpm --filter @monster/admin build` exits 0; button renders in analytics page
  - Done when: build exits 0, action file exists with correct `'use server'` directive, button is visible in the analytics page

## Files Likely Touched

- `packages/agents/src/jobs/analytics-aggregation.ts` (new)
- `packages/agents/src/queue.ts`
- `packages/agents/src/worker.ts`
- `packages/agents/src/index.ts`
- `apps/admin/src/app/(dashboard)/analytics/actions.ts` (new)
- `apps/admin/src/app/(dashboard)/analytics/page.tsx`
- `ecosystem.config.js`
