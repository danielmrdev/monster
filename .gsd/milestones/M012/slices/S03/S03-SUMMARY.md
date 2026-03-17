---
id: S03
parent: M012
milestone: M012
provides:
  - CategoryForm meta_description textarea wired to tsa_categories.description (D057 alias)
  - Site edit page Homepage SEO card with focus_keyword + homepage_seo_text textarea
  - Generate with AI SSE streaming for homepage_seo_text
  - updateSite action saves focus_keyword and homepage_seo_text to sites table
  - generate-seo-text route extended with homepage_seo_text field case
  - UpdateSiteState broken out as its own type (distinct from CreateSiteState)
requires:
  - slice: S01
    provides: sites.homepage_seo_text column (text, nullable)
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
key_decisions:
  - D057 column alias: form field `meta_description` maps to DB column `tsa_categories.description`; edit page sets both defaultValues fields from the same column
  - UpdateSiteState is now a distinct type (not alias of CreateSiteState) carrying UpdateSiteErrors, which adds focus_keyword? and homepage_seo_text? fields — required for TypeScript to accept errors?.focus_keyword in the form
  - meta_description takes precedence over legacy description in updateCategory (meta_description ?? description)
  - homepage_seo_text textarea is controlled (useState) so AI-streamed text renders incrementally during SSE
patterns_established:
  - AI-generate button pattern for site-level fields: POST to /api/sites/[id]/generate-seo-text with {field, contextId: siteId}, stream SSE text chunks into controlled useState
  - UpdateSiteErrors extends CreateSiteErrors intersection type to add site-edit-specific fields without breaking shared types
  - D057 column alias pattern: form uses semantic field name (meta_description), DB column has legacy name (description); both directions handled explicitly in action and defaultValues
observability_surfaces:
  - CategoryForm errors surfaced as errors._form[0] red banner
  - generate-seo-text SSE emits {"type":"error","error":"..."} on failure; rendered as red paragraph under textarea
  - Server log "[generate-seo-text] siteId=X contextId=X field=homepage_seo_text" on every AI generation call
  - DB inspection: SELECT id, description FROM tsa_categories WHERE id='<catId>'
  - DB inspection: SELECT focus_keyword, homepage_seo_text FROM sites WHERE id='<id>'
drill_down_paths:
  - .gsd/milestones/M012/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M012/slices/S03/tasks/T02-SUMMARY.md
duration: ~25min (T01: 10m, T02: 15m)
verification_result: passed
completed_at: 2026-03-17
---

# S03: CategoryForm Meta + Homepage SEO

**Added meta_description textarea to CategoryForm and a Homepage SEO card to the site edit page; both fields persist to DB and the homepage field has AI generation via SSE streaming.**

## What Happened

S03 had two tasks targeting orthogonal UI surfaces: T01 modified the category edit form; T02 modified the site edit form.

**T01 — CategoryForm meta_description field**

The existing CategoryForm already had a generic `description` textarea. Per decision D057, `tsa_categories.description` *is* the meta description column — so T01 added a dedicated `meta_description` field to surface this semantically in the admin UI without changing the underlying storage model.

Three files were updated:
- **CategoryForm.tsx** — added `meta_description?: string | null` to the `defaultValues` interface; rendered a labeled `<Textarea name="meta_description" rows={2}>` after the focus_keyword field, with `<FieldError>` and "150–160 characters" helper text. `meta_description?: string[]` added to `CategoryFormState.errors` in actions.ts.
- **[catId]/edit/page.tsx** — passes `meta_description: cat.description ?? null` in `defaultValues` (existing `select('*')` already fetches the description column).
- **actions.ts** — `updateCategory` reads `meta_description` from FormData and saves `description: meta_description ?? description`, giving the dedicated field precedence over the legacy description field.

**T02 — Homepage SEO card in site edit page**

T02 added a "Homepage SEO" `<Card>` to `edit-form.tsx` containing: a `focus_keyword` text input (already in DB but not previously surfaced in the edit form), a controlled `<Textarea name="homepage_seo_text" rows={10}>` for the homepage body text, and a "✦ Generate with AI" button that streams from the SSE route.

The form uses `useState` for `homepageSeoText` so AI-streamed text chunks render incrementally. The streaming pattern mirrors the existing `category_seo_text` flow: POST to `/api/sites/[id]/generate-seo-text` with `{field: 'homepage_seo_text', contextId: siteId}`, consume SSE `text` events, append to controlled state.

The `generate-seo-text` route was extended with a `homepage_seo_text` branch: fetches `focus_keyword` from the site record (site select now includes it), constructs a prompt requesting ~400-word homepage SEO text in the site's language with the focus keyword included.

`updateSite` in `actions.ts` reads `focus_keyword` and `homepage_seo_text` from FormData and includes them in the Supabase `.update()` call. `UpdateSiteState` was extracted as a distinct type (previously aliased to `CreateSiteState`) carrying `UpdateSiteErrors` which extends `CreateSiteErrors` with the two new optional field arrays — required for TypeScript to accept `errors?.focus_keyword` references in the form.

`edit/page.tsx` passes `focus_keyword` and `homepage_seo_text` from the site record to `EditForm` (site `select('*')` already fetches both columns).

## Verification

All slice-level checks passed:

```bash
# CategoryForm field present
grep 'meta_description' apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx
# → 6 hits (interface, label, id, name, defaultValue, FieldError) ✓

# Homepage SEO field present
grep 'homepage_seo_text' apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
# → 8 hits ✓

# Route extended
grep 'homepage_seo_text' apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
# → 3 hits ✓

# updateSite action saves both fields
grep 'homepage_seo_text\|focus_keyword' apps/admin/src/app/(dashboard)/sites/actions.ts
# → 4 hits ✓

# Build
pnpm --filter @monster/admin build
# → exit 0, all routes compiled, types valid ✓
```

First build attempt in T02 failed with `Property 'focus_keyword' does not exist on type 'CreateSiteErrors'` — fixed by making `UpdateSiteState` a distinct type. Second build passed cleanly. The BullMQ critical-dependency warning is pre-existing and unrelated to this slice.

## Requirements Advanced

- R004 — ContentGenerator fields now have fully editable UI surface; category meta_description (the SEO-critical field generated by ContentGenerator) is now editable post-generation

## Requirements Validated

- None validated in this slice (no new proof beyond what S02 already established for R004)

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- **UpdateSiteState type extraction** — the plan did not anticipate the TypeScript constraint that required breaking `UpdateSiteState` out from the `CreateSiteState` alias. Applied as a necessary deviation; cleaner architecture as a result.
- **textarea rows={10} vs plan's rows={6}** — homepage SEO text is ~400 words; 10 rows is more usable for the expected content volume.
- **CategoryForm.tsx already had a description field** — the legacy `description` textarea coexists with the new `meta_description` field; both map to the same DB column, with `meta_description` taking precedence in the action (D057 alias pattern).

## Known Limitations

- The legacy `description` textarea in CategoryForm still renders alongside `meta_description`. They map to the same column (D057). A future polish pass could remove or hide the legacy field to avoid confusion.
- `updateSite` does not validate `homepage_seo_text` length or format — no `errors._form` path for this field; Supabase errors would surface as unhandled throws in the server log.
- Generate with AI for `homepage_seo_text` requires a live Anthropic API key in Settings to produce output; without it, the SSE stream returns an error event that is displayed under the textarea.

## Follow-ups

- Consider hiding the legacy `description` textarea in CategoryForm now that `meta_description` is the canonical field (minor UX cleanup).
- `focus_keyword` was added to the site edit form in this slice — confirm it was not previously in the form to avoid a duplicate field (grep shows it was absent before T02).

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx` — added `meta_description` to interface + rendered textarea with label/error/hint
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/edit/page.tsx` — passes `meta_description: cat.description ?? null` in defaultValues
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/actions.ts` — updateCategory reads meta_description, saves to description column; CategoryFormState.errors extended
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — Homepage SEO card with focus_keyword + homepage_seo_text + Generate with AI; controlled textarea; AI streaming state
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — passes focus_keyword and homepage_seo_text to EditForm
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — updateSite reads/saves focus_keyword + homepage_seo_text; UpdateSiteState/UpdateSiteErrors extracted as distinct types
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — homepage_seo_text field case added; site select now includes focus_keyword

## Forward Intelligence

### What the next slice should know
- `UpdateSiteState` and `UpdateSiteErrors` are now distinct types in `apps/admin/src/app/(dashboard)/sites/actions.ts` — any future addition of site-edit-specific validated fields should extend `UpdateSiteErrors`, not `CreateSiteErrors`.
- The SSE streaming pattern for AI generation is now established in two places (category_seo_text, homepage_seo_text) — the generate-seo-text route is the canonical SSE endpoint for all site/category-level AI content; it can be extended with new field cases without changing the client-side streaming logic.
- `generate-seo-text` route now selects `focus_keyword` from the sites table for every call (not just homepage_seo_text) — useful if other fields also need it in prompts.

### What's fragile
- The legacy `description` textarea in CategoryForm coexists with `meta_description` — if a user fills in the legacy field and leaves meta_description blank, the action will use the legacy description value (the `meta_description ?? description` fallback). This is intentional backward-compatible behavior but could surprise a future developer.
- `UpdateSiteState` type extraction means any code that previously treated `UpdateSiteState = CreateSiteState` will now see a distinct type. There are no callers outside `edit-form.tsx` and `actions.ts` so this is safe, but worth noting if `CreateSiteState` is refactored.

### Authoritative diagnostics
- TypeScript errors: `cd apps/admin && npx tsc --noEmit` — most precise signal for type regressions
- Build: `pnpm --filter @monster/admin build` — confirms all routes compile and type-check
- DB persistence: `SELECT id, description FROM tsa_categories WHERE id='<catId>'` and `SELECT focus_keyword, homepage_seo_text FROM sites WHERE id='<id>'`

### What assumptions changed
- The plan assumed `focus_keyword` was already in the site edit form — it was not. T02 added it fresh, which is why `UpdateSiteErrors` needed the new field.
- The plan assumed `UpdateSiteState` was already its own type — it was aliased to `CreateSiteState`. Extracting it was a required deviation, not a new feature.
