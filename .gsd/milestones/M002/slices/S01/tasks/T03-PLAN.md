---
estimated_steps: 6
estimated_files: 6
---

# T03: Detail view + edit form + nav active state

**Slice:** S01 — Sites CRUD
**Milestone:** M002

## Description

Complete the CRUD surface with a detail page and edit form, then wire the nav active state to close out the S01 boundary contract. The `NavItem` client component (`usePathname()`) replaces the static links in `NavSidebar` — this is the only client boundary needed, keeping the sidebar itself a server component (D029).

After this task, all four site routes work, all 7 nav links highlight correctly, and the pm2 reload verification passes.

## Steps

1. Create `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`:
   - Server component; extract `params.id` from props
   - Call `createServiceClient().from('sites').select('*').eq('id', id).single()`
   - If no row or error, call `notFound()` from `next/navigation`
   - Render all site fields in a `card` layout: name (heading), domain, niche, status (badge), market, language, currency, affiliate_tag, template_slug, customization fields (primaryColor, accentColor, fontFamily, logoUrl, faviconUrl — read from `site.customization as SiteCustomization | null`)
   - Header: back link to `/sites`, "Edit" button linking to `/sites/[id]/edit`

2. Add `updateSite` server action to `apps/admin/src/app/(dashboard)/sites/actions.ts`:
   - Signature: `updateSite(id: string, formData: FormData)` — use `.bind(null, id)` in the form to pass the id
   - Same Zod validation as `createSite`
   - Call `createServiceClient().from('sites').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id)`
   - On success: `revalidatePath('/sites')`, `revalidatePath('/sites/${id}')`, `redirect('/sites/${id}')`

3. Create `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx`:
   - Server component; fetch existing site (same as detail page)
   - Render same form structure as `/sites/new` but with `defaultValue` on all inputs pre-filled from the site row
   - Bind the `updateSite` action: `const updateSiteWithId = updateSite.bind(null, site.id)` and use as `<form action={updateSiteWithId}>`
   - Submit button labeled "Save Changes"; cancel link to `/sites/[id]`

4. Create `apps/admin/src/components/nav-item.tsx`:
   - `'use client'` directive
   - Props: `href: string`, `label: string`
   - Uses `usePathname()` from `next/navigation`
   - Active when `pathname === href` or (`href !== '/dashboard'` and `pathname.startsWith(href)`) — the second condition handles sub-routes like `/sites/new`, `/sites/[id]`
   - Active classes: `bg-gray-800 text-white`; inactive: `text-gray-300 hover:bg-gray-800 hover:text-white`
   - Renders a Next.js `Link` with the appropriate classes

5. Update `apps/admin/src/components/nav-sidebar.tsx`:
   - Import `NavItem` from `./nav-item`
   - Replace the `Link` rendered inside `navItems.map()` with `<NavItem href={href} label={label} />`
   - Sidebar component itself has no `'use client'` directive — it stays a server component

6. Run typecheck and operational verification:
   - `cd apps/admin && pnpm tsc --noEmit` — exits 0
   - Build and deploy: `pnpm -r build` then `pm2 reload monster-admin`
   - `curl -sI http://localhost:3004/sites` — returns HTTP 200

## Must-Haves

- [ ] Detail page calls `notFound()` on missing site (not a crash or blank page)
- [ ] `updateSite` uses `.bind(null, id)` pattern to pass the site id through the form action — id is not in a hidden input
- [ ] `updated_at` set to current ISO timestamp in the update call (D016)
- [ ] `NavItem` uses `'use client'` directive; `NavSidebar` does not
- [ ] Active state logic handles sub-routes: `/sites/new` and `/sites/[id]/edit` both highlight the "Sites" nav item
- [ ] `tsc --noEmit` exits 0
- [ ] `pm2 reload monster-admin && curl -sI http://localhost:3004/sites` returns HTTP 200

## Verification

- Navigate to `/sites/[id]` for an existing site — all fields display correctly
- Navigate to `/sites/[id]/edit` — form inputs are pre-filled with existing values
- Change the site name, submit — redirected to detail page showing the new name; `/sites` list shows updated name
- Navigate to each of the 7 routes (`/dashboard`, `/sites`, `/monster`, `/research`, `/analytics`, `/finances`, `/settings`) — the corresponding nav link has visually distinct active styling; no other links are highlighted
- Navigate to `/sites/new` — "Sites" nav link is still highlighted (sub-route active logic)
- `cd apps/admin && pnpm tsc --noEmit` exits 0
- `pm2 reload monster-admin && curl -sI http://localhost:3004/sites` returns HTTP 200

## Observability Impact

**New runtime signals introduced by this task:**

- **`updateSite` failure path:** If the Supabase `.update()` call fails, the action throws `"Failed to update site ${id}: ${message} (code: ${code})"`. This surfaces in Next.js error boundary and in `pm2 logs monster-admin`. No silent swallowing.
- **`notFound()` on detail/edit page:** If a site id is not found in the DB, Next.js renders the 404 page (not a crash). Inspectable via `pm2 logs monster-admin` — no error logged, just the 404 response.
- **NavItem active state:** Client-side only — `usePathname()` drives class toggling. No server-side signal. Visually inspectable in the browser; no logs.
- **`updated_at` timestamp:** Every successful `updateSite` call writes `updated_at: new Date().toISOString()` to the DB. Inspect via Supabase dashboard → `sites` table or via the detail page metadata section.

**Inspection surfaces:**
- `pm2 logs monster-admin --lines 50` — thrown errors from `updateSite` (DB failures, env var missing)
- Supabase dashboard → `sites` table — `updated_at` column confirms successful updates
- Next.js error boundary — renders for unhandled thrown exceptions (not for returned `{ errors }`)
- `/sites/[id]` detail page metadata section — shows `updated_at` value after a successful edit

**Failure visibility:**
- Zod validation errors: returned as `{ errors }`, rendered inline on the edit form — no server log, no redirect
- DB update error: thrown, surfaces in pm2 logs and error boundary
- Missing `SUPABASE_SERVICE_ROLE_KEY`: throws at `createServiceClient()` call time with descriptive message (D021)
- Missing site (notFound): 404 page rendered, no error thrown

## Inputs

- `apps/admin/src/app/(dashboard)/sites/actions.ts` — from T02, extend with `updateSite`
- `apps/admin/src/lib/supabase/service.ts` — from T01, service client
- `packages/shared/src/types/customization.ts` — from T01, `SiteCustomization` type for reading `site.customization`
- `apps/admin/src/components/nav-sidebar.tsx` — existing sidebar to update

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — site detail page
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — pre-filled edit form
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — extended with `updateSite`
- `apps/admin/src/components/nav-item.tsx` — new client component with active state
- `apps/admin/src/components/nav-sidebar.tsx` — updated to use `NavItem`
