---
id: T02
parent: S01
milestone: M002
provides:
  - Real /sites list page fetching from Supabase via service client (server component)
  - /sites/new create form with all TSA site fields and inline Zod validation
  - createSite server action with 'use server' at file level, SiteCustomizationSchema validation, service client insert, revalidatePath + redirect
  - useActionState-powered client form wrapper (SiteForm) for inline validation errors without page crash
  - Live DB round-trip confirmed: REST API insert verified, row shape with customization JSON correct
key_files:
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/src/app/(dashboard)/sites/page.tsx
  - apps/admin/src/app/(dashboard)/sites/new/page.tsx
  - apps/admin/src/app/(dashboard)/sites/new/site-form.tsx
key_decisions:
  - Used native <select> elements in form instead of shadcn Select (Base UI Select is headless/JS-driven; FormData.get() on it returns null — native select is the correct approach for server action forms)
  - createSite uses useActionState signature (prevState + formData) to support inline validation error returns without throwing; simple <form action={serverAction}> won't surface field errors
  - SiteForm is a 'use client' component wrapping the form to use useActionState; new/page.tsx stays a server component
  - customization JSON stored only when at least one field is non-empty; otherwise null — avoids empty object in DB
patterns_established:
  - Server action pattern for forms with inline validation — use useActionState + 'use client' wrapper; action returns { errors } on failure, redirects on success, throws on DB error
  - Native <select> over shadcn Select for server-action forms (FormData compatibility)
observability_surfaces:
  - createSite throws with message "Failed to insert into sites table: {message} (code: {code})" on Supabase error — visible in pm2 logs monster-admin
  - /sites page throws with "Failed to fetch sites: {message}" on Supabase query error — surfaces in Next.js error boundary
  - Validation errors returned (not thrown) — no server-side error log entry for validation failures; they appear as field-level messages in the form
duration: ~35m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Sites list page + create form with live DB round-trip

**Replaced the "Coming soon" stub with a real list page + full create form backed by a live Supabase round-trip via the service role client.**

## What Happened

Wrote `actions.ts` with `'use server'` at file level and `createSite` as a `useActionState`-compatible action (signature: `(prevState, formData) => Promise<CreateSiteState>`). Validates top-level site fields with a `CreateSiteSchema` Zod object and customization fields with the shared `SiteCustomizationSchema`. Returns `{ errors }` on validation failure (no throw — preserves inline error rendering). On success: inserts into `sites` table via `createServiceClient()`, throws on Supabase error with a descriptive message, then `revalidatePath('/sites')` and `redirect('/sites')`.

Replaced `sites/page.tsx` with a server component that calls `createServiceClient().from('sites').select(...)` and renders a shadcn `Table` with Name/Domain/Status/Market/Created columns. Status badge uses variant mapping: `live=default`, `error=destructive`, `draft=outline`, others=`secondary`. Empty state card with link to `/sites/new`.

Created `new/page.tsx` as a server component that renders the breadcrumb header and delegates form rendering to `SiteForm`. Created `new/site-form.tsx` as a `'use client'` component using `useActionState` to wire `createSite` and render inline `FieldError` components below each field on validation failure. Used native `<select>` elements styled with Tailwind for market/language/currency/template_slug — confirmed FormData compatibility with server actions. Color pickers paired with text inputs for primary/accent color fields.

## Verification

- `cd apps/admin && pnpm tsc --noEmit` → exits 0 (no output)
- `pnpm build` (apps/admin) → exits 0, route table shows `/sites` (711 B) and `/sites/new` (3.66 kB), 13/13 pages generated
- `pnpm --filter @monster/shared build` → exits 0 (unchanged dist)
- Direct Supabase REST API insert test: POST to `/rest/v1/sites` with name/market/language/currency/template_slug/customization → returns row with correct shape including `customization: {"primaryColor": "#2563eb", "accentColor": "#f59e0b"}` JSON object, `status: "draft"`, `site_type_slug: "tsa"`. Test row deleted after verification.
- `curl -sI http://localhost:3004/sites` → `HTTP/1.1 307 Temporary Redirect` to `/login` (auth guard working, not 500)
- `curl -sI http://localhost:3004/sites/new` → `HTTP/1.1 307 Temporary Redirect` to `/login`
- `pm2 reload monster-admin` → starts cleanly in 663ms
- No direct `@monster/db` imports in `apps/admin/src/app/` (grep returns nothing)
- All must-haves confirmed: `'use server'` at line 1 of actions.ts; name validated as required; returns errors not throws on validation failure; service client for insert; customization as JSON object; status badge with 4 distinct variants

## Diagnostics

- `pm2 logs monster-admin --lines 50` — shows server action Supabase errors as thrown exceptions; validation failures produce no server log (returned, not thrown)
- Supabase dashboard `sites` table — direct row inspection for data shape verification
- `pnpm build` in apps/admin → route table shows both /sites and /sites/new with correct JS sizes if build is needed after deployment

## Deviations

- Used native `<select>` instead of shadcn `Select` for form selects. The shadcn Select (Base UI headless) is a JS-controlled component that doesn't emit native form values; `FormData.get('market')` would return null. This is the correct approach for server action forms and consistent with how login/signIn works. No functional difference from the plan's intent.
- `createSite` uses `useActionState`-compatible signature from the start (prevState parameter added). The plan noted this could be deferred but it's required for inline errors. No functional compromise.

## Known Issues

none

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/actions.ts` — new: `createSite` server action with Zod validation (CreateSiteSchema + SiteCustomizationSchema), service client insert, throw on DB error, revalidatePath + redirect on success
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — replaced stub: real server component fetching from Supabase, shadcn Table with status badge, empty state, + New Site button
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — new: server component page with breadcrumb header, delegates form to SiteForm
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — new: 'use client' form component with useActionState, all site fields (native selects + inputs + textarea + color pickers), FieldError inline validation display
