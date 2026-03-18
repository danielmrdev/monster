# M013: TSA Template Redesign — Single Unified Template

**Vision:** Replace the three generic TSA templates with a single, polished, opinionated design. Minimalist, brand-color-driven, with centered logo, horizontal category nav, vertical image grids, and SEO prose text. Affiliate links cloaked via `/go/<slug>` for clean URLs, better CTR, and centralized tracking. The template system stays extensible — one template now, more later when needed.

## Success Criteria

- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 and produces all page types
- Homepage: centered logo, horizontal category nav, H1 from `focus_keyword`, category grid with description + vertical image, SEO text at bottom
- Category page: H1, description, product grid with uniform vertical images + price + discount badge (when `original_price` present) + "+info" and "comprar" buttons, SEO text, 3 related categories at bottom
- Product page: image gallery, price with struck-through original + % discount badge, "comprar" button via `/go/`, pros/cons, AI description, breadcrumb back to category
- Legal pages: prose typography, coherent with the rest of the design
- Every affiliate link in built HTML is `/go/<slug>`, not a direct Amazon URL
- `tsc --noEmit` and `astro check` both exit 0

## Key Risks / Unknowns

- `description` field missing from `CategoryData` interface and fixture — must be added before any template can render it
- `@tailwindcss/typography` may not be installed in the generator — needs verification at S01 start
- Old triple-dispatch logic in all four page files needs clean replacement without regressions on legal page rendering

## Proof Strategy

- Data gap (description, original_price) → retire in S01 by updating interface + fixture and verifying build with new fields present
- Link cloaking correctness → retire in S05 by grepping built HTML and confirming zero `amazon.` URLs in `<a href>` attributes on affiliate links

## Verification Classes

- Contract verification: `SITE_SLUG=fixture pnpm build` exit 0 + `astro check` exit 0 + HTML grep for `/go/` links
- Integration verification: full fixture build produces homepage + all category pages + all product pages + 4 legal pages
- Operational verification: none (template rendered by GenerateSiteJob, validated separately)
- UAT / human verification: visual browser inspection of the built dist/ in a local server

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 6 slices complete with their slice-level verification passing
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- `tsc --noEmit` exits 0
- `astro check` exits 0
- Zero direct Amazon affiliate URLs (`amazon.es/dp/`, `amazon.com/dp/`) in built HTML `<a href>` attributes
- All page types (homepage, category, product, 4 legal) render correct structure per spec
- `description` field present in `CategoryData` interface and fixture

## Requirement Coverage

- Covers: R001 (pipeline output quality), R045 (TSA unified template), R046 (link cloaking), R047 (category description in generator)
- Partially covers: R002 (extensible architecture — template_slug concept preserved)
- Leaves for later: R002 full validation (second template type)
- Orphan risks: none

## Slices

- [x] **S01: Data layer + new layout base** `risk:medium` `depends:[]`
  > After this: `SITE_SLUG=fixture pnpm build` succeeds with the new layout shell; `CategoryData` has `description`; `ProductData` has `original_price`; `@tailwindcss/typography` confirmed installed; old layout files removed.

- [x] **S02: Homepage + category page** `risk:medium` `depends:[S01]`
  > After this: Homepage and category pages render in browser from `dist/` with new design: centered logo, category grid with description, product grid with price/discount badges.

- [x] **S03: Product page** `risk:low` `depends:[S01]`
  > After this: Product page renders with image gallery, price/discount, pros/cons, AI description, breadcrumb to category.

- [x] **S04: Legal pages** `risk:low` `depends:[S01]`
  > After this: All four legal pages render with prose typography, coherent header/footer, correct legal content.

- [x] **S05: Link cloaking** `risk:low` `depends:[S02, S03]`
  > After this: All affiliate links in built HTML are `/go/<slug>`; `/go/[slug].astro` meta-refresh redirect pages present in dist/; zero direct Amazon URLs on affiliate `<a>` tags; `cloaking.ts` module is template-agnostic and reusable.

- [x] **S06: Homepage design completeness** `risk:low` `depends:[S01, S02]`
  > After this: Homepage renders centered logo (two-row header or grid-cols-3 layout), H1 from `focus_keyword` when non-null, prose SEO text section at bottom, category grid cards with vertical image. Fixture updated with `homepage_seo_text` and non-null `focus_keyword`. `astro check` exits 0. All previously passing criteria remain green.

## Boundary Map

### S01 → S02, S03, S04

Produces:
- `apps/generator/src/layouts/tsa/Layout.astro` — new single TSA layout (header with centered logo + horizontal cat nav + hamburger; footer with legal links; slots for main content)
- `apps/generator/src/lib/data.ts` — `CategoryData.description: string | null` added; `ProductData.original_price: number | null` added
- `apps/generator/src/data/fixture/site.json` — `description` field on both categories
- Old layout files removed (classic/modern/minimal)
- `@tailwindcss/typography` installed and configured

Consumes:
- nothing (first slice)

### S02 → S05

Produces:
- `apps/generator/src/pages/index.astro` — homepage using Layout.astro, single-branch (no template_slug dispatch), renders per spec
- `apps/generator/src/pages/categories/[slug].astro` — category page using Layout.astro, single-branch

Consumes from S01:
- `layouts/tsa/Layout.astro` → header/footer shell
- `CategoryData.description` → displayed in category grid cards and category page header
- `ProductData.original_price` → discount badge logic

### S03 → S05

Produces:
- `apps/generator/src/pages/products/[slug].astro` — product page using Layout.astro, single-branch, with affiliate link placeholder (to be replaced in S05)

Consumes from S01:
- `layouts/tsa/Layout.astro`
- `ProductData.original_price` → price/discount display

### S04 → (no S05 dependency)

Produces:
- `apps/generator/src/pages/[legal].astro` — legal pages using Layout.astro, single-branch, prose typography

Consumes from S01:
- `layouts/tsa/Layout.astro`

### S05 (final)

Produces:
- `apps/generator/src/lib/cloaking.ts` — `buildCloakUrl(productSlug): string`, `buildCloakMap(products): Record<string, string>` — template-agnostic
- `apps/generator/src/pages/go/[slug].astro` — meta-refresh redirect page, generated for every product at build time
- Updated `pages/index.astro`, `pages/categories/[slug].astro`, `pages/products/[slug].astro` — all affiliate links use `buildCloakUrl()` with `rel="nofollow sponsored"`

Consumes from S02:
- Homepage and category pages (affiliate links to be swapped from direct → `/go/`)

Consumes from S03:
- Product page (buy button to be swapped to `/go/`)
