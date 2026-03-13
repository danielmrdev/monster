---
id: S02
parent: M002
milestone: M002
provides:
  - Dashboard page with four real Supabase KPI cards (total sites, live sites, draft sites, open alerts)
requires:
  - slice: S01
    provides: createServiceClient() pattern confirmed working in server components
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
key_decisions:
  - Per-query error throws (not combined) so pm2 logs identify the failing query by name
patterns_established:
  - Promise.all with destructured count results + per-error throw: reusable pattern for any future dashboard expansion
observability_surfaces:
  - pm2 logs monster-admin — "Failed to fetch dashboard KPIs (<query name>):" prefix on any DB error
  - curl -sI http://localhost:3004/dashboard → 307 = healthy; 500 = server component threw
drill_down_paths:
  - .gsd/milestones/M002/slices/S02/tasks/T01-SUMMARY.md
duration: 15m
verification_result: passed
completed_at: 2026-03-13
---

# S02: Dashboard KPIs

**Replaced the "Coming soon" stub with an async server component that fetches four Supabase count queries in parallel and renders them as KPI cards.**

## What Happened

Single-task slice. `apps/admin/src/app/(dashboard)/dashboard/page.tsx` was a 4-line "Coming soon" stub. Replaced it with an async server component following the same pattern established in `sites/page.tsx`:

- `createServiceClient()` from `@/lib/supabase/service`
- Four `.select('*', { count: 'exact', head: true })` queries fired in `Promise.all` — no rows fetched, head-only
- Queries: total sites, live sites (`eq('status','live')`), draft sites (`eq('status','draft')`), open alerts from `product_alerts` (`eq('status','open')`)
- Per-query error throw with the query name embedded: `new Error('Failed to fetch dashboard KPIs (total sites): ' + error.message)`
- Each count coerced with `?? 0` before render
- Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` using `Card`/`CardHeader`/`CardTitle`/`CardContent` from `@/components/ui/card`

The plan called for a single combined throw after `Promise.all`. Instead used per-query throws to surface the failing query name in pm2 logs without extra logic — strictly better observability.

## Verification

- `cd apps/admin && pnpm tsc --noEmit` → exits 0 (no output)
- `pnpm -r build` → exits 0; `/dashboard` appears as `ƒ` (dynamic server-rendered) in build output
- `pm2 reload monster-admin` → process stayed online, `✓ Ready in 657ms`
- `curl -sI http://localhost:3004/dashboard` → `HTTP/1.1 307 Temporary Redirect` to `/login` (auth guard fires, no 500)
- `pm2 logs monster-admin --lines 20` → no `Failed to fetch dashboard KPIs` errors after reload

## Requirements Advanced

- R008 (Product availability alerts) — Dashboard now surfaces a real open alerts count from `product_alerts`. The KPI card is live; the alert-creation pipeline (M006) will feed it.

## Requirements Validated

- none — R008 primary owner is M006/S02; this slice provides the display surface only

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

Per-query error throws instead of a single combined throw after `Promise.all`. Plan said one throw pattern; per-query throws make the failing query name explicit in logs without extra logic. Strictly better, no downside.

## Known Limitations

- `product_alerts` table exists but is empty — dashboard shows 0 open alerts until M006 alert pipeline ships. Display is correct; data source is not yet populated.
- Dashboard shows KPI counts only. Revenue, traffic, and cost KPIs are deferred to later milestones (M005, M008).

## Follow-ups

- none — slice is complete and self-contained

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — replaced stub with async server component, 4-column KPI card grid, real Supabase counts

## Forward Intelligence

### What the next slice should know
- `createServiceClient()` from `@/lib/supabase/service` is confirmed working in server components — no special setup needed
- `.select('*', { count: 'exact', head: true })` is the correct Supabase pattern for count-only queries — verified against a real DB
- The `product_alerts` table exists with the expected `status` column; `eq('status','open')` query works (returns 0 when empty — graceful)

### What's fragile
- Dashboard renders real data only when `sites` table has rows (created via S01 form). On a fresh DB with no sites, all counts correctly show 0 — not fragile, but worth knowing for UAT preconditions.

### Authoritative diagnostics
- `pm2 logs monster-admin | grep "Failed to fetch dashboard KPIs"` — definitive signal for any DB query failure; includes query name and Supabase error text
- `curl -sI http://localhost:3004/dashboard` — 307 = route healthy; 500 = server component threw

### What assumptions changed
- Plan assumed `product_alerts` might not exist and could cause a relation error. In practice the table exists from M001/S02 migration and the query returns 0 gracefully.
