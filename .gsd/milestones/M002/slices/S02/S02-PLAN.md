# S02: Dashboard KPIs

**Goal:** Replace the "Coming soon" stub in the dashboard page with real KPI cards fetched from Supabase — total sites, live sites, draft sites, open alerts.
**Demo:** Load `/dashboard` → four KPI cards render with real counts from Supabase; no hardcoded zeros, no stub text.

## Must-Haves

- Four KPI counts fetched via `createServiceClient()`: total sites, live sites, draft sites, open alerts
- All four queries fire in parallel (`Promise.all`) — no sequential waterfall
- `count` coerced to `0` with `?? 0` before display — no `null` rendered
- `product_alerts` open count renders gracefully when the table is empty (count = 0)
- Error on any count query throws with a descriptive message surfaced in pm2 logs
- Server component only — no `'use client'`, no state, no client bundle

## Verification

- `cd apps/admin && pnpm tsc --noEmit` → exits 0
- `pnpm -r build` → exits 0, `/dashboard` route appears in build output
- `pm2 reload monster-admin && curl -sI http://localhost:3004/dashboard` → 307 to /login (route resolves, no 500)
- `pm2 logs monster-admin --lines 20` → no thrown errors after reload

## Tasks

- [x] **T01: Replace dashboard stub with real KPI cards** `est:20m`
  - Why: The entire slice is this one file — read four counts from Supabase, render with Card components
  - Files: `apps/admin/src/app/(dashboard)/dashboard/page.tsx`
  - Do: Replace the stub with a server component that: (1) calls `createServiceClient()` from `@/lib/supabase/service`, (2) runs four count-only queries in `Promise.all` — total sites, live sites (`eq('status','live')`), draft sites (`eq('status','draft')`), open alerts (`product_alerts` where `eq('status','open')`), all using `.select('*', { count: 'exact', head: true })`; (3) throws `new Error('Failed to fetch dashboard KPIs: ' + error.message)` if any query fails; (4) coerces each `count ?? 0`; (5) renders a 4-column `<div className="grid grid-cols-4 gap-4">` using `Card`/`CardHeader`/`CardTitle`/`CardContent` from `@/components/ui/card` — one card per KPI with label + count
  - Verify: `pnpm tsc --noEmit` in `apps/admin` exits 0; `pnpm -r build` exits 0 with `/dashboard` in build output; `pm2 reload monster-admin` + `curl -sI http://localhost:3004/dashboard` returns 307 (not 500); `pm2 logs monster-admin --lines 20` shows no errors
  - Done when: typecheck passes, build succeeds, pm2 reload clean, no pm2 errors

## Observability / Diagnostics

**Runtime signals:**
- `pm2 logs monster-admin` — any `Failed to fetch dashboard KPIs:` error surfaces here with the Supabase error message attached; no silent swallowing
- Next.js error boundary renders an error page in the browser if the server component throws — distinct from the 307 redirect (means the route resolved but DB failed)

**Inspection surfaces:**
- `curl -sI http://localhost:3004/dashboard` → `307` means route resolves (auth guard fires); `500` means server component threw
- `pm2 status` → `monster-admin` stays `online` after reload; unexpected restarts indicate a boot-time crash
- Supabase dashboard → `sites` and `product_alerts` tables can be queried directly to verify counts match what the UI shows

**Failure visibility:**
- Supabase credential failure: `createServiceClient()` throws or returns an auth error → `Failed to fetch dashboard KPIs: ...` in pm2 logs
- Missing `product_alerts` table: Supabase returns a relation error → same throw path; does not silently render `0`
- DB unreachable: connection timeout → Next.js surfaces a 500 after the default fetch timeout

**Redaction:** No secrets logged. Error messages contain only Supabase error text (no credentials, no env var values).

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx`
