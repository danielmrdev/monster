---
estimated_steps: 5
estimated_files: 4
---

# T03: enqueueProductRefresh server action + admin panel refresh card

**Slice:** S01 — Worker Fix + Refresh Job Scaffold + Cron Scheduler
**Milestone:** M006

## Description

Closes the slice by making it demoable through the admin panel. Two pieces:

1. `enqueueProductRefresh(siteId)` server action — adds a job to `productRefreshQueue()`. No `ai_jobs` row in S01 (the job is short and fire-and-forget; job tracking is a S02+ concern). Returns `{ ok: boolean; jobId?: string; error?: string }`.

2. `RefreshCard` client component — shows `sites.last_refreshed_at` formatted as relative time ("Last refreshed: 3 hours ago" / "Never refreshed"), a "Refresh Now" button that calls the server action via `useTransition`, and inline feedback (spinner while pending, "Refresh queued" on success, error message on failure).

The card must re-fetch `last_refreshed_at` after a successful refresh to show updated time. Use `router.refresh()` (Next.js App Router pattern) after a successful enqueue to trigger a server-side re-render of the page with fresh DB data.

`productRefreshQueue` must be exported from `packages/agents/src/index.ts` (done in T01) so the admin server action can import it.

## Steps

1. Ensure `productRefreshQueue` is exported from `packages/agents/src/index.ts` (verify T01 did this; add if missing).

2. Add `enqueueProductRefresh(siteId: string)` to `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`:
   - Import `productRefreshQueue` from `@monster/agents`
   - Add job to queue: `await productRefreshQueue().add('refresh-site', { siteId }, { removeOnComplete: true, removeOnFail: false })`
   - Return `{ ok: true, jobId: job.id }` on success, `{ ok: false, error: message }` on failure
   - No `ai_jobs` row — this is a lightweight fire-and-forget trigger

3. Create `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` as a `'use client'` component:
   - Props: `{ siteId: string; lastRefreshedAt: string | null }`
   - Format `lastRefreshedAt` as relative time: compute `Math.floor((Date.now() - new Date(lastRefreshedAt).getTime()) / 1000 / 60)` minutes; display "X minutes ago" / "X hours ago" / "X days ago" or "Never refreshed"
   - "Refresh Now" button: `useTransition` to call `enqueueProductRefresh(siteId)`; disabled + spinner while pending
   - On success: call `router.refresh()` to reload server component data; show "Refresh queued" inline for 3s
   - On error: show error message inline
   - Import `useRouter` from `next/navigation`

4. Import `RefreshCard` into `page.tsx` and add a "Product Refresh" section card before the SEO Scores section. Pass `lastRefreshedAt={site.last_refreshed_at ?? null}` and `siteId={site.id}`. The `site` object from Supabase will include `last_refreshed_at` after the migration is applied — if the column isn't yet in generated types, cast appropriately.

5. Run typechecks and verify the page renders.

## Must-Haves

- [ ] `enqueueProductRefresh` server action in `actions.ts` — adds job to `productRefreshQueue()`
- [ ] `RefreshCard.tsx` client component exists with relative time display and "Refresh Now" button
- [ ] "Refresh Now" button triggers server action with `useTransition` (no full page reload)
- [ ] Success state calls `router.refresh()` to show updated `last_refreshed_at`
- [ ] Error state shows inline message
- [ ] "Product Refresh" card visible in site detail page
- [ ] `pnpm --filter apps/admin typecheck` exits 0
- [ ] `pnpm --filter apps/admin build` exits 0

## Verification

- `pnpm --filter apps/admin typecheck` exits 0
- `pnpm --filter apps/admin build` exits 0
- Visit `/sites/<id>` in the browser — "Product Refresh" card renders with timestamp or "Never refreshed"
- Click "Refresh Now" — button shows spinner during pending, then "Refresh queued" message appears and timestamp updates on page refresh

## Inputs

- T01 outputs: `productRefreshQueue` exported from `@monster/agents`
- T02 outputs: `ProductRefreshJob` running in worker — clicking Refresh Now produces pm2 log lines
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — existing server actions to follow for pattern
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` + `AggregationTrigger.tsx` — D089 pattern for 'use client' leaf component with `useTransition` in a server component page
- D089 — `'use client'` must be a separate file, not inlined in an async server component

## Observability Impact

**New signals introduced:**
- `console.log([enqueueProductRefresh] Queued job <jobId> for site <siteId>)` — server action success; visible in admin process logs
- `console.error([enqueueProductRefresh] Failed to enqueue for site <siteId>: <message>)` — server action failure; visible in admin process logs
- BullMQ `product-refresh` queue gains a `refresh-site` job entry — inspect via Redis: `KEYS bull:product-refresh:wait:*`
- `sites.last_refreshed_at` updates in DB after worker completes the job — observable in Supabase dashboard or SQL

**How a future agent inspects this:**
- Admin log (server action path): check stdout for `[enqueueProductRefresh]` lines
- Worker completion: `pm2 logs monster-worker | grep ProductRefreshJob` — shows fetch_products lifecycle
- DB state: `SELECT last_refreshed_at, next_refresh_at FROM sites WHERE id = '<siteId>'`
- UI confirmation: visit `/sites/<id>` — "Last refreshed: X minutes ago" timestamp updates after `router.refresh()`

**Failure state exposed:**
- Queue add failure → `{ ok: false, error: message }` returned to client → error shown inline in RefreshCard
- Worker job failure → logged in pm2, job stays in BullMQ failed set (removeOnFail: false)
- Redis unreachable → `enqueueProductRefresh` throws, caught, returns `{ ok: false }`

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `enqueueProductRefresh` added
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — new client component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — "Product Refresh" card section added
- Admin panel site detail page: renders refresh timestamp and working "Refresh Now" button
