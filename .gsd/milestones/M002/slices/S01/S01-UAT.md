# S01: Sites CRUD — UAT

**Milestone:** M002
**Written:** 2026-03-13

## UAT Type

- UAT mode: human-experience + live-runtime
- Why this mode is sufficient: All routes fetch from / write to Supabase Cloud in real time. Build and typecheck verified by automation. Browser-based UAT is required to confirm: (1) form UX and inline validation errors render correctly, (2) active nav state highlights visually for each route, (3) edit form pre-fills from DB, (4) redirect-after-save flows work end-to-end.

## Preconditions

1. Admin panel running on port 3004: `pm2 status` shows `monster-admin` online
2. Authenticated: log in at `http://localhost:3004/login` with the Supabase admin email/password before running tests
3. Supabase Cloud is reachable (`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set in `.env`)
4. No pre-existing site with domain `test-uat-001.com` in the `sites` table (check Supabase dashboard → sites table; delete if present)

## Smoke Test

Navigate to `http://localhost:3004/sites` — page loads (no error boundary, no redirect loop). The sites list renders with a table header (Name / Domain / Status / Market / Created) and either existing rows or an empty state card with a "+ New Site" button.

## Test Cases

### 1. Create a TSA site with full fields

1. Navigate to `http://localhost:3004/sites/new`
2. Verify the page title "New Site" is visible and the form has sections for Basic Info and Customization
3. Fill in the form:
   - Name: `UAT Test Site`
   - Domain: `test-uat-001.com`
   - Niche (textarea): `Camping gear and outdoor equipment for beginners`
   - Market: `ES` (Amazon.es)
   - Language: `es`
   - Currency: `EUR`
   - Affiliate Tag: `uattest-21`
   - Template: `classic`
   - Primary Color: `#2563eb`
   - Accent Color: `#f59e0b`
   - Font Family: `Inter`
   - Logo URL: *(leave blank)*
   - Favicon URL: *(leave blank)*
4. Click **Create Site**
5. **Expected:** Redirected to `/sites`. The table shows a new row with Name = `UAT Test Site`, Domain = `test-uat-001.com`, Status badge = `draft`, Market = `ES`.
6. Open Supabase dashboard → `sites` table → find the new row
7. **Expected:** Row has `status: "draft"`, `site_type_slug: "tsa"`, `market: "ES"`, `language: "es"`, `currency: "EUR"`, `affiliate_tag: "uattest-21"`, `template_slug: "classic"`, `customization: {"primaryColor": "#2563eb", "accentColor": "#f59e0b", "fontFamily": "Inter"}`. Note the site `id` for subsequent tests.

### 2. View site detail

1. On the `/sites` list, click the `UAT Test Site` row (or navigate to `/sites/{id}` directly)
2. **Expected:** Detail page loads with all fields visible:
   - Name: `UAT Test Site`
   - Domain: `test-uat-001.com`
   - Niche: `Camping gear and outdoor equipment for beginners`
   - Market: `ES`, Language: `es`, Currency: `EUR`
   - Affiliate Tag: `uattest-21`
   - Template: `classic`
   - Primary Color: `#2563eb` with a color swatch
   - Accent Color: `#f59e0b` with a color swatch
   - Font Family: `Inter`
   - Status badge: `draft`
   - Created at and Updated at timestamps visible
3. **Expected:** An "Edit" button is visible in the page header. A "← Back to Sites" link is visible.

### 3. Edit a site and verify update persists

1. From the detail page for `UAT Test Site`, click **Edit**
2. **Expected:** Edit form loads at `/sites/{id}/edit` with all fields pre-filled. Name field shows `UAT Test Site`. Domain shows `test-uat-001.com`. Primary Color shows `#2563eb`. Market select shows `ES`.
3. Change the Name to `UAT Test Site (edited)` and the Primary Color to `#dc2626`
4. Click **Save Changes**
5. **Expected:** Redirected to `/sites/{id}` (detail page). Name shows `UAT Test Site (edited)`. Primary Color shows `#dc2626` with updated swatch.
6. Navigate to `/sites` (list)
7. **Expected:** List row shows updated name `UAT Test Site (edited)`
8. Open Supabase dashboard → `sites` table → find the row
9. **Expected:** `name: "UAT Test Site (edited)"`, `customization.primaryColor: "#dc2626"`, `updated_at` timestamp is more recent than `created_at`

### 4. Active nav state — all 7 routes

1. Navigate to each route and verify the correct sidebar link is highlighted (bold text, visible background highlight vs other links which are dimmer):
   - `/dashboard` → **Dashboard** link highlighted; Sites, Research, Analytics, Monster, Finances, Settings are not
   - `/sites` → **Sites** link highlighted; Dashboard is not
   - `/sites/new` → **Sites** link still highlighted (startsWith match)
   - `/sites/{id}` → **Sites** link still highlighted
   - `/sites/{id}/edit` → **Sites** link still highlighted
   - `/research` → **Research Lab** link highlighted
   - `/analytics` → **Analytics** link highlighted
   - `/monster` → **Monster** link highlighted
   - `/finances` → **Finances** link highlighted
   - `/settings` → **Settings** link highlighted
2. **Expected:** Active link has visibly distinct styling (darker background, white text) compared to inactive links (gray text, no background). No two links are active simultaneously.

## Edge Cases

### Validation errors on empty submit

1. Navigate to `http://localhost:3004/sites/new`
2. Click **Create Site** without filling any fields
3. **Expected:** Page does NOT redirect. Error messages appear inline below required fields (Name, Domain, Market, Language, Currency, Affiliate Tag, Template). No unhandled error. No row appears in Supabase `sites` table.

### Validation errors on partial submit

1. Navigate to `http://localhost:3004/sites/new`
2. Fill only Name = `Partial Test` and submit
3. **Expected:** Inline errors appear for Domain, Market, Language, Currency, Affiliate Tag, Template. Name field shows the value entered (form state preserved). No redirect.

### Non-existent site ID

1. Navigate to `http://localhost:3004/sites/00000000-0000-0000-0000-000000000000`
2. **Expected:** Next.js 404 page renders. No unhandled server error. No pm2 log error entry.

### Dashboard link exact match (no false highlight)

1. Navigate to `/dashboard`
2. **Expected:** Only **Dashboard** is highlighted — NOT Sites, Research, Analytics, etc.
3. There are no sub-routes under `/dashboard` today, but verify that visiting `/dashboard` does not also highlight Sites (i.e. the startsWith guard for `/dashboard` is working).

## Failure Signals

- Red error boundary page on `/sites/new` submit → server action throwing unexpectedly; check `pm2 logs monster-admin --lines 50`
- Redirect to `/login` instead of rendering sites page → session expired; re-login and retry
- Empty sites list after successful create → service client not using service role; check `SUPABASE_SERVICE_ROLE_KEY` env var; check `pm2 logs monster-admin`
- Form submits without validation errors but no redirect → `useActionState` wiring broken; inspect browser console for JS errors
- Active nav highlights all links or no links → `usePathname()` returning unexpected value; check browser console
- Edit form shows empty fields (not pre-filled) → server component fetch failed silently; check `pm2 logs monster-admin`
- Edit save redirects to `/sites` instead of `/sites/{id}` → wrong redirect target in `updateSite` action

## Requirements Proved By This UAT

- R001 (supporting) — site record with all TSA fields can be created, viewed, and edited via the admin panel; Supabase row is the pipeline entry point for M003 generation
- R013 (operability) — pm2 + port 3004 + authenticated routes all respond correctly after `pm2 reload monster-admin`

## Not Proven By This UAT

- Site generation (R001 primary) — belongs to M003/S02; no Astro build triggered here
- API key storage and retrieval (R013 supporting) — Settings slice (S03) not built yet
- Dashboard KPI accuracy — S02 not built yet
- Cost entry and P&L — S04 not built yet
- Delete site — not implemented in this slice (no delete action in S01 scope)

## Notes for Tester

- The `sites` table in Supabase may have test rows from development. Feel free to delete `test-uat-001.com` after UAT completes.
- Color pickers in the form show a native color picker alongside a text input — either can set the value. The text input is what gets submitted to FormData.
- Template dropdown options: `classic`, `modern`, `minimal`. Market options: `ES`, `US`, `UK`, `DE`, `FR`, `IT`, `CA`, `JP`, `MX`, `IN`. Language options: `es`, `en`, `de`, `fr`, `it`, `pt`, `ja`.
- If the admin panel was just restarted via `pm2 reload monster-admin`, wait 3-5 seconds before navigating to confirm the process is fully up before testing.
- The edit form's "Save Changes" button triggers a server action — there's a brief pause before the redirect. This is normal; no spinner is shown in this slice.
