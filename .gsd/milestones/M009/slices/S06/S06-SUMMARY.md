---
id: S06
milestone: M009
provides:
  - legal_templates + legal_template_assignments DB migrations
  - /templates admin UI: list, create, edit, delete legal templates
  - Site edit page: Legal Template Assignment section (4 selects per type)
  - POST /api/sites/[id]/legal-assignments — saves/clears assignments
  - GenerateSiteJob: fetches assigned templates, injects into site.json as legalTemplates
  - SiteData.legalTemplates field in apps/generator/src/lib/data.ts
  - [legal].astro: reads legalTemplates[typeKey] with fallback to hardcoded defaults
key_files:
  - packages/db/supabase/migrations/20260316140000_legal_templates.sql
  - packages/db/supabase/migrations/20260316140001_legal_template_assignments.sql
  - apps/admin/src/app/(dashboard)/templates/page.tsx
  - apps/admin/src/app/(dashboard)/templates/actions.ts
  - apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx
  - apps/admin/src/app/(dashboard)/templates/new/page.tsx
  - apps/admin/src/app/(dashboard)/templates/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/LegalTemplateAssignment.tsx
  - apps/admin/src/app/api/sites/[id]/legal-assignments/route.ts
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/src/lib/data.ts
  - apps/generator/src/pages/[legal].astro
key_decisions:
  - "legal_template_assignments uses (supabase as any) cast until migration applied + types regenerated"
  - "LegalTemplateAssignment saves via a dedicated API route (not server action) to avoid form conflict with EditForm"
  - "[legal].astro SLUG_TO_TYPE map: privacidad→privacy, aviso-legal→terms, cookies→cookies, contacto→contact"
  - "legalTemplates injected into siteData with type cast workaround (table not in generated types yet)"
patterns_established:
  - "Legal type assignment pattern: separate API route + client component with useTransition"
drill_down_paths:
  - .gsd/milestones/M009/slices/S06/S06-PLAN.md
duration: 2h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S06: Legal Page Templates

**CRUD for legal templates in /templates; assignable per site via edit page; legalTemplates injected into site.json; [legal].astro falls back to hardcoded defaults when no template assigned.**

## What Was Built

**DB migrations** — `legal_templates` (id, title, type, language, content) and `legal_template_assignments` (site_id, template_type, template_id, UNIQUE site+type).

**Templates CRUD** — `/templates` page lists templates grouped by type; `/templates/new` and `/templates/[id]/edit` with `TemplateForm` component (title, type select, language, content textarea). Server actions `createTemplate`, `updateTemplate`, `deleteTemplate` all use `(supabase as any)` cast.

**Site edit assignment** — `LegalTemplateAssignment` client component on the site edit page shows 4 selects (one per legal type). Saves via `POST /api/sites/[id]/legal-assignments`. Upserts non-empty, deletes empty (= restore default).

**GenerateSiteJob** — fetches `legal_template_assignments` joined with `legal_templates(content)` for the site. Injects a `legalTemplates` map into `siteData` object.

**Astro** — `SiteData.legalTemplates` field added to `data.ts`. `[legal].astro` replaced `LEGAL_PAGES.map` with a `DEFAULTS` + `SLUG_TO_TYPE` pattern that reads `data.legalTemplates[typeKey] ?? fallback.content`.

## Verification

- `pnpm --filter @monster/agents build` exits 0 ✓
- `pnpm --filter @monster/admin build` exits 0 ✓
- `npx astro check` — 0 errors ✓
- `pm2 reload monster-admin` + HTTP 200 on /templates ✓

## Deviations

- `legal_template_assignments` uses a join query with type cast since the table isn't in generated Supabase types yet. Will be resolvable after applying migrations and regenerating types with `supabase gen types`.
