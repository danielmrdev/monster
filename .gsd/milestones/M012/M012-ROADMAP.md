# M012: Admin Polish + Mobile-First Sites

**Vision:** Close the gap between what the DB supports and what the admin UI exposes; make generated sites genuinely mobile-first; seed legal templates with dynamic placeholder substitution so one template serves all sites of the same language.

## Success Criteria

- All product AI content fields (description, pros, cons, user opinions, meta) are editable and persist to DB
- Category meta_description is editable from the category form
- Homepage SEO text has a dedicated editor in the site edit page
- Settings is organised into tabs; AI Prompts tab shows the active default prompt (not empty)
- Legal template editor has markdown preview and a placeholder hint panel
- Generated sites render legal pages as formatted HTML with site-specific values substituted
- All three site templates pass a 375px mobile viewport test: hamburger opens/closes, CTAs are full-width, no horizontal overflow

## Key Risks / Unknowns

- `pros_cons` JSONB serialization — two textareas must round-trip to/from `{pros: string[], cons: string[]}` without corrupting existing AI-generated data
- Template slug migration must be atomic — UPDATE existing sites + INSERT new slugs in one SQL file; Astro template switch logic must use new `tsa/` prefix
- `marked` dynamic import in admin client for preview must not block form render
- `company_name`/`contact_email` not currently in `SiteInfo` — must trace all callers of `generate-site.ts` to confirm no breakage

## Proof Strategy

- `pros_cons` round-trip → retire in S02 by inserting a product with pros_cons via form, reading back from DB and confirming JSON shape
- Template slug migration → retire in S01 by confirming `site_templates` rows and a test `sites` row use `tsa/classic`
- Marked HTML output → retire in S05 by building the fixture site and checking `[legal].astro` output contains `<h2>` tags

## Verification Classes

- Contract verification: TypeScript build exit 0; DB columns present; form round-trips confirmed by reading DB after save
- Integration verification: full `astro build` on fixture site with legal templates and `tsa/classic` slug
- Operational verification: none
- UAT / human verification: mobile viewport test on all three templates; legal page HTML rendered correctly in browser

## Milestone Definition of Done

This milestone is complete only when all are true:

- All DB migrations applied cleanly (no errors)
- ProductForm saves and loads all content fields correctly
- CategoryForm saves meta_description correctly
- Homepage SEO section saves focus_keyword and homepage_seo_text to sites table
- Settings renders with three tabs; AI Prompts tab shows non-empty default for all three agents
- Legal template editor shows preview and placeholder hints
- 8 legal template seed rows present in DB
- Generated legal pages contain `<h2>` / `<ul>` / `<li>` HTML (not raw markdown)
- Placeholder substitution confirmed: `{{site.name}}` replaced in rendered legal page
- Hamburger menu toggles open/closed on all three templates at 375px
- `pnpm --filter @monster/generator build` exits 0 with `tsa/classic` slug in fixture

## Requirement Coverage

- Covers: R001 (pipeline completeness), R004 (AI content editable post-generation)
- Partially covers: R005 (meta_description now persisted, scorer can read it)
- Leaves for later: R002 (second site type — template namespacing is the enabler, not the implementation)
- Orphan risks: none

## Slices

- [ ] **S01: DB Migrations** `risk:low` `depends:[]`
  > After this: `homepage_seo_text` column exists in `sites`; `meta_description` column exists in `tsa_products`; `tsa/classic`, `tsa/modern`, `tsa/minimal` slugs in `site_templates`; existing sites updated.

- [ ] **S02: ProductForm Content Fields** `risk:medium` `depends:[S01]`
  > After this: Product edit page has editable description, pros (textarea), cons (textarea), user opinions, meta_description fields; Generate with AI populates them; all fields save and load correctly.

- [ ] **S03: CategoryForm Meta + Homepage SEO** `risk:low` `depends:[S01]`
  > After this: Category edit form has meta_description field; site edit page has a Homepage SEO section with focus_keyword and homepage_seo_text with Generate with AI.

- [ ] **S04: Settings Tabs + Visible Prompts** `risk:low` `depends:[]`
  > After this: Settings has three tabs (API Keys, AI Prompts, Deployment); AI Prompts tab shows the active hardcoded default for each agent and allows override.

- [ ] **S05: Legal Templates Seed + Markdown Pipeline** `risk:low` `depends:[S01]`
  > After this: 8 legal template rows in DB (4 types × ES+EN) with placeholders; editor has Preview toggle and placeholder hint panel; generated legal pages render as HTML with substituted values.

- [ ] **S06: Templates Mobile-First** `risk:medium` `depends:[S01]`
  > After this: All three Astro templates have working hamburger nav at 375px; product page CTAs are full-width on mobile; pros/cons stack vertically on mobile; no horizontal overflow on any page type.

## Boundary Map

### S01 → S02, S03, S05, S06
Produces:
- `sites.homepage_seo_text` column (text, nullable)
- `tsa_products.meta_description` column (text, nullable)
- `site_templates` rows: `tsa/classic`, `tsa/modern`, `tsa/minimal`
- Existing `sites.template_slug` values updated from `classic` → `tsa/classic` etc.

Consumes: nothing (DB-only changes)

### S02 → (no downstream)
Produces:
- `ProductForm` with editable fields: `detailed_description`, `pros` (textarea), `cons` (textarea), `user_opinions_summary`, `meta_description`
- `updateProduct` action saves all five fields; `ProductFormState` errors extended
- `ProductFormProps.defaultValues` extended with all five fields
- Generate with AI writes into editable textareas instead of read-only preview

Consumes from S01:
- `tsa_products.meta_description` column

### S03 → (no downstream)
Produces:
- `CategoryForm` with `meta_description` field (saves to `description` column)
- `EditForm` (site edit) with Homepage SEO card: `focus_keyword` + `homepage_seo_text`
- `updateSite` action saves `focus_keyword` and `homepage_seo_text`
- `generate-seo-text` API route: new `homepage_seo_text` field case

Consumes from S01:
- `sites.homepage_seo_text` column

### S04 → (no downstream)
Produces:
- `SettingsForm` with three-tab layout (shadcn `Tabs` component)
- AI Prompts tab: `defaultPrompts` prop (hardcoded strings from agent source); textarea `defaultValue` = DB override ?? hardcoded default
- `SettingsPage` fetches hardcoded defaults and passes them to form

Consumes: nothing (settings table already exists)

### S05 → (no downstream)
Produces:
- Migration: 8 `legal_templates` seed rows with `{{site.name}}` etc. placeholders
- `interpolateLegal(content: string, site: SiteInfo): string` function in `apps/generator/src/lib/legal.ts`
- `marked` added to `apps/generator` package.json
- `[legal].astro` uses `set:html={marked(interpolateLegal(pageContent, site))}`
- `TemplateForm` has Preview toggle + placeholder hint panel (12 available placeholders listed)

Consumes from S01:
- Template slug rows (no direct dep, but S05 builds on S01-migrated fixture)

### S06 → (no downstream)
Produces:
- `classic/Layout.astro`, `modern/Layout.astro`, `minimal/Layout.astro` — hamburger nav with `<script is:inline>`
- All product page CTAs: `w-full` on mobile across all three templates
- Pros/cons grid: `grid-cols-1 sm:grid-cols-2` in all three templates
- Template switch logic in all page files updated to use `tsa/classic`, `tsa/modern`, `tsa/minimal`

Consumes from S01:
- New `tsa/*` template slugs (switch logic must match)
