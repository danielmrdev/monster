# M013: TSA Template Redesign — Single Unified Template

**Gathered:** 2026-03-18
**Status:** Ready for planning

## Project Description

Replace the current three-template system (classic/modern/minimal) in the TSA site generator with a single, well-designed, opinionated template. The reference design is decalaveras.com: clean, minimalist, text+image-driven, with real brand colors used purposefully. Tailwind v4 + @tailwindcss/typography prose plugin for SEO texts.

## Why This Milestone

The three existing templates are generic and under-designed. A single polished template is better than three mediocre ones. The architecture stays extensible — `template_slug` in site.json continues to exist, and future templates can be added when needed. Each site gets exactly one template assigned; no site uses multiple.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Generate a site with `SITE_SLUG=fixture` and see the new unified design across all page types: homepage, category, product, and all four legal pages
- See logo centered large in the header, horizontal category nav, H1 with focus keyword, and SEO text rendered with prose on every page type
- See affiliate links rendered as `/go/<product-slug>` (not raw Amazon URLs) across all product grids and product pages
- Confirm that pricing shows old price struck through + % discount badge when `original_price` is present

### Entry point / environment

- Entry point: `SITE_SLUG=fixture pnpm --filter @monster/generator build`
- Environment: local dev build, visual inspect of dist/ HTML + browser preview
- Live dependencies involved: none (fixture build, no Supabase, no DataForSEO)

## Completion Class

- Contract complete means: build succeeds, all page types render correct HTML structure, all affiliate links use `/go/`, no references to old template slugs in rendered pages
- Integration complete means: `SITE_SLUG=fixture` build produces 11+ pages with correct content injected
- Operational complete means: none (template is consumed by GenerateSiteJob, which is exercised separately)

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 and produces all page types
- Every affiliate link in the built HTML is `/go/<slug>` not a direct Amazon URL
- Homepage renders: centered logo, cat nav, H1 from `focus_keyword`, category grid with `description` field, SEO text
- Category page renders: H1, description, product grid with price/discount logic, SEO text, 3 related categories at bottom
- Product page renders: image/gallery, price with original_price badge when present, buy button via `/go/`, pros/cons, breadcrumb
- Legal pages render with prose typography
- `tsc --noEmit` and `astro check` both exit 0

## Risks and Unknowns

- `description` field missing from `CategoryData` in `data.ts` and fixture — needs to be added before templates can use it
- `@tailwindcss/typography` may not be installed in the generator — needs verification
- Current pages dispatch on `template_slug` with three branches; new code should simplify to a single path while keeping the slug concept alive

## Existing Codebase / Prior Art

- `apps/generator/src/layouts/classic/Layout.astro` — existing layout, dismantled in S01
- `apps/generator/src/layouts/modern/Layout.astro` — existing layout, dismantled in S01
- `apps/generator/src/layouts/minimal/Layout.astro` — existing layout, dismantled in S01
- `apps/generator/src/pages/index.astro` — homepage, currently triple-dispatches on template_slug
- `apps/generator/src/pages/categories/[slug].astro` — category page, triple-dispatch
- `apps/generator/src/pages/products/[slug].astro` — product page, triple-dispatch
- `apps/generator/src/pages/[legal].astro` — legal pages, triple-dispatch
- `apps/generator/src/lib/data.ts` — `CategoryData` interface (missing `description` field)
- `apps/generator/src/lib/data.ts` — `ProductData` interface (has `current_price`, `original_price` not yet in interface — in DB as `original_price numeric`)
- `apps/generator/src/layouts/BaseLayout.astro` — base HTML, CSS vars for brand colors, analytics injection
- `apps/generator/src/data/fixture/site.json` — test data, needs `description` added to categories
- `packages/db/supabase/migrations/20260313000002_tsa.sql` — `original_price numeric` exists in tsa_products
- `packages/db/src/types/supabase.ts` — `original_price: number | null` exists

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001 — End-to-end site generation pipeline: this milestone improves the generated output quality
- R002 — Extensible site type architecture: template_slug concept preserved; single implementation, extensible slot

## Scope

### In Scope

- New unified TSA layout (`apps/generator/src/layouts/tsa/Layout.astro`)
- Homepage page rebuilt to spec (centered logo, H1, category grid with description+image, SEO text)
- Category page rebuilt (H1, description, product grid with image+price+discount+buttons, SEO text, related cats)
- Product page rebuilt (image gallery, price/discount, buy button via cloaking, pros/cons, AI description, breadcrumb)
- Legal pages rebuilt with prose typography
- Link cloaking module (`apps/generator/src/lib/cloaking.ts`) + `/go/[slug].astro` redirect page — template-agnostic, reusable by all future templates
- `CategoryData.description` added to interface and fixture
- `ProductData.original_price` added to interface
- Old layout files (classic/modern/minimal) removed or left as stubs — slice S01 decides
- Fixture `site.json` updated with `description` on categories

### Out of Scope / Non-Goals

- Multiple template variants (future milestone when needed)
- HTTP 302 real redirects for cloaking (requires Caddy rules — deferred)
- Generating new site types beyond TSA
- Changing the admin panel (no admin changes in this milestone)
- Migration to add `description` to Supabase DB schema (field already exists; only generator interface needs update)

## Technical Constraints

- Tailwind v4 (inline `@import "tailwindcss"` in BaseLayout — see existing pattern)
- `@tailwindcss/typography` prose plugin must be installed if not already
- No JS framework in templates — `is:inline` scripts only (D163 pattern)
- All affiliate links must use `rel="nofollow sponsored"` (legal requirement)
- Generator must remain fully static (no SSR)
- `SITE_SLUG=fixture` must be the validation target for all build checks

## Integration Points

- `apps/generator/src/lib/data.ts` — interface changes affect all page files that destructure props
- `packages/db/src/types/supabase.ts` — `original_price: number | null` already typed; generator interface must match
- `BaseLayout.astro` — brand CSS vars (`--color-primary`, `--color-accent`) already injected; templates use them

## Open Questions

- Whether to delete the old classic/modern/minimal layout files or keep them as archived stubs → agent's discretion (clean delete is fine, they're superseded)
- Font loading strategy (Google Fonts vs system fonts) → agent's discretion; system font stack is safe default, add Google Font import if the design calls for it
