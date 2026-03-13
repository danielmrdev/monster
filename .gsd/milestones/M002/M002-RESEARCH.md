---
milestone: M002
title: Admin Panel MVP
date: 2026-03-13
status: complete
---

# M002 — Research

**Date:** 2026-03-13

## Summary

M001 delivered a clean, working Next.js 15 admin shell: Supabase Auth working end-to-end, middleware protecting all 7 routes, shadcn v4 components (button, input, label) installed, Tailwind v4 wired, pm2 running on port 3004. The foundation is solid — M002 is purely a feature-building milestone on top of it.

The core pattern is already established by the login page: native `<form action={serverAction}>` with FormData, server action in a `'use server'` file, redirect on success/error. All mutations in M002 should follow this pattern. The key constraint: the server client in `lib/supabase/server.ts` uses the **anon key + session cookie** (for auth only). All admin CRUD must use `createServiceClient()` from `@monster/db` (service role key) because RLS is enabled on `sites`, `settings`, `costs`, and all other tables with **no permissive policies** — anon client writes will be silently blocked by RLS.

The customization JSON field in `sites` is untyped (`Record<string, unknown>`). M002 is the right time to define the canonical shape (primary color, accent color, font, logo URL, favicon URL) as a Zod schema so the form validates it and future code has a stable contract. This is a small scoping addition that prevents debt accumulation at the worst possible point (when M003 templates start consuming the data).

## Recommendation

Build M002 in 4 slices ordered by value and dependency:
1. **Sites CRUD** — the entry point to the pipeline (R001). List → Create → Detail → Edit. Service role client for all mutations.
2. **Dashboard** — KPI cards and alert panel reading from the same DB. No mutations.
3. **Settings** — API key management via `settings` table. Sensitive values stored as `{"value": "..."}` JSON in the JSONB column.
4. **Finances shell** — Cost entry form + cost list. Revenue section placeholder.

Server Actions are the right pattern for all mutations. No API routes needed for CRUD. Use `@hookform/resolvers` + Zod for client-side validation in forms (already installed), but submit via a standard form action — not `handleSubmit()`. This gives progressive enhancement and avoids the shadcn v4 `Form` component gap (D024).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Type-safe DB client | `createServiceClient()` from `@monster/db` | Already wired, typed with `Database` generic, reads env at call time |
| Form validation | `zod` + `@hookform/resolvers` (already installed) | Consistent schema-first validation. Reuse for customization JSON shape too. |
| shadcn components | `shadcn@latest add <component>` in `apps/admin` | Already initialized. Just add: card, select, textarea, badge, table, separator, dialog, toast |
| Market / language lists | `AMAZON_MARKETS`, `SUPPORTED_LANGUAGES` from `@monster/shared` | Already typed constants. Use directly in form selects — no hardcoding |
| Site status badge | `SITE_STATUS_FLOW` from `@monster/shared` | Status labels and valid transitions already defined |
| Template options | `site_templates` table seeded with classic/modern/minimal | Query at page load or use `SiteTemplate` type from `@monster/shared` |

## Existing Code and Patterns

- `apps/admin/src/app/(auth)/login/actions.ts` — the canonical Server Action pattern: `'use server'`, `createClient()`, FormData, `redirect()`. All M002 mutations follow this exactly.
- `apps/admin/src/lib/supabase/server.ts` — **anon key + cookie session client**. Use for auth checks only. Do NOT use for admin CRUD (RLS blocks anon without policies).
- `packages/db/src/client.ts` → `createServiceClient()` — service role client. Use this in all Server Actions that write to `sites`, `settings`, `costs`. Import from `@monster/db`.
- `apps/admin/src/components/ui/button.tsx` — Base UI Button wrapper. Same pattern for all new shadcn components.
- `packages/shared/src/constants/index.ts` — `AMAZON_MARKETS`, `SUPPORTED_LANGUAGES`, `SITE_STATUS_FLOW`. Use in form selects and status display.
- `packages/shared/src/types/index.ts` — `Site`, `TsaCategory`, `TsaProduct` interfaces. Use as return types from DB queries.
- `apps/admin/src/components/nav-sidebar.tsx` — Active link highlighting is missing from the current sidebar. M002 should add it (use `usePathname()` in a Client Component wrapper).
- `packages/db/src/types/supabase.ts` — `Tables<'sites'>`, `Tables<'costs'>`, etc. Use for typed query results alongside the narrowed `Site` interface from `@monster/shared`.

## Constraints

- **RLS enabled, no permissive policies on admin tables.** `sites`, `settings`, `costs`, `product_alerts`, `deployments`, `domains`, `tsa_categories`, `tsa_products` all have RLS enabled with zero policies. Service role bypasses RLS — `createServiceClient()` must be used for all mutations and reads in server components/actions. The anon session client works only for auth state.
- **shadcn v4 has no `Form` component.** D024 is confirmed — server action forms use native `<form action={...}>`. For complex forms, add client-side validation via `zod.parse()` in the action before the DB write.
- **shadcn v4 uses Base UI, not Radix.** Components import from `@base-ui/react/*`. When adding new shadcn components, verify they're available in v4 — `shadcn@latest add <name>` in `apps/admin` directory.
- **Server Actions in Next.js 15 are async by default.** The `'use server'` directive goes at the top of the file (file-level) or inside the function body (inline). File-level is cleaner for dedicated action files per route.
- **Customization JSON is untyped.** The `sites.customization` column is `jsonb` / `Record<string, unknown>`. M002 should define a `SiteCustomization` Zod schema and type — this becomes the contract for M003 templates.
- **No `packages/ui` sharing yet.** shadcn components live in `apps/admin/src/components/ui/`. The M002 context mentions `packages/ui` as a possibility, but M001 established the pattern in `apps/admin` directly (D022). Stick with `apps/admin` — no extraction needed until `apps/generator` needs admin components (it won't).
- **`domain` field is UNIQUE in `sites` table.** Site creation without a domain should leave it null (not empty string). Validate this in the form — empty string → null before insert.
- **Worktree pattern.** All M002 development in `/home/daniel/monster-work/gsd/M002/Sxx`. Main stays on `main` = production. Use `./scripts/new-worktree.sh M002 S01` to create.

## Common Pitfalls

- **Using anon client for CRUD.** `lib/supabase/server.ts` returns anon key client — correct for auth checks, wrong for DB mutations. Writes silently fail with RLS "no rows returned". Pattern: always import `createServiceClient` from `@monster/db` in Server Actions.
- **`redirect()` throws inside try/catch.** Next.js `redirect()` works by throwing an error internally. Wrapping it in try/catch will swallow it. Structure actions as: validate → DB write → `redirect()` (only after DB write succeeds).
- **Empty string vs null for optional fields.** HTML form inputs always return strings. `domain`, `niche`, `affiliate_tag`, `company_name`, `contact_email` are nullable in DB. Server actions must convert `""` → `null` before insert/update.
- **Settings table stores JSON.** `settings.value` is `jsonb`. API keys should be stored as `{"value": "sk-..."}` not as raw strings. Read/write with `(row.value as {value: string}).value`.
- **Active nav link state.** `NavSidebar` is a server component; `usePathname()` needs a client component wrapper. Create a `NavItem` client component for active state — don't convert the entire sidebar.
- **Zod v4 breaking changes.** The project has `zod@^4.3.6` installed. Zod v4 changed some APIs (e.g., `z.string().nonempty()` → `z.string().min(1)`). Use v4 syntax throughout.
- **`revalidatePath()` after mutations.** Server Actions that write to DB should call `revalidatePath('/sites')` (or relevant path) before `redirect()` to bust the Next.js cache. Without it, the list page may show stale data.
- **Site detail route shape.** Use `/sites/[id]` for detail and `/sites/[id]/edit` for edit. This is the standard Next.js App Router pattern. The create form lives at `/sites/new`.

## Open Risks

- **Settings key confidentiality.** API keys in `settings` table are "encrypted at rest" via Supabase's managed encryption (pgcrypto at storage level). The admin panel will show masked values in the UI (show last 4 chars). This is advisory — full keys should be readable by the admin but not accidentally exposed in logs or responses. The service role client reads plaintext from DB; masking is UI-only.
- **`customization` JSON shape.** If M002 doesn't define the Zod schema for `SiteCustomization`, M003 template authors will invent their own shape and the DB will have inconsistent blobs. Candidate requirement: define and validate the shape in M002. **Recommend making this a task in M002/S01 (Sites CRUD)** rather than letting it drift to M003.
- **NavSidebar icons.** Current sidebar has no icons (text-only). `lucide-react` is already installed. Adding icons is low-effort and significantly improves UX. Advisory — not blocking but worth doing in S01.
- **Pagination on Sites list.** With 1-10 sites in Phase 1, pagination is premature. But the `<table>` component should be structured so adding pagination later requires no structural change. Keep data-fetching in a Server Component, pass paginated rows as props.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| shadcn/ui | `jezweb/claude-skills@tailwind-v4-shadcn` (2.7K installs) | available — most relevant for Tailwind v4 + shadcn v4 combo |
| shadcn/ui | `shadcn/ui@shadcn` (15.6K installs) | available — official but may be shadcn v2/v3 |
| Next.js server actions | `davepoon/buildwithclaude@server-actions` (70 installs) | available — low install count |
| Supabase | `supabase/agent-skills@supabase-postgres-best-practices` (33.4K installs) | available |
| react-hook-form + Zod | `jezweb/claude-skills@react-hook-form-zod` (1.2K installs) | available |
| frontend-design | (installed) | installed — use for UI component work |

The installed `frontend-design` skill covers UI component work. No additional skills strictly required for M002 — the patterns are well-established in the existing codebase (D022, D024).

## Sources

- RLS constraint confirmed: no policies on `sites`, `settings`, `costs` in migrations 001, 002, 006 (source: local codebase)
- Service role bypass of RLS: Supabase service role key always bypasses RLS (source: Supabase docs, confirmed by D019 pattern)
- shadcn v4 no `Form` component: D024 in DECISIONS.md
- Zod v4 API changes: `zod@^4.3.6` in `apps/admin/package.json`
- Base UI vs Radix: `button.tsx` imports from `@base-ui/react/button` (source: `apps/admin/src/components/ui/button.tsx`)
- Worktree protocol: M001-SUMMARY.md
- `domain` UNIQUE constraint: migration 001 `CREATE TABLE sites ... domain text UNIQUE`
