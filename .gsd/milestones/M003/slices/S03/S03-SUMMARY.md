---
id: S03
parent: M003
milestone: M003
provides:
  - ContentGenerator class with structured Claude API output (CategoryContentSchema + ProductContentSchema, Zod v4)
  - Idempotent generateCategoryContent() and generateProductContent() methods with 1.5s pacing
  - generate_content phase wired into GenerateSiteJob between process_images and SiteData assembly
  - BullMQ Worker lockDuration 300000ms to survive 60s+ content generation phases
  - focus_keyword written to tsa_categories and tsa_products before Astro build
  - SiteData contract extended with focus_keyword/meta_description/user_opinions_summary on all entities
  - BaseLayout.astro emits <meta name="description"> when metaDescription prop is present
  - All three template layouts (classic/modern/minimal) forward metaDescription to BaseLayout
  - Product and category pages derive and pass meta_description from site.json to layouts
requires:
  - slice: S02
    provides: tsa_categories/tsa_products rows with real ASINs in Supabase; image pipeline complete; GenerateSiteJob with fetch_products/process_images phases
affects:
  - S04 — reads focus_keyword from DB (via site.json) and from built HTML to score pages
key_files:
  - packages/agents/src/content-generator.ts
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/src/lib/data.ts
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/layouts/classic/Layout.astro
  - apps/generator/src/layouts/modern/Layout.astro
  - apps/generator/src/layouts/minimal/Layout.astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/categories/[slug].astro
key_decisions:
  - D057: category meta_description stored in tsa_categories.description (no new column needed)
  - D058: product meta_description in-memory only (Map) — not persisted to tsa_products
  - D059: lockDuration 300000ms on BullMQ Worker (covers worst-case 90s generation with headroom)
  - D060: zodOutputFormat imported from @anthropic-ai/sdk/helpers/zod (not main index)
patterns_established:
  - Zod v4 schemas in packages/agents only — never imported from @monster/shared (v3 pinned)
  - ContentGenerator NOT exported from index.ts — worker-internal only (D048 pattern)
  - Idempotency via alreadyHasFocusKeyword param — skip returns null immediately, no API call
  - sleep(1500) called only after successful generation, not on skipped calls
  - Category/product DB re-fetch before content phase (idempotency on retry)
  - Template prop forwarding: page → template layout → BaseLayout, each layer declares the optional prop explicitly
  - Null → undefined conversion at page boundary for Astro optional props
observability_surfaces:
  - "[ContentGenerator] initialised — ANTHROPIC_API_KEY present" at worker startup
  - "[ContentGenerator] category \"<name>\" — skipped (already generated)" on idempotent skip
  - "[ContentGenerator] category \"<name>\" — generated focus_keyword=\"<kw>\"" on generation
  - "[ContentGenerator] product \"<asin>\" — skipped (already generated)" on idempotent skip
  - "[ContentGenerator] product \"<asin>\" — generated focus_keyword=\"<kw>\"" on generation
  - "[GenerateSiteJob] generate_content: N/total items generated" at phase completion
  - ai_jobs.payload: {phase: "generate_content", done: N, total: M} updated per item
  - Constructor throws with descriptive message if ANTHROPIC_API_KEY missing (fail-fast)
drill_down_paths:
  - .gsd/milestones/M003/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S03/tasks/T03-SUMMARY.md
duration: 70m
verification_result: passed
completed_at: 2026-03-14
---

# S03: ContentGenerator

**AI-generated SEO texts, product descriptions, pros/cons, opinion summaries, and meta descriptions are now written to Supabase before the Astro build — throttle-aware, idempotent, in the site's configured language, with focus_keyword populated for every category and product.**

## What Happened

Three tasks executed sequentially with clean builds and zero deviations in T02/T03.

**T01** established the core `ContentGenerator` class in `packages/agents`. Installing `@anthropic-ai/sdk@0.78.x` and `zod@4.3.x` revealed one key deviation: `zodOutputFormat` is not exported from the SDK's main index — it lives at `@anthropic-ai/sdk/helpers/zod` and takes only a single argument (the Zod schema; no name parameter as the plan stated). Both schemas were implemented with full language-driven system prompts, `max_tokens: 1024`, `maxRetries: 5` on the Anthropic client, and a constructor-level fail-fast on missing `ANTHROPIC_API_KEY`. Idempotency is enforced via an `alreadyHasFocusKeyword` parameter — the method returns null immediately without an API call when content already exists.

**T02** wired the `generate_content` phase into `GenerateSiteJob` between the `process_images` final payload update and the `SiteData` assembly block. The phase re-fetches categories and products from Supabase (not in-memory arrays) to ensure idempotency on retry — the `focus_keyword` check reflects DB truth. Per-item `ai_jobs.payload` updates (`{phase: generate_content, done: N, total: M}`) provide live progress visibility in the admin panel. A `productMetaDescriptions` Map captures in-memory meta descriptions for injection at the assembly step (D058 — no `tsa_products.meta_description` column). `lockDuration: 300000` on the Worker prevents BullMQ from stalling a 90s+ content phase.

**T03** extended the SiteData contract and plumbed AI content through the Astro template chain. `CategoryData` gained `focus_keyword` and `meta_description` (mapped from `tsa_categories.description` per D057). `ProductData` gained `focus_keyword`, `user_opinions_summary`, and `meta_description` (from the in-memory Map). `SiteInfo` gained `focus_keyword`. All three template layouts (`classic`, `modern`, `minimal`) forward `metaDescription?: string` to `BaseLayout`, which conditionally emits `<meta name="description" content={...} />` in `<head>`. Product and category pages convert null→undefined at the page boundary before passing to layouts.

## Verification

```
pnpm --filter @monster/agents typecheck    → exit 0 (clean)
pnpm --filter @monster/agents build        → exit 0 (dist/worker.js 498.85 KB)
npx astro check (apps/generator)           → 0 errors, 0 warnings, 0 hints (10 files)
grep 'meta name="description"' BaseLayout.astro → tag present
grep "metaDescription" classic/modern/minimal Layout.astro → prop declared + forwarded in all 3
grep "generate_content|lockDuration" generate-site.ts → both present
grep "focus_keyword|meta_description|user_opinions_summary" data.ts → all fields present
grep "focus_keyword|productMetaDescriptions" generate-site.ts → assembly wired correctly
ANTHROPIC_API_KEY missing check → constructor throws with descriptive message (PASS)
```

## Requirements Advanced

- R004 (AI content generation) — fully implemented: category SEO texts, product descriptions, pros/cons, user opinion summaries, meta descriptions, all in site.language, with throttle-aware pacing and idempotency

## Requirements Validated

- none — validation requires a real job run with Anthropic API producing DB rows and HTML output (operational verification beyond this slice's CLI-level proof)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

**T01 only:**
1. `zodOutputFormat` import path: `@anthropic-ai/sdk/helpers/zod` not `@anthropic-ai/sdk`. The plan's import path was wrong — the function is a helper, not a main export. Recorded as D060.
2. `zodOutputFormat(schema)` is unary — the plan said `zodOutputFormat(schema, 'content')` but the function signature takes no name argument. Verified by inspecting SDK source.
3. Format passed via `output_config.format` property, matching actual SDK API shape discovered from `lib/parser.d.ts`.

T02 and T03 had zero deviations from plan.

## Known Limitations

- Product `meta_description` is not persisted to DB — it lives in a `Map<productId, string>` for the duration of one job run. On retry (after crash mid-generation), the Map is reconstructed from `generateProductContent()` calls, but skipped products (idempotency via `focus_keyword`) don't re-generate `meta_description`. Result: retried jobs produce null `meta_description` for already-generated products. Acceptable for Phase 1 (D058). Fix: add `tsa_products.meta_description` column in a migration.
- `pnpm --filter @monster/generator build` fails at static generation phase (no `src/data/default/site.json`). The Vite/TS compilation phase succeeds — this is expected behaviour (build requires a real job run to produce the data file first).
- Category `meta_description` reuses the `tsa_categories.description` column (D057). If category description and meta description diverge in meaning, a dedicated column is needed.

## Follow-ups

- Add `tsa_products.meta_description` column migration (remove D058 workaround) when idempotent meta description becomes a requirement
- Add `tsa_categories.meta_description` column migration (remove D057 workaround) if description diverges from meta description use case
- S04 SEO Scorer must read `focus_keyword` from DB rows (via site.json) — the `focus_keyword` field is now populated on both categories and products and flows through to built HTML

## Files Created/Modified

- `packages/agents/src/content-generator.ts` — new: ContentGenerator class + CategoryContentSchema + ProductContentSchema + inferred types
- `packages/agents/package.json` — added @anthropic-ai/sdk@^0.78.0 and zod@^4.3.6 to dependencies
- `packages/agents/src/jobs/generate-site.ts` — ContentGenerator import, lockDuration 300000, generate_content phase block, productMetaDescriptions Map, updated siteData assembly
- `apps/generator/src/lib/data.ts` — extended CategoryData, ProductData, SiteInfo with new fields
- `apps/generator/src/layouts/BaseLayout.astro` — metaDescription prop + <meta name="description"> tag
- `apps/generator/src/layouts/classic/Layout.astro` — metaDescription prop forwarded to BaseLayout
- `apps/generator/src/layouts/modern/Layout.astro` — metaDescription prop forwarded to BaseLayout
- `apps/generator/src/layouts/minimal/Layout.astro` — metaDescription prop forwarded to BaseLayout
- `apps/generator/src/pages/products/[slug].astro` — metaDescription derived (null→undefined) and passed
- `apps/generator/src/pages/categories/[slug].astro` — metaDescription derived (null→undefined) and passed
- `.gsd/DECISIONS.md` — appended D060
- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — added failure-path diagnostic verification step (pre-flight)
- `.gsd/milestones/M003/slices/S03/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight)

## Forward Intelligence

### What the next slice should know
- `focus_keyword` is now populated on both `tsa_categories` and `tsa_products` after a successful content generation phase — S04 SEO Scorer reads it from the `site.json` data file (not directly from DB) for keyword density scoring. The field flows: DB → siteData assembly → site.json → `getStaticPaths()` → component props.
- `BaseLayout.astro` now emits `<meta name="description">` conditionally — S04 should score meta description presence and length using this tag in the built HTML.
- The `generate_content` phase in `GenerateSiteJob` is at line ~320–440 in `generate-site.ts`. The phase block re-fetches from DB. Product assembly is at ~line 442 onwards.

### What's fragile
- `productMetaDescriptions` Map is only populated if ContentGenerator runs during this job invocation. If the job crashes after `generate_content` and retries, the Map starts empty, and `focus_keyword`-present products skip generation (idempotent) but their `meta_description` will be null in the rebuilt site.json. This is the known D058 gap.
- `tsa_categories.description` doubles as `meta_description` (D057). If ContentGenerator output is long (400-word SEO text), it's the wrong column for a 150-char meta description — the `meta_description` field in the schema is in `CategoryContentSchema` and is a distinct short string, correctly written to `description`. Check actual values after first real run.

### Authoritative diagnostics
- After a job run: `SELECT focus_keyword, description FROM tsa_categories WHERE site_id = '...' LIMIT 5` — focus_keyword non-null confirms generation ran; description contains the meta description string.
- After a job run: `SELECT focus_keyword FROM tsa_products WHERE site_id = '...' LIMIT 5` — non-null confirms product content generated.
- In built HTML: `grep -r '<meta name="description"' .generated-sites/<slug>/dist/` — present on product and category pages where meta_description was non-null.
- Worker stdout: grep for `[ContentGenerator]` lines — shows skip vs generation per item, phase completion count.
- `ai_jobs.payload` in Supabase: `{phase: "generate_content", done: N, total: M}` — last value shows completion state.

### What assumptions changed
- Plan assumed `zodOutputFormat` is a main SDK export — it's a helpers subpath export. Import must use `@anthropic-ai/sdk/helpers/zod`.
- Plan assumed `zodOutputFormat(schema, 'name')` — the function is unary; no name argument exists.
