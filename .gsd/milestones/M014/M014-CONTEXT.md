# M014: Site Detail & Edit — UX & Data Improvements

**Gathered:** 2026-03-18
**Status:** Ready for planning

## Project Description

BuilderMonster admin panel — improvements to the site detail and edit pages covering: file uploads for logo/favicon, UI reorganization (Generate/Deploy buttons, tab rename, Domain Management relocation), product refresh interval configuration, categories tab redesign with per-category product pages, SEO score filtering and legend, and VPS local-mode monitoring.

## Why This Milestone

The site detail page has accumulated UX debt: logo/favicon fields are free-text URLs (not file uploads), Generate+Deploy buttons clutter the header, the Content tab mixes categories and products in a way that doesn't scale, the refresh interval is in the DB but has no UI, SEO scores include irrelevant redirect pages, and the local VPS shows as unreachable because it's trying SSH to itself.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Upload a PNG logo in the edit form → it's optimized and stored; the generated site uses the local asset
- Upload a favicon ZIP in the edit form → extracted files are installed at site generation; `<link rel="manifest">` is in the `<head>`
- See Generate Site and Deploy buttons inside the Deploy tab, not in the page header
- Configure product refresh interval (in days) in both the edit form and the Deploy tab detail view
- Browse the Categories tab listing name + description + product count per category, then click a category to see its products + product search
- See SEO scores only for content pages (not `/go/**` redirects or legal pages); understand each score dimension via an inline legend
- See the local VPS (hel1) reporting real CPU/disk/memory metrics without SSH

### Entry point / environment

- Entry point: `http://localhost:3000/sites/[id]` (detail) and `http://localhost:3000/sites/[id]/edit`
- Environment: local dev + production VPS1 (admin panel)
- Live dependencies: Supabase Cloud (DB), sharp (image optimization), adm-zip (favicon extraction)

## Completion Class

- Contract complete means: all UI changes render correctly, file uploads persist to local filesystem, DB migrations applied, SEO filter excludes `/go/` and legal pages
- Integration complete means: generated site dist/ contains logo asset at correct path, favicon files at root, `<link rel="manifest">` in `<head>`, product count query joins correctly
- Operational complete means: local VPS health reads real metrics via child_process (no SSH)

## Final Integrated Acceptance

- Upload a logo PNG → edit form saves → generate site → dist/ has logo WebP, layout renders `<img>` pointing to it
- Upload a favicon ZIP → generate site → dist/ root has `favicon.ico`, `site.webmanifest`; `<link rel="manifest">` in `<head>`
- Set refresh interval to 3 days in edit form → appears in Deploy tab → value stored in DB
- Categories tab shows description + product count; clicking a category shows only its products with search
- SEO scores table has no `/go/` rows and no legal rows; legend card is visible
- hel1 server card shows real disk/memory data (no SSH error)

## Risks and Unknowns

- Logo/favicon storage: local filesystem on VPS1 (`apps/admin/public/uploads/sites/[id]/`) — served by Next.js, accessible to generator at build time. No Supabase Storage needed.
- sharp not in `apps/admin` deps — add it.
- adm-zip not in deps anywhere — add to `apps/admin`.
- `inferPageType` returns `'legal'` for `/go/` paths — fix: detect `/go/` prefix and skip before scoring loop.
- `is_local` flag on servers — add column via migration, InfraService uses child_process when true.

## Existing Codebase / Prior Art

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — logoUrl/faviconUrl are plain Input fields; target for file upload
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Generate/Deploy in header (lines ~160–200)
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — Content tab; Deploy tab; SEO tab
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — shows seo_text excerpt; needs description + product count
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — no interval config UI
- `packages/agents/src/jobs/generate-site.ts` — `inferPageType()` line 42; scoring loop line 449; publicDir line 170
- `apps/generator/src/layouts/BaseLayout.astro` — `<head>` favicon injection point
- `apps/generator/src/lib/data.ts` — `SiteInfo` type; `customization.logoUrl` already present
- `packages/deployment/src/infra.ts` — `InfraService.getFleetHealth()` SSH path; target for local bypass
- `packages/db/supabase/migrations/20260316160000_servers.sql` — servers table
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — move to Research Lab
- `apps/admin/src/app/(dashboard)/research/page.tsx` — Research Lab destination for Domain Management

## Scope

### In Scope

- Logo: PNG upload → sharp → `public/uploads/sites/[id]/logo.webp` → `customization.logoUrl`
- Favicon: ZIP upload → extract to `public/uploads/sites/[id]/favicon/` → `customization.faviconDir` stored → copy to dist/ at generation → `<link>` tags in BaseLayout
- Move Generate Site + Deploy buttons from header into Deploy tab
- `refresh_interval_hours` field (shown as days) in edit form + Deploy tab detail view
- Categories tab: rename from "Content", show description + product count, remove products list
- Category detail page `/sites/[id]/categories/[catId]` — products + search for that category
- SEO scoring: skip `/go/**` + legal pages; add legend card in SEO tab
- `is_local` column on servers: migration + InfraService local-mode
- Domain Management moved from Deploy tab to Research Lab

### Out of Scope / Non-Goals

- Supabase Storage for uploads
- Multi-VPS logo/favicon sync
- Redesigning the category edit form
- Product auto-categorization logic changes

## Technical Constraints

- sharp → add to `apps/admin/package.json`
- adm-zip → add to `apps/admin/package.json`
- Favicon copy in generate-site.ts must be graceful when `faviconDir` is absent
- `is_local` migration must use `ADD COLUMN IF NOT EXISTS`
- Product count via JOIN in the categories query — no N+1

## Integration Points

- Supabase DB — `servers.is_local`, `tsa_categories.description` (exists), `sites.refresh_interval_hours` (exists)
- `apps/generator/src/layouts/BaseLayout.astro` — favicon `<link>` tags
- `packages/agents/src/jobs/generate-site.ts` — logo path passthrough, favicon dir copy
- `packages/deployment/src/infra.ts` — `is_local` bypass
- `apps/admin/src/app/(dashboard)/research/page.tsx` — Domain Management destination
