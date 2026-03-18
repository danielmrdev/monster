---
id: T01
parent: S03
milestone: M014
provides:
  - Generate and Deploy buttons relocated from page header to Deploy tab deploySlot
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - Buttons grouped in a flex wrapper above <DeployStatus> inside deploySlot — keeps actions co-located with status context
patterns_established:
  - none
observability_surfaces:
  - Deploy tab now shows Generate + Deploy buttons adjacent to pipeline status badge and last deployment error — failure is visible in the same panel as the retry triggers
duration: ~10m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Move Generate/Deploy Buttons from Header to Deploy Tab Slot

**Removed `<GenerateSiteButton>` and Deploy form/button from the page header; added them to `deploySlot` above `<DeployStatus>` in the same file.**

## What Happened

Single-file change in `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`. Deleted `<GenerateSiteButton siteId={site.id} />` and the `{site.domain ? <form>...</form> : <button disabled>}` block from the header's `<div className="flex items-center gap-2">`. Header now contains only Preview (link/span) and Edit (link). Added both components into `deploySlot` inside a `<div className="flex items-center gap-2">` wrapper, positioned directly above `<DeployStatus siteId={site.id} />`. The conditional logic and inline `'use server'` action are identical to what was in the header.

Pre-flight fixes were also applied: added `## Observability / Diagnostics` and a diagnostic grep check to `S03-PLAN.md`; added `## Observability Impact` to `T01-PLAN.md`.

Note: the task plan referenced `pnpm --filter @monster/admin typecheck` but the admin package has no `typecheck` script — ran `npx tsc --noEmit` directly from `apps/admin/` instead. Zero errors.

## Verification

- `npx tsc --noEmit` (from `apps/admin/`) — exits 0, no output
- `rg "GenerateSiteButton"` — one match at line 154 (inside `deploySlot` block, not in header)
- `grep "enqueueSiteDeploy"` — one usage (the import + one call site, both inside `deploySlot`)
- `rg "latestDeployment.error"` — present in deploy slot, confirming diagnostic failure-path display is intact

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd apps/admin && npx tsc --noEmit` | 0 | ✅ pass | 8.2s |
| 2 | `rg "GenerateSiteButton" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` | 0 | ✅ pass (1 match inside deploySlot) | <1s |
| 3 | `grep "enqueueSiteDeploy" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` | 0 | ✅ pass (deploySlot only) | <1s |
| 4 | `rg "latestDeployment.error" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` | 0 | ✅ pass (diagnostic check) | <1s |

## Diagnostics

To inspect the moved button wiring: `rg "GenerateSiteButton\|enqueueSiteDeploy" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx -n` — should show both inside the `deploySlot` const block (lines ~100–185), none in the header JSX (~189+).

## Deviations

`pnpm --filter @monster/admin typecheck` fails with `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT` — the admin package has no `typecheck` script. Used `npx tsc --noEmit` from `apps/admin/` instead. Same outcome, zero errors.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — removed Generate/Deploy buttons from header; added them to deploySlot above DeployStatus
- `.gsd/milestones/M014/slices/S03/S03-PLAN.md` — added Observability/Diagnostics section and diagnostic verification check
- `.gsd/milestones/M014/slices/S03/tasks/T01-PLAN.md` — added Observability Impact section
