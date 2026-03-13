# M002: Admin Panel MVP

**Vision:** A working admin panel where the user can create and manage TSA site records, configure API keys, track costs, and see portfolio KPIs — all persisted in Supabase. By the end, the pipeline entry point exists: site record → database → visible in admin.

## Success Criteria

- User can create a TSA site record with all fields (name, domain, niche, market, language, affiliate tag, template, customization) and see it appear in the Sites list
- User can open a site detail view and edit site fields; changes persist in Supabase
- `SiteCustomization` Zod schema is defined and validated on site create/edit (colors, typography, logo URL, favicon URL)
- User can save API keys (Spaceship, DataForSEO, Claude, Amazon affiliate tags) in Settings; retrieved correctly in subsequent requests (masked in UI, full value round-trips through DB)
- Dashboard loads without errors and shows real KPI counts (sites total, live sites, draft sites, open alerts)
- User can add a cost entry and see it in the cost list; Finances page renders without errors
- Active nav link is highlighted in the sidebar for all 7 routes
- All pages remain functional after pm2 restart (`pm2 reload monster-admin`)

## Key Risks / Unknowns

- **Service role client vs anon client** — RLS is enabled with zero policies on all admin tables. Using the wrong client produces silent failures (no rows returned, no error). This is the #1 footgun in M002.
- **`SiteCustomization` JSON shape** — if not defined now, M003 templates will invent incompatible shapes. Needs a canonical Zod schema in M002/S01 so it's the stable contract going forward.
- **shadcn v4 component availability** — v4 uses Base UI, not Radix. Need to verify `card`, `select`, `textarea`, `badge`, `table`, `separator`, `dialog`, `toast` are available before building forms. Added components in the wrong app dir breaks the import chain.

## Proof Strategy

- Service role client footgun → retired in S01 by building a real site create form that writes to Supabase and immediately reads the record back in the list view (live round-trip, not a test fixture).
- `SiteCustomization` shape → retired in S01 by defining the Zod schema in `packages/shared` and validating it in the server action before any DB write.
- shadcn component availability → retired in S01 by installing all needed components upfront and building the most complex form (Sites create) as the first real UI work.

## Verification Classes

- Contract verification: `tsc --noEmit` exits 0 across the monorepo after each slice; Zod schemas validate sample inputs without throwing
- Integration verification: create/edit/read operations hit Supabase Cloud and return correct data (verified by observing the admin UI, not fixtures); settings round-trip (save key → reload page → masked value shown)
- Operational verification: `pm2 reload monster-admin` → `curl -sI http://localhost:3004/sites` returns HTTP 200 after each slice merges to main
- UAT / human verification: final acceptance scenario in M002-CONTEXT.md (create site → view detail → edit → settings save → dashboard loads)

## Milestone Definition of Done

This milestone is complete only when all are true:

- All four slices are merged to main and deployed via `./scripts/deploy.sh`
- Sites CRUD: create, view, edit operations all persist to Supabase and reflect in the UI
- Sites list shows real data from DB (not stub); detail page shows correct site fields
- `SiteCustomization` Zod schema is in `packages/shared` and used in the create/edit server actions
- Settings: at least Spaceship + DataForSEO + Claude API key fields save and retrieve correctly (masked display)
- Dashboard: KPI cards render real counts from DB (not hardcoded zeros)
- Finances: cost entry form writes to `costs` table; cost list displays records
- Active nav link highlighted across all 7 routes
- `pm2 reload monster-admin` → admin panel responds HTTP 200 on port 3004
- `tsc --noEmit` exits 0 across the monorepo

## Requirement Coverage

- Covers: R001 (supporting — Sites CRUD is the pipeline entry point), R008 (supporting — alert surface in Dashboard), R012 (supporting — Finances shell), R013 (active — panel stays operational after pm2 restart)
- Partially covers: R001 (primary owner is M003/S02 — generation pipeline not built here, only the site record)
- Leaves for later: R002 (schema already done in M001/S02), R003 (M007), R004 (M003), R005 (M003), R006 (M004), R007 (M006), R009 (M005), R010 (M007), R011 (M004), R015 (M003)
- Orphan risks: none — all active requirements either covered here or have primary owners in later milestones

## Slices

- [x] **S01: Sites CRUD** `risk:high` `depends:[]`
  > After this: user can create a TSA site record with all fields via a real form, see it in the Sites list fetched from Supabase, open a detail view with correct data, and edit the site — all writes using the service role client and validated against the `SiteCustomization` Zod schema; active nav link highlighting works across all 7 routes.

- [x] **S02: Dashboard KPIs** `risk:low` `depends:[S01]`
  > After this: Dashboard page shows real KPI cards (total sites, live count, draft count, open alerts count) fetched from Supabase via the service client, replacing the "Coming soon" stub.

- [x] **S03: Settings — API Key Management** `risk:medium` `depends:[S01]`
  > After this: user can save and retrieve API keys (Spaceship, DataForSEO, Claude, Amazon affiliate tags) via the Settings page; values stored as `{"value": "..."}` JSON in the `settings` table, displayed masked in the UI (last 4 chars visible).

- [ ] **S04: Finances Shell** `risk:low` `depends:[S01]`
  > After this: user can add a cost entry (category, amount, date, notes) via a form that writes to the `costs` table; the cost list displays existing records fetched from Supabase; revenue section shows a "coming soon" placeholder.

## Boundary Map

### S01 → S02

Produces:
- `createServiceClient()` usage pattern confirmed working in server actions and server components (S02 reads `sites` table with the same client)
- `SiteCustomization` Zod schema in `packages/shared/src/types/customization.ts` — the stable shape for all downstream template work
- `/sites`, `/sites/new`, `/sites/[id]`, `/sites/[id]/edit` routes fully functional
- shadcn `card`, `select`, `textarea`, `badge`, `table` components installed in `apps/admin`
- `NavItem` client component with `usePathname()` active state (used by all routes)

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- Server action pattern (`'use server'` file-level, FormData, `revalidatePath()`, `redirect()`) confirmed and reusable
- `createServiceClient()` import path and usage established

Consumes:
- nothing (first slice)

### S01 → S04

Produces:
- Same server action pattern as S03
- `costs` table accessible via service client (verified by schema in `packages/db`)

Consumes:
- nothing (first slice)

### S02 boundary

Produces:
- Dashboard page with real data, replacing the stub — no new API surface for downstream slices

Consumes:
- `createServiceClient()` pattern from S01
- `sites` table rows in Supabase (created via S01 form)

### S03 boundary

Produces:
- `settings` table round-trip confirmed: save JSON value → read back → masked display
- No new types or interfaces (settings are untyped key/value pairs)

Consumes:
- Server action pattern from S01
- `settings` table schema from M001/S02 migrations

### S04 boundary

Produces:
- `costs` table write + read confirmed end-to-end
- Finances shell with placeholder revenue section — stable surface for M008

Consumes:
- Server action pattern from S01
- `costs` table schema from M001/S02 migrations
