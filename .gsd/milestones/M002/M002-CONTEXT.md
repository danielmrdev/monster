# M002: Admin Panel MVP — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M001 is complete

## Why This Milestone

M001 delivers the shell. M002 makes the admin panel actually useful: the user can see their portfolio at a glance (Dashboard), create and manage TSA sites (Sites CRUD), configure API keys and settings (Settings), and see a placeholder for financial tracking (Finances shell). By the end of M002, the admin panel is a working product even though no sites can be generated yet.

## User-Visible Outcome

### When this milestone is complete, the user can:
- See a Dashboard with (initially empty) KPI cards for sites, revenue, visits, alerts
- Create a new TSA site record (name, domain, niche, market, language, affiliate tag, template, customization)
- View site detail page with categories, products placeholder, deploy status
- Configure API keys (Claude, Spaceship, DataForSEO, Cloudflare) in Settings
- See a Finances page with cost entry form and empty P&L table

### Entry point / environment
- Entry point: admin panel at VPS1 Tailscale IP
- Environment: production VPS1, Supabase Cloud
- Live dependencies: Supabase Cloud

## Completion Class

- Contract complete means: all CRUD operations hit Supabase and reflect correctly
- Integration complete means: API key settings saved and retrievable, site records persist
- Operational complete means: panel remains functional after pm2 restart

## Final Integrated Acceptance

- Create a TSA site record with all fields → appears in Sites list → detail view shows correct data
- Edit site customization → changes persist in Supabase
- Settings: save Spaceship API key → retrieve it in a subsequent request
- Dashboard loads without errors (empty state is fine)

## Risks and Unknowns

- **Server Actions vs API routes** — Next.js 15 Server Actions are the preferred pattern for mutations. Need consistent pattern across all admin panel forms.
- **shadcn/ui in monorepo** — components must be installed in `apps/admin`, not root. The shadcn monorepo init command handles this but needs care.

## Existing Codebase / Prior Art

- M001 admin panel shell (App Router, Supabase client, auth layout)
- M001 DB schema (sites, tsa_categories, tsa_products tables)
- `docs/PRD.md` — Admin Panel Screens section for exact feature spec

## Relevant Requirements

- R001 — Pipeline loop (Sites CRUD is the entry point)
- R008 — Product availability alerts (Dashboard alert surface)
- R012 — Finances panel shell
- R013 — Admin panel on VPS1

## Scope

### In Scope
- Dashboard: KPI cards (sites count, status, alerts panel)
- Sites: list view, create form, edit form, detail view (categories/products placeholders)
- Settings: API key management (Spaceship, DataForSEO, Cloudflare, Claude, Amazon affiliate tags)
- Finances: cost entry form, cost list, placeholder revenue section
- Navigation: sidebar with all 7 sections (non-functional sections show "Coming soon")

### Out of Scope
- Actual site generation (M003)
- Working analytics charts (M005)
- Monster Chat and Research Lab (M007)
- Amazon revenue sync (M008)

## Technical Constraints

- Next.js 15 Server Actions for mutations (not API routes for CRUD)
- shadcn/ui components from `packages/ui` or installed directly in `apps/admin`
- Supabase RLS: admin panel uses service role key for all operations (single user, private VPS)
- API keys stored in Supabase `settings` table, encrypted at rest via Supabase

## Integration Points

- Supabase Cloud: all reads/writes via typed client from `packages/db`
- pm2: no changes to process management — just code deployment
