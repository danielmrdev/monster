---
estimated_steps: 7
estimated_files: 4
---

# T02: Sites list page + create form with live DB round-trip

**Slice:** S01 — Sites CRUD
**Milestone:** M002

## Description

Replace the "Coming soon" sites stub with a real list page that fetches from Supabase via the service client, and build the create form that writes a new site record to the DB. This is the integration proof — a real create→read round-trip through the service role client confirms both the service client and RLS bypass are working correctly.

The create form covers all site fields. Server action validates with Zod (including `SiteCustomizationSchema` for the customization fields) before inserting. Inline validation errors on failure.

## Steps

1. Create `apps/admin/src/app/(dashboard)/sites/actions.ts` with `'use server'` at file level. Define `createSite(formData: FormData)`:
   - Extract all fields from FormData: `name`, `domain`, `niche`, `market`, `language`, `currency`, `affiliate_tag`, `template_slug`, plus customization fields (`primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, `faviconUrl`)
   - Parse the top-level site fields with a Zod schema (name required, rest optional)
   - Parse customization fields with `SiteCustomizationSchema`; store as the `customization` JSON column value
   - On validation error: return `{ errors: ... }` (do not throw — form can render inline errors)
   - On success: call `createServiceClient().from('sites').insert({ site_type_slug: 'tsa', ...fields })`, throw on Supabase error, then `revalidatePath('/sites')` and `redirect('/sites')`

2. Replace `apps/admin/src/app/(dashboard)/sites/page.tsx`:
   - Server component; call `createServiceClient().from('sites').select('*').order('created_at', { ascending: false })`
   - Render a page header with title "Sites" and a "+ New Site" button linking to `/sites/new`
   - Render a shadcn `table` with columns: Name (link to `/sites/[id]`), Domain, Status (shadcn `badge` with color by status: draft=gray, live=green, error=red, others=yellow), Market, Created
   - Empty state: card with "No sites yet" and a link to `/sites/new`

3. Create `apps/admin/src/app/(dashboard)/sites/new/page.tsx`:
   - Server component (no client state needed — server action handles submission)
   - Import `createSite` from `../actions`; render a `<form action={createSite}>`
   - Lay out the form in two shadcn `card` sections: "Basic Info" and "Customization"
   - Basic Info fields: `name` (input, required), `domain` (input), `niche` (textarea), `market` (select — options from `AmazonMarket` values: ES/US/UK/DE/FR/IT/MX/CA/JP/AU), `language` (select — es/en/de/fr/it/ja), `currency` (select — EUR/USD/GBP/MXN/CAD/JPY/AUD), `affiliate_tag` (input), `template_slug` (select — classic/modern/minimal)
   - Customization fields: `primaryColor` (input type=color or text), `accentColor` (input type=color or text), `fontFamily` (input), `logoUrl` (input), `faviconUrl` (input)
   - Submit button + Cancel link back to `/sites`
   - Note: use a client wrapper component if needed to handle form state/errors from the server action return value, OR use `useFormState` / `useActionState` in a `'use client'` component. Keep it simple — if server action redirects on success and throws on DB error, a simple `<form action={createSite}>` without client state is sufficient for T02; inline validation errors can be added in T02 via `useActionState` if time allows, or deferred to be added naturally during T03.

4. Verify the round-trip manually against the running dev server: fill form, submit, confirm row in `/sites` list and in Supabase dashboard.

5. Run `cd apps/admin && pnpm tsc --noEmit` — must exit 0.

## Must-Haves

- [ ] `actions.ts` has `'use server'` at file level (not just on the function) — required for Next.js server action files
- [ ] `createSite` validates `name` as required; returns error (not throws) on validation failure so the page doesn't crash
- [ ] Service client used for the DB insert — never the anon client from `@/lib/supabase/server`
- [ ] `customization` stored as a JSON object in the `sites` table (not as a flat string)
- [ ] Sites list page shows real rows from Supabase (not hardcoded)
- [ ] Status badge renders with at minimum two distinct colors (draft vs live)
- [ ] `tsc --noEmit` exits 0 after this task

## Verification

- `pnpm --filter admin dev` starts without error
- Navigate to `/sites` — list renders (may be empty, that's fine)
- Navigate to `/sites/new` — form renders with all expected fields
- Fill name + market + language + template_slug (required selects), submit — redirects to `/sites`, new row visible
- Check Supabase `sites` table: row exists with correct `name`, `market`, `language`, `template_slug`, `customization` JSON
- `cd apps/admin && pnpm tsc --noEmit` exits 0

## Observability Impact

- Signals added/changed: server action throws on Supabase error (message includes table name and operation) — visible in `pm2 logs monster-admin` and Next.js error boundary
- How a future agent inspects this: `pm2 logs monster-admin --lines 50` for server errors; Supabase dashboard `sites` table for data verification
- Failure state exposed: Supabase `.insert()` errors surface as thrown exceptions with the Supabase error message; missing `SUPABASE_SERVICE_ROLE_KEY` throws the descriptive message from `createServiceClient()` (D021)

## Inputs

- `apps/admin/src/lib/supabase/service.ts` — from T01, service client re-export
- `packages/shared/src/types/customization.ts` — from T01, `SiteCustomizationSchema` for validation
- `packages/shared/src/types/index.ts` — `AmazonMarket`, `Language`, `SiteTemplate` for select options
- `packages/db/src/types/supabase.ts` — `TablesInsert<'sites'>` for type-safe insert
- shadcn components from T01 — `card`, `select`, `textarea`, `badge`, `table`

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/actions.ts` — server actions file with `createSite`
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — real list page with DB fetch
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — create form, all fields
