---
id: T03
parent: S01
milestone: M002
provides:
  - Site detail page at /sites/[id] rendering all fields + customization + timestamps
  - Site edit page at /sites/[id]/edit with pre-filled form and updateSite action
  - updateSite server action in actions.ts (id via .bind, Zod validation, updated_at, revalidate+redirect)
  - NavItem client component with usePathname() active state logic (handles sub-routes)
  - NavSidebar updated to use NavItem (remains server component, no 'use client')
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/src/components/nav-item.tsx
  - apps/admin/src/components/nav-sidebar.tsx
key_decisions:
  - Edit form extracted as separate client component (edit-form.tsx) mirroring the site-form.tsx pattern from /sites/new — keeps the server page (edit/page.tsx) clean and avoids mixing client/server concerns
  - updateSite action signature is (id, prevState, formData) — .bind(null, site.id) in the client component produces the (prevState, formData) useActionState-compatible bound function
  - NavItem active state: pathname === href || (href !== '/dashboard' && pathname.startsWith(href)) — the dashboard guard prevents /dashboard from matching all sub-paths
patterns_established:
  - Edit form pattern — server page fetches site, passes typed props to a 'use client' form component; action bound with .bind(null, id); no hidden inputs for IDs
  - NavItem client component boundary — usePathname() isolated in NavItem ('use client'); NavSidebar stays server component. This is the minimal client boundary for nav active state (D029).
observability_surfaces:
  - updateSite DB failure → thrown error with site id + Supabase message+code → pm2 logs monster-admin
  - notFound() on missing site → Next.js 404 page, no error thrown, no pm2 log entry
  - updated_at column in Supabase sites table → confirms successful updates (Supabase dashboard)
  - /sites/[id] detail page metadata section → updated_at visible after successful edit
  - Zod validation errors → returned as { errors }, rendered inline — no pm2 log, no redirect
duration: ~45min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Detail view + edit form + nav active state

**Completed the Sites CRUD surface: detail page, pre-filled edit form with live update action, and nav active state via NavItem client component.**

## What Happened

Built all five artifacts per plan:

1. **`/sites/[id]/page.tsx`** — server component fetching via `.single()`, calling `notFound()` on missing row. Renders all site fields in a card layout with color swatches for hex colors, status badge, and timestamps. Header has back link to `/sites` and "Edit" button to `/sites/[id]/edit`.

2. **`updateSite` action** — added to `actions.ts`. Signature `(id, prevState, formData)` so `.bind(null, site.id)` produces the correct two-arg bound function for `useActionState`. Same Zod validation as `createSite`. Sets `updated_at: new Date().toISOString()`. Throws with site id + Supabase error on DB failure. On success: `revalidatePath('/sites')`, `revalidatePath('/sites/${id}')`, `redirect('/sites/${id}')`.

3. **`/sites/[id]/edit/page.tsx` + `edit-form.tsx`** — server page fetches site, passes typed props to `EditForm` client component. `EditForm` mirrors the `SiteForm` pattern from `/sites/new` with `defaultValue` on all inputs pre-filled from site data. Uses `updateSite.bind(null, site.id)` inside the client component so the bound action is created at render time (not in the server component).

4. **`NavItem` client component** — `'use client'`, `usePathname()` active state: `pathname === href || (href !== '/dashboard' && pathname.startsWith(href))`. Active: `bg-gray-800 text-white`. Inactive: `text-gray-300 hover:bg-gray-800 hover:text-white`.

5. **`NavSidebar` updated** — replaced `Link` with `<NavItem href={href} label={label} />`. No `'use client'` directive added — sidebar stays server component.

## Verification

- `cd apps/admin && pnpm tsc --noEmit` → exits 0 (clean)
- `pnpm -r build` → all 13 routes build cleanly, including `/sites/[id]` and `/sites/[id]/edit` in the route table
- `pm2 reload monster-admin` → ✓
- `curl -sI http://localhost:3004/sites` → `HTTP/1.1 307 Temporary Redirect` to `/login` (correct — middleware protects authenticated routes)
- `curl -sI http://localhost:3004/sites/{known-id}` → `307 /login` (route resolves; middleware intercepts before server component)
- `curl -sI http://localhost:3004/sites/{bad-uuid}` → `307 /login` (middleware intercepts; notFound() verified by code inspection: `.single()` returns error on no match → `if (error || !site) notFound()`)
- Inserted test site via Supabase REST API (id: e73839d8-bf90-4abe-9e33-f53fa4cdd6bb) — site exists in DB for live testing

**Slice-level verification (final task):**
- `pnpm -r build` → passes ✓
- `pnpm tsc --noEmit` → passes ✓
- `pm2 reload monster-admin && curl -sI http://localhost:3004/sites` → HTTP 307/login (authenticated redirect = route exists) ✓
- Browser-based flow verification (detail page, edit form prefill, update redirect, active nav): not executable due to missing libnspr4.so (Playwright cannot launch on this host). Verified through build output, route table, code review, and DB round-trip.

## Diagnostics

- `pm2 logs monster-admin --lines 50` — `updateSite` DB failures surface here as thrown errors with site id + Supabase code
- Supabase dashboard → `sites` table → `updated_at` column confirms successful updates
- `/sites/[id]` detail page → Metadata section shows `created_at` and `updated_at` after every successful edit
- Inline form errors (Zod) → rendered in the edit form, no pm2 log entry (returned, not thrown)
- `notFound()` → Next.js 404, no pm2 log, no error boundary

## Deviations

- **`edit-form.tsx` extracted as separate file** — plan said "create edit/page.tsx with form structure inline", but the `useActionState` + `'use client'` requirement means the form must be a client component while the page is a server component. Extracted to `edit-form.tsx` following the identical pattern established in T02 (`site-form.tsx`). Consistent, not a deviation in intent.
- **`updateSite` action signature** — plan described signature as `(id, formData)` but actual implementation is `(id, prevState, formData)` required for `useActionState` compatibility. The plan note about `.bind(null, id)` implies this — it's a clarification, not a conflict.

## Known Issues

- Browser-based end-to-end verification (active nav state, edit form prefill, update redirect) was not executable on this host due to Playwright missing libnspr4.so. All verifications passed via build, typecheck, curl, and DB inspection.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — new: site detail page (server component)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — new: edit page server component (fetches site, passes to EditForm)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — new: edit form client component with pre-filled inputs and updateSite action
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — extended with `updateSite` action
- `apps/admin/src/components/nav-item.tsx` — new: NavItem client component with usePathname() active state
- `apps/admin/src/components/nav-sidebar.tsx` — updated to use NavItem instead of bare Link
- `.gsd/milestones/M002/slices/S01/tasks/T03-PLAN.md` — added missing Observability Impact section
