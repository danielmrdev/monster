---
id: T03
parent: S03
milestone: M003
provides:
  - SiteData contract extended with focus_keyword/meta_description/user_opinions_summary on all entities
  - BaseLayout.astro emits <meta name="description"> when metaDescription prop is present
  - All three template layouts (classic/modern/minimal) forward metaDescription to BaseLayout
  - Product and category pages derive and pass meta_description from site.json to layouts
  - generate-site.ts siteData assembly includes all new DB fields + productMetaDescriptions Map values
key_files:
  - apps/generator/src/lib/data.ts
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/layouts/classic/Layout.astro
  - apps/generator/src/layouts/modern/Layout.astro
  - apps/generator/src/layouts/minimal/Layout.astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/categories/[slug].astro
  - packages/agents/src/jobs/generate-site.ts
key_decisions:
  - category meta_description mapped from tsa_categories.description column (ContentGenerator writes there, data.ts reads cat.description ?? null)
  - productMetaDescriptions Map (populated during generate_content phase in T02) consumed directly in the assembly block — not re-fetched from DB, because meta_description is not stored on tsa_products (only in-memory per job run)
  - SiteInfo.focus_keyword added to data.ts interface even though no page currently uses it — preserves type contract parity with DB and enables future SEO scoring
patterns_established:
  - Template prop forwarding: each layout layer (page → template layout → BaseLayout) declares the optional prop and passes it through explicitly — no magic prop spreading
  - Null → undefined conversion at page boundary: `product.meta_description ?? undefined` converts null (JSON) to undefined (Astro optional prop) so the conditional render `{metaDescription && ...}` works correctly
observability_surfaces:
  - Built HTML grep: `grep '<meta name="description"' .generated-sites/*/dist/**/*.html` — present when meta_description was non-null in DB after ContentGenerator ran
  - site.json inspection: `cat apps/generator/src/data/<slug>/site.json | jq '.products[0].meta_description'` — shows null if generation skipped or not yet run
  - Type errors surface at Astro build/check time: `pnpm --filter @monster/generator build` or `npx astro check` — catches any missed prop forwarding in layouts/pages
duration: 20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Extend SiteData contract and wire meta_description into templates

**Extended SiteData interfaces and wired AI-generated meta_description through all three template layouts into BaseLayout's `<meta name="description">` tag — completing the ContentGenerator round-trip.**

## What Happened

Straightforward data contract extension across generator interfaces and template prop chain. All three tasks in S03 are now complete:

1. **data.ts** — Added `focus_keyword: string | null` and `meta_description: string | null` to `CategoryData`; `focus_keyword: string | null`, `user_opinions_summary: string | null`, `meta_description: string | null` to `ProductData`; `focus_keyword: string | null` to `SiteInfo`.

2. **generate-site.ts** — Updated `siteData` assembly block: `site.focus_keyword` from DB row; `cat.focus_keyword` and `cat.description` (mapped to `meta_description`) from category rows; `p.focus_keyword`, `p.user_opinions_summary`, and `productMetaDescriptions.get(p.id)` from product rows + the in-memory Map populated during the generate_content phase.

3. **BaseLayout.astro** — Added `metaDescription?: string` to Props interface and `{metaDescription && <meta name="description" content={metaDescription} />}` in `<head>` after `<title>`.

4. **Three template layouts** (classic, modern, minimal) — Added `metaDescription?: string` to each Props interface, destructured it, and passed `metaDescription={metaDescription}` to `<BaseLayout>`.

5. **Product page** — Derived `const metaDescription = product.meta_description ?? undefined` and passed to all three layout variants.

6. **Category page** — Same pattern with `category.meta_description ?? undefined`.

## Verification

```
pnpm --filter @monster/agents typecheck  → exit 0 (clean)
pnpm --filter @monster/agents build      → exit 0 (ESM build success)
npx astro check (in apps/generator)     → 0 errors, 0 warnings, 0 hints across 10 files
grep 'meta name="description"' BaseLayout.astro → tag present
grep "metaDescription" classic/modern/minimal Layout.astro → prop declared + forwarded in all three
grep "focus_keyword|user_opinions_summary|meta_description" data.ts → all fields present
grep "focus_keyword|productMetaDescriptions" generate-site.ts → assembly wired
```

`pnpm --filter @monster/generator build` fails at static generation phase (no `src/data/default/site.json`), which is expected — no job has run. The Vite/TS compilation phase completes successfully before that error.

## Diagnostics

- After a real job run: inspect `apps/generator/src/data/<slug>/site.json` — `products[*].meta_description` should be non-null strings if ContentGenerator ran and wrote to the DB.
- In built HTML: `grep -r '<meta name="description"' .generated-sites/<slug>/dist/` — tag appears on product and category pages where `meta_description` was populated.
- Missing meta tag on a page = `meta_description` was null in site.json = ContentGenerator either skipped (idempotency) or had no result for that item — safe default, not an error.
- Type regression check: `npx astro check` in apps/generator catches any layout/page prop mismatch.

## Deviations

None. All steps followed the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — extended CategoryData, ProductData, SiteInfo with new fields
- `apps/generator/src/layouts/BaseLayout.astro` — metaDescription prop + <meta name="description"> tag
- `apps/generator/src/layouts/classic/Layout.astro` — metaDescription prop forwarded to BaseLayout
- `apps/generator/src/layouts/modern/Layout.astro` — metaDescription prop forwarded to BaseLayout
- `apps/generator/src/layouts/minimal/Layout.astro` — metaDescription prop forwarded to BaseLayout
- `apps/generator/src/pages/products/[slug].astro` — metaDescription derived and passed to all three layout variants
- `apps/generator/src/pages/categories/[slug].astro` — metaDescription derived and passed to all three layout variants
- `packages/agents/src/jobs/generate-site.ts` — siteData assembly updated with focus_keyword, meta_description, user_opinions_summary on all entities
- `.gsd/milestones/M003/slices/S03/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
