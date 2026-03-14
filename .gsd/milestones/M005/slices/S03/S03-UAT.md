# S03: Daily Aggregation Cron — UAT

**Milestone:** M005
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: artifact-driven checks (build, export, log strings, pm2 config) confirm the implementation is correct and complete; live-runtime checks (worker startup, queue trigger, Supabase rows) confirm the full aggregation pipeline actually works end-to-end. Both are required — the artifact checks pass today; the runtime checks require the `node-ssh` blocker to be resolved first.

## Preconditions

**For artifact-driven tests (runnable now):**
- Monorepo at `/home/daniel/monster/` on the M005/S03 branch
- `pnpm install` completed

**For live-runtime tests (requires blocker fix):**
- `node-ssh` package installed or `@monster/deployment` moved to optional peer dependency in agents tsup config
- Upstash Redis credentials in `.env` (`UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`)
- Supabase service role key in `.env` (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`)
- At least one `analytics_events` row in Supabase for the target date (run tracker on a generated site first — S01 UAT)
- Admin panel running (`pm2 start monster-admin` or `pnpm dev` in `apps/admin`)
- Worker running (`pm2 start monster-worker` or `node packages/agents/dist/worker.js`)

## Smoke Test

```bash
pnpm --filter @monster/agents build && \
  node -e "const m = require('./packages/agents/dist/index.js'); console.log(typeof m.analyticsAggregationQueue)"
```
**Expected:** Build exits 0, prints `function`. This confirms the aggregation queue is exported and the built package is importable.

---

## Test Cases

### 1. Agents package build exits 0

```bash
cd /home/daniel/monster
pnpm --filter @monster/agents build
```

1. Run the command above.
2. **Expected:** `ESM ⚡️ Build success` for both `index` and `worker` entry points. Exit code 0. No TypeScript errors.

---

### 2. Admin package build exits 0

```bash
cd /home/daniel/monster
pnpm --filter @monster/admin build
```

1. Run the command above.
2. **Expected:** Next.js build exits 0. `/analytics` route listed as `ƒ (Dynamic)`. No type errors related to `AggregationTrigger`, `actions.ts`, or the `@monster/agents` import.

---

### 3. analyticsAggregationQueue export is callable

```bash
node -e "const m = require('./packages/agents/dist/index.js'); console.log(typeof m.analyticsAggregationQueue)"
```

1. Run after `pnpm --filter @monster/agents build`.
2. **Expected:** Prints `function`. Confirms the singleton factory is exported from the package index, making it importable by the admin server action without importing the job class.

---

### 4. All 8 observability log strings present in built worker bundle

```bash
grep -c "\[AnalyticsAggregationJob\]" packages/agents/dist/worker.js
```

1. Run after build.
2. **Expected:** Prints `8`. The 8 expected strings are: "running for date", "fetched N events", "no events for date — skipping", "upserted R rows", "ERROR: fetch failed", "ERROR: upsert failed", "scheduler registered", and the BullMQ-registered handler label.

---

### 5. upsertJobScheduler called with correct args in built output

```bash
grep "analytics-daily-aggregation\|0 2 \* \* \*" packages/agents/dist/worker.js
```

1. Run after build.
2. **Expected:** Both strings appear. Confirms the stable jobId and cron pattern are baked into the worker bundle — the scheduler will register correctly on startup.

---

### 6. pm2 monster-worker entry exists in ecosystem.config.js

```bash
grep -A 10 "monster-worker" ecosystem.config.js
```

1. Run the grep.
2. **Expected:** Output shows `name: 'monster-worker'`, a `script` or `interpreter` path pointing to the built worker, `autorestart: true`, `kill_timeout: 10000`, and log file paths under `logs/pm2-worker-*.log`.

---

### 7. actions.ts has 'use server' directive and exports only async functions

```bash
head -1 apps/admin/src/app/(dashboard)/analytics/actions.ts
grep "export" apps/admin/src/app/(dashboard)/analytics/actions.ts
```

1. Run both commands.
2. **Expected:** First line is `'use server';`. The `export` grep shows only `export async function enqueueAnalyticsAggregation` — no exported constants or objects (enforces D034).

---

### 8. AggregationTrigger wired into analytics page

```bash
grep "AggregationTrigger" apps/admin/src/app/(dashboard)/analytics/page.tsx
```

1. Run the grep.
2. **Expected:** Two matches — one import line and one JSX usage line. The button renders in the page header alongside `AnalyticsFilters`.

---

### 9. Worker startup registers scheduler (live-runtime — requires blocker fix)

```bash
pm2 start ecosystem.config.js --only monster-worker
sleep 5
pm2 logs monster-worker --lines 20 --nostream
```

1. Start the worker via pm2.
2. Wait 5 seconds for startup.
3. Check logs.
4. **Expected:** Within the first 20 log lines, see `[AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)`. No crash or pm2 restart loop.

---

### 10. Manual trigger enqueues job (live-runtime — requires blocker fix)

1. Open the admin panel at `http://localhost:3004/analytics` (or the VPS1 Tailscale URL).
2. Confirm the "Run Aggregation" button is visible in the page header.
3. Click "Run Aggregation".
4. **Expected:** Button shows "Queuing…" briefly, then displays "Queued for YYYY-MM-DD" (yesterday's date) in green below the button. No red error message.
5. In a terminal, run: `redis-cli KEYS "bull:analytics-aggregation:*"` (or Upstash console equivalent).
6. **Expected:** At least one key with pattern `bull:analytics-aggregation:waiting:*` or `bull:analytics-aggregation:active:*` appears, confirming the job entered the queue.

---

### 11. Worker processes job and upserts into analytics_daily (live-runtime — requires blocker fix + events data)

**Precondition:** At least one `analytics_events` row exists in Supabase for yesterday's date.

1. Ensure the worker is running (test 9 passed).
2. Click "Run Aggregation" in the admin panel (or call `enqueueAnalyticsAggregation()` directly).
3. Wait up to 30 seconds for the worker to process the job.
4. Check pm2 logs: `pm2 logs monster-worker --lines 30 --nostream | grep AnalyticsAggregationJob`
5. **Expected log sequence:**
   ```
   [AnalyticsAggregationJob] running for date YYYY-MM-DD
   [AnalyticsAggregationJob] fetched N events for date YYYY-MM-DD   (N > 0)
   [AnalyticsAggregationJob] upserted R rows for date YYYY-MM-DD    (R ≥ 1)
   ```
6. In Supabase table editor, run: `SELECT * FROM analytics_daily WHERE date = 'YYYY-MM-DD' ORDER BY pageviews DESC LIMIT 10;`
7. **Expected:** Rows exist for each `(site_id, date, page_path)` combination. `pageviews` matches the count of `pageview` events for that page. `unique_visitors` ≤ `pageviews`. `affiliate_clicks` matches count of `click_affiliate` events. `top_referrers` is a jsonb object (may be `{}` if no referrers). `top_countries` is `{}` (Phase 1 — all country values are null).

---

### 12. Idempotency: running aggregation twice for the same date produces the same rows (live-runtime)

1. After test 11 passes, record the `pageviews` and `unique_visitors` values from `analytics_daily` for yesterday.
2. Click "Run Aggregation" again (same target date).
3. Wait for the job to complete (check pm2 logs for "upserted R rows").
4. Re-query `analytics_daily` for the same date.
5. **Expected:** Row counts are identical. No duplicate rows. `pageviews`, `unique_visitors`, `affiliate_clicks` values are unchanged. The upsert overwrote with the same data — not appended.

---

### 13. Zero-event date returns early with structured log (live-runtime)

1. Call `enqueueAnalyticsAggregation('1970-01-01')` from the server action (or directly via queue.add with `data: { targetDate: '1970-01-01' }`).
2. Wait for the worker to process the job.
3. Check pm2 logs.
4. **Expected:**
   ```
   [AnalyticsAggregationJob] running for date 1970-01-01
   [AnalyticsAggregationJob] fetched 0 events for date 1970-01-01
   [AnalyticsAggregationJob] no events for date 1970-01-01 — skipping
   ```
   No upsert attempt. No error. Job marked as completed (not failed) by BullMQ.
5. In Supabase: `SELECT * FROM analytics_daily WHERE date = '1970-01-01';` — **Expected:** zero rows.

---

### 14. Nightly cron fires at 02:00 UTC without manual intervention (live-runtime — next-day verification)

1. Ensure worker is running via pm2 with `autorestart: true`.
2. Wait until after 02:00 UTC the following day (or temporarily set the cron pattern to a 1-minute interval for testing).
3. Check pm2 logs for the worker process at 02:00 UTC.
4. **Expected:** Log shows "[AnalyticsAggregationJob] running for date YYYY-MM-DD" without any manual trigger. `analytics_daily` has a new row for yesterday's date.

---

## Edge Cases

### AggregationTrigger shows error when Redis is down

1. Stop Redis / Upstash connection (simulate by setting `UPSTASH_REDIS_URL` to an invalid URL).
2. Restart the admin panel.
3. Click "Run Aggregation".
4. **Expected:** Button shows "Queuing…" briefly, then displays a red "Error: …" message below. No unhandled exception crashes the page. The server action returns `{ ok: false, error: '...' }`.

### Worker startup with no events does not crash scheduler registration

1. Ensure `analytics_events` is empty in Supabase.
2. Start the worker (`pm2 start monster-worker`).
3. **Expected:** Scheduler registers successfully ("scheduler registered" log line appears). Worker enters idle state waiting for jobs. No crash.

### Re-starting worker does not create duplicate schedulers

1. Start the worker, confirm scheduler is registered.
2. Stop and restart the worker (`pm2 restart monster-worker`).
3. **Expected:** Single `[AnalyticsAggregationJob] scheduler registered` log line appears (not two). BullMQ `upsertJobScheduler` with stable ID `'analytics-daily-aggregation'` is idempotent — no duplicate cron entries in Redis.
4. Verify: `KEYS bull:analytics-aggregation:repeat:*` — should show exactly one key.

---

## Failure Signals

- Red "Error: …" in AggregationTrigger UI → Redis unreachable or queue misconfigured; check `UPSTASH_REDIS_URL`
- pm2 `monster-worker` shows status `errored` with repeated restarts → `node-ssh` blocker not resolved, or Redis credentials missing
- "upserted 0 rows" in worker log despite events existing → check `analytics_daily` unique constraint `(site_id, date, page_path)` exists in Supabase schema
- `analytics_daily` rows have `pageviews: 0` or missing → check that `analytics_events.event_type = 'pageview'` rows exist for the target date; aggregation only counts `pageview` events for the pageviews column
- Job appears in `bull:analytics-aggregation:failed:*` → check worker logs for "[AnalyticsAggregationJob] ERROR:" line with the date and error message
- Worker does not process enqueued jobs → confirm worker is actually running and connected to the same Redis instance as the admin server action

---

## Requirements Proved By This UAT

- R009 (Analytics: lightweight GDPR-friendly tracking) — specifically the aggregation layer: `analytics_daily` rows are produced from `analytics_events`; the cron is registered; the trigger is manual-testable from the admin panel. Combined with S01+S02 UATs, this completes the full analytics pipeline implementation.

## Not Proven By This UAT

- Live site event ingestion (proven by S01 UAT — visit live site, confirm rows in `analytics_events`)
- Analytics dashboard rendering correct data (proven by S02 UAT — confirm counts match Supabase)
- Country breakdown in `analytics_daily` (`top_countries` is always `{}` in Phase 1 — R024 deferred)
- DataForSEO / Amazon product freshness (different milestone — M006)
- `node-ssh` blocker resolution (pre-existing M004 issue; runtime tests 9–14 are blocked until resolved)

## Notes for Tester

- Tests 1–8 are artifact-driven and runnable right now without any infrastructure.
- Tests 9–14 require the `node-ssh` ERR_MODULE_NOT_FOUND to be fixed first. Check `node packages/agents/dist/worker.js` — if it exits immediately with `Cannot find package 'node-ssh'`, the blocker is still present.
- The "yesterday" default in `enqueueAnalyticsAggregation` is computed server-side at call time (`new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)`). If you want to test a specific date, pass it explicitly as the `targetDate` argument.
- `top_countries` will always be `{}` in Phase 1 because all `analytics_events.country` values are `null` (D081). This is correct behavior — not a bug.
- `top_referrers` groups by URL origin (`new URL(ref).origin`). Direct traffic (empty/null referrer) is omitted from the jsonb object entirely. Only external referrers with valid URLs appear.
- The idempotency test (case 12) is the most important correctness check — confirm it before relying on the nightly cron in production.
