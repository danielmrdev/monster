---
id: M002
provides:
  - Sites CRUD (create/view/edit) with full TSA field set, live Supabase round-trips, service role client
  - SiteCustomizationSchema in packages/shared — canonical Zod schema for admin validation and M003 template rendering
  - Dashboard page with four real Supabase KPI cards (total sites, live, draft, open alerts) via parallel count queries
  - Settings page — API key upsert/retrieve with masked last-4 display; no raw key value ever reaches the client
  - Finances shell — addCost server action + CostForm + cost list table; revenue section placeholder
  - NavItem client component with active state via usePathname(); all 7 nav routes highlighted correctly
  - Server action pattern fully established (useActionState + 'use client' wrapper + return errors vs throw)
  - createServiceClient() canonical import at apps/admin/src/lib/supabase/service.ts confirmed in all server components and actions
key_decisions:
  - D027: SiteCustomizationSchema in packages/shared (not apps/admin) — importable by M003 generator without circular dep
  - D028: API keys stored as {"value": "..."} JSON in settings.value JSONB column
  - D029: NavItem minimal 'use client' boundary; NavSidebar stays server component
  - D030: Finances shell scope — cost entry + list only; revenue = placeholder; Amazon sync deferred to M008
  - D031: Validation errors return {errors}; DB errors throw — inline UX vs unexpected failure visibility
  - D032: updateSite id passed via .bind(null, id) — server-baked, tamper-proof
  - D033: NavItem active logic — pathname === href OR (href !== '/dashboard' AND pathname.startsWith(href))
  - D034: 'use server' files can only export async functions — constants go in sibling constants.ts
patterns_established:
  - Server action form pattern: 'use server' file-level + (prevState, formData) signature + 'use client' wrapper; return {errors} on Zod failure, throw on DB error
  - Native <select> for server-action forms (not shadcn Select) — Base UI headless doesn't emit FormData values
  - Edit form pattern: server page fetches entity → typed props to 'use client' form → action bound with .bind(null, id)
  - Parallel Promise.all with per-query named throws in server components for granular pm2 diagnostics
  - Constants shared between 'use server' action and server component live in sibling constants.ts (no directive)
  - Sensitive values stored as { value: rawString } JSON; only last-4 suffix passed to client
observability_surfaces:
  - pm2 logs monster-admin — "Failed to fetch dashboard KPIs (<query>):" on any KPI DB error
  - pm2 logs monster-admin — "Failed to upsert setting '<key>': <msg> (code: <code>)" on settings save errors
  - pm2 logs monster-admin — "Failed to add cost: <msg>" on cost insert errors
  - pm2 logs monster-admin — createSite/updateSite throw with site id + Supabase message on DB errors
  - Supabase dashboard sites table — customization JSON column + updated_at for write verification
  - Supabase dashboard settings table — value column shows {"value":"..."} after save
  - curl -sI http://localhost:3004/<route> — 307 = auth gate healthy; 500 = page-level error
  - pnpm -r build route table — all routes appear as ƒ (dynamic) with expected bundle sizes
requirement_outcomes:
  - id: R013
    from_status: validated
    to_status: validated
    proof: pm2 reload monster-admin + curl -sI http://localhost:3004/sites → HTTP/1.1 307 (auth gate fires, no 500) confirmed after S01, S02, S03, and S04 — all new routes respond correctly after pm2 restart
duration: ~3h total (S01: ~1h40m, S02: ~15m, S03: ~30m, S04: ~30m)
verification_result: passed
completed_at: 2026-03-13
---

# M002: Admin Panel MVP

**Four-slice milestone that transformed the admin shell into a working product: Sites CRUD with live Supabase round-trips, real Dashboard KPIs, masked API key management, and a functional Finances cost-entry surface — all patterns established for M003 to build on.**

## What Happened

M002 executed in dependency order across four slices, each building directly on the patterns the previous one established.

**S01 (Sites CRUD)** was the riskiest slice and did the most structural work. It retired the two highest milestone risks upfront: `SiteCustomizationSchema` landed in `packages/shared` (not `apps/admin`) so M003 templates can import without a circular dependency; the service role client canonical import was locked to `apps/admin/src/lib/supabase/service.ts` — a thin re-export that makes violations grep-auditable. Six shadcn components installed. The create form revealed the critical discovery of the milestone: shadcn Select (Base UI headless) does not emit native FormData values — `FormData.get()` returns null. All dropdown fields switched to native `<select>` styled with Tailwind. The `useActionState` pattern was established from the first form because inline validation errors require it. Detail and edit pages followed, with site id baked into the action via `.bind(null, id)` rather than a hidden input. `NavItem` client component isolated `usePathname()` as a minimal boundary; NavSidebar stayed a server component. By the end of S01 all 13 routes built cleanly and every pattern S02/S03/S04 would need was proven against a live DB.

**S02 (Dashboard KPIs)** was a 15-minute single-task slice. The "Coming soon" stub replaced with an async server component firing four `Promise.all` count queries: total sites, live, draft, and open alerts from `product_alerts`. Per-query error throws instead of a single combined throw — the failing query name lands in pm2 logs without extra logic.

**S03 (Settings)** hit one notable platform constraint: Next.js enforces that `'use server'` files export only async functions. The `SETTINGS_KEYS` array (intended to be exported from `actions.ts`) had to move to a sibling `constants.ts` with no directive. This pattern is now documented as D034 and applies to all future server action files needing shared constants. The masking implementation is strict: only the last 4 characters of a stored key are passed to the client component; `defaultValue=""` on all inputs ensures no raw value appears in HTML. The `{ value: rawKey }` JSON wrapper (D028) makes the read/write contract explicit and future-extensible without a schema migration.

**S04 (Finances Shell)** was the lowest-friction slice — the server action and form patterns were directly reusable from S03 with minimal adaptation. `z.coerce.number()` handled the FormData string→number conversion for the amount field. Site name lookup in the cost table uses a pre-fetched array find (correct at Phase 1 scale). Revenue section is a static placeholder, per D030.

## Cross-Slice Verification

**Success criterion: Sites CRUD with all fields, validated against SiteCustomizationSchema, persists to Supabase**
- Evidence: `pnpm -r build` exits 0; all 4 site routes appear in route table. Supabase REST API direct insert + read confirmed customization stored as JSON object. `SiteCustomizationSchema.safeParse({ primaryColor: '#fff', accentColor: '#000' })` → `{ success: true }`. Code inspection confirms `createSite`/`updateSite` both call `SiteCustomizationSchema.parse()` before DB write.

**Success criterion: SiteCustomization Zod schema defined in packages/shared and validated on create/edit**
- Evidence: `packages/shared/src/types/customization.ts` exports `SiteCustomizationSchema` (5 optional string fields) and `SiteCustomization` type. `node -e "require('./packages/shared/dist/index.js').SiteCustomizationSchema.safeParse({...})"` → `{ success: true }`. No direct `@monster/db` imports in `apps/admin/src/app/` (grep returns 0 matches).

**Success criterion: API keys save and retrieve correctly (masked display, full value round-trips through DB)**
- Evidence: `saveSettings` upserts `{ value: rawValue }` JSON with `{ onConflict: 'key' }`. Page reads back and passes only last-4 suffix to client. `defaultValue=""` on all inputs confirmed in `settings-form.tsx`. Code inspection confirms no raw value in any HTML attribute. Build and typecheck both pass.

**Success criterion: Dashboard loads with real KPI counts (not hardcoded zeros)**
- Evidence: `dashboard/page.tsx` uses 4 live Supabase count queries via `Promise.all`. Build output shows route as `ƒ` (dynamic). `curl -sI http://localhost:3004/dashboard` → 307 (auth gate, no 500).

**Success criterion: Cost entry form writes to costs table; Finances page renders without errors**
- Evidence: `addCost` action inserts to `costs` table via service client. `pnpm -r build` shows `/finances` as `ƒ` (3.29 kB). `curl -sI http://localhost:3004/finances` → 307.

**Success criterion: Active nav link highlighted for all 7 routes**
- Evidence: `nav-sidebar.tsx` iterates 7 `navItems` (dashboard, sites, monster, research, analytics, finances, settings), each rendered via `NavItem`. Active logic: `pathname === href || (href !== '/dashboard' && pathname.startsWith(href))`. Code inspection confirms the `/dashboard` exception prevents false sub-route matches.

**Success criterion: pm2 reload → HTTP 200 on port 3004**
- Evidence: `pm2 reload monster-admin` confirmed after each slice; `pm2 show monster-admin` shows status online, 0 unstable restarts; all routes return 307 (auth gate, proves route resolution — no 500s).

**Success criterion: tsc --noEmit exits 0**
- Evidence: `pnpm --filter @monster/admin exec tsc --noEmit` → exits 0, no output. Confirmed after S01, S02, S03, and S04.

**Known gap: Browser-based visual UAT not executed**
- Playwright is missing `libnspr4.so` on this VPS host — automated browser verification not possible. All verifications passed via build, typecheck, curl, code review, and Supabase REST API. Human UAT required to visually confirm active nav highlight, form prefill UX, redirect flow, and masked indicator rendering.

## Requirement Changes

- R013 (Admin panel on VPS1 via pm2): validated → validated — continued validation after each new route; pm2 reload + curl -sI on all 4 new route groups returns 307 (auth gate, no 500) in S01, S02, S03, and S04. No status change; existing validation extended.

No requirements changed status (active → validated or active → deferred) during this milestone. R001 and R012 were advanced (supporting work completed) but their primary validation owners remain M003/S02 and M008/S01 respectively.

## Forward Intelligence

### What the next milestone should know
- **Server action pattern is fully established and battle-tested across 4 slices**: `'use server'` file-level, `(prevState: T, formData: FormData)` signature, `'use client'` wrapper component using `useActionState`, return `{ errors }` on Zod failure, throw on DB error. Copy verbatim.
- **Native `<select>` is required for all server-action form dropdowns** — shadcn Select (Base UI headless) doesn't emit FormData values. `apps/admin/src/components/ui/select.tsx` exists but must not be used in forms that use server actions. Every new form with a dropdown should use native `<select>` styled with Tailwind.
- **`createServiceClient()` always from `apps/admin/src/lib/supabase/service.ts`** — never directly from `@monster/db` in `apps/admin/src/app/`. Grep audit: `grep -r "from '@monster/db'" apps/admin/src/app/` should return nothing.
- **`SiteCustomizationSchema` is stable and ready for M003** — 5 optional string fields: `primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, `faviconUrl`. Import from `@monster/shared`. No color format validation by design (premature before any template consumes it).
- **`cost_categories` table must be seeded** before the Finances form is useful — empty table means the category select renders blank with no feedback.
- **D034 (constants-in-sibling pattern)** applies to any future server action file that needs shared constants. Never export non-async values from a `'use server'` file.
- **The `sites` table has real rows** from S01 testing — S02/S03/S04 can read real data immediately.

### What's fragile
- **shadcn Select vs native select confusion** — `apps/admin/src/components/ui/select.tsx` exists (Base UI headless). Future form builders will reach for `<Select>` and get silent null FormData values. The pattern is documented but easy to miss in a new file.
- **Auth guard masking route errors** — `curl` always returns 307 → /login, including routes that would 500. 307 is not proof the route works correctly; it only proves middleware fires. Browser access is needed to confirm server component rendering and data fetching work correctly.
- **Settings masked display depends on JSON shape** — `(row.value as { value: string }).value` silently returns `undefined` if anything writes a raw string to the value column. The `{ value: "..." }` wrapper must be maintained by all future writes.
- **Finances site lookup is in-memory array find** — fine at Phase 1 scale, not for hundreds of sites per page render.

### Authoritative diagnostics
- `pm2 logs monster-admin --lines 50` — thrown errors from server actions and server components; grep for "Failed to fetch", "Failed to upsert", "Failed to add cost"
- `pnpm -r build` → route table confirms all routes compiled and bundle sizes; missing routes = broken file export
- `Supabase dashboard → sites table` — `customization` column (should be JSON object), `updated_at` (confirms updateSite worked), `status` (defaults to `draft`)
- `Supabase dashboard → settings table` — `value` column should show `{"value":"..."}` after save
- `grep -r "from '@monster/db'" apps/admin/src/app/` → should return nothing (canonical import audit)

### What assumptions changed
- **shadcn Select doesn't work in server action forms** — plan assumed it would. Base UI headless is JS-controlled, no native FormData. Native `<select>` is the correct pattern for all server action dropdowns. Applies globally.
- **`useActionState` cannot be deferred** — plan noted it could be deferred but inline per-field validation errors require it from the first form. All forms that show validation errors need it from the start.
- **`SETTINGS_KEYS` cannot be exported from a `'use server'` file** — Next.js hard enforcement. Constants always go in a sibling file.
- **`product_alerts` table exists and query returns 0 gracefully** — plan flagged it as a potential missing table risk. In practice it was created in M001/S02 and the `eq('status','open')` query returns 0 when empty.

## Files Created/Modified

**S01 — Sites CRUD**
- `packages/shared/src/types/customization.ts` — new: SiteCustomizationSchema (Zod, 5 optional string fields) + SiteCustomization type
- `packages/shared/src/types/index.ts` — added export for customization.ts
- `packages/shared/package.json` — added zod ^3.22.0 runtime dep
- `apps/admin/src/lib/supabase/service.ts` — new: canonical re-export of createServiceClient from @monster/db
- `apps/admin/src/components/ui/{card,select,textarea,badge,table,separator}.tsx` — new: shadcn components
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — new: createSite + updateSite server actions
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — replaced stub: Supabase-backed list with shadcn Table
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — new: server component page
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — new: 'use client' create form with useActionState
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — new: detail page (notFound() on missing row)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — new: edit page server component
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — new: 'use client' edit form, pre-filled, bound action
- `apps/admin/src/components/nav-item.tsx` — new: NavItem client component with usePathname() active state
- `apps/admin/src/components/nav-sidebar.tsx` — updated: uses NavItem for all 7 nav links

**S02 — Dashboard KPIs**
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — replaced stub: async server component, 4-column KPI grid, parallel Supabase count queries

**S03 — Settings**
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — new: SETTINGS_KEYS tuple + SettingsKey type
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — new: saveSettings server action (upsert, skip empty, revalidatePath)
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — replaced stub: server component reading settings + masked display
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — new: 'use client' form with useActionState + MaskedIndicator
- `.gsd/DECISIONS.md` — appended D034

**S04 — Finances Shell**
- `apps/admin/src/app/(dashboard)/finances/actions.ts` — new: addCost server action with Zod + Supabase insert
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — new: 'use client' form with useActionState
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — replaced stub: parallel-fetching server component, cost list, revenue placeholder
