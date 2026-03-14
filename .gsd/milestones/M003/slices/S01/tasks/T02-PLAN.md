---
estimated_steps: 8
estimated_files: 11
---

# T02: Build all three template variants across all page types

**Slice:** S01 — Astro Templates + Build Pipeline
**Milestone:** M003

## Description

This task produces the full R015 deliverable: three visually distinct Astro templates (Classic, Modern, Minimal) covering every page type the generator must produce (homepage, category, product, 4 legal pages). It also defines the canonical `site.json` data injection contract that all downstream slices (S02, S03) will extend.

The data injection pattern (D035) is: write `src/data/<slug>/site.json` before calling `build()`, then read it in `getStaticPaths()`. This task establishes that contract with fixture data and proves `getStaticPaths()` picks up the JSON correctly.

All image references in S01 use Unsplash placeholder URLs for hero and local-path strings (`/images/products/<asin>-0.webp`) for products — the actual files won't exist yet, so product images render as broken `<img>` tags. This is acceptable; S02 downloads real images. Verify affiliate link structure is correct now.

## Steps

1. **Define fixture data.** Write `apps/generator/src/data/fixture/site.json` with a realistic ES-market fixture: `{ site: { name, domain, market: "ES", language: "es", currency: "EUR", affiliate_tag: "test-fixture-20", template_slug: "classic", customization: { primaryColor: "#4f46e5", accentColor: "#7c3aed", fontFamily: "sans-serif" } }, categories: [ { id, name: "Freidoras de Aire", slug: "freidoras-de-aire", seo_text: "Texto SEO de prueba...", category_image: null, keywords: ["freidora de aire", "airfryer"] }, { id, name: "Accesorios Freidora", slug: "accesorios-freidora", seo_text: "...", category_image: null, keywords: [] } ], products: [ { id, asin: "B08Z7RGQPK", title: "Philips HD9252/90 Airfryer Compact", slug: "philips-hd9252-90", current_price: 89.99, images: [], rating: 4.5, is_prime: true, detailed_description: null, pros_cons: null, category_slug: "freidoras-de-aire" }, ... 3 more products ] }`.

2. **Write `src/lib/data.ts`.** Export `loadSiteData(slug: string): SiteData` that reads `src/data/${slug}/site.json` using a static `import` (Astro supports JSON imports with `resolveJsonModule`). Define `SiteData` interface matching the JSON shape. Export types for downstream use.

3. **Wire `index.astro` to real data.** `getStaticPaths()` reads the `SITE_SLUG` env var, calls `loadSiteData(slug)`, and returns one path entry (the homepage). Pass `site`, `categories`, and featured products (first 4) as `props`. Dispatch to the correct template layout based on `site.template_slug`. Render: hero (Unsplash `https://images.unsplash.com/photo-<id>?w=1200` placeholder), category grid (2–3 col responsive), featured products strip (4 cards with title, price, image placeholder, affiliate link).

4. **Write `src/pages/categories/[slug].astro`.** `getStaticPaths()` returns one entry per category. Props: `{ site, category, products }` (products in this category filtered from the full product list by `category_slug`). Render: category name `<h1>`, `seo_text` paragraph, responsive product grid. Each product card links to `/products/<slug>/` and shows image (broken OK in S01), price, title.

5. **Write `src/pages/products/[slug].astro`.** `getStaticPaths()` returns one entry per product. Props: `{ site, product }`. Render: product `<h1>`, price (`{currency} {current_price}`), affiliate link `<a href="https://www.amazon.{market_domain}/dp/{asin}?tag={affiliate_tag}">`. Derive `market_domain` from `AMAZON_MARKETS` constant. Render `pros_cons` if present (JSON blob `{ pros: string[], cons: string[] }`), `detailed_description` if present. Product image: `images[0]` if set, else grey placeholder div.

6. **Write `src/pages/[legal].astro`.** `getStaticPaths()` returns fixed entries for ES legal slugs: `privacidad`, `aviso-legal`, `cookies`, `contacto`. Each page renders a boilerplate paragraph for now. Comment marks where language-specific slugs will be driven by `site.language` in a future pass.

7. **Implement three template layouts.** Each layout is an Astro component in `src/layouts/{classic,modern,minimal}/Layout.astro` that wraps `BaseLayout.astro` and adds its own structural chrome:
   - **Classic:** Top nav bar with site name + category links, main content area, footer with legal links and `© {site.name}`.
   - **Modern:** Full-width hero section, sticky header, wide card grid with drop shadows.
   - **Minimal:** Centered container (max-w-4xl), tight typography scale, subtle borders, no decorative elements.
   All three: legal footer links (`/privacidad/`, `/aviso-legal/`, `/cookies/`, `/contacto/`); category nav links; affiliate disclosure text ("Como Asociado de Amazon, obtenemos ingresos por las compras adscritas que cumplen los requisitos aplicables").

8. **Run full build and check.** `SITE_SLUG=fixture pnpm --filter @monster/generator build` → verify all routes present. `cd apps/generator && npx astro check` for type safety.

## Must-Haves

- [ ] `site.json` fixture conforms to the `SiteData` interface (no `any` in `data.ts`)
- [ ] `getStaticPaths()` in all three page files reads `SITE_SLUG` env var, not a hardcoded slug
- [ ] Product affiliate links contain `?tag=` from fixture data — verified by `grep`
- [ ] All four legal pages render (privacidad, aviso-legal, cookies, contacto)
- [ ] Three template layouts are visually distinct (different structural chrome — not just color changes)
- [ ] `npx astro check` exits 0

## Verification

- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- `ls apps/generator/.generated-sites/fixture/dist/` shows: `index.html`, `categories/freidoras-de-aire/index.html`, `products/philips-hd9252-90/index.html`, `privacidad/index.html`, `aviso-legal/index.html`, `cookies/index.html`, `contacto/index.html`
- `grep -q "?tag=test-fixture-20" apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html && echo "affiliate OK"`
- `grep -rq "amazon.com\|ssl-images-amazon.com" apps/generator/.generated-sites/fixture/dist/ && echo "FAIL: hotlinked images" || echo "images OK"`
- `cd apps/generator && npx astro check` exits 0

## Inputs

- `apps/generator/astro.config.ts` — working config from T01 (env-var outDir, Tailwind integration)
- `apps/generator/src/layouts/BaseLayout.astro` — define:vars wiring from T01
- `packages/shared/src/constants/index.ts` — `AMAZON_MARKETS` for deriving `market_domain`
- `packages/shared/src/types/index.ts` — `SiteTemplate`, `Language`, `AmazonMarket` types

## Observability Impact

**Signals produced by this task:**
- `apps/generator/.generated-sites/fixture/dist/` directory tree — complete existence confirms full build success; spot-check specific routes (index.html, category, product, 4 legal pages) to confirm `getStaticPaths()` fired for each page type
- `grep -q "?tag=test-fixture-20" .../products/philips-hd9252-90/index.html` — confirms affiliate link wiring is correct end-to-end (fixture data → template → rendered HTML)
- `grep -rq "amazon.com\|ssl-images-amazon.com" .../dist/` — asserts absence of hotlinked Amazon images in generated HTML; should return "images OK"
- `npx astro check` exit code — 0 means all Astro components are type-safe; non-zero reveals component prop mismatches or missing types

**How a future agent inspects this task:**
- Run `SITE_SLUG=fixture pnpm --filter @monster/generator build` — success or failure immediately visible from exit code + Astro build output
- `ls apps/generator/.generated-sites/fixture/dist/{categories,products}/*/index.html` — enumerates which slugs were generated; missing paths indicate `getStaticPaths()` returned empty for that page type
- `cat apps/generator/src/data/fixture/site.json` — canonical data contract reference; downstream slices extend this shape
- `cat apps/generator/src/lib/data.ts` — shows `SiteData` interface; confirms no `any` types

**Failure state visibility:**
- Build error with TypeScript stack trace → component prop type mismatch or missing import
- Empty `dist/` directory → `getStaticPaths()` returned zero entries (usually `SITE_SLUG` not set or JSON path wrong)
- Wrong directory name (e.g. `default/`) → `SITE_SLUG` env var not passed to build command
- `astro check` non-zero → type errors in `.astro` frontmatter (props destructuring or interface mismatch)

## Expected Output

- `apps/generator/src/data/fixture/site.json` — canonical fixture + data contract reference
- `apps/generator/src/lib/data.ts` — typed `loadSiteData()` and `SiteData` interface
- `apps/generator/src/pages/index.astro` — real homepage with data-driven category grid
- `apps/generator/src/pages/categories/[slug].astro` — category page with product grid
- `apps/generator/src/pages/products/[slug].astro` — product page with affiliate link
- `apps/generator/src/pages/[legal].astro` — four legal pages
- `apps/generator/src/layouts/classic/Layout.astro`
- `apps/generator/src/layouts/modern/Layout.astro`
- `apps/generator/src/layouts/minimal/Layout.astro`
- `.generated-sites/fixture/dist/` — full static site for all page types, passing `grep`-based affiliate and image checks
