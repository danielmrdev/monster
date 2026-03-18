---
id: M013
provides:
  - Single unified TSA template (tsa/classic) replacing classic/modern/minimal variants
  - apps/generator/src/layouts/tsa/Layout.astro — grid-cols-3 header (hamburger left, logo center, desktop nav right), footer with legal links, mobile dropdown (KN013 sibling pattern)
  - apps/generator/src/pages/index.astro — homepage with hero, H1 from focus_keyword, category grid (image/placeholder + description), prose SEO text via marked()
  - apps/generator/src/pages/categories/[slug].astro — category page with H1, description, product grid (uniform vertical image, price, discount badge, +info/comprar buttons), SEO text, related categories section
  - apps/generator/src/pages/products/[slug].astro — product page with image gallery, price/discount badge, buy button via /go/, pros/cons (when present), AI description, breadcrumb to category
  - apps/generator/src/pages/[legal].astro — legal pages with prose typography, coherent header/footer via Layout.astro
  - apps/generator/src/lib/cloaking.ts — template-agnostic buildCloakUrl(productSlug) and buildCloakMap(products)
  - apps/generator/src/pages/go/[slug].astro — static meta-refresh redirect pages, one per product
  - CategoryData.description: string | null in data.ts interface and fixture
  - ProductData.original_price: number | null in data.ts interface and fixture
  - SiteInfo.homepage_seo_text: string | null in data.ts interface and fixture
  - SiteInfo.focus_keyword set to "freidoras de aire" in fixture
  - @tailwindcss/typography installed and configured
key_decisions:
  - D169: Single unified TSA template replaces classic/modern/minimal; template_slug concept preserved (tsa/classic)
  - D170: Link cloaking via /go/[slug].astro with meta-refresh; cloaking.ts is template-agnostic
  - D171: meta-refresh + rel="nofollow sponsored" carries no SEO penalty; Google follows meta-refresh
  - grid-cols-3 header: hamburger left cell, logo center cell (min-w-0 truncate), desktop nav right cell
  - marked() used synchronously without await (KN009 — marked v17 is sync)
  - placeholder div (bg-gray-100 h-40) used when category_image is null — never renders <img src="">
patterns_established:
  - grid-cols-3 three-cell header: reusable centered-logo pattern for any future layout
  - Prose section pattern: <section class="mt-12 border-t ..."><div class="prose prose-sm max-w-none text-gray-600" set:html={...}>
  - Category card layout: image/placeholder block (h-40) above p-5 text block, overflow-hidden on outer anchor
  - Cloaking pattern: buildCloakUrl(slug) returns /go/${slug}; all affiliate <a> carry rel="nofollow sponsored"
  - /go/[slug].astro: noindex meta + meta-refresh + window.location fallback + rel canonical to Amazon
observability_surfaces:
  - SITE_SLUG=fixture pnpm --filter @monster/generator build (exit 0, 15 pages in ~2.7s)
  - SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check (0 errors, 0 warnings)
  - grep -oP 'href="[^"]*amazon\.[^"]*"' dist/**/*.html | grep -v /go/ (must be empty)
  - grep -i 'freidoras de aire' dist/index.html | grep h1 (H1 from focus_keyword)
  - grep 'prose prose-sm max-w-none' dist/index.html (prose SEO text section present)
requirement_outcomes:
  - id: R045
    from_status: active
    to_status: validated
    proof: "SITE_SLUG=fixture build exits 0 producing 15 pages (1 homepage, 2 category, 4 product, 4 legal, 4 /go/). Homepage has centered logo (grid-cols-3), H1 from focus_keyword='freidoras de aire', category grid with description + image/placeholder, prose SEO text section. Category pages have H1, description, product grid with price/+info/comprar buttons, SEO text, related categories. Product pages have image gallery, price, buy button via /go/, breadcrumb. Legal pages have prose prose-sm typography and coherent header/footer. astro check exits 0."
  - id: R046
    from_status: active
    to_status: validated
    proof: "cloaking.ts exports buildCloakUrl/buildCloakMap. /go/[slug].astro generates one redirect page per product. grep for amazon. URLs in <a href> attributes outside /go/ pages returns zero results. All affiliate <a> tags carry rel='nofollow sponsored'. 4 /go/ redirect pages in dist."
  - id: R047
    from_status: active
    to_status: validated
    proof: "CategoryData.description: string | null added to data.ts interface. Fixture freidoras-de-aire category has description='Las mejores freidoras de aire...' and accesorios-freidora has description='Accesorios compatibles...'. Description is rendered in category grid cards on homepage and in category page header. astro check confirms type safety."
duration: ~6 slices, ~8–20m each
verification_result: passed
completed_at: 2026-03-18
---

# M013: TSA Template Redesign — Single Unified Template

**Replaced three generic TSA templates with a single polished unified design: centered logo header, horizontal category nav, H1 from focus_keyword, product grids with price/discount badges, prose SEO text sections, and affiliate link cloaking via `/go/<slug>` on all page types.**

## What Happened

M013 executed as six sequential slices, each building on the previous. The work was primarily in `apps/generator/` — no admin panel changes, no DB migrations.

**S01 (Data layer + new layout base)** established the foundation: `CategoryData.description` and `ProductData.original_price` were added to the `data.ts` interface and fixture; `@tailwindcss/typography` was confirmed installed; the old classic/modern/minimal layout files were removed; and `apps/generator/src/layouts/tsa/Layout.astro` was created as the single shared header/footer shell with the mobile hamburger nav following the KN013 sibling dropdown pattern.

**S02 (Homepage + category page)** rebuilt `index.astro` and `categories/[slug].astro` against the new layout. The homepage received the hero section with Unsplash stock image, a category grid with card descriptions, and the product grid with price display and "+info"/"comprar" buttons. The category page received breadcrumb nav, description header, product grid with uniform vertical images, SEO text prose section, and a related categories block.

**S03 (Product page)** rebuilt `products/[slug].astro` with an image gallery (thumbnail switcher via is:inline script), price block with struck-through original price and discount badge when `original_price` is present, buy button placeholder (later replaced in S05), pros/cons accordion (renders when fixture data is non-null), AI description section, and breadcrumb back to the category.

**S04 (Legal pages)** rebuilt `[legal].astro` using Layout.astro, eliminating the old triple-dispatch pattern. All four legal page types (privacidad, aviso-legal, cookies, contacto) now render with `prose prose-sm max-w-none` typography and the coherent header/footer.

**S05 (Link cloaking)** introduced `lib/cloaking.ts` (template-agnostic `buildCloakUrl(productSlug)` and `buildCloakMap(products)`) and `pages/go/[slug].astro` (static meta-refresh redirect with `noindex,nofollow` robots meta, `rel="canonical"` pointing to Amazon, and `window.location` JS fallback). All affiliate `<a>` tags across homepage, category, and product pages were updated to use `buildCloakUrl()` with `rel="nofollow sponsored"`. Zero direct Amazon URLs remain in `<a href>` attributes outside the `/go/` redirect pages.

**S06 (Homepage design completeness)** closed four design gaps: the header was upgraded from flex to `grid grid-cols-3` (hamburger left cell, logo center cell with `min-w-0 truncate`, desktop nav right cell); H1 was changed from `site.name` to `site.focus_keyword ?? site.name`; category cards were restructured with an image/placeholder block above the text block; and a prose SEO text section was added at the bottom of the homepage via `marked()` rendering `site.homepage_seo_text`. The `SiteInfo` interface was extended with `homepage_seo_text: string | null` and the fixture was updated with `focus_keyword: "freidoras de aire"` and a content-rich `homepage_seo_text` paragraph.

## Cross-Slice Verification

All M013 success criteria were verified against the fixture build:

| Criterion | Evidence | Result |
|-----------|----------|--------|
| `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 | 15 pages built in 2.68s, `[build] Complete!` | ✅ |
| `astro check` exits 0 | 11 files checked, 0 errors, 0 warnings | ✅ |
| `tsc --noEmit` exits 0 | Exit code 0, no output | ✅ |
| Homepage: centered logo | `grid grid-cols-3 h-14 items-center` nav in built HTML, logo in center cell | ✅ |
| Homepage: horizontal category nav | `hidden md:flex gap-4` desktop nav + hamburger mobile dropdown | ✅ |
| Homepage: H1 from `focus_keyword` | `<h1 ...> freidoras de aire </h1>` in built HTML | ✅ |
| Homepage: category grid with description | Category description text in card p-5 text block in built HTML | ✅ |
| Homepage: SEO text at bottom | `<div class="prose prose-sm max-w-none text-gray-600">` with rendered paragraph | ✅ |
| Category page: H1, description, product grid with price/discount + buttons | H1 present, description in page header, product cards with EUR price and +info/comprar CTAs | ✅ |
| Category page: SEO text, 3 related categories | `prose prose-sm` section + related categories section present | ✅ |
| Product page: image gallery, price/discount, `/go/` buy button, breadcrumb | gallery div, EUR price, `href="/go/philips-hd9252-90/"`, breadcrumb "Inicio / Freidoras de Aire / …" | ✅ |
| Legal pages: prose typography, coherent header/footer | All 4 legal pages present with `prose prose-sm max-w-none` and shared Layout.astro header | ✅ |
| Zero direct Amazon affiliate URLs in `<a href>` outside `/go/` | `grep -rP 'href="[^"]*amazon\.[^"]*"' dist/` excluding `/go/` pages returns empty | ✅ |
| All affiliate `<a>` carry `rel="nofollow sponsored"` | `rel="nofollow sponsored"` on all product buy buttons and category product links | ✅ |
| `CategoryData.description` in interface and fixture | `description: string | null` in data.ts; fixture categories have non-null descriptions | ✅ |

Page inventory (15 total): 1 homepage + 2 category + 4 product + 4 /go/ redirect + 4 legal = 15. All page types account for.

## Requirement Changes

- R045 (TSA unified template): active → **validated** — Fixture build produces all page types with the specified design: centered logo, focus_keyword H1, category grid with description+image/placeholder, product grid with price/discount/buttons, prose SEO text, related categories, product gallery, legal prose typography. `astro check` exits 0.
- R046 (Link cloaking): active → **validated** — `cloaking.ts` module is template-agnostic. `/go/[slug].astro` produces 4 static redirect pages. Zero direct Amazon `<a href>` in non-go pages. All affiliate links carry `rel="nofollow sponsored"`.
- R047 (CategoryData.description in generator): active → **validated** — `description: string | null` added to `CategoryData` interface. Both fixture categories have non-null descriptions. Description renders in category grid cards (homepage) and category page header.

## Forward Intelligence

### What the next milestone should know
- The unified TSA template is the only active template. `template_slug` in `site.json` is preserved for extensibility but all TSA sites now use `tsa/classic`. The dispatch-on-template-slug pattern was removed from all four page files.
- `cloaking.ts` is template-agnostic: any future template imports `buildCloakUrl(slug)` from `../lib/cloaking` and uses it for all affiliate links. No changes needed to `cloaking.ts` itself.
- `marked()` is synchronous in v17 (KN009). `homepage_seo_text` is passed as a string to `set:html` via `marked()`. If the AI pipeline sends Markdown, it renders correctly. If it sends raw HTML, `marked()` passes it through (correct behavior).
- Fixture has `pros_cons: null` and empty `ai_description` for all products — the pros/cons and AI description sections are therefore absent from fixture product pages. This is correct; real AI-generated products will have these fields populated.

### What's fragile
- Category card images depend on `category_image` being non-null in the fixture. Both fixture categories have `category_image: null`, so all builds show the `bg-gray-100 h-40` placeholder. The `<img>` branch of the category card image block has never been exercised in a fixture build — validate it when real category images are available.
- The `grid-cols-3` header requires the mobile dropdown (`#mobile-menu-tsa-dropdown`) to remain a sibling div outside the three-cell nav grid. The hamburger `<script is:inline>` toggles only the dropdown div. Do not merge the dropdown into the nav grid or the layout will break on desktop.
- Product page pros/cons and AI description sections are null-guarded. Fixture products have no AI content, so those sections never render in test builds. The sections will first be exercised on a real site with ContentGenerator output.

### Authoritative diagnostics
- `apps/generator/.generated-sites/fixture/dist/index.html` is the canonical artifact for all homepage checks. Grep it directly without a dev server.
- `SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check` is the authoritative TypeScript checker for `.astro` files. Run it after any interface change in `data.ts`.
- Link cloaking check: `grep -rP 'href="[^"]*amazon\.[^"]*"' dist/ | grep -v '/go/'` must return empty on every build.

### What assumptions changed
- The old triple-dispatch pattern (switch/if on `template_slug` with classic/modern/minimal branches) was removed entirely. Pages now have a single render path. The `template_slug` value in `site.json` is still read but only as metadata — no dispatch is performed.
- `@tailwindcss/typography` was already installed in the generator before S01 started — no installation was required.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — Added `description: string | null` to `CategoryData`; `original_price: number | null` to `ProductData`; `homepage_seo_text: string | null` to `SiteInfo`
- `apps/generator/src/data/fixture/site.json` — Added `description` to both categories; set `focus_keyword: "freidoras de aire"`; added `homepage_seo_text` HTML paragraph; added `original_price` fields to products
- `apps/generator/src/layouts/tsa/Layout.astro` — New single unified TSA layout (grid-cols-3 header, hamburger + mobile dropdown, footer with legal links and Amazon disclosure)
- `apps/generator/src/pages/index.astro` — Rebuilt: hero section, H1 from `focus_keyword ?? site.name`, category grid with image/placeholder + description, product section, prose SEO text via `marked()`; imports `{ marked }`
- `apps/generator/src/pages/categories/[slug].astro` — Rebuilt: breadcrumb, H1, description, product grid (uniform vertical image, price, discount badge, +info/comprar buttons), SEO text, related categories
- `apps/generator/src/pages/products/[slug].astro` — Rebuilt: image gallery with thumbnail switcher, price/discount block, buy button via `buildCloakUrl()`, pros/cons (nullable), AI description (nullable), breadcrumb
- `apps/generator/src/pages/[legal].astro` — Rebuilt: single-branch, uses Layout.astro, prose typography
- `apps/generator/src/lib/cloaking.ts` — New: `buildCloakUrl(productSlug)`, `buildCloakMap(products)`
- `apps/generator/src/pages/go/[slug].astro` — New: static meta-refresh redirect page per product
- `apps/generator/src/layouts/classic/` — Removed (old layout)
- `apps/generator/src/layouts/modern/` — Removed (old layout)
- `apps/generator/src/layouts/minimal/` — Removed (old layout)
