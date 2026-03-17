---
verdict: needs-attention
remediation_round: 0
---

# Milestone Validation: M012

## Success Criteria Checklist

- [x] **All product AI content fields (description, pros, cons, user opinions, meta) are editable and persist to DB**
  Evidence: S02 — `ProductForm.tsx` has 5 named editable textareas (`detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description`); `updateProduct` action serializes `pros_cons` to JSONB; `edit/page.tsx` deserializes on load; `pnpm --filter @monster/admin build` exits 0. DB columns confirmed via live query (T01).

- [x] **Category meta_description is editable from the category form**
  Evidence: S03 — `CategoryForm.tsx` has `meta_description` textarea (6 grep hits for label/name/defaultValue/FieldError/interface/errors); `updateCategory` action saves to `tsa_categories.description` per D057. Build exits 0.

- [x] **Homepage SEO text has a dedicated editor in the site edit page**
  Evidence: S03 — `edit-form.tsx` has 8 hits for `homepage_seo_text` (controlled textarea + Generate with AI SSE streaming); `updateSite` action saves `focus_keyword` + `homepage_seo_text`. Build exits 0.

- [x] **Settings is organised into tabs; AI Prompts tab shows the active default prompt (not empty)**
  Evidence: S04 — `settings-form.tsx` has 4 `<TabsTrigger>` elements (3 tabs + default); `DEFAULT_PROMPTS` exported in `constants.ts`; fallback chain `agentPrompts[key] ?? defaultPrompts[key] ?? ''` confirmed by grep. Build exits 0; `/settings` 12.9 kB.

- [x] **Legal template editor has markdown preview and a placeholder hint panel**
  Evidence: S05 — `TemplateForm.tsx` has 7 hits for `isPreview|dangerouslySetInnerHTML`; "Available placeholders" panel confirmed; lazy `await import('marked')` on first click; hidden input preserves value in preview mode. Admin build exits 0.

- [x] **Generated sites render legal pages as formatted HTML with site-specific values substituted**
  Evidence (code level): S05 — `[legal].astro` has 3 `set:html={marked(interpolateLegal(pageContent, site))}` calls (one per template variant); `interpolateLegal()` replaces 5 placeholders; `grep -r "{{site\." apps/generator/.generated-sites/fixture/dist/` returns 0 (no unsubstituted placeholders escaped the build).
  **Partial gap (documented known limitation):** The fixture build uses hardcoded fallback content (plain prose, no `<h2>/<ul>/<li>`) because `site.json` has no `legalTemplates` field — `GenerateSiteJob` does not yet populate `legalTemplates` from `legal_template_assignments`. The seed markdown _does_ contain `##` headers and `-` list items, so the pipeline would produce proper `<h2>/<ul>/<li>` when templates are assigned. The milestone DoD criterion "Generated legal pages contain `<h2>`/`<ul>`/`<li>`" is not yet verifiable via the fixture build.

- [x] **All three site templates pass a 375px mobile viewport test: hamburger opens/closes, CTAs are full-width, no horizontal overflow**
  Evidence (code level): S06 — `grep -l "is:inline"` returns all 3 layout files; `grep "md:hidden"` returns 3 hits (one per template); `grep "block w-full"` returns 3 hits in `products/[slug].astro`; `grid-cols-1 sm:grid-cols-2` returns 3 hits; 0 bare slug strings remain. Generator build exits 0, 11 pages.
  **Human UAT pending:** S06 explicitly flags that hamburger interaction and no-horizontal-overflow have not been verified in a live browser at 375px. This is a UAT-class verification gap, not a code gap.

## Slice Delivery Audit

| Slice | Claimed | Delivered | Status |
|-------|---------|-----------|--------|
| S01 | `sites.homepage_seo_text`, `tsa_products.meta_description` columns; `tsa/classic/modern/minimal` rows in `site_templates`; existing sites migrated | All 4 migrations present and applied (T01 confirms live DB verification); TypeScript types rebuilt (T02 confirms 18 dist hits). S01-SUMMARY is a doctor-created placeholder (real detail in T01/T02 summaries) but task summaries substantiate all deliverables. | **pass** |
| S02 | 5 editable textareas; `updateProduct` JSONB serialization; Generate with AI populates all via SSE | `ProductForm.tsx` has 24 grep hits for all 5 field names; `product_all_content` SSE path confirmed; collect-then-parse JSON strategy documented; build exits 0 | **pass** |
| S03 | `CategoryForm` meta_description; Site edit Homepage SEO card (focus_keyword + homepage_seo_text + Generate with AI) | Both confirmed by grep; `UpdateSiteState` extracted as distinct type; route extended with `homepage_seo_text` case; build exits 0 | **pass** |
| S04 | Settings 3-tab layout (API Keys / AI Prompts / Deployment); DEFAULT_PROMPTS never-empty fallback | 4 TabsTrigger elements; DEFAULT_PROMPTS exported; fallback chain confirmed; Deployment tab scaffolded (display-only, no save wiring — documented deviation) | **pass** |
| S05 | 8 legal_templates DB rows; `interpolateLegal()`; `marked` pipeline in `[legal].astro`; TemplateForm Preview + placeholder hints | All confirmed: 3 `set:html` calls in `[legal].astro`; `interpolateLegal` exported with 5 replacements; seed migration has 8 rows with correct markdown; TemplateForm Preview confirmed; 0 unsubstituted placeholders in fixture build | **pass** |
| S06 | Hamburger nav (all 3 templates); tsa/* slug comparisons in all 4 page files; block w-full CTAs; grid-cols-1 sm:grid-cols-2 pros/cons | All confirmed by grep; 0 bare slugs remain; generator build exits 0, 11 pages | **pass** |

## Cross-Slice Integration

All boundary map entries align with what was built:

- **S01 → S02**: `tsa_products.meta_description` column consumed by `ProductForm` ✓
- **S01 → S03**: `sites.homepage_seo_text` column consumed by `edit-form.tsx` and `updateSite` action ✓
- **S01 → S05**: `legal_templates` table (pre-existing from M009) and `tsa/*` slug rows available to `[legal].astro` ✓
- **S01 → S06**: `tsa/*` slug comparisons updated in all 4 page files; 0 bare slugs remain ✓
- **S05 → S06**: S05 noted that `[legal].astro` used bare `"modern"/"minimal"` comparisons — S06 fixed them; confirmed by grep ✓

One integration gap identified:
- **GenerateSiteJob → site.json `legalTemplates`**: `GenerateSiteJob` does not yet read `legal_template_assignments` from Supabase and inject `legalTemplates` into `site.json`. The pipeline is wired at the generator end (`[legal].astro` reads `data.legalTemplates`) but the job-side assembly is missing. This was documented in S05's follow-ups as out-of-scope for M012 but is a prerequisite for live sites using assigned legal templates.

## Requirement Coverage

Requirements covered by M012 and their status:

- **R001** (pipeline completeness) — advanced by S02/S03/S05/S06: editable AI content, homepage SEO text, formatted legal pages, mobile-first templates. Not yet fully validated (requires live end-to-end run).
- **R004** (AI content editable post-generation) — advanced by S02 (5 product content fields now editable) and S03 (category meta_description editable). Status remains `validated` per the requirements table.
- **R005** (SEO Scorer — meta_description persisted) — partially advanced: `meta_description` is now in DB for both products and categories; scorer can read it consistently across regenerations.

No active requirements are left unaddressed by M012 that were listed as "Covers" in the roadmap.

## Verdict Rationale

All six slices delivered their stated outputs. TypeScript builds exit 0 across admin and generator. All DB migrations are present and were applied to live Supabase. All code-level verification checks pass (greps, build exits, type-check exits).

Two gaps are classified as **needs-attention** (not needs-remediation) because neither is a missing deliverable — both are acknowledged, documented limitations:

1. **Legal page HTML structure in fixture** (`<h2>/<ul>/<li>` not present in fixture dist): The pipeline is correctly wired (`[legal].astro` uses `set:html={marked(interpolateLegal(...))}`) but the fixture `site.json` has no `legalTemplates` key, causing the fallback content (plain prose) to be used. The seeded DB templates do contain proper markdown with `##` headers and `-` list items. The milestone DoD states "Generated legal pages contain `<h2>` / `<ul>` / `<li>` HTML (not raw markdown)" — this is true of the pipeline and the seeded content, but not demonstrable via the fixture build alone. The gap is the missing `GenerateSiteJob` → `legalTemplates` wiring (S05 follow-up item), which was knowingly left out of M012 scope. **This needs to be addressed in the next milestone.**

2. **Mobile viewport 375px UAT** (hamburger open/close, no horizontal overflow not confirmed in browser): All code checks pass. S06 explicitly defers live browser UAT. This is standard for a code-complete milestone where live device testing is the next step.

The milestone is **needs-attention**: fully code-complete, all builds passing, all DB migrations applied — but two verification items require follow-up: the `GenerateSiteJob` legal template wiring and the live mobile browser UAT.

## Remediation Plan

No remediation slices required. The two gaps are documentation/follow-up items for the next milestone:

1. **Next milestone (M013+)**: Wire `GenerateSiteJob` to read `legal_template_assignments` from Supabase and write `legalTemplates` field to `site.json`. This closes the end-to-end legal template pipeline and will make the `<h2>/<ul>/<li>` criterion demonstrable in a real site build.

2. **Operator UAT**: Before declaring M012 fully validated (not just complete), run a live browser test at 375px on a deployed fixture or real site to confirm hamburger behavior and absence of horizontal overflow on all three templates.
