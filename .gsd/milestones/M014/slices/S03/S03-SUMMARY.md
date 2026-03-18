---
id: S03
parent: M014
milestone: M014
provides:
  - Generate Site and Deploy buttons relocated from page header to Deploy tab deploySlot
  - refresh_interval_hours wired end-to-end: edit form (days) → server action (hours conversion) → DB write → Deploy tab display
requires: []
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/actions.ts
key_decisions:
  - Buttons grouped in a flex wrapper above <DeployStatus> inside deploySlot — keeps actions co-located with status context
  - Input accepts days (UX-friendly), DB stores hours; conversion happens in updateSite server action
  - Invalid/missing input silently coerced to 2 days (48h) via Math.max(1, isNaN(rawDays) ? 2 : rawDays) — no user-facing error on bad input
  - null guard ?? 48 on refresh_interval_hours in edit/page.tsx covers pre-migration rows
patterns_established:
  - none
observability_surfaces:
  - Deploy tab shows Generate + Deploy buttons adjacent to pipeline status badge and last deployment error — failure visible in same panel as retry triggers
  - Deploy tab shows live "Refresh interval: N days" from DB; mismatch reveals a bad save or coercion
  - Failed updateSite throws structured error with Supabase message + code — visible in server stdout and Next.js error boundary
  - Diagnostic: SELECT id, name, refresh_interval_hours FROM sites WHERE id = '<id>';
drill_down_paths:
  - .gsd/milestones/M014/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M014/slices/S03/tasks/T02-SUMMARY.md
duration: ~20m total (T01 ~10m, T02 ~10m)
verification_result: passed
completed_at: 2026-03-18
---

# S03: Edit Form & Deploy Tab Reorganization

**Generate/Deploy buttons moved from page header to Deploy tab; refresh_interval_hours wired end-to-end from edit form (days) through server action to DB and Deploy tab display.**

## What Happened

Two focused tasks, each touching a tight set of files with no cross-task dependencies.

**T01** removed `<GenerateSiteButton siteId={site.id} />` and the Deploy `<form>` block (conditional on `site.domain`) from the page header's `<div className="flex items-center gap-2">`. Header now contains only Preview (link/span) and Edit (link). Both components were re-added inside `deploySlot` in a new `<div className="flex items-center gap-2">` wrapper, positioned directly above `<DeployStatus siteId={site.id} />`. The conditional logic (enabled form with inline `'use server'` action when domain exists; disabled button with tooltip when not) is identical to the original. The `latestDeployment.error` failure-path display is intact in the deploy slot.

**T02** wired `refresh_interval_hours` across four files: added a number input for days to `edit-form.tsx` (defaulting to `Math.round(site.refresh_interval_hours / 24)`), forwarded the DB value to `siteForForm` in `edit/page.tsx` with a `?? 48` null guard, read and converted days → hours in `updateSite` in `actions.ts` (with NaN coercion to 2 days), and added a "Refresh interval: N days" display row in the `deploySlot` of `page.tsx` after the pipeline status badge.

Both tasks ran typecheck (`cd apps/admin && npx tsc --noEmit`) and exited 0. Note: `pnpm --filter @monster/admin typecheck` fails with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` (no `typecheck` script in admin `package.json`) — direct tsc invocation is the correct approach (KN016).

## Verification

All slice-level checks passed:

| Check | Result |
|---|---|
| `cd apps/admin && npx tsc --noEmit` | exit 0, no output |
| `rg "GenerateSiteButton" sites/[id]/page.tsx` | 1 match, inside deploySlot (line 159), not in header |
| `grep "enqueueSiteDeploy" sites/[id]/page.tsx` | deploySlot only (import + 1 call site) |
| `rg "refresh_interval" edit-form.tsx` | input field + label + defaultValue + aria-invalid |
| `rg "refresh_interval_hours" edit/page.tsx` | match in siteForForm with `?? 48` guard |
| `rg "refresh_interval" actions.ts` | UpdateSiteErrors type + formData read + DB update payload |
| `rg "refresh_interval" sites/[id]/page.tsx` | display row in deploySlot |
| `rg "latestDeployment.error" sites/[id]/page.tsx` | present in deploy slot (failure visibility intact) |

## Requirements Advanced

- none (S03 is a UX reorganization; no capability requirements map to this slice)

## Requirements Validated

- none

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

`pnpm --filter @monster/admin typecheck` fails with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` — the admin `package.json` has no `typecheck` script. Ran `npx tsc --noEmit` from `apps/admin/` directly instead. Same outcome, zero errors. Documented in KN016.

## Known Limitations

- The refresh interval input has no user-facing validation error: invalid or missing `refresh_interval_days` is silently coerced to 2 days (48h). A future slice could add explicit validation and a visible error message if this causes UX confusion.
- The Deploy tab's "Refresh interval" row is read-only display; there is no inline-edit affordance. Users must go to the edit form to change it.

## Follow-ups

- none

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — removed Generate/Deploy buttons from header; added them to deploySlot above DeployStatus; added "Refresh interval: N days" display row in deploySlot
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — added `refresh_interval_hours: number` to interface; added number input for days in Basic Info card
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — added `refresh_interval_hours` to `siteForForm` with `?? 48` null guard
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — added `refresh_interval_hours` to `UpdateSiteErrors`; reads days from formData, converts to hours, writes to DB in `updateSite`

## Forward Intelligence

### What the next slice should know
- No new abstractions or patterns were established here — pure UI reorganization. S04, S05, S06 are all independent and can proceed without reading this slice's code.
- The `deploySlot` JSX in `page.tsx` now has three stacked sections: Generate+Deploy buttons, Refresh Interval display, and `<DeployStatus>`. Any additions to the Deploy tab should be added to the `deploySlot` const, not the page header.
- `pnpm --filter @monster/admin typecheck` does not work — use `cd apps/admin && npx tsc --noEmit` (KN016).

### What's fragile
- Silent coercion of invalid `refresh_interval_days` to 2 days — if the form input is empty or non-numeric at submit time, the DB will be written with 48h without any visible error. Worth watching if the field is ever pre-populated with a non-integer string.

### Authoritative diagnostics
- To verify button placement: `rg "GenerateSiteButton\|enqueueSiteDeploy" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx -n` — both should appear only inside the `deploySlot` const block (approx lines 95–185), not in the header JSX (~189+).
- To verify refresh interval persists: `SELECT id, name, refresh_interval_hours FROM sites WHERE id = '<id>';` after saving the edit form.

### What assumptions changed
- Plan assumed `pnpm --filter @monster/admin typecheck` worked — it doesn't. The admin package has no `typecheck` script. Direct tsc invocation is the correct pattern going forward.
