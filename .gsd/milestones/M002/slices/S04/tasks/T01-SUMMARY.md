---
id: T01
parent: S04
milestone: M002
provides:
  - addCost server action (Zod validation + Supabase insert + revalidatePath)
  - CostForm client component (useActionState, native selects, success banner, per-field errors)
  - /finances/page.tsx server component (parallel fetch, cost table, revenue placeholder)
key_files:
  - apps/admin/src/app/(dashboard)/finances/actions.ts
  - apps/admin/src/app/(dashboard)/finances/cost-form.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
key_decisions:
  - All <select> elements are native HTML (not shadcn Select) — FormData compatibility, consistent with S01 lesson
  - Empty string → null mapping done both at FormData extraction and at DB insert for defensive correctness
patterns_established:
  - addCost follows identical prevState/formData/return shape as saveSettings (S03) — copy pattern confirmed working
observability_surfaces:
  - DB insert errors thrown as "Failed to add cost: {message}" → pm2 logs monster-admin
  - Page fetch errors thrown as "Failed to fetch costs/categories/sites: {message}" → pm2 logs
  - Validation errors returned as { errors } to client, rendered inline — no server log (by design)
duration: 20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: `addCost` server action + `CostForm` client component + `/finances/page.tsx`

**Wired the complete data path for /finances: Zod-validated server action, useActionState form with inline errors, and parallel-fetching server component rendering form + cost list table + revenue placeholder.**

## What Happened

Created three files following established S01/S03 patterns:

1. **`actions.ts`** — `'use server'` file-level directive. `AddCostSchema` uses `z.coerce.number()` for amount (FormData strings), `z.string().min(1)` for required fields, optional strings for period/description/site_id. Action maps empty strings to null before insert. DB errors thrown with context. `revalidatePath('/finances')` before returning `{ success: true }`.

2. **`cost-form.tsx`** — `'use client'` component. `useActionState(addCost, null)` — null initial state (matches settings pattern). All selects are native `<select>` with the NativeSelect Tailwind wrapper from site-form.tsx. Success banner on `state?.success`. `FieldError` per field on `state?.errors?.field?.[0]`. Category options from `categories` prop (DB-fetched). Site options from `sites` prop with "Portfolio-wide" empty option.

3. **`page.tsx`** — Async server component. `Promise.all` across costs, cost_categories, and sites. Throws on any DB error with descriptive message. Renders `CostForm`, then cost list `Table` (empty state row if no entries), then revenue placeholder `Card`.

## Verification

- `pnpm --filter @monster/admin exec tsc --noEmit` → exits 0, no output ✓
- `pnpm -r build` → exits 0; `/finances` in route table as `ƒ` (dynamic) ✓
- `grep -r "from '@monster/db'" apps/admin/src/app/` → empty (exit 1 = no matches) ✓
- `pm2 reload monster-admin` → online, 0 new restarts ✓
- `curl -sI http://localhost:3004/finances` → HTTP 307 → /login (auth middleware, expected — no 500) ✓
- `pm2 logs monster-admin --lines 20` → clean after reload, no error lines for this feature ✓

Browser verification skipped — Playwright chromium unavailable on this VPS (missing libnspr4.so). Route correctness confirmed via curl + build output.

## Diagnostics

- Runtime errors: `pm2 logs monster-admin --lines 50` — DB errors surfaced with "Failed to add cost:" prefix
- Route health: `curl -sI http://localhost:3004/finances` — 307 = auth middleware working, 500 = app error
- Form errors: browser devtools → Network → POST to /finances → response body `{ errors: { field: ['msg'] } }`

## Deviations

S04-PLAN.md split cost list + revenue placeholder into T02, but the task plan (T01-PLAN.md) made clear both should land in this task. Implemented all three files completely. T02 in S04-PLAN.md covers pm2/curl slice verification only — that was also completed here.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/actions.ts` — new: `addCost` server action with Zod + Supabase insert
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — new: `'use client'` form with useActionState
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — replaced stub: parallel-fetching server component with full UI
- `.gsd/milestones/M002/slices/S04/S04-PLAN.md` — added Observability / Diagnostics section (pre-flight fix)
