---
estimated_steps: 5
estimated_files: 4
---

# T02: Make DomainManagement siteId optional and wire into Research Lab

**Slice:** S06 — VPS Local Mode + Domain Management Relocation
**Milestone:** M014

## Description

The Domain Management widget (availability check + registration) currently lives in the Deploy tab of the site detail page. The research phase determined that domain availability checking is equally useful in the Research Lab — where the user is exploring a niche idea and wants to immediately check if candidate domains are free — but there is no `siteId` in that context. This task makes `siteId` optional in the component, conditionally hides the registration panel when absent, adds the component to the Research Lab left column, and removes it from the Deploy tab.

The component stays in its current file location (`sites/[id]/DomainManagement.tsx`). Research Lab imports it via absolute path `'@/app/(dashboard)/sites/[id]/DomainManagement'`. The relative import `./actions` inside the component still resolves correctly from its own directory.

## Steps

1. **Edit `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx`**:
   - Change `interface DomainManagementProps { siteId: string; ... }` → `siteId?: string`
   - Wrap the entire registration panel section (the `{isAvailable && domainToRegister && !registerState?.success && ...}` block AND the registration result block) in `{siteId && (...)}`
   - The `registerAction` function and the `useActionState(registerAction, null)` call can remain — they just won't be triggered from UI when `siteId` is absent. No code path errors when `siteId` is undefined because the form blocks are guarded.
   - No changes to the availability check form — it always renders.

2. **Edit `apps/admin/src/app/(dashboard)/research/page.tsx`**:
   - Add import: `import DomainManagement from '@/app/(dashboard)/sites/[id]/DomainManagement'`
   - In the left column (`<div className="space-y-6">`), after the "New Research Session" card and before any `activeSessionId` block, add a new card:
     ```tsx
     <div className="rounded-lg border bg-card p-6 shadow-sm">
       <h2 className="text-base font-semibold mb-4">Domain Management</h2>
       <DomainManagement />
     </div>
     ```
   - No `siteId` prop, no `existingDomain` prop — renders availability check only.

3. **Edit `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`**:
   - Remove `domainSlot: React.ReactNode` from the `TabsProps` interface (around line 87)
   - Remove `domainSlot` from the destructured props (around line 101)
   - Remove the `<Card title="Domain Management">{domainSlot}</Card>` block from the Deploy tab (around line 225)

4. **Edit `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`**:
   - Remove the import `import DomainManagement from './DomainManagement'` (the component is still in the same file but no longer used here)
   - Remove `domainSlot={<DomainManagement siteId={site.id} existingDomain={site.domain} />}` from the `<SiteDetailTabs>` call (around line 272)

5. **Type-check**:
   ```bash
   cd apps/admin && npx tsc --noEmit
   ```

## Must-Haves

- [ ] `DomainManagement.tsx` has `siteId?: string` (optional) in its props interface
- [ ] Registration panel (both the "Approve & Register" form and the registration result) is wrapped in `{siteId && (...)}` — hidden when no siteId
- [ ] Availability check form renders in both contexts (with and without siteId)
- [ ] Research Lab page imports `DomainManagement` from `'@/app/(dashboard)/sites/[id]/DomainManagement'`
- [ ] Research Lab page has a "Domain Management" card in the left column
- [ ] `SiteDetailTabs.tsx` has no `domainSlot` prop — interface, destructuring, and JSX card all removed
- [ ] `sites/[id]/page.tsx` no longer imports or renders `DomainManagement`
- [ ] `cd apps/admin && npx tsc --noEmit` exits 0 with no errors

## Verification

```bash
# siteId is optional in DomainManagement
grep "siteId\?:" apps/admin/src/app/\(dashboard\)/sites/\[id\]/DomainManagement.tsx

# Research Lab imports DomainManagement
grep "DomainManagement" apps/admin/src/app/\(dashboard\)/research/page.tsx

# Deploy tab no longer has domainSlot (should return 0)
grep -c "domainSlot" "apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx"

# sites/[id]/page.tsx no longer imports DomainManagement
grep -c "DomainManagement" "apps/admin/src/app/(dashboard)/sites/[id]/page.tsx"

# TypeScript clean
cd apps/admin && npx tsc --noEmit
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — current component (siteId required, registration always shown). The full file content is known: `useActionState` for both check and register actions; relative import `./actions`; two-section JSX: availability check (always render) + registration panel (render when `isAvailable && domainToRegister`).
- `apps/admin/src/app/(dashboard)/research/page.tsx` — existing Research Lab page; left column uses `<div className="space-y-6">` with "New Research Session" card first, then conditional active session block. Insert Domain Management card between these two.
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — `domainSlot` at line 87 (interface), line 101 (destructure), line 225 (JSX card in Deploy tab).
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — `DomainManagement` import at line 11; usage at line 272.
- KN016: `cd apps/admin && npx tsc --noEmit` is the correct typecheck command (no `typecheck` pnpm script exists).

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — `siteId?: string` optional; registration sections guarded by `{siteId && (...)}` 
- `apps/admin/src/app/(dashboard)/research/page.tsx` — imports `DomainManagement`; renders it in left column without siteId prop
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — no `domainSlot` prop, no Domain Management card
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — no `DomainManagement` import or usage
- Zero TypeScript errors from `npx tsc --noEmit`
