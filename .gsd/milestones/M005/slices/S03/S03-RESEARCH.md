# S03: Daily Aggregation Cron — Research

**Date:** 2026-03-13
**Researched by:** auto-mode

## Summary

S03 is the lowest-risk slice in M005. All the infrastructure already exists: the BullMQ worker pattern is established and consistent across three jobs (GenerateSiteJob, DeploySiteJob, SslPollerJob), the `analytics_events` table is already populated (or will be by S01), and the `analytics_daily` table schema is fully in place from M001. The work is three pieces: (1) a new `AnalyticsAggregationJob` class in `packages/agents/src/jobs/`, (2) a new queue factory in `queue.ts`, (3) wiring into `worker.ts` with `upsertJobScheduler` for repeat registration, and (4) a manual-trigger server action in the admin panel analytics page.

One schema surprise: `analytics_daily` has `UNIQUE(site_id, date, page_path)` — per-page-path granularity, not per-site. The M005-ROADMAP describes the aggregation as per-site with a `top_pages` jsonb field, but the actual DB schema and the S02 dashboard consume per-path rows. The S02 dashboard renders each `analytics_daily` row as its own table row with a `page_path` column. The aggregation SQL must group by `(site_id, page_path)` within a date, producing one row per site×page per day.

The aggregation implementation choice is: application-level JS aggregation (fetch all yesterday's events, group in-memory, upsert rows) vs. a Supabase DB function via `supabase.rpc()`. At Phase 1 volumes (single site, a few hundred events/day), JS aggregation is correct and avoids a new migration. If event volume grows past ~10k rows/day the DB-function approach becomes worth the migration complexity. For now, use the same pattern as S02's `computeMetrics()` but write results back to `analytics_daily`.

BullMQ v5 introduces `queue.upsertJobScheduler(id, repeatOpts, template)` as the preferred API for repeat jobs, replacing the older `queue.add('name', data, { repeat: { pattern } })` approach. The old API still functions (it routes to the same internals) but `upsertJobScheduler` provides idempotent re-registration — calling it twice with the same `jobSchedulerId` updates the existing scheduler rather than creating a duplicate. This directly solves the duplicate-registration-on-restart pitfall documented in M005-RESEARCH.

## Recommendation

Implement `AnalyticsAggregationJob` with application-level JS aggregation: fetch all `analytics_events` for yesterday (UTC date), group by `(site_id, page_path)`, aggregate counts and jsonb rollups, then upsert into `analytics_daily` using `onConflict: 'site_id,date,page_path'`. Register the job as a BullMQ repeat scheduler using `upsertJobScheduler` with `pattern: '0 2 * * *'` and a stable `jobSchedulerId: 'analytics-daily-aggregation'`. Add a manual-trigger server action in the admin panel analytics page, following the `enqueueSiteGeneration` pattern in `sites/[id]/actions.ts`.

The aggregation job needs no `ai_jobs` tracking row — it's autonomous and headless, not tied to a user-initiated site action. Simple console logs are sufficient. No new migrations are needed.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| BullMQ repeat job registration | `queue.upsertJobScheduler(id, repeatOpts, template)` (BullMQ v5 native) | Idempotent by `jobSchedulerId`. Replaces old `queue.add + repeat` pattern. Survives worker restarts without duplicate scheduler entries. |
| BullMQ queue factory | `createRedisConnection()` + `new Queue(name, { connection })` pattern from `queue.ts` | Already established for generate/deploy/ssl-poller queues. Copy the pattern exactly. |
| Worker registration | `new Worker(queueName, handler, { connection })` from `deploy-site.ts` / `ssl-poller.ts` | Same pattern for every job. Lock duration default (30s) is fine — aggregation completes in <5s for Phase 1 volumes. |
| Supabase upsert with conflict handling | `supabase.from('analytics_daily').upsert([...rows], { onConflict: 'site_id,date,page_path' })` | Service role bypasses RLS. Conflict target matches the `UNIQUE(site_id, date, page_path)` constraint in migration 003. |
| Per-event aggregation | In-memory `Map<string, { pageviews, uniqueVisitors, clicks, countries, referrers }>` with key `${siteId}::${pagePath}` | Same pattern as `computeMetrics()` in `apps/admin/src/app/(dashboard)/analytics/lib.ts`. Proven at Phase 1 volumes. |
| UTC date arithmetic | `new Date(Date.now() - 86400000).toISOString().slice(0, 10)` | "Yesterday" in UTC. Consistent with D083 (always UTC). No timezone library needed. |

## Existing Code and Patterns

- `packages/agents/src/worker.ts` — Add `AnalyticsAggregationJob` registration here alongside the three existing jobs. Also call `registerRepeatScheduler()` (a public method on the job class, called once on startup) to register the cron via `upsertJobScheduler`. Add the worker to the `SIGTERM`/`SIGINT` shutdown arrays.
- `packages/agents/src/queue.ts` — Add `createAnalyticsAggregationQueue()` and `analyticsAggregationQueue()` singleton following the exact pattern of `createDeployQueue()`/`deployQueue()`. Queue name: `'analytics-aggregation'`.
- `packages/agents/src/jobs/deploy-site.ts` — Most similar job to follow. Copy the worker constructor pattern; note that `lockDuration` default (30s) is fine for aggregation (no long-running I/O beyond one Supabase SELECT and one upsert batch).
- `packages/agents/src/jobs/ssl-poller.ts` — Pattern for a job that doesn't use `ai_jobs` tracking. SslPollerJob logs to console only — no `ai_jobs` row. Follow this pattern for AnalyticsAggregationJob.
- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — `computeMetrics()` shows the exact grouping logic needed. The aggregation job is essentially the same aggregation written to DB instead of returned to the client. Reuse the logic, not the code directly (the job runs in `packages/agents`, not in `apps/admin`).
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `enqueueSiteGeneration()` is the pattern for the manual-trigger server action. For the analytics aggregation trigger, it's simpler: no `ai_jobs` row needed, just `analyticsAggregationQueue().add('run-now', { targetDate: 'yesterday' })`.
- `packages/agents/tsup.config.ts` — No changes needed. The new job file is internal to `worker.ts` (not exported from `index.ts`) — same as all other jobs.

## Schema Reality Check

The `analytics_daily` table (migration 003) has:
```
UNIQUE(site_id, date, page_path)
```

This means the aggregation must produce **one row per (site_id, date, page_path)** — not one row per site per day. The S02 dashboard renders `row.date`, `row.page_path`, `row.pageviews`, `row.unique_visitors`, `row.affiliate_clicks` per row. The `top_countries` and `top_referrers` columns are per-path jsonb rollups (e.g., `{ "ES": 3, "US": 1 }` for that page's events on that day).

There is **no `top_pages` column** in `analytics_daily`. The M005-ROADMAP describes a different schema than what was actually implemented in M001. The S02 code works with the real schema. S03 must produce the per-path granularity that S02 expects.

## Constraints

- **No new migrations needed.** `analytics_daily` schema from migration 003 is sufficient. Upsert handles idempotency via the existing unique constraint.
- **`upsertJobScheduler` called on the Queue (not Worker).** The repeat scheduler is registered on the queue object, not the worker. Create a separate queue instance in `AnalyticsAggregationJob.registerRepeatScheduler()` (or expose via `analyticsAggregationQueue()`). Worker processes the jobs normally.
- **`analytics_events` has no `visitor_hash` index.** `COUNT(DISTINCT visitor_hash)` over a date's events does a filtered table scan. At Phase 1 volumes (<10k events/day) this is negligible. Don't add an index in S03 — the research doc defers this to when daily event count exceeds ~50k.
- **90-day cleanup is Phase 2.** The aggregation job could include a `DELETE FROM analytics_events WHERE created_at < now() - interval '90 days'` — but this is explicitly deferred (D015). Don't add it now.
- **The `analyticsAggregationQueue` singleton must not conflict with the Supabase connection.** `createRedisConnection()` returns a new ioredis instance each time. The queue and worker each need separate connections (same as all other queues).
- **Worker process has no entry in `ecosystem.config.js`.** The pm2 config only runs `monster-admin`. The worker (`node packages/agents/dist/worker.js`) must be added to `ecosystem.config.js` for the repeat scheduler to persist across reboots. This may be a S03 deliverable or a known limitation.

## Common Pitfalls

- **`upsertJobScheduler` vs `queue.add` with repeat.** Both APIs exist in BullMQ v5. Use `upsertJobScheduler` — it's idempotent by `jobSchedulerId`. The old `queue.add({ repeat: { pattern } })` still works but generates a key from a hash of (name + pattern + data), which changes if the job name changes. `upsertJobScheduler('analytics-daily-aggregation', ...)` uses the explicit ID as the dedup key.
- **`onConflict` column string vs array.** Supabase-js `.upsert({ onConflict: 'site_id,date,page_path' })` requires a comma-separated string matching the columns in the UNIQUE constraint, not an array. The constraint is `UNIQUE(site_id, date, page_path)`.
- **"Yesterday" in UTC.** Use `DATE(created_at AT TIME ZONE 'UTC')` semantics in the JS filter: compute yesterday as `new Date(Date.now() - 86400000).toISOString().slice(0, 10)`. Query `analytics_events` where `created_at >= yesterdayStart` and `created_at < todayStart` (midnight UTC boundaries). This prevents edge cases on events that cross midnight.
- **Empty event days.** If no events exist for yesterday, the aggregation job produces zero rows — correct behavior, no upsert needed. Guard with an early-return if the fetched events array is empty. Log the count for observability.
- **Worker process not running.** The BullMQ repeat job only fires if the worker process is running. Since there's no pm2 entry for the worker yet, the repeat scheduler won't fire without manual `node packages/agents/dist/worker.js`. Either add a pm2 entry or document this clearly in the slice UAT.
- **Manual trigger for "today" vs "yesterday".** The manual-trigger action in the admin panel should accept an optional `targetDate` param (ISO date string). Default to yesterday. This allows triggering aggregation for a specific past date during testing without waiting for the 2am cron.
- **`top_countries` is always `{}` in Phase 1.** Since `analytics_events.country` is always `null` (D081), the `top_countries` rollup will always be an empty object. Store `{}` not `null` to satisfy the jsonb column and avoid null-handling complexity in future consumers.
- **`top_referrers` grouping.** Referrer values can be long URLs. Group by origin (scheme + host) rather than full URL to produce useful rollup keys. `new URL(referrer).origin` with a try/catch fallback for malformed referrers. Store as `{ "https://google.com": 3, "": 2 }` (empty string for direct/no-referrer).

## Open Risks

- **Worker pm2 entry missing.** The repeat scheduler only executes if `node packages/agents/dist/worker.js` is running. If the pm2 ecosystem doesn't include the worker process, the 2am cron never fires in production. Either add the pm2 entry in S03 or explicitly document it as a follow-up. The `ecosystem.config.js` currently only has `monster-admin`.
- **`upsertJobScheduler` on startup races with queue connection.** `queue.upsertJobScheduler` is async and returns a Promise. The worker.ts startup must `await` it. If uncaught, the scheduler registers lazily and may not fire on the first expected cycle after deploy.
- **Aggregation over large event sets.** supabase-js fetches all matching rows into memory. At Phase 1 volumes this is fine, but if the event table grows to hundreds of thousands of rows per day before a cleanup cron exists, the fetch becomes expensive. The `analytics_events` indexes on `site_id` and `created_at` (from migration 003) make the Supabase-side query efficient; the memory overhead is the limit.
- **Manual trigger adds duplicate same-day rows.** Running the manual trigger multiple times for the same date overwrites the existing row via upsert — this is the correct behavior per D083 (idempotent full-day aggregation). But if the user triggers it for today (before today's events are complete), the partial aggregation row looks like it covers the full day. Document that manual trigger is for testing with yesterday's date.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| BullMQ v5 repeat jobs | (none found) | none found |
| Supabase upsert | (none found) | none found |

## Sources

- `packages/agents/src/worker.ts` — existing worker startup pattern (three jobs, SIGTERM/SIGINT handlers)
- `packages/agents/src/queue.ts` — existing queue factory pattern (createXxxQueue + singleton xxxQueue)
- `packages/agents/src/jobs/deploy-site.ts` — Worker constructor pattern with lockDuration
- `packages/agents/src/jobs/ssl-poller.ts` — headless job pattern (no ai_jobs tracking, console.log only)
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — manual-trigger server action pattern (`enqueueSiteGeneration`)
- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — `computeMetrics()` event grouping logic to replicate in aggregation job
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — S02 dashboard shows `dailyRows` rendering; confirms per-path row granularity
- `packages/db/supabase/migrations/20260313000003_analytics.sql` — actual `UNIQUE(site_id, date, page_path)` constraint (different from roadmap description of per-site granularity)
- `packages/agents/node_modules/bullmq/dist/esm/classes/queue.d.ts` — `upsertJobScheduler` API signature confirmed in BullMQ v5.71.0
- `packages/agents/node_modules/bullmq/dist/esm/interfaces/repeat-options.d.ts` — `RepeatOptions.pattern` field (cron string)
- M005-RESEARCH.md — BullMQ dedup via stable jobId, aggregation SQL approach, common pitfalls
- M005-ROADMAP.md S03 boundary — produces: BullMQ queue `analytics-aggregation`, `AnalyticsAggregationJob` registered in `worker.ts`
- DECISIONS.md D082 — BullMQ repeat job, stable jobId `'analytics-daily-aggregation'`, no Vercel Cron
- DECISIONS.md D083 — full-day atomic upsert (idempotent), not incremental updates
