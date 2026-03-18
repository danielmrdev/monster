---
estimated_steps: 4
estimated_files: 1
---

# T01: Move Generate/Deploy Buttons from Header to Deploy Tab Slot

**Slice:** S03 — Edit Form & Deploy Tab Reorganization
**Milestone:** M014

## Description

The page header currently contains three action buttons: Preview, Generate Site, and Deploy. The design calls for the header to show only navigation/view actions (Preview, Edit) while workflow actions (Generate, Deploy) live in the Deploy tab. This task removes Generate Site and Deploy from the header and moves them into the `deploySlot` JSX block in the same file.

All work is in a single file — `page.tsx`. The `deploySlot` is a server-rendered `React.ReactNode` block that is passed to `<SiteDetailTabs>` as a prop. Moving the buttons there is safe: inline `'use server'` actions work inside server-rendered slot content, and `<GenerateSiteButton>` is a Client Component that can be rendered anywhere in the RSC tree.

## Steps

1. **Remove from header** — In the `<div className="flex items-center gap-2">` block, delete the `<GenerateSiteButton siteId={site.id} />` line and the entire Deploy form/disabled-button conditional block (`{site.domain ? (<form action={...}>...</form>) : (<button ... disabled>Deploy</button>)}`). Keep Preview and Edit buttons untouched.

2. **Add to deploySlot** — In the `deploySlot` JSX block (the `<div className="space-y-3">` that already contains the pipeline status, deployment history, nameservers, and `<DeployStatus>`), add the Generate Site button and Deploy conditional form **above** `<DeployStatus siteId={site.id} />`. Use a `<div className="flex items-center gap-2">` wrapper to group them side-by-side.

3. **Preserve conditional logic** — The Deploy button remains conditional: if `site.domain` is set, render the `<form>` with the inline `'use server'` action calling `enqueueSiteDeploy(site.id)`; otherwise render the disabled button with `title="Set a domain first"`.

4. **Verify** — Run typecheck.

## Must-Haves

- [ ] Header `<div className="flex items-center gap-2">` contains no `<GenerateSiteButton>` and no `enqueueSiteDeploy` reference
- [ ] `deploySlot` contains `<GenerateSiteButton siteId={site.id} />` and the full Deploy conditional form/button
- [ ] The inline `'use server'` action for `enqueueSiteDeploy` is preserved unchanged
- [ ] TypeScript typecheck exits 0

## Verification

```bash
pnpm --filter @monster/admin typecheck
rg "GenerateSiteButton" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
# Should show exactly one match, inside deploySlot block (not in the header)
grep "enqueueSiteDeploy" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
# Should show match inside deploySlot block only
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — current file with `<GenerateSiteButton>` and Deploy form in the header's `<div className="flex items-center gap-2">` block, and existing `deploySlot` const starting at the `// ── Deploy tab content` comment

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — header contains only Preview and Edit buttons; `deploySlot` contains `<GenerateSiteButton>`, Deploy form/disabled-button conditional, and all existing content (`<DeployStatus>`, deployment history, etc.)
