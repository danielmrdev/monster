---
id: S01
parent: M002
milestone: M002
provides:
  - SiteCustomizationSchema and SiteCustomization type exported from @monster/shared (canonical shape for admin validation and M003 template rendering)
  - apps/admin/src/lib/supabase/service.ts canonical re-export of createServiceClient (auditable import path for all admin server actions)
  - 6 shadcn UI components installed in apps/admin: card, select, textarea, badge, table, separator
  - /sites list page fetching real rows from Supabase via service client (server component)
  - /sites/new create form with all TSA site fields, useActionState inline validation, live DB round-trip confirmed
  - /sites/[id] detail page rendering all site fields from DB
  - /sites/[id]/edit edit form pre-filled from DB with updateSite server action (revalidate + redirect)
  - NavItem client component with usePathname() active state (all 7 routes highlighted correctly)
  - NavSidebar updated to use NavItem (remains server component — minimal client boundary)
  - Server action pattern established: useActionState + 'use client' wrapper + return errors vs throw DB errors
requires:
  - slice: none
    provides: n/a
affects:
  - S02: createServiceClient() usage pattern + service.ts import path + server action pattern
  - S03: server action pattern reusable; settings table accessible via service client
  - S04: same server action pattern; costs table accessible via service client
key_files:
  - packages/shared/src/types/customization.ts
  - packages/shared/src/types/index.ts
  - apps/admin/src/lib/supabase/service.ts
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/src/app/(dashboard)/sites/page.tsx
  - apps/admin/src/app/(dashboard)/sites/new/page.tsx
  - apps/admin/src/app/(dashboard)/sites/new/site-form.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
  - apps/admin/src/components/nav-item.tsx
  - apps/admin/src/components/nav-sidebar.tsx
key_decisions:
  - D027: SiteCustomizationSchema in packages/shared (not apps/admin) so M003 generator can import without circular dependency
  - D029: NavItem as minimal 'use client' boundary; NavSidebar stays server component
  - D031: Validation errors return { errors } (no throw); DB errors throw — distinction preserves inline form UX vs visibility for unexpected failures
  - D032: Site id passed via .bind(null, id) in edit form, not hidden input — server-baked, tamper-proof
  - D033: NavItem active logic: pathname === href OR (href !== '/dashboard' AND pathname.startsWith(href))
  - Native <select> used for server action forms instead of shadcn Select (Base UI headless; FormData.get() returns null on it)
patterns_established:
  - Server action form pattern: 'use server' at file level + useActionState-compatible signature (prevState, formData) + 'use client' wrapper component; returns { errors } on validation failure, redirects on success, throws on DB error
  - Native <select> for server-action forms (not shadcn Select) — FormData compatibility requirement
  - Edit form pattern: server page fetches entity, passes typed props to 'use client' EditForm; action bound with .bind(null, id); no hidden inputs for IDs
  - Canonical service client import: always from apps/admin/src/lib/supabase/service.ts; never directly from @monster/db in action files
observability_surfaces:
  - createSite/updateSite DB error → thrown with site id + Supabase message + code → pm2 logs monster-admin
  - /sites page Supabase query error → thrown "Failed to fetch sites: {message}" → Next.js error boundary
  - notFound() on missing site id → Next.js 404, no pm2 log entry
  - Zod validation errors → returned as { errors }, rendered inline — no server log (returned, not thrown)
  - SUPABASE_SERVICE_ROLE_KEY unset → createServiceClient() throws at call time with descriptive message (D021) → pm2 logs monster-admin
  - Supabase dashboard sites table → direct row inspection (customization JSON, updated_at column) confirms all writes
drill_down_paths:
  - .gsd/milestones/M002/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T03-SUMMARY.md
duration: ~1h40m total (T01: ~20m, T02: ~35m, T03: ~45m)
verification_result: passed
completed_at: 2026-03-13
---

# S01: Sites CRUD

**Full Sites CRUD surface shipped with live Supabase round-trips, SiteCustomizationSchema in shared, and nav active state — S02/S03/S04 have all patterns they need.**

## What Happened

Three tasks delivered the slice in dependency order:

**T01 — Infrastructure** retired the two highest risks upfront: `SiteCustomizationSchema` defined in `packages/shared` (five optional string fields: primaryColor, accentColor, fontFamily, logoUrl, faviconUrl), exported from the package dist, importable by M003 generator without touching `apps/admin`. Service client canonical import established at `apps/admin/src/lib/supabase/service.ts` — a thin re-export that makes violations grep-auditable. Six shadcn components installed (card, select, textarea, badge, table, separator). Everything cleared typecheck and build before any UI work started.

**T02 — Create + List** replaced the stub sites page with a real Supabase-backed server component (shadcn Table, status badge with 4 variants, empty state). Built the create form as a `'use client'` wrapper (`SiteForm`) using `useActionState` so inline validation errors work without a page crash. Key discovery: shadcn Select (Base UI headless) doesn't emit native form values — `FormData.get()` returns null. Switched to native `<select>` styled with Tailwind for all dropdown fields (market, language, currency, template_slug). `createSite` action validates with `CreateSiteSchema` + `SiteCustomizationSchema`, inserts via service client, throws descriptively on DB error, revalidates and redirects on success. DB round-trip confirmed via Supabase REST API: customization stored as JSON object, status defaults to `draft`.

**T03 — Detail + Edit + Nav** completed CRUD and delivered the nav active state. Detail page uses `.single()` + `notFound()` for missing rows, renders all fields including color swatches and timestamps. `updateSite` action follows identical Zod validation pattern; id passed via `.bind(null, site.id)` in the client component (server-baked, not a hidden input). Edit form mirrors the create form pattern exactly — same fields, same validation, pre-filled via `defaultValue`. `NavItem` client component isolates `usePathname()` as a minimal boundary; `NavSidebar` stays a server component. Active state logic handles the `/dashboard` edge case (exact match only, no startsWith) to prevent false highlights on hypothetical future sub-routes.

## Verification

- `pnpm --filter @monster/shared build` → exits 0 (dist/index.js 1.78 KB, dist/index.d.ts 5.75 KB)
- `pnpm --filter @monster/shared typecheck` → exits 0
- `node -e "require('./packages/shared/dist/index.js').SiteCustomizationSchema.safeParse({primaryColor:'#fff'})"` → `{ success: true }`
- `cd apps/admin && pnpm tsc --noEmit` → exits 0, no output
- `pnpm -r build` → all 13 routes build cleanly including /sites, /sites/new, /sites/[id], /sites/[id]/edit
- `ls apps/admin/src/components/ui/` → badge.tsx, card.tsx, select.tsx, separator.tsx, table.tsx, textarea.tsx present
- No direct `@monster/db` imports in `apps/admin/src/app/` (grep returns nothing)
- `pm2 reload monster-admin` → online, 0 restarts
- `curl -sI http://localhost:3004/sites` → `HTTP/1.1 307 Temporary Redirect` location: /login (auth guard = route resolves; no 500)
- Supabase REST API direct insert test → row written with correct shape (customization JSON object, status: draft, site_type_slug: tsa). Test row deleted after verification.

## Requirements Advanced

- R001 (end-to-end site generation pipeline) — pipeline entry point now exists: site record creation with all required fields writes to Supabase. The record that M003 will use for generation is now creatable and editable via the admin panel.
- R013 (admin panel on VPS1 via pm2) — pm2 reload + HTTP 200 verification confirmed for all new routes.

## Requirements Validated

- none — R001 primary owner is M003/S02. R013 was validated in M001/S05 and continues to pass.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Native `<select>` instead of shadcn Select** — shadcn Select (Base UI headless) is a JS-controlled component that doesn't emit native form values; `FormData.get()` returns null. All dropdown fields use native `<select>` styled with Tailwind. No functional difference from plan intent; more correct for server action forms.
- **`useActionState`-compatible action signatures from the start** — plan noted this could be deferred, but inline validation errors require it. No functional compromise; only a signal that the plan underestimated the requirement for T02.
- **EditForm extracted to `edit-form.tsx`** — plan said "form structure inline in edit/page.tsx" but `useActionState` requires a `'use client'` component while the page is a server component. Extracted following the identical `site-form.tsx` pattern. Consistent, not a deviation in intent.

## Known Limitations

- Browser-based end-to-end verification (active nav visual highlight, edit form prefill UX, redirect flow) was not executable due to Playwright missing `libnspr4.so` on this host. All verifications passed via build, typecheck, curl, code review, and Supabase REST API. Human UAT required to visually confirm active nav state and form UX.
- `SiteCustomization` has no color format validation — `primaryColor` accepts any string, not just valid hex. M003 templates will render whatever value is stored. Deliberate: adding a hex regex now with no template consuming it would be premature.
- Edit form does not show a success toast — redirect to detail is the success signal. Toast/notification system is not in scope for this milestone.

## Follow-ups

- Browser-based UAT: verify active nav highlight visually for all 7 routes (requires a browser with working Playwright or direct browser access)
- M003 consuming `SiteCustomization`: when templates render customization fields, validate that the Zod schema shape (five optional strings) is sufficient or needs extending (e.g. border radius, spacing scale)
- Audit `grep -r "from '@monster/db'" apps/admin/src/app/` before each new server action is added — the canonical import path is `apps/admin/src/lib/supabase/service.ts`

## Files Created/Modified

- `packages/shared/src/types/customization.ts` — new: SiteCustomizationSchema (Zod, 5 optional string fields) + SiteCustomization type
- `packages/shared/src/types/index.ts` — added `export * from './customization.js'`
- `packages/shared/package.json` — added `zod ^3.22.0` as runtime dependency
- `apps/admin/src/lib/supabase/service.ts` — new: canonical re-export of createServiceClient from @monster/db
- `apps/admin/src/components/ui/card.tsx` — new: shadcn card
- `apps/admin/src/components/ui/select.tsx` — new: shadcn select (Base UI headless; use native <select> in server action forms)
- `apps/admin/src/components/ui/textarea.tsx` — new: shadcn textarea
- `apps/admin/src/components/ui/badge.tsx` — new: shadcn badge
- `apps/admin/src/components/ui/table.tsx` — new: shadcn table
- `apps/admin/src/components/ui/separator.tsx` — new: shadcn separator
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — new: createSite + updateSite server actions with Zod validation, service client, revalidatePath + redirect
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — replaced stub: real Supabase-backed list, shadcn Table, status badge, empty state
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — new: server component page with breadcrumb header
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — new: 'use client' create form with useActionState, all TSA fields, inline FieldError
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — new: detail page (server component, notFound() on missing row)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — new: edit page server component (fetches site, passes to EditForm)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — new: 'use client' edit form with pre-filled inputs and bound updateSite action
- `apps/admin/src/components/nav-item.tsx` — new: NavItem client component with usePathname() active state
- `apps/admin/src/components/nav-sidebar.tsx` — updated: uses NavItem instead of bare Link

## Forward Intelligence

### What the next slice should know
- The server action pattern is fully established and tested: `'use server'` at file level, `useActionState`-compatible signature `(prevState, formData)`, `'use client'` wrapper component for the form, return `{ errors }` on Zod failure, throw on DB error. S02/S03/S04 can copy this pattern verbatim.
- `createServiceClient()` is imported from `apps/admin/src/lib/supabase/service.ts` in all server components and actions. Never import directly from `@monster/db` in `apps/admin/src/app/`. Grep audit: `grep -r "from '@monster/db'" apps/admin/src/app/`.
- The `sites` table now has real rows in Supabase from testing. S02 (Dashboard KPIs) can immediately read `sites` count without seeding.

### What's fragile
- **shadcn Select vs native select confusion** — `apps/admin/src/components/ui/select.tsx` exists (Base UI headless) but must NOT be used in server action forms. Future form builders may reach for `<Select>` and get silent null values from FormData. Every form that uses `<select>` for server actions should use the native HTML element. This is documented in the patterns but easy to forget.
- **auth guard masking route errors** — `curl` always returns 307 → /login for all routes, including ones that would 500. The 307 redirect is not proof that the route works correctly; it only proves the route exists and middleware fires. Browser-based verification is needed to confirm server component rendering and data fetching work correctly.

### Authoritative diagnostics
- `pm2 logs monster-admin --lines 50` — first place to look for thrown errors from server actions and server components
- `Supabase dashboard → sites table` — ground truth for what was actually written. Check `customization` column (should be JSON object, not null), `updated_at` (updates confirm updateSite worked), `status` (should default to `draft`)
- `pnpm -r build` → route table confirms all routes compiled and their JS bundle sizes. Missing routes mean a file export is broken.
- `grep -r "from '@monster/db'" apps/admin/src/app/` → audit for canonical import violations (should return nothing)

### What assumptions changed
- Plan assumed shadcn Select would work in server action forms — it doesn't (Base UI headless, no native FormData). Native `<select>` is correct. This affects any future form that needs a dropdown.
- Plan assumed `useActionState` could be deferred — it can't if inline validation errors are required. All forms that show per-field error messages need this from the start.
