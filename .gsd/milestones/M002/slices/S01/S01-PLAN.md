# S01: Sites CRUD

**Goal:** User can create a TSA site record with all fields via a real form, see it in the Sites list fetched from Supabase via the service role client, open a detail view, and edit the site — all writes validated against the `SiteCustomization` Zod schema. Active nav link highlighting works across all 7 routes.

**Demo:** Navigate to `/sites/new`, fill in all fields (name, domain, niche, market, language, affiliate tag, template, primary/accent color, font, logo URL), submit — site appears in `/sites` list fetched live from Supabase. Click the site row → detail view shows correct data. Click Edit → edit form pre-filled. Change the name, save → list reflects the update. All 7 sidebar links highlight correctly when active.

## Must-Haves

- `SiteCustomization` Zod schema defined in `packages/shared/src/types/customization.ts` and exported from `@monster/shared`
- `apps/admin/src/lib/supabase/service.ts` exports `createServiceClient()` from `@monster/db` — used by all server actions in this slice (never the anon client)
- shadcn components installed in `apps/admin`: `card`, `select`, `textarea`, `badge`, `table`, `separator`
- `/sites` list page fetches real rows from `sites` table using service client
- `/sites/new` create form: all fields (name, domain, niche, market, language, currency, affiliate_tag, template_slug, customization fields), server action validates with Zod, writes to `sites` table, redirects to list
- `/sites/[id]` detail page: shows all site fields from DB
- `/sites/[id]/edit` edit form: pre-filled from DB, server action updates the row, redirects to detail
- `NavItem` client component with `usePathname()` active state; `NavSidebar` updated to use it; active link highlighted for all 7 routes
- `tsc --noEmit` exits 0 across the monorepo after slice completes

## Proof Level

- This slice proves: integration
- Real runtime required: yes
- Human/UAT required: yes

## Verification

- `pnpm --filter @monster/shared build` exits 0 after T01 (schema in dist)
- `pnpm -r --filter apps/admin typecheck` or `tsc --noEmit` exits 0 after each task
- After T02: create a site via `/sites/new` in the browser → site row appears in `/sites` list with correct data — confirmed by direct browser interaction against the running app on port 3004
- After T03: edit form pre-fills correctly; save redirects to detail with updated name; active nav link is highlighted (visible highlight on active route for all 7 nav items)
- After slice: `pm2 reload monster-admin` → `curl -sI http://localhost:3004/sites` returns HTTP 200
- **Failure-path diagnostic:** Submit `/sites/new` with required fields missing → form renders inline validation errors (field-level Zod messages); no redirect occurs; no row written to Supabase `sites` table. Confirm with `pm2 logs monster-admin --lines 20` — no unhandled error thrown, only expected field validation.
- **Missing env var diagnostic:** If `SUPABASE_SERVICE_ROLE_KEY` is unset, `createServiceClient()` throws `"Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY"` — visible in `pm2 logs monster-admin` and Next.js error boundary, not swallowed.

## Observability / Diagnostics

- Runtime signals: server action errors surface as thrown errors (Next.js will render an error boundary); service client missing env var throws descriptive message at call time (D021)
- Inspection surfaces: Supabase dashboard → `sites` table for row verification; `pm2 logs monster-admin` for server action errors
- Failure visibility: form validation errors rendered inline (Zod parse errors mapped to field messages); redirect on success; no silent swallowing
- Redaction constraints: `SUPABASE_SERVICE_ROLE_KEY` must not appear in any rendered output or client bundle

## Integration Closure

- Upstream surfaces consumed: `createServiceClient()` from `packages/db/src/client.ts`; `Database` types from `packages/db/src/types/supabase.ts`; `SiteStatus`, `AmazonMarket`, `Language`, `SiteTemplate` from `packages/shared`; shadcn `button`, `input`, `label` (already installed)
- New wiring introduced: `SiteCustomization` Zod schema in `packages/shared` (consumed by M003 generator); `apps/admin/src/lib/supabase/service.ts` (consumed by S02, S03, S04 server actions); `NavItem` client component (active state for all 7 routes)
- What remains before the milestone is truly usable end-to-end: S02 (dashboard KPIs), S03 (settings/API keys), S04 (finances shell)

## Tasks

- [x] **T01: Define SiteCustomization schema, wire service client, install shadcn components** `est:45m`
  - Why: Retires the two highest risks before any UI work — schema shape (D027) and service role client footgun (D019). shadcn components must exist before the create form can be built.
  - Files: `packages/shared/src/types/customization.ts`, `packages/shared/src/types/index.ts`, `packages/shared/package.json`, `apps/admin/src/lib/supabase/service.ts`, `apps/admin/src/components/ui/` (shadcn installs)
  - Do: Add zod as a dependency to `packages/shared`; define `SiteCustomizationSchema` (Zod object) and `SiteCustomization` type in `customization.ts`; export from `packages/shared` index; create `apps/admin/src/lib/supabase/service.ts` that re-exports `createServiceClient` from `@monster/db`; run `pnpm shadcn add card select textarea badge table separator` in `apps/admin`
  - Verify: `pnpm --filter @monster/shared build` exits 0; `pnpm --filter @monster/shared typecheck` exits 0; `ls apps/admin/src/components/ui/` shows new components
  - Done when: `@monster/shared` builds successfully with `SiteCustomization` type exported, all 6 shadcn components present in `apps/admin/src/components/ui/`, `service.ts` exists with correct re-export, `tsc --noEmit` exits 0 in `apps/admin`

- [x] **T02: Sites list page + create form with live DB round-trip** `est:2h`
  - Why: Delivers the primary user-facing proof — a real form that writes to Supabase and a list that reads back. Proves service client works end-to-end. First live integration closure.
  - Files: `apps/admin/src/app/(dashboard)/sites/page.tsx`, `apps/admin/src/app/(dashboard)/sites/new/page.tsx`, `apps/admin/src/app/(dashboard)/sites/actions.ts`
  - Do: Replace sites `page.tsx` stub with a server component that calls `createServiceClient()`, queries `sites` table (all columns), renders a shadcn `table` with columns: name, domain, status (badge), market, created_at, and a row-click link to `/sites/[id]`. Create `/sites/new/page.tsx` as a server component rendering a form. Create `actions.ts` with `'use server'` at file level; `createSite` action: parse `FormData`, validate name/domain/niche/market/language/currency/affiliate_tag/template_slug/customization fields against `SiteCustomizationSchema`, call `createServiceClient().from('sites').insert(...)`, on success `revalidatePath('/sites')` and `redirect('/sites')`. Form includes all fields; use shadcn `select` for market/language/template_slug/currency, `textarea` for niche, `input` for text fields, `card` for layout sections. Inline validation errors below each field on form failure.
  - Verify: Start dev server (`pnpm --filter admin dev`), navigate to `/sites/new`, fill form, submit — row appears in `/sites` list. Check Supabase `sites` table directly to confirm row written correctly.
  - Done when: Site created via form appears in the list with correct name/domain/status shown; Supabase row confirms all fields persisted; `tsc --noEmit` exits 0

- [x] **T03: Detail view + edit form + nav active state** `est:1.5h`
  - Why: Completes CRUD (read detail + update). Nav active state is the final must-have for S01 per the roadmap boundary contract.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx`, `apps/admin/src/app/(dashboard)/sites/actions.ts` (extend with `updateSite`), `apps/admin/src/components/nav-item.tsx`, `apps/admin/src/components/nav-sidebar.tsx`
  - Do: Create `/sites/[id]/page.tsx`: fetch site by id via `createServiceClient()`, render all fields in a `card` layout with an "Edit" button linking to `/sites/[id]/edit`. Create `/sites/[id]/edit/page.tsx`: fetch existing site, render same form as create but pre-filled; add `updateSite` server action to `actions.ts` (same Zod validation, `.update()` call, `revalidatePath` both `/sites` and `/sites/${id}`, redirect to detail). Create `nav-item.tsx` as `'use client'` component using `usePathname()` to apply active styles (`bg-gray-800 text-white` class) when `pathname.startsWith(href)`. Update `nav-sidebar.tsx` to use `NavItem` for each nav link (sidebar itself stays server component per D029).
  - Verify: Navigate to site detail — all fields show. Click Edit — form pre-filled. Change name, save — detail shows new name, list shows new name. Click each of the 7 nav links — active link has visible highlight; others do not.
  - Done when: Edit persists to DB and reflects in both detail and list views; all 7 nav items highlight correctly on their respective routes; `tsc --noEmit` exits 0; `pm2 reload monster-admin && curl -sI http://localhost:3004/sites` returns HTTP 200

## Files Likely Touched

- `packages/shared/src/types/customization.ts` (new)
- `packages/shared/src/types/index.ts`
- `packages/shared/package.json`
- `apps/admin/src/lib/supabase/service.ts` (new)
- `apps/admin/src/components/ui/card.tsx` (new, shadcn)
- `apps/admin/src/components/ui/select.tsx` (new, shadcn)
- `apps/admin/src/components/ui/textarea.tsx` (new, shadcn)
- `apps/admin/src/components/ui/badge.tsx` (new, shadcn)
- `apps/admin/src/components/ui/table.tsx` (new, shadcn)
- `apps/admin/src/components/ui/separator.tsx` (new, shadcn)
- `apps/admin/src/app/(dashboard)/sites/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/actions.ts` (new)
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` (new)
- `apps/admin/src/components/nav-item.tsx` (new)
- `apps/admin/src/components/nav-sidebar.tsx`
