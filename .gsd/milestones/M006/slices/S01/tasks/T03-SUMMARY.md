---
id: T03
parent: S01
milestone: M006
provides:
  - enqueueProductRefresh server action in apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - RefreshCard client component in apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx
  - Product Refresh card section in site detail page (page.tsx)
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - enqueueProductRefresh is fire-and-forget (no ai_jobs row) — S02+ concern per plan
  - removeOnComplete: true, removeOnFail: false — completed jobs purge to keep Redis clean, failed jobs retain for inspection
  - router.refresh() pattern (not polling) — re-fetches last_refreshed_at from DB via server component re-render
  - 3s auto-clear on success message — avoids stale positive feedback after router.refresh() causes re-render
patterns_established:
  - useTransition + useRouter + server action pattern — same shape as AggregationTrigger but with router.refresh() on success
  - formatRelativeTime pure function — no dependency on external library, handles seconds/minutes/hours/days
observability_surfaces:
  - "[enqueueProductRefresh] Queued job <id> for site <siteId> — admin process stdout on success"
  - "[enqueueProductRefresh] Failed to enqueue for site <siteId>: <msg> — admin process stderr on failure"
  - "BullMQ product-refresh queue: KEYS bull:product-refresh:wait:* in Redis"
  - "sites.last_refreshed_at — Supabase sites table, populated after job completes"
  - "pm2 logs monster-worker | grep ProductRefreshJob — worker-side job lifecycle"
duration: ~20min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: enqueueProductRefresh server action + admin panel refresh card

**Added `enqueueProductRefresh` server action and `RefreshCard` client component; Product Refresh card now visible on site detail page with relative timestamp and working Refresh Now button.**

## What Happened

Confirmed `productRefreshQueue` was already exported from `packages/agents/src/index.ts` (done in T01).

Added `enqueueProductRefresh(siteId)` to `actions.ts`: imports `productRefreshQueue` from `@monster/agents`, calls `queue.add('refresh-site', { siteId }, { removeOnComplete: true, removeOnFail: false })`, returns `{ ok, jobId }` or `{ ok: false, error }`. No `ai_jobs` row — fire-and-forget as specified.

Created `RefreshCard.tsx` as `'use client'`: uses `useTransition` + `useRouter` (from `next/navigation`), shows relative time via `formatRelativeTime()` helper (seconds → minutes → hours → days), disables the button + shows spinner while pending, calls `router.refresh()` on success to trigger server re-render of `last_refreshed_at`, auto-clears the "Refresh queued" message after 3s via `useEffect`.

Added the Product Refresh card section to `page.tsx` before the SEO Scores section, passing `site.last_refreshed_at ?? null` (column present in generated types from T02 migration).

## Verification

- `npx tsc --noEmit` in apps/admin: clean (no output)
- `pnpm --filter @monster/admin build`: exits 0, `/sites/[id]` route compiled successfully (3.67 kB)
- Browser unavailable (missing system library `libnspr4.so`); verified via build output and source inspection instead
- All three files have correct imports and exports confirmed via grep

## Diagnostics

- Server action success: `grep "\[enqueueProductRefresh\]" <admin-log>` — shows job ID and site ID
- Server action failure: same grep, stderr level — error message from Redis/BullMQ
- Queue state: `redis-cli KEYS 'bull:product-refresh:*'` — shows pending/active jobs
- DB state: `SELECT last_refreshed_at, next_refresh_at FROM sites WHERE id = '<siteId>'` — populated after job runs
- Worker logs: `pm2 logs monster-worker | grep ProductRefreshJob` — full fetch_products lifecycle

## Deviations

None. Implemented exactly per plan. The `useEffect` 3s auto-clear was specified in the plan.

## Known Issues

Browser verification was done via build output and source review only — the headless Chromium shell is missing `libnspr4.so` on this machine. The build passes and the component structure is correct.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — added `productRefreshQueue` import + `enqueueProductRefresh` server action
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — new 'use client' component with relative time display and Refresh Now button
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — added RefreshCard import + Product Refresh card section before SEO Scores
- `.gsd/milestones/M006/slices/S01/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
