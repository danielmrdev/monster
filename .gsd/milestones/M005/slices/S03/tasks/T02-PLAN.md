---
estimated_steps: 4
estimated_files: 2
---

# T02: Add manual-trigger server action + analytics page trigger button

**Slice:** S03 — Daily Aggregation Cron
**Milestone:** M005

## Description

Add a `'use server'` action file for the analytics aggregation manual trigger and wire a "Run Aggregation" button into the existing analytics page. This closes the slice's demo path — from the admin panel, a user can trigger aggregation on-demand for yesterday (or a specific date), then inspect `analytics_daily` in Supabase to confirm rows appeared.

## Steps

1. **Create `apps/admin/src/app/(dashboard)/analytics/actions.ts`:**
   - Add `'use server'` directive at top
   - Import `analyticsAggregationQueue` from `@monster/agents`
   - Export `async function enqueueAnalyticsAggregation(targetDate?: string): Promise<{ ok: boolean; error?: string }>`:
     - Compute `date = targetDate ?? new Date(Date.now() - 86400000).toISOString().slice(0, 10)` (yesterday UTC)
     - Call `await analyticsAggregationQueue().add('run-now', { targetDate: date }, { removeOnComplete: true, removeOnFail: false })`
     - Return `{ ok: true }` on success; catch and return `{ ok: false, error: message }` on failure

2. **Update `apps/admin/src/app/(dashboard)/analytics/page.tsx`:**
   - Import `enqueueAnalyticsAggregation` from `./actions`
   - Add a small `AggregationTrigger` client component (inline in the page file or as a sibling component) with a "Run Aggregation" button that calls the action and shows a brief inline status message (`"Queued"` / `"Error: ..."`) — keep it simple, no toast library needed
   - Place the button in the page header area alongside the existing `AnalyticsFilters`

3. **Verify build:** `pnpm --filter @monster/admin build`

4. **Visual check:** Open analytics page in browser (if dev server is running) or confirm the button renders in the static build output

## Must-Haves

- [ ] `actions.ts` has `'use server'` directive (no non-async exports — D034)
- [ ] `enqueueAnalyticsAggregation` defaults to yesterday's UTC date when no `targetDate` provided
- [ ] `analyticsAggregationQueue` imported from `@monster/agents` (not from the job class directly)
- [ ] Button visible on analytics page
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

```bash
pnpm --filter @monster/admin build
# → exit 0, no type errors

# Confirm actions.ts has 'use server' and only exports async functions
grep "'use server'" apps/admin/src/app/(dashboard)/analytics/actions.ts
grep "export async function" apps/admin/src/app/(dashboard)/analytics/actions.ts
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `enqueueSiteGeneration` pattern (create queue item, return ok/error shape)
- `packages/agents/src/index.ts` (T01 output) — `analyticsAggregationQueue` export
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — existing page layout to find the right insertion point for the button
- D034 — `'use server'` files can only export async functions; constants must go in a sibling file

## Observability Impact

- **New signal added:** Clicking "Run Aggregation" calls `enqueueAnalyticsAggregation()` → server action logs nothing directly, but the job appears in BullMQ under queue `analytics-aggregation`. Inspect via: `KEYS bull:analytics-aggregation:*` in Redis, or `pm2 logs monster-worker --lines 20 | grep AnalyticsAggregationJob`.
- **Success state visible to a future agent:** After a successful enqueue, the button shows inline `"Queued for YYYY-MM-DD"`. The job transitions through BullMQ states (waiting → active → completed). Completed jobs are removed (`removeOnComplete: true`); failed jobs persist (`removeOnFail: false`) and are visible via `KEYS bull:analytics-aggregation:failed:*`.
- **Error state:** If `analyticsAggregationQueue().add()` throws (Redis unreachable, queue not initialized), the server action returns `{ ok: false, error: message }` and the UI displays `"Error: <message>"` inline next to the button — no toast library needed.
- **Failure inspection:** After a failed trigger attempt, the inline error message in the UI is the first diagnostic signal. Then check pm2 logs for the worker error, and Redis for failed job keys.

## Expected Output

- `apps/admin/src/app/(dashboard)/analytics/actions.ts` — new server action file with `enqueueAnalyticsAggregation`
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — "Run Aggregation" button added to page header area
- `pnpm --filter @monster/admin build` exits 0
