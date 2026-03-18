---
id: T02
parent: S02
milestone: M013
provides:
  - "apps/generator/src/pages/categories/[slug].astro — full category page with breadcrumb, H1, description, product grid (price/discount/+info/comprar), SEO text, related categories"
  - "data-affiliate={asin} on all product Comprar CTAs for click analytics"
  - "buildAffiliateUrl imported and used for all affiliate links"
key_files:
  - apps/generator/src/pages/categories/[slug].astro
key_decisions:
  - "Two-button CTA per product card: '+ info' (→ /products/{slug}/) and 'Comprar' (→ affiliate URL) — matches milestone spec"
  - "Related categories section: up to 3 others, pill-button style, filtered by current slug"
  - "SEO text section renders below product grid, separated by a top border — same seo_text field as category description but serves as the longer prose block at page bottom"
patterns_established:
  - "Category product card: image (h-52) → title → price row (current + optional strikethrough) → two-button row (+info / comprar). Consistent with homepage featured-product card structure."
  - "Breadcrumb: Inicio / {category.name} — minimal text nav, no schema markup (not in scope)"
  - "Related categories as pill links — reusable pattern for cross-linking categories"
observability_surfaces:
  - "grep -c 'data-affiliate=' dist/categories/{slug}/index.html — equals product count in that category"
  - "grep -c '/products/' dist/categories/{slug}/index.html — equals product count (one link per card)"
  - "grep 'href=\"\"' dist/categories/{slug}/index.html — zero output = affiliate URLs correctly formed"
  - "grep 'Otras categorías' dist/categories/{slug}/index.html — confirms related section rendered"
duration: ~20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Category page — header, product grid, SEO text, related categories

**Built the category page with breadcrumb nav, H1, description, 3-column product grid (price/discount badge/+info/comprar CTAs), SEO text section, and related-categories pill links.**

## What Happened

Read the existing placeholder `categories/[slug].astro` — all data loading was intact (`products`, `CURRENCY`, `MARKET`, `TAG` already declared but unused). Added `buildAffiliateUrl` to the import and `relatedCategories` computation.

Replaced the placeholder with the full category page template. Design stays consistent with the homepage: same discount-badge logic (`original_price > current_price`), same price-row structure (current bold + optional strikethrough), same hover-shadow card pattern. The category page uses a 3-column grid (vs homepage's 4-column) to accommodate the taller cards with two action buttons.

Two CTAs per card per milestone spec: `+ info` (solid border/ghost style, links to product page) and `Comprar` (filled accent color, affiliate link with `rel="nofollow sponsored"` + `data-affiliate`).

Related categories at the bottom show up to 3 other categories as pill-style links — the `freidoras-de-aire` page shows `accesorios-freidora` as the only other category in the fixture.

## Verification

```
SITE_SLUG=fixture pnpm --filter @monster/generator build  → exit 0, 11 pages (2.47s)
SITE_SLUG=fixture pnpm --filter @monster/generator check  → exit 0, 0 errors (6.1s)
grep -c "data-affiliate=" dist/categories/freidoras-de-aire/index.html  → 3
grep -c "/products/" dist/categories/freidoras-de-aire/index.html       → 3
grep "Otras categorías" dist/categories/freidoras-de-aire/index.html    → 1 hit
grep "Inicio" dist/categories/freidoras-de-aire/index.html              → 1 hit (breadcrumb)
grep 'href=""' dist/categories/.../index.html                           → OK: no empty href
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 2.47s |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 0 | ✅ pass | 6.1s |
| 3 | `grep -c "data-affiliate=" dist/categories/freidoras-de-aire/index.html` | — | ✅ 3 hits | — |
| 4 | `grep -c "/products/" dist/categories/freidoras-de-aire/index.html` | — | ✅ 3 hits | — |
| 5 | `grep -c "Otras categorías" dist/categories/freidoras-de-aire/index.html` | — | ✅ 1 hit | — |
| 6 | `grep -c "Inicio" dist/categories/freidoras-de-aire/index.html` | — | ✅ 1 hit (breadcrumb) | — |
| 7 | `grep 'href=""' dist/categories/freidoras-de-aire/index.html` | 1 (no match) | ✅ OK | — |
| 8 | `find dist -name "*.html" \| wc -l` | — | ✅ 11 pages | — |

## Diagnostics

```bash
# Quick check after any category page edit
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -20

# Confirm product affiliate links in category page
grep -c "data-affiliate=" apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html

# Confirm related categories rendered
grep "Otras categorías" apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html

# Empty href guard
grep 'href=""' apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html && echo "WARN" || echo "OK"
```

## Deviations

None. The implementation matches the slice plan and milestone spec exactly.

## Known Issues

- Fixture has `original_price: null` for all products — discount badge and strikethrough not visible in fixture build. Logic is correct.
- `category_image` field exists in `CategoryData` but the milestone spec doesn't describe it being used in the category page header. The header uses text only. No change needed.

## Files Created/Modified

- `apps/generator/src/pages/categories/[slug].astro` — full category page implementation, replaced placeholder
