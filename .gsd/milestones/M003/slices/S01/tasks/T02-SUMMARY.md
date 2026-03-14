---
id: T02
parent: S01
milestone: M003
provides:
  - Three visually distinct Astro templates (Classic, Modern, Minimal) in src/layouts/{classic,modern,minimal}/Layout.astro
  - All page types implemented — homepage, category, product, 4 legal pages
  - Canonical site.json data injection contract (D035) with fixture data
  - src/lib/data.ts with SiteData interface and loadSiteData() / buildAffiliateUrl() helpers
  - Full fixture build at .generated-sites/fixture/dist/ with all 11 routes
key_files:
  - apps/generator/src/data/fixture/site.json
  - apps/generator/src/lib/data.ts
  - apps/generator/src/pages/index.astro
  - apps/generator/src/pages/categories/[slug].astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/[legal].astro
  - apps/generator/src/layouts/classic/Layout.astro
  - apps/generator/src/layouts/modern/Layout.astro
  - apps/generator/src/layouts/minimal/Layout.astro
key_decisions:
  - D044: index.astro reads SITE_SLUG in frontmatter (not getStaticPaths) — getStaticPaths only valid for dynamic routes
  - D045: loadSiteData() uses process.cwd() not import.meta.url — prerender chunks run from dist dir
  - D046: LEGAL_PAGES const defined inside getStaticPaths() in [legal].astro — module-scope consts get split into non-prerender chunks by Vite
patterns_established:
  - Non-dynamic pages (index.astro) load site data in frontmatter scope via loadSiteData(slug) — not via getStaticPaths()
  - Dynamic pages ([slug].astro, [legal].astro) use getStaticPaths() to expand per-slug routes; data read with process.cwd() path
  - Template dispatch: all page files switch on site.template_slug ("modern" | "minimal" | default Classic) — one file renders all three template variants
  - Constants that must be available inside getStaticPaths() must be defined inside it (not at module scope) to survive Vite's prerender chunk bundling
  - All layouts include: category nav links, 4 legal footer links, affiliate disclosure text
observability_surfaces:
  - apps/generator/.generated-sites/fixture/dist/ — exists with 11 routes on success; absent or empty on build failure
  - grep -q "?tag=test-fixture-20" .../products/philips-hd9252-90/index.html — confirms end-to-end affiliate wiring
  - grep -rq "ssl-images-amazon.com" .../dist/ → "images OK" on success (no hotlinks)
  - cd apps/generator && npx astro check — exits 0; non-zero reveals type errors in component props
  - ls .generated-sites/fixture/dist/{categories,products}/*/index.html — enumerates which slugs rendered
duration: ~40m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Build all three template variants across all page types

**Full R015 deliverable shipped: Classic/Modern/Minimal templates across homepage, category, product, and 4 legal page types; fixture build passes all verification checks including affiliate link and no-hotlink assertions.**

## What Happened

Implemented the complete Astro template system for TSA sites. Key implementation path:

**Fixture data:** Wrote `src/data/fixture/site.json` with ES-market freidoras de aire fixture — 2 categories, 4 products across those categories, realistic prices/ASINs/slugs.

**Data library (`src/lib/data.ts`):** `loadSiteData(slug)` reads `src/data/<slug>/site.json` via `readFileSync` using `process.cwd()` — critical path: `import.meta.url` resolves to the prerender chunk in `dist/.prerender/`, not `src/`, so `process.cwd()` (always the generator project root) is the correct anchor. `buildAffiliateUrl()` derives market domain from `AMAZON_MARKETS` constants and builds the `?tag=` URL.

**Template layouts:** Three structurally distinct layouts:
- **Classic:** White nav bar with `border-b border-gray-200 bg-white shadow-sm`, standard `max-w-6xl` content, simple footer
- **Modern:** Colored sticky header (`sticky top-0 z-50`) with `background-color: var(--color-primary)`, `max-w-7xl` wide content, hero image band slot, two-tone footer
- **Minimal:** Understated `max-w-4xl` centered column, hairline `border-gray-100` dividers everywhere, uppercase tracking-wide nav labels, no colored elements

**Pages:** All three page file types dispatch to the correct layout via `site.template_slug` switch. Two Vite bundler gotchas discovered and fixed:
1. `index.astro` cannot use `getStaticPaths()` — for non-dynamic routes, returned props are not injected (D044)
2. `LEGAL_PAGES` const in `[legal].astro` must be defined inside `getStaticPaths()`, not at module scope — Vite splits module-scope constants into non-prerender chunks, making them unavailable at route-generation time (D046)

**@monster/shared dependency:** Added to `apps/generator/package.json` as `"@monster/shared": "workspace:*"` — needed for `AMAZON_MARKETS` and type imports.

**`astro check` fix:** Removed `.ts` extension from import paths (not valid without `allowImportingTsExtensions`). Inlined the `Props` type assertion in products/[slug].astro to eliminate an unused-interface warning.

## Verification

```bash
# Build
SITE_SLUG=fixture pnpm --filter @monster/generator build
# → exit 0, "11 page(s) built in 2.30s"

# All 11 routes present
ls apps/generator/.generated-sites/fixture/dist/
# → _astro  aviso-legal  categories  contacto  cookies  index.html  privacidad  products

# Affiliate tag
grep -q "?tag=test-fixture-20" .../products/philips-hd9252-90/index.html && echo "affiliate OK"
# → affiliate OK

# No hotlinked Amazon images
grep -rq "ssl-images-amazon.com" .../dist/ || echo "images OK"
# → images OK

# Type check
cd apps/generator && npx astro check
# → Result (10 files): 0 errors, 0 warnings, 0 hints
```

Verified HTML content:
- `index.html`: Classic template rendered (fixture template_slug="classic"), h1 "Airfryer Pro ES", category links, affiliate links to amazon.es with correct tag
- `categories/freidoras-de-aire/index.html`: Category h1, product grid links to `/products/<slug>/`
- `products/philips-hd9252-90/index.html`: Affiliate link `https://www.amazon.es/dp/B08Z7RGQPK?tag=test-fixture-20`
- `privacidad/index.html`: Legal page h1 "Política de Privacidad"
- Affiliate disclosure "Como Asociado de Amazon..." present in index.html

## Diagnostics

- Build success: `[build] Complete! 11 page(s) built` in stdout; `dist/` populated
- Build failure: Astro emits stack trace with component file+line reference; `dist/` dir may be partially populated
- `getStaticPaths` returns empty: dist route dir missing (e.g. no `categories/` subdir) — check slug availability and `process.cwd()` path in `loadSiteData()`
- Wrong slug dir: `ls apps/generator/.generated-sites/` shows `default/` — means `SITE_SLUG` env var was not set before `astro build`
- Prerender chunk errors: "X is not defined" at `dist/.prerender/chunks/*.mjs:N` — module-scope var missing from prerender bundle; move into `getStaticPaths()` body
- Type errors: `astro check` non-zero → check import paths (no `.ts` extension), check `Astro.props` cast matches `getStaticPaths` return shape

## Deviations

- **`index.astro` uses frontmatter data load instead of `getStaticPaths()`:** Plan specified `getStaticPaths()` for the homepage. Astro 6 doesn't inject `getStaticPaths()` props for non-dynamic routes — `Astro.props` is empty. Fixed by reading data directly in frontmatter (correct Astro SSG pattern). D044 records this.
- **`loadSiteData()` uses `process.cwd()` not JSON import:** Plan specified "static import with resolveJsonModule". Static imports are transpiled at build time (filename must be literal). Dynamic slug-based path requires `readFileSync`. D045 records this.
- **`LEGAL_PAGES` defined inside `getStaticPaths()`:** Plan showed it at module scope. Vite splits module-scope constants from prerender chunks — the const was literally `not defined` at runtime. D046 records this.
- **`@astrojs/check` installed as dev dep:** Plan didn't mention this; `npx astro check` prompts to install it interactively. Added as explicit devDep.

## Known Issues

- Product images render as broken `<img>` tags (images array is empty in fixture). This is expected — S02 downloads real images.
- Tailwind CSS classes are imported via `@import "tailwindcss"` in BaseLayout inline style — this works but may emit a Vite warning about CSS processing order in some build environments. Not an issue in the current setup.

## Files Created/Modified

- `apps/generator/src/data/fixture/site.json` — ES-market freidoras de aire fixture (2 categories, 4 products)
- `apps/generator/src/lib/data.ts` — SiteData interface, loadSiteData(), buildAffiliateUrl(), getAmazonDomain()
- `apps/generator/src/pages/index.astro` — Homepage with Classic/Modern/Minimal dispatch, hero, category grid, featured products
- `apps/generator/src/pages/categories/[slug].astro` — Category page with product grid, getStaticPaths()
- `apps/generator/src/pages/products/[slug].astro` — Product page with affiliate link, pros/cons, description
- `apps/generator/src/pages/[legal].astro` — 4 legal pages (privacidad, aviso-legal, cookies, contacto)
- `apps/generator/src/layouts/BaseLayout.astro` — Updated: added lang prop, fixed define:vars to use inline style
- `apps/generator/src/layouts/classic/Layout.astro` — Classic layout (bordered nav, max-w-6xl, simple footer)
- `apps/generator/src/layouts/modern/Layout.astro` — Modern layout (sticky colored header, max-w-7xl, hero slot, two-tone footer)
- `apps/generator/src/layouts/minimal/Layout.astro` — Minimal layout (max-w-4xl, hairline borders, no color)
- `apps/generator/package.json` — Added @monster/shared workspace dep, @astrojs/check devDep
- `.gsd/milestones/M003/slices/S01/tasks/T02-PLAN.md` — Added Observability Impact section (pre-flight fix)
- `.gsd/DECISIONS.md` — Appended D044, D045, D046
