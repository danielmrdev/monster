# S06: Legal Page Templates

**Goal:** DB-backed legal page templates assignable per site; templates render in generated Astro sites with graceful fallback to hardcoded defaults.
**Demo:** User creates a custom privacy policy template in /templates, assigns it to a site, generates the site — the privacy page shows the custom content. Sites with no assigned template still generate with the original hardcoded content.

## Must-Haves

- DB migrations: `legal_templates` table and `legal_template_assignments` table apply cleanly
- `/templates` route in admin panel: list all templates, create/edit/delete
- Site edit page: assign a template per legal type (privacy, terms, cookies, contact)
- GenerateSiteJob: fetches assigned templates, injects content into site.json as `legalTemplates` field
- Astro `[legal].astro`: reads `legalTemplates[pageType]` from site.json; falls back to hardcoded default if null/absent
- `SiteData` and `SiteInfo` types in data.ts updated with `legalTemplates` field
- Build passes: `pnpm --filter @monster/admin build`, `pnpm --filter @monster/agents build`, `pnpm exec astro check` (or equivalent)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (GenerateSiteJob must write legalTemplates into site.json)
- Human/UAT required: yes (assign a template to a site, generate it, verify legal page content)

## Verification

- `pnpm --filter @monster/admin build` exits 0
- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/generator check` (astro check) exits 0
- DB migration files present; grep confirms `legal_templates` in migrations/
- `/templates` page exists in admin (route file present)

## Tasks

- [x] **T01: DB migrations** `est:20m`
  - Why: legal_templates and legal_template_assignments tables must exist before UI and generator can use them
  - Files: `packages/db/supabase/migrations/<ts>_legal_templates.sql`, `<ts>_legal_template_assignments.sql`
  - Do:
    (1) Migration 1: `legal_templates` table:
      ```sql
      CREATE TABLE legal_templates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL,
        type text NOT NULL CHECK (type IN ('privacy','terms','cookies','contact')),
        language text NOT NULL DEFAULT 'es',
        content text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE legal_templates ENABLE ROW LEVEL SECURITY;
      ```
    (2) Migration 2: `legal_template_assignments` table:
      ```sql
      CREATE TABLE legal_template_assignments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
        template_type text NOT NULL CHECK (template_type IN ('privacy','terms','cookies','contact')),
        template_id uuid NOT NULL REFERENCES legal_templates(id) ON DELETE CASCADE,
        UNIQUE (site_id, template_type)
      );
      ALTER TABLE legal_template_assignments ENABLE ROW LEVEL SECURITY;
      ```
  - Verify: Migration files exist with correct SQL
  - Done when: Both migration files written

- [ ] **T02: /templates admin UI** `est:1.5h`
  - Why: Operator needs CRUD for templates; /templates nav item already exists in NavSidebar
  - Files: `apps/admin/src/app/(dashboard)/templates/page.tsx`, `apps/admin/src/app/(dashboard)/templates/new/page.tsx`, `apps/admin/src/app/(dashboard)/templates/[id]/edit/page.tsx`, `apps/admin/src/app/(dashboard)/templates/actions.ts`
  - Do:
    (1) `actions.ts` — server actions: `createTemplate`, `updateTemplate`, `deleteTemplate` (all use `(supabase as any).from('legal_templates')` cast until migration applied + types regenerated)
    (2) `page.tsx` — list all templates grouped by type; link to create + edit per row; delete button
    (3) `new/page.tsx` — form: title, type (select), language (text input), content (large Textarea)
    (4) `[id]/edit/page.tsx` — same form with defaultValues, title "Edit Template"
    (5) `TemplateForm` component used by both new + edit pages
  - Verify: `pnpm --filter @monster/admin build` exits 0; template pages present in route output
  - Done when: Build clean; templates list + create + edit pages compile

- [x] **T03: Site template assignment UI** `est:45m`
  - Why: User needs to assign a template to a site per legal type
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`
  - Do:
    (1) In site edit page, fetch `legal_templates` and existing `legal_template_assignments` for this site
    (2) Add a "Legal Templates" section to the edit form: 4 selects (one per type: privacy, terms, cookies, contact), each showing a dropdown of available templates of that type + "None (default)" option
    (3) On save, upsert `legal_template_assignments` rows: if a template is selected, upsert; if "None", delete the assignment
    (4) All DB calls use `(supabase as any)` cast
  - Verify: `pnpm --filter @monster/admin build` exits 0
  - Done when: Build clean; legal template selects appear in site edit form

- [x] **T04: GenerateSiteJob + Astro integration** `est:45m`
  - Why: The generator must inject assigned template content into site.json; [legal].astro must read it
  - Files: `packages/agents/src/jobs/generate-site.ts`, `apps/generator/src/lib/data.ts`, `apps/generator/src/pages/[legal].astro`
  - Do:
    (1) In `data.ts`, add `legalTemplates` to `SiteData` interface:
      ```ts
      legalTemplates?: {
        privacy?: string | null;
        terms?: string | null;
        cookies?: string | null;
        contact?: string | null;
      };
      ```
      Also add to `SiteInfo` interface for completeness.
    (2) In `generate-site.ts`, after fetching site data and before writing `site.json`, fetch `legal_template_assignments` for the site joined with `legal_templates` content. Build a `legalTemplates` map. Add to the `siteData` object.
    (3) In `[legal].astro`, in `getStaticPaths()`, after loading site data, map each LEGAL_PAGE to use `data.legalTemplates?.[typeKey] ?? page.content` where `typeKey` is 'privacy', 'terms', 'cookies', 'contact' mapped from the page slug.
  - Verify: `pnpm --filter @monster/agents build` exits 0; `pnpm --filter @monster/generator check` exits 0 (or astro check)
  - Done when: Both build/typecheck pass; [legal].astro uses legalTemplates with fallback

## Files Likely Touched

- `packages/db/supabase/migrations/<ts>_legal_templates.sql` (new)
- `packages/db/supabase/migrations/<ts>_legal_template_assignments.sql` (new)
- `apps/admin/src/app/(dashboard)/templates/` (new route group)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`
- `packages/agents/src/jobs/generate-site.ts`
- `apps/generator/src/lib/data.ts`
- `apps/generator/src/pages/[legal].astro`
