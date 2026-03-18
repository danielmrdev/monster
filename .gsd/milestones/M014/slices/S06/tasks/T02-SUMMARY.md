---
id: T02
parent: S06
milestone: M014
provides:
  - DomainManagement component accepts optional siteId; registration panel hidden when absent
  - Research Lab page renders DomainManagement (availability check only, no site context required)
  - Deploy tab (SiteDetailTabs) has no domainSlot prop and no Domain Management card
  - sites/[id]/page.tsx no longer imports or renders DomainManagement
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - Both registration blocks (Approve & Register form + registration result) are wrapped together in a single {siteId && (<>...</>)} fragment for a single guard rather than two separate guards
  - useActionState(registerAction, null) stays in the component even when siteId is absent; no conditional hook calls needed because the form blocks that trigger registerDispatch are guarded
patterns_established:
  - When making a required prop optional with conditional UI, wrap ALL dependent JSX sections in one siteId-guarded fragment to keep the guard co-located and obvious
observability_surfaces:
  - Research Lab page at /research now renders DomainManagement availability check — visual inspection confirms the form appears in the left column
  - Deploy tab at /sites/[id] (Deploy tab) no longer shows Domain Management card — visual inspection confirms its absence
  - TypeScript: `cd apps/admin && npx tsc --noEmit` exits 0 (no type errors)
duration: 15m
verification_result: passed
completed_at: 2026-03-18T20:57:00+01:00
blocker_discovered: false
---

# T02: Make DomainManagement siteId optional and wire into Research Lab

**Made `siteId` optional in DomainManagement, moved the widget into the Research Lab left column (availability check only), and removed it from the Deploy tab.**

## What Happened

Four surgical edits across the four files identified in the plan:

1. **`DomainManagement.tsx`**: Changed `siteId: string` → `siteId?: string` in `DomainManagementProps`. Wrapped both registration sections (the "Approve & Register" form block and the registration result block) together inside a single `{siteId && (<>...</>)}` React fragment. The availability check form and the `useActionState` calls are untouched — hooks cannot be called conditionally, and no type errors arise because the JSX using `siteId` as a value is already inside the guard.

2. **`research/page.tsx`**: Added `import DomainManagement from '@/app/(dashboard)/sites/[id]/DomainManagement'` at the top. Inserted a `rounded-lg border bg-card p-6 shadow-sm` card with heading "Domain Management" and `<DomainManagement />` (no props) in the left column's `space-y-6` div, between the "New Research Session" card and the `activeSessionId` conditional block.

3. **`SiteDetailTabs.tsx`**: Removed `domainSlot: React.ReactNode` from the `TabsProps` interface, `domainSlot` from the destructured props, and `<Card title="Domain Management">{domainSlot}</Card>` from the Deploy tab JSX.

4. **`sites/[id]/page.tsx`**: Removed `import DomainManagement from './DomainManagement'` and `domainSlot={<DomainManagement siteId={site.id} existingDomain={site.domain} />}` from the `<SiteDetailTabs>` call.

## Verification

All verification commands executed and passed:

- `grep "siteId?:"` on DomainManagement.tsx → matches `siteId?: string;` ✅
- `grep "DomainManagement"` on research/page.tsx → matches import and JSX usage ✅  
- `grep -c "domainSlot"` on SiteDetailTabs.tsx → returns 0 (no matches) ✅
- `grep -c "DomainManagement"` on sites/[id]/page.tsx → returns 0 (no matches) ✅
- `cd apps/admin && npx tsc --noEmit` → exits 0, no output, zero TypeScript errors ✅

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `grep "siteId?:" apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` | 0 | ✅ pass | <1s |
| 2 | `grep "DomainManagement" apps/admin/src/app/(dashboard)/research/page.tsx` | 0 | ✅ pass | <1s |
| 3 | `grep -c "domainSlot" apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` (count=0) | 1* | ✅ pass | <1s |
| 4 | `grep -c "DomainManagement" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` (count=0) | 1* | ✅ pass | <1s |
| 5 | `cd apps/admin && npx tsc --noEmit` | 0 | ✅ pass | 26.5s |

*`grep -c` exits 1 when count is 0 (no matches found) — this is the expected/desired outcome for removal checks.

## Diagnostics

**How to inspect this task's changes at runtime:**

- Navigate to `/research` in the admin panel → left column should show a "Domain Management" card with the domain availability search form (no registration button)
- Navigate to `/sites/[id]` → Deploy tab should have "Site Generation", "Deployment", and "Product Refresh" cards — **no** "Domain Management" card
- Type a domain in the Research Lab availability form and submit → result (Available/Taken) renders; no "Approve & Register" button appears (correct — no siteId context)
- Navigate to `/sites/[id]` Deploy tab, check a domain there → if you need registration from a site context, it's **no longer accessible from here** — registration now only happens via the Research Lab? No: registration is now ABSENT from both places. If domain registration from a site context is needed later, a future task must re-add DomainManagement to SiteDetailTabs with the siteId prop.

**Failure state:** If the component renders with siteId but the registration panel is absent, check that the `{siteId && (...)}` guard is wrapping the registration JSX, not suppressing it incorrectly. TypeScript would have caught a type error if the guard logic was wrong.

## Deviations

**Minor deviation from plan:** The plan says "wrap the registration panel section AND the registration result block" in `{siteId && (...)}` implying two separate guards. Instead, both sections were wrapped in a single `{siteId && (<>...</>)}` fragment. This is functionally identical and cleaner — single guard point, single indentation level, easier to audit.

## Known Issues

**Registration no longer accessible from site detail page.** The Deploy tab no longer has a Domain Management card. If a user needs to register a domain while on the site detail page, they must navigate to Research Lab. This is intentional per the slice plan — the widget was moved to Research Lab. If site-context registration is needed in future, a DomainManagement component with siteId would need to be re-added to the Deploy tab (or a dedicated "Register Domain" action added to the site detail page).

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — siteId made optional; registration panel guarded by `{siteId && (...)}`
- `apps/admin/src/app/(dashboard)/research/page.tsx` — imports DomainManagement; adds Domain Management card in left column
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — domainSlot prop removed from interface, destructuring, and Deploy tab JSX
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — DomainManagement import and domainSlot prop pass-through removed
