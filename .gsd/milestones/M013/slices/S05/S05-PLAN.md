# S05: Link cloaking

**Goal:** Replace all direct Amazon affiliate URLs in content pages with `/go/{slug}/` cloaked paths. Build a static meta-refresh redirect page for each product at `/go/[slug]/`.
**Demo:** `SITE_SLUG=fixture pnpm build` produces 15 pages (11 content + 4 `/go/` redirects). Zero direct `amazon.` URLs in `<a href>` on content pages. `astro check` exits 0.

**Status: Complete.**

## Must-Haves

- [x] `apps/generator/src/lib/cloaking.ts` — `buildCloakUrl(slug)` and `buildCloakMap(products, market, tag)`
- [x] `apps/generator/src/pages/go/[slug].astro` — static meta-refresh redirect, noindex, canonical
- [x] `index.astro` — CTA uses `buildCloakUrl(p.slug)`, no direct Amazon URL
- [x] `categories/[slug].astro` — Comprar CTA uses `buildCloakUrl(p.slug)`, no direct Amazon URL
- [x] `products/[slug].astro` — Comprar button uses `buildCloakUrl(product.slug)`, no direct Amazon URL
- [x] Build exits 0, 15 pages (11 + 4 go/ redirects)
- [x] `astro check` exits 0 (0 errors, 0 warnings, 0 hints)

## Verification

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
# Expected: 15 page(s) built

SITE_SLUG=fixture pnpm --filter @monster/generator check
# Expected: 0 errors, 0 warnings, 0 hints

# /go/ redirect pages present
ls apps/generator/.generated-sites/fixture/dist/go/

# meta-refresh correct
grep 'http-equiv="refresh"' apps/generator/.generated-sites/fixture/dist/go/philips-hd9252-90/index.html

# No direct amazon URLs on content pages
grep 'href="https://www.amazon' apps/generator/.generated-sites/fixture/dist/index.html && echo "FAIL" || echo "OK"
grep 'href="https://www.amazon' apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html && echo "FAIL" || echo "OK"
grep 'href="https://www.amazon' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html && echo "FAIL" || echo "OK"

# /go/ links present on content pages
grep -c 'href="/go/' apps/generator/.generated-sites/fixture/dist/index.html
grep -c 'href="/go/' apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html
```

## Tasks

- [x] **T01: cloaking.ts + go/[slug].astro + swap all affiliate hrefs** `est:30m`

## Files Touched

- `apps/generator/src/lib/cloaking.ts` (new)
- `apps/generator/src/pages/go/[slug].astro` (new)
- `apps/generator/src/pages/index.astro`
- `apps/generator/src/pages/categories/[slug].astro`
- `apps/generator/src/pages/products/[slug].astro`
