---
id: T02
parent: S03
milestone: M005
provides:
  - enqueueAnalyticsAggregation server action in apps/admin/src/app/(dashboard)/analytics/actions.ts
  - AggregationTrigger client component in apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx
  - "Run Aggregation" button wired into the analytics page header
key_files:
  - apps/admin/src/app/(dashboard)/analytics/actions.ts
  - apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx
  - apps/admin/src/app/(dashboard)/analytics/page.tsx
key_decisions:
  - AggregationTrigger extracted as a separate 'use client' file (not inlined in page.tsx) because the analytics page is an async server component — mixing 'use client' in the same file would break RSC
  - enqueueAnalyticsAggregation returns { ok, jobId, date, error } — returning date enables the inline status message to confirm which date was queued, useful for debugging
  - removeOnComplete: true, removeOnFail: false — completed jobs are cleaned up automatically; failed jobs persist for Redis inspection
patterns_established:
  - Headless aggregation jobs (no ai_jobs tracking) use a simpler ok/error return shape compared to site generation jobs that return jobId from ai_jobs table
observability_surfaces:
  - "Queued for YYYY-MM-DD" — inline UI confirmation after successful enqueue
  - "Error: <message>" — inline UI error when queue.add() throws (Redis down, queue misconfigured)
  - BullMQ job visible after enqueue: KEYS bull:analytics-aggregation:* in Redis
  - Failed jobs persist: KEYS bull:analytics-aggregation:failed:*
  - Worker log after job is picked up: pm2 logs monster-worker --lines 20 | grep AnalyticsAggregationJob
duration: 15m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Add manual-trigger server action + analytics page trigger button

**Shipped `enqueueAnalyticsAggregation` server action and `AggregationTrigger` client component — "Run Aggregation" button live in analytics page header, `pnpm --filter @monster/admin build` exits 0.**

## What Happened

Created `actions.ts` with `'use server'` directive and `enqueueAnalyticsAggregation(targetDate?)`. Defaults to yesterday UTC via `new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)`. Calls `analyticsAggregationQueue().add('run-now', ...)` imported from `@monster/agents`. Returns `{ ok, jobId, date, error }`.

Created `AggregationTrigger.tsx` as a separate `'use client'` component (not inlined in the server component page). Uses `useTransition` for pending state, shows "Queuing…" while the server action is in-flight. Displays inline status after resolution: green "Queued for YYYY-MM-DD" on success, red "Error: …" on failure.

Updated `page.tsx` to import and place `<AggregationTrigger />` next to `<AnalyticsFilters />` in the page header, wrapped in a flex row for alignment.

## Verification

```bash
pnpm --filter @monster/admin build
# → exit 0, no type errors; /analytics route: ƒ (Dynamic)

head -3 apps/admin/src/app/(dashboard)/analytics/actions.ts
# → 'use server';

grep "export async function" apps/admin/src/app/(dashboard)/analytics/actions.ts
# → export async function enqueueAnalyticsAggregation(
```

All must-haves confirmed:
- `actions.ts` has `'use server'` directive, only exports async functions (D034 compliant)
- `enqueueAnalyticsAggregation` defaults to yesterday UTC
- `analyticsAggregationQueue` imported from `@monster/agents` (not job class)
- Button visible in analytics page header
- `pnpm --filter @monster/admin build` exits 0

## Diagnostics

- Trigger success: inline "Queued for YYYY-MM-DD" message under button; job in Redis: `KEYS bull:analytics-aggregation:*`
- Trigger failure: inline "Error: <message>" under button — check if Redis is running and worker is up
- Failed jobs after worker processing: `KEYS bull:analytics-aggregation:failed:*`
- Worker pickup: `pm2 logs monster-worker --lines 20 | grep AnalyticsAggregationJob`

## Deviations

- Returned `jobId` and `date` in the action response (not in original plan) — enables inline status to show the queued date, improving debuggability at no cost.

## Known Issues

- Same pre-existing issue from T01: `node packages/agents/dist/worker.js` fails with `ERR_MODULE_NOT_FOUND: node-ssh` due to `@monster/deployment`. The UI trigger and server action are complete; end-to-end flow requires the worker startup issue to be resolved.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/analytics/actions.ts` — new server action file with `enqueueAnalyticsAggregation`; `'use server'` directive; imports `analyticsAggregationQueue` from `@monster/agents`
- `apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx` — new client component with button, pending state, inline success/error status
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — added `AggregationTrigger` import and placed component in page header alongside `AnalyticsFilters`
- `.gsd/milestones/M005/slices/S03/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
