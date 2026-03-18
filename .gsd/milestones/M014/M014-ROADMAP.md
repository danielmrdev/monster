# M014: Site Detail & Edit — UX & Data Improvements

**Vision:** Improve the site detail and edit pages with file uploads for logo/favicon, UI reorganization, per-category product pages, SEO score filtering, and VPS local-mode monitoring.

## Success Criteria

- Logo PNG upload in edit form → stored as WebP, used in generated site
- Favicon ZIP upload → extracted, copied to dist/ at generation, manifest link in `<head>`
- Generate Site and Deploy buttons live in Deploy tab, not in page header
- Product refresh interval configurable in edit form and visible in Deploy tab
- Categories tab shows description + product count; category detail page shows per-category products + search
- SEO scores exclude `/go/**` and legal pages; legend card explains each dimension
- Local VPS (hel1) reports real metrics without SSH

## Key Risks / Unknowns

- sharp not in apps/admin deps — first time adding file processing to the admin app
- adm-zip ZIP extraction — new dep, need to verify it handles favicon.io ZIP structure correctly
- Category product count needs a DB JOIN or aggregate query — verify it doesn't introduce N+1

## Proof Strategy

- sharp/adm-zip integration → retire in S01 by uploading real files and verifying output files exist on disk
- Favicon generator integration → retire in S02 by building the fixture site and checking dist/ root + `<head>` HTML

## Verification Classes

- Contract verification: file existence checks (logo.webp, favicon.ico, site.webmanifest), grep for `<link rel="manifest">` in BaseLayout output, DB column presence
- Integration verification: full site generation with logo + favicon, verify dist/ contents
- Operational verification: InfraService local-mode reads real metrics (no SSH error)
- UAT / human verification: visual check of edit form upload widgets, category page rendering

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 6 slices complete and verified
- Logo upload stores WebP; generated site dist/ contains the asset and layout renders it
- Favicon ZIP extracts correctly; dist/ root has favicon files; BaseLayout has `<link rel="manifest">`
- Generate/Deploy buttons absent from header; present and functional in Deploy tab
- refresh_interval_hours persists from edit form; Deploy tab shows current value
- Categories tab has no products list; category detail page has products + search
- SEO scores table has no `/go/` or legal rows; legend card present
- hel1 InfraService returns real metrics (not SSH error)

## Requirement Coverage

- Covers: logo/favicon assets pipeline (R001), product refresh config UI (R008), SEO scoring quality (R016), VPS monitoring (R019)
- Partially covers: none
- Leaves for later: none
- Orphan risks: none

## Slices

- [x] **S01: Logo & Favicon Upload** `risk:high` `depends:[]`
  > After this: PNG upload in edit form saves logo.webp to public/uploads/sites/[id]/; ZIP upload extracts favicon files to public/uploads/sites/[id]/favicon/; both paths stored in customization JSON.

- [x] **S02: Generator Integration — Logo Path + Favicon Install** `risk:medium` `depends:[S01]`
  > After this: generate site with fixture → dist/ contains logo.webp at /logo.webp, dist/ root has favicon.ico + site.webmanifest, and BaseLayout `<head>` has `<link rel="manifest">` + favicon link tags.

- [ ] **S03: Edit Form & Deploy Tab Reorganization** `risk:low` `depends:[]`
  > After this: page header has no Generate/Deploy buttons; Deploy tab has both buttons + refresh interval field (days); edit form has refresh interval field.

- [ ] **S04: Categories Tab Redesign + Category Detail Page** `risk:medium` `depends:[]`
  > After this: tab renamed "Categories", each row shows description + product count; clicking a category navigates to /sites/[id]/categories/[catId] showing that category's products with search.

- [ ] **S05: SEO Score Filter + Legend** `risk:low` `depends:[]`
  > After this: SEO scores table contains no /go/ or legal rows; a legend card above the table explains each score dimension.

- [ ] **S06: VPS Local Mode + Domain Management Relocation** `risk:medium` `depends:[]`
  > After this: servers with is_local=true report real disk/memory/Caddy metrics via child_process; Domain Management section visible in Research Lab (removed from Deploy tab).

## Boundary Map

### S01 → S02

Produces:
- Upload API routes: `POST /api/sites/[id]/upload-logo` → writes `public/uploads/sites/[id]/logo.webp`, returns `{ logoUrl: '/uploads/sites/[id]/logo.webp' }`
- Upload API routes: `POST /api/sites/[id]/upload-favicon` → writes `public/uploads/sites/[id]/favicon/{files}`, returns `{ faviconDir: '/uploads/sites/[id]/favicon' }`
- `customization.logoUrl` stored as local path `/uploads/sites/[id]/logo.webp`
- `customization.faviconDir` stored as local path `/uploads/sites/[id]/favicon`

Consumes:
- nothing (leaf node)

### S02 → (milestone complete)

Produces:
- `generate-site.ts`: copies `public/uploads/sites/[id]/logo.webp` → `dist/logo.webp` when `customization.logoUrl` is a local path
- `generate-site.ts`: copies `public/uploads/sites/[id]/favicon/` → `dist/` root when `customization.faviconDir` is set
- `BaseLayout.astro`: accepts `faviconDir?: string` in SiteInfo; when set, renders `<link rel="icon">`, `<link rel="apple-touch-icon">`, `<link rel="manifest">` tags
- Updated `SiteInfo` type in `apps/generator/src/lib/data.ts` with `faviconDir?: string`

Consumes from S01:
- `customization.logoUrl` — local path convention `/uploads/sites/[id]/logo.webp`
- `customization.faviconDir` — local path convention `/uploads/sites/[id]/favicon`

### S03 → (milestone complete)

Produces:
- `page.tsx` header without Generate/Deploy buttons
- Deploy tab slot includes `<GenerateSiteButton>` + `<DeployButton>` + refresh interval display
- Edit form includes `refresh_interval_days` field (converts to/from `refresh_interval_hours` in DB)

Consumes:
- nothing (independent)

### S04 → (milestone complete)

Produces:
- `SiteDetailTabs.tsx`: "Content" tab renamed to "Categories"; `productsSlot` prop removed; categories rows show `description` + product count
- New page: `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` — category detail with products + search
- Updated DB query in `page.tsx`: categories select includes `description`, product count via aggregate

Consumes:
- nothing (independent); `tsa_categories.description` already exists in DB

### S05 → (milestone complete)

Produces:
- `generate-site.ts`: skip files matching `/go/` prefix and type `'legal'` before scoring loop
- `SiteDetailTabs.tsx`: legend card above SEO Scores table explaining 8 score dimensions

Consumes:
- nothing (independent)

### S06 → (milestone complete)

Produces:
- Migration: `ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_local boolean NOT NULL DEFAULT false`
- `InfraService.getFleetHealth()`: when `server.is_local = true`, runs `execSync` commands instead of SSH
- Research Lab page: Domain Management section (availability check + register domain)
- Deploy tab: Domain Management section removed

Consumes:
- nothing (independent)
