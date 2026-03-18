---
id: T02
parent: S03
milestone: M014
provides:
  - refresh_interval_hours field wired through edit form (days), server action (hours conversion), and Deploy tab display
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - Input accepts days (UX-friendly), DB stores hours; conversion happens in updateSite server action
  - Invalid/missing input silently coerced to 2 days (48h) via Math.max(1, isNaN(rawDays) ? 2 : rawDays) — no user-facing error on bad input
patterns_established:
  - none
observability_surfaces:
  - Deploy tab shows live "Refresh interval: N days" from DB; mismatch reveals a bad save or coercion
  - Failed updateSite throws structured error: "Failed to update site <id>: <msg> (code: <code>)" — visible in server stdout and Next.js error boundary
  - Inspect current value: SELECT id, name, refresh_interval_hours FROM sites WHERE id = '<id>';
duration: ~10m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Add Refresh Interval Field — Form, Action, DB, Deploy Tab Display

**Wired `refresh_interval_hours` end-to-end: edit form number input (days) → server action hours conversion + DB write → Deploy tab "Refresh interval: N days" display.**

## What Happened

All four target files updated as planned:

1. **`edit-form.tsx`** — Added `refresh_interval_hours: number` to `EditFormProps.site`; added a full-width number input row after the Affiliate Tag / Template grid, defaulting to `Math.round(site.refresh_interval_hours / 24)` days.

2. **`edit/page.tsx`** — Added `refresh_interval_hours: site.refresh_interval_hours ?? 48` to `siteForForm` (the `?? 48` guards against pre-migration rows where the column might be null).

3. **`actions.ts`** — Added `refresh_interval_hours?: string[]` to `UpdateSiteErrors`; in `updateSite`, reads `refresh_interval_days` from formData, guards with `Math.max(1, isNaN(rawDays) ? 2 : rawDays) * 24`, and includes `refresh_interval_hours` in the `.update({})` payload.

4. **`page.tsx`** — Added a "Refresh interval: N days" display row in `deploySlot` immediately after the pipeline status badge row.

TypeScript exited 0 with no errors.

## Verification

- `npx tsc --noEmit` in `apps/admin` → exit 0, no output
- All four grep checks confirmed expected references in all four files
- Slice-level checks: typecheck ✅, buttons in deploySlot ✅, GenerateSiteButton in deploySlot ✅, refresh_interval in form + action ✅, refresh_interval_hours in edit/page ✅, latestDeployment.error in deploy slot ✅

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd apps/admin && npx tsc --noEmit` | 0 | ✅ pass | 7.2s |
| 2 | `rg "refresh_interval" edit-form.tsx` | 0 | ✅ pass | <1s |
| 3 | `rg "refresh_interval_hours" edit/page.tsx` | 0 | ✅ pass | <1s |
| 4 | `rg "refresh_interval" actions.ts` | 0 | ✅ pass | <1s |
| 5 | `rg "refresh_interval" sites/[id]/page.tsx` | 0 | ✅ pass | <1s |
| 6 | `rg "latestDeployment.error" sites/[id]/page.tsx` | 0 | ✅ pass | <1s |

## Diagnostics

- Deploy tab renders the current `refresh_interval_hours` from DB as days; if wrong after save, inspect DB: `SELECT id, name, refresh_interval_hours FROM sites WHERE id = '<id>';`
- Silent coercion: if `refresh_interval_days` is missing or NaN from the form, `refreshIntervalHours` becomes `2 * 24 = 48`. Deploy tab will show `2 days`. This is detectable by comparing what was submitted vs what the Deploy tab shows.
- `updateSite` throws on DB write failure with full Supabase error message and code — visible in Next.js server logs and browser error boundary.

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — Added `refresh_interval_hours: number` to interface; added number input for days in Basic Info card
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — Added `refresh_interval_hours` to `siteForForm` with `?? 48` null guard
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — Added `refresh_interval_hours` to `UpdateSiteErrors`; reads days, converts to hours, writes to DB in `updateSite`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Added "Refresh interval: N days" display row in `deploySlot`
