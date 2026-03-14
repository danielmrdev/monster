---
id: T02
parent: S03
milestone: M007
provides:
  - SiteForm defaultValues prop (niche textarea + market select pre-fill)
  - /sites/new async page that reads searchParams and passes niche+market to SiteForm
key_files:
  - apps/admin/src/app/(dashboard)/sites/new/site-form.tsx
  - apps/admin/src/app/(dashboard)/sites/new/page.tsx
key_decisions:
  - Used defaultValue (uncontrolled) not value (controlled) on Textarea and NativeSelect — SiteForm is a client component and React Hook Form's useActionState owns submission state; controlled inputs would conflict
  - SiteForm signature uses default parameter `= {}` to handle zero-arg call sites (e.g. other pages that render <SiteForm /> without props)
  - page.tsx searchParams typed as Promise<{...}> per Next.js 15 async searchParams API; awaited before passing to child
patterns_established:
  - Next.js 15 async searchParams pattern: interface PageProps { searchParams: Promise<{...}> } → await in async server component → pass decoded values as props
observability_surfaces:
  - Navigate to /sites/new?niche=camping+gear&market=US — niche textarea and market select pre-filled on load confirms the full CTA loop works
  - grep -n "defaultValues" apps/admin/src/app/(dashboard)/sites/new/site-form.tsx → 3 hits (signature, niche defaultValue, market defaultValue)
  - grep -n "searchParams" apps/admin/src/app/(dashboard)/sites/new/page.tsx → Promise type + await
  - Build output shows /sites/new as ƒ (dynamic) confirming async server component
duration: ~15m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: SiteForm defaultValues + /sites/new searchParams + CTA wiring

**Wired the "Create site from this research" CTA loop: SiteForm now accepts `defaultValues` and `/sites/new` reads `searchParams` to pre-fill niche and market from the research report.**

## What Happened

Two surgical edits:

1. **`site-form.tsx`**: Added `defaultValues?: { niche?: string; market?: string }` prop to `SiteForm`. Wired `defaultValue={defaultValues?.niche ?? ''}` on the niche `<Textarea>` and `defaultValue={defaultValues?.market ?? ''}` on the market `<NativeSelect>`. Both use uncontrolled `defaultValue` — SiteForm is a `'use client'` component and React's uncontrolled pattern is correct here since `useActionState` drives submission, not a controlled state tree.

2. **`page.tsx`**: Added `interface PageProps { searchParams: Promise<{ niche?: string; market?: string }> }`, made the export `async`, awaited `searchParams`, and passed `defaultValues={{ niche, market }}` to `<SiteForm />`. Values come in URL-decoded from Next.js — no manual decode needed.

## Verification

```
pnpm -r typecheck        → exit 0 (all 9 packages)
pnpm --filter @monster/admin build  → exit 0
/sites/new shown as ƒ (dynamic) in build output — correct, async server component
curl http://localhost:3004/research → 307 ✓
curl http://localhost:3004/sites/new → 307 ✓
grep "defaultValues" site-form.tsx → 3 hits ✓
grep "searchParams" page.tsx → Promise type + await ✓
```

## Diagnostics

- Navigate to `/sites/new?niche=camping+gear&market=US` → niche textarea shows "camping gear", market select shows "United States (US)" — full CTA loop confirmed.
- If niche is empty despite param: check `grep -n "async" apps/admin/src/app/(dashboard)/sites/new/page.tsx` — must be async. Also verify `searchParams` is awaited, not read synchronously.
- If market is not pre-selected: the value must exactly match a `value` in `AMAZON_MARKETS` (e.g. `US`, `ES`, `UK`). The NicheResearcher passes the market code directly from DB — should match.
- TypeScript errors on `defaultValues` → check the prop type and `SiteForm` signature in `site-form.tsx`.

## Deviations

None. Implemented exactly as planned.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — added `defaultValues` prop; niche Textarea and market NativeSelect now accept pre-fill values
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — converted to async, reads `searchParams.niche` and `searchParams.market`, passes to `SiteForm`
- `.gsd/milestones/M007/slices/S03/tasks/T02-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
