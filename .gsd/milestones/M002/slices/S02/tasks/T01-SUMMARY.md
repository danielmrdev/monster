---
id: T01
parent: S02
milestone: M002
provides:
  - Dashboard page with four real Supabase KPI cards (total sites, live sites, draft sites, open alerts)
key_files:
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
key_decisions:
  - Per-query error throws (not a single combined throw) to surface which query failed in pm2 logs
patterns_established:
  - Promise.all with destructured count results + per-error throw: same pattern usable for future dashboard expansions
observability_surfaces:
  - pm2 logs monster-admin — "Failed to fetch dashboard KPIs (<query name>):" prefix for any DB error
  - curl -sI http://localhost:3004/dashboard → 307 = healthy; 500 = server component threw
duration: 15m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Replace dashboard stub with real KPI cards

**Replaced the 4-line "Coming soon" stub with an async server component that fetches four Supabase count queries in parallel and renders them as KPI cards.**

## What Happened

Wrote `apps/admin/src/app/(dashboard)/dashboard/page.tsx` as a pure async server component. Followed the established pattern from `sites/page.tsx` exactly: `createServiceClient()` from `@/lib/supabase/service`, destructured results, throw on error, render with Card components.

Four count queries fire in `Promise.all` using `.select('*', { count: 'exact', head: true })` — no rows fetched:
- Total sites
- Live sites (`eq('status', 'live')`)
- Draft sites (`eq('status', 'draft')`)
- Open alerts from `product_alerts` (`eq('status', 'open')`)

Each error throw includes the query name for diagnostic clarity. Each count coerced with `?? 0`. Grid is `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`.

## Verification

- `cd apps/admin && pnpm tsc --noEmit` → exits 0, no output
- `pnpm -r build` → exits 0; `/dashboard` appears as `ƒ` (dynamic server-rendered) in build output
- `pm2 reload monster-admin` → process stayed online, restarted cleanly (`✓ Ready in 696ms`)
- `curl -sI http://localhost:3004/dashboard` → `HTTP/1.1 307 Temporary Redirect` to `/login` (auth guard fires = route resolves, no 500)
- `pm2 logs monster-admin --lines 20` → no `Failed to fetch dashboard KPIs` errors post-reload

## Diagnostics

- `pm2 logs monster-admin --lines 30` and grep for `Failed to fetch dashboard KPIs` — any Supabase error surfaces here with query name and error message
- `curl -sI http://localhost:3004/dashboard` — 307 means healthy, 500 means DB or component error
- Pre-existing `EvalError` entries in pm2 error log (timestamps `23:46–23:47`) are from the middleware, unrelated to this task and predating this reload

## Deviations

Per-query error throws instead of a single combined throw after `Promise.all`. The plan said one throw pattern; using per-query throws makes the failing query name explicit in logs without extra logic. Strictly better observability, no downside.

## Known Issues

Pre-existing `EvalError: Code generation from strings disallowed for this context` in middleware — predates this slice, not introduced here.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — replaced stub with async server component, 4-column KPI card grid, real Supabase counts
- `.gsd/milestones/M002/slices/S02/S02-PLAN.md` — added `## Observability / Diagnostics` section (pre-flight fix)
- `.gsd/milestones/M002/slices/S02/tasks/T01-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
