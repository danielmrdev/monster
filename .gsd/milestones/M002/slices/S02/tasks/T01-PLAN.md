---
estimated_steps: 4
estimated_files: 1
---

# T01: Replace dashboard stub with real KPI cards

**Slice:** S02 — Dashboard KPIs
**Milestone:** M002

## Description

The dashboard page (`apps/admin/src/app/(dashboard)/dashboard/page.tsx`) is currently a 4-line stub returning "Coming soon". Replace it entirely with a server component that fetches four count-only queries from Supabase in parallel and renders them as KPI cards using the already-installed `Card` component family.

No new patterns, no new files, no new components. Everything needed — `createServiceClient()`, `Card` components, the `sites` and `product_alerts` tables — is already in place from S01.

## Steps

1. Read the current stub at `apps/admin/src/app/(dashboard)/dashboard/page.tsx` and `apps/admin/src/app/(dashboard)/sites/page.tsx` (reference for the established server component pattern)
2. Replace the stub with an `async` server component:
   - Import `createServiceClient` from `@/lib/supabase/service`
   - Import `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card`
   - Fire four count queries in `Promise.all`:
     - `supabase.from('sites').select('*', { count: 'exact', head: true })` → total
     - Same + `.eq('status', 'live')` → live count
     - Same + `.eq('status', 'draft')` → draft count
     - `supabase.from('product_alerts').select('*', { count: 'exact', head: true }).eq('status', 'open')` → open alerts
   - Throw `new Error('Failed to fetch dashboard KPIs: ' + error.message)` if any query returns an error
   - Coerce each `count ?? 0` before display
3. Render a `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">` with one `Card` per KPI: label in `CardTitle`, number in `CardContent`
4. Run `pnpm tsc --noEmit` in `apps/admin`, then `pnpm -r build`, then `pm2 reload monster-admin`

## Must-Haves

- [ ] All four queries use `.select('*', { count: 'exact', head: true })` — no row fetching
- [ ] All four queries fire in `Promise.all` — no sequential awaits
- [ ] Error from any query throws with a descriptive message (query name + error.message)
- [ ] Each count coerced with `?? 0` — no null rendered
- [ ] No `'use client'` directive — pure server component
- [ ] `createServiceClient()` imported from `@/lib/supabase/service` (not from `@monster/db`)

## Verification

- `cd apps/admin && pnpm tsc --noEmit` → exits 0, no output
- `pnpm -r build` → exits 0; `/dashboard` appears in route build output
- `pm2 reload monster-admin` → process stays online, 0 unexpected restarts
- `curl -sI http://localhost:3004/dashboard` → `HTTP/1.1 307` (auth guard fires = route resolves; no 500)
- `pm2 logs monster-admin --lines 20` → no thrown errors

## Inputs

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — current 4-line stub to replace
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — canonical server component pattern: createServiceClient, destructure { data, error }, throw on error, render
- `apps/admin/src/lib/supabase/service.ts` — canonical `createServiceClient()` import path
- `apps/admin/src/components/ui/card.tsx` — Card, CardHeader, CardTitle, CardContent available
- S01-SUMMARY.md Forward Intelligence: service client import path, error throw pattern, no `@monster/db` direct imports in `apps/admin/src/app/`

## Observability Impact

**What changes:** The dashboard route transitions from a static stub to a live Supabase read path. Any DB error is now visible at runtime.

**How a future agent inspects this:**
- `pm2 logs monster-admin --lines 30` → look for `Failed to fetch dashboard KPIs:` to diagnose DB errors
- `curl -sI http://localhost:3004/dashboard` → 307 = route healthy; 500 = server component threw
- Browser → `/dashboard` (authenticated) → four KPI cards with live counts; "Coming soon" text should be gone

**Failure state that becomes visible:**
- Supabase misconfiguration: throws with `Failed to fetch dashboard KPIs: <supabase error>` in pm2 logs + 500 HTTP response
- `product_alerts` table absent: same throw path, not a silent zero
- Partial DB failure: `Promise.all` rejects on the first error; all-or-nothing, no partial renders

**No secrets logged.** Error throw only includes Supabase's own error message text.

## Expected Output

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — async server component with 4-column KPI card grid, real Supabase counts, no stub
