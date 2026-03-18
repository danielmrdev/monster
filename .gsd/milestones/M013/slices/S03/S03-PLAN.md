# S03: Product page content

**Goal:** Replace the placeholder in `products/[slug].astro` with the full product page: image gallery with thumbnail switcher, price/discount badge, comprar affiliate CTA, pros/cons, AI description, user opinions, breadcrumb back to category.
**Demo:** `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0. Product pages render breadcrumb, price, affiliate CTA, and graceful null-field handling.

## Must-Haves

- Breadcrumb: Inicio → parent category → product title
- H1 with product title
- Image gallery (main image + thumbnail row if multiple images; "Sin imagen" placeholder if none)
- Thumbnail switcher script (`is:inline`, no bundle, D163)
- Price with `--color-primary`, optional strikethrough original_price when higher, savings summary
- Discount badge (% dto.) when `original_price > current_price`
- Comprar CTA: `rel="nofollow sponsored"`, `target="_blank"`, `data-affiliate={asin}`
- Prime badge, star rating — shown when present
- `detailed_description` section — rendered when non-null
- `user_opinions_summary` section — rendered when non-null
- Pros/cons grid — rendered when non-null
- Back-to-category link at bottom
- `astro check` exits 0, build exits 0, 11 pages

## Proof Level

- This slice proves: contract
- Real runtime required: yes (Astro build + check + HTML verification)
- Human/UAT required: no

## Verification

```bash
# Build exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator build

# Type-check exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator check

# Product page: affiliate CTA present with correct ASIN
grep -c 'data-affiliate=' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html

# Product page: breadcrumb links to category
grep -c 'freidoras-de-aire' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html

# Product page: affiliate URL correctly formed (not empty)
grep -o 'href="https://www.amazon[^"]*"' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html

# No empty affiliate hrefs
grep 'href=""' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html && echo "WARN" || echo "OK"

# Page count
find apps/generator/.generated-sites/fixture/dist -name "*.html" | wc -l

# Diagnostic: structured error surface
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -20
```

## Observability / Diagnostics

**Runtime signals:**
- `data-affiliate={asin}` on product buy button — analytics click tracking
- Breadcrumb back-link → crawlability from product to category
- Thumbnail script only emitted when `product.images.length > 1` — no dead script on imageless products

**Failure visibility:**
- Null reference in product field → Astro build error with line-precise context
- `buildAffiliateUrl` empty args → `href=""` — detectable via HTML grep
- Thumbnail script references `product-main-img` ID; if the image element is absent (no images), the script is not emitted — no dead addEventListener

**Inspection surface:**
```bash
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -20
grep -c 'data-affiliate=' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html
grep 'href=""' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html && echo "WARN" || echo "OK"
```

## Tasks

- [x] **T01: Product page — gallery, price/discount, CTA, pros/cons, breadcrumb** `est:45m`
  - Why: `products/[slug].astro` has a placeholder. This task builds the real product page.
  - Files: `apps/generator/src/pages/products/[slug].astro`
  - Verify: Build exits 0, astro check exits 0 (0 hints), affiliate CTA in HTML, breadcrumb links to category
  - Done when: All product page elements render correctly in built HTML

## Files Likely Touched

- `apps/generator/src/pages/products/[slug].astro`
