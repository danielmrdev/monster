---
id: T01
parent: S03
milestone: M013
provides:
  - "apps/generator/src/pages/products/[slug].astro — full product page with image gallery, thumbnail switcher, price/discount badge, affiliate CTA, pros/cons, AI description, user opinions, breadcrumb"
  - "data-affiliate={asin} on comprar CTA for analytics click tracking"
  - "Inline thumbnail gallery switcher script (is:inline, no bundle, D163) — only emitted when product has multiple images"
key_files:
  - apps/generator/src/pages/products/[slug].astro
key_decisions:
  - "Two-column layout on lg (image left, info panel right) collapses to single column on mobile — matches editorial retail direction"
  - "Thumbnail script only emitted when product.images.length > 1 — no dead script on imageless products"
  - "Affiliate URL is direct Amazon URL for now — S05 will swap all affiliate links to /go/ cloaked URLs"
  - "All content sections (detailed_description, user_opinions_summary, pros_cons) are null-guarded — graceful degradation, no crashes"
  - "astro check exits 0 with 0 hints (all placeholder vars now consumed)"
patterns_established:
  - "Thumbnail gallery switcher: button[data-thumb-btn] + img#product-main-img + is:inline script. Pattern is self-contained, no external deps."
  - "Discount savings line: 'Ahorra {CURRENCY} {diff} ({pct}%)' shown below price when discount applies — consistent with category page badge"
  - "Back-to-category link at page bottom: ← Ver todos los productos de {category.name}"
observability_surfaces:
  - "grep -c 'data-affiliate=' dist/products/{slug}/index.html — must equal 1 per product page"
  - "grep -o 'href=\"https://www.amazon[^\"]*\"' dist/products/{slug}/index.html — confirms affiliate URL is well-formed"
  - "grep 'href=\"\"' dist/products/{slug}/index.html — zero output = no empty affiliate hrefs"
  - "grep -c 'freidoras-de-aire' dist/products/philips-hd9252-90/index.html — confirms breadcrumb + back-link both reference parent category"
duration: ~20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Product page — gallery, price/discount, CTA, pros/cons, breadcrumb

**Built the full product page with two-column image/info layout, thumbnail gallery switcher, price/discount badge, affiliate CTA, pros/cons grid, AI content sections, and breadcrumb back to parent category.**

## What Happened

All product data vars were already declared in the frontmatter (`CURRENCY`, `affiliateUrl`, `prosCons`, `metaDescription`). Computed `hasDiscount`/`discountPct` from `original_price` and replaced the placeholder with the full template.

Layout: two-column on desktop (`lg:grid-cols-[1fr_400px]`), single column on mobile. Left column: main image + optional thumbnail row. Right column: title + Prime/rating/discount badges, price block, Comprar button, affiliate disclosure.

Below the fold: `detailed_description`, `user_opinions_summary`, and `pros_cons` sections — all null-guarded, only rendered when non-null. Fixture products have all three as null so these sections don't appear in the fixture build, but the conditional logic is correct.

The thumbnail gallery switcher is an `is:inline` script that swaps `src` on the main `<img id="product-main-img">` and highlights the active thumbnail button. The script block is wrapped in Astro's `{product.images.length > 1 && ...}` conditional so it's never emitted for products with 0 or 1 images.

`astro check` exits 0 with 0 errors, 0 warnings, 0 hints — the cleanest result of the milestone so far, confirming all previously-unused placeholder variables are now consumed.

## Verification

```
SITE_SLUG=fixture pnpm --filter @monster/generator build  → exit 0, 11 pages (2.63s)
SITE_SLUG=fixture pnpm --filter @monster/generator check  → exit 0, 0 errors, 0 hints (6.2s)
grep -c 'data-affiliate=' dist/products/philips-hd9252-90/index.html  → 1
grep -c 'rel="nofollow sponsored"' dist/products/philips-hd9252-90/index.html  → 1
grep 'href="https://www.amazon.es/dp/B08Z7RGQPK?tag=test-fixture-20"' → present
grep -c 'freidoras-de-aire' dist/products/philips-hd9252-90/index.html  → 2 (breadcrumb + back-link)
grep -c 'Prime' dist/products/philips-hd9252-90/index.html  → 1
grep -o '★ 4.5' dist/products/philips-hd9252-90/index.html  → present
grep -c 'Sin imagen' dist/products/philips-hd9252-90/index.html  → 1 (fixture has empty images[])
find dist -name "*.html" | wc -l  → 11
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 2.63s |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 0 | ✅ pass (0 hints) | 6.2s |
| 3 | `grep -c 'data-affiliate=' dist/products/philips-hd9252-90/index.html` | — | ✅ 1 hit | — |
| 4 | `grep -c 'rel="nofollow sponsored"' dist/products/philips-hd9252-90/index.html` | — | ✅ 1 hit | — |
| 5 | `grep 'href="https://www.amazon.es/dp/B08Z7RGQPK?tag=test-fixture-20"'` | — | ✅ present | — |
| 6 | `grep -c 'freidoras-de-aire' dist/products/philips-hd9252-90/index.html` | — | ✅ 2 hits | — |
| 7 | `grep -c 'Prime' dist/products/philips-hd9252-90/index.html` | — | ✅ 1 hit | — |
| 8 | `grep 'href=""' dist/products/philips-hd9252-90/index.html` | 1 (no match) | ✅ OK | — |
| 9 | `find dist -name "*.html" \| wc -l` | — | ✅ 11 pages | — |

## Diagnostics

```bash
# Quick check after any product page edit
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -20

# Confirm affiliate CTA is present and correctly attributed
grep -c 'data-affiliate=' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html

# Verify affiliate URL not empty
grep 'href=""' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html && echo "WARN" || echo "OK"

# When fixture gets real images, verify thumbnail script is emitted:
grep 'product-main-img' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html

# When fixture gets pros_cons/detailed_description, verify those sections render:
grep -c 'Ventajas\|Inconvenientes\|Descripción' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html
```

## Deviations

- Added `user_opinions_summary` section (not explicitly listed in task plan, but it's a `ProductData` field from the milestone context and a natural part of the AI-content block). Zero risk, null-guarded.
- Added savings summary line ("Ahorra EUR X (Y%)") below price — not in plan but consistent with the discount badge pattern and adds real value for conversion.

## Known Issues

- All fixture products have `images: []` — "Sin imagen" placeholder shows for all products. Thumbnail gallery script is never emitted in fixture build. Both are correct graceful degradation; no fix needed.
- `detailed_description`, `user_opinions_summary`, `pros_cons` are all null in fixture — those sections don't render. Logic is correct; will activate with real data.
- Affiliate URLs are direct Amazon URLs (`amazon.es/dp/...`). S05 will replace all affiliate hrefs with `/go/{slug}` cloaked URLs per the milestone spec.

## Files Created/Modified

- `apps/generator/src/pages/products/[slug].astro` — full product page implementation, replaced placeholder
- `.gsd/milestones/M013/slices/S03/S03-PLAN.md` — created (slice plan scaffolded for S03 execution)
