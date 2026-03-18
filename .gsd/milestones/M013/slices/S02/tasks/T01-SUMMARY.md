---
id: T01
parent: S02
milestone: M013
provides:
  - "apps/generator/src/pages/index.astro — full homepage with hero banner, category grid (description ?? seo_text), featured products grid (price/discount/CTA)"
  - "metaDescription derived from focus_keyword for homepage SEO"
  - "data-affiliate={asin} on all affiliate CTAs for analytics click tracking"
key_files:
  - apps/generator/src/pages/index.astro
key_decisions:
  - "metaDescription computed in frontmatter from focus_keyword, not hardcoded — SEO-correct for every site"
  - "Discount badge and strikethrough price rendered conditionally on original_price > current_price — fixture products have null original_price so badge doesn't appear (correct behavior)"
  - "Category cards use group-hover Tailwind pattern to color the heading via --color-primary on parent hover"
patterns_established:
  - "Product card structure: image → title → price row (current + optional strikethrough) → CTA button. This pattern must be consistent across homepage and category page (T02)."
  - "Discount badge: absolute-positioned top-right corner of image, background --color-accent, text '-%N%' — reuse in T02 category product grid"
  - "Section headings use a 1px colored bar (w-1 h-5 rounded-full) as a left-accent. Primary color for categories, accent for products."
observability_surfaces:
  - "grep -c 'data-affiliate=' apps/generator/.generated-sites/fixture/dist/index.html — must equal 4 (one per featured product)"
  - "grep 'href=\"\"' dist/index.html — zero output = affiliate URLs correctly formed"
  - "grep 'unsplash' dist/index.html — confirms hero image URL is in the built output"
  - "grep '/categories/' dist/index.html — confirms category links are rendered"
duration: ~20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Homepage — hero, category grid, featured products

**Built the homepage with Unsplash hero banner, category description grid, and featured-product cards with price/discount logic and analytics-ready affiliate CTAs.**

## What Happened

Read the current placeholder `index.astro` and the `data.ts` interfaces to understand all available fields. The homepage already had all the data vars declared (`CURRENCY`, `MARKET`, `TAG`, `featuredProducts`, `heroUrl`) — they just weren't used. Replaced the single-line placeholder with the full homepage template.

Design direction: clean editorial retail — white card grid sections, sharp section headings with a colored 1px left-accent bar, generous spacing. The hero uses the full Unsplash image as an absolute-positioned background with a dark-to-transparent gradient overlay. Category cards get a group-hover heading color transition via `--color-primary`. Product cards follow a vertical image-on-top layout with a clear price hierarchy.

Computed `metaDescription` from `site.focus_keyword` when available, with a sensible fallback — this is better SEO practice than a hardcoded string.

The discount badge path (`original_price > current_price`) correctly produced no badges in the fixture build because all four fixture products have `original_price: null` — the conditional logic is present and correct.

## Verification

```
SITE_SLUG=fixture pnpm --filter @monster/generator build  → exit 0, 11 pages (2.47s)
SITE_SLUG=fixture pnpm --filter @monster/generator check  → exit 0, 0 errors (5.9s)
grep -c "data-affiliate=" dist/index.html                 → 4
grep "unsplash" dist/index.html                           → URL present
grep -o 'href="/categories/..."' dist/index.html          → both categories present
grep 'href=""' dist/index.html                            → OK: no empty affiliate href
grep -c 'rel="nofollow sponsored"' dist/index.html        → 4
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 2.47s |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 0 | ✅ pass | 5.9s |
| 3 | `grep -c "data-affiliate=" dist/index.html` | — | ✅ 4 hits | — |
| 4 | `grep "unsplash" dist/index.html` | — | ✅ present | — |
| 5 | `grep 'href="/categories/..."' dist/index.html` | — | ✅ both categories | — |
| 6 | `grep 'href=""' dist/index.html` | 1 (no match) | ✅ OK | — |
| 7 | `grep -c 'rel="nofollow sponsored"' dist/index.html` | — | ✅ 4 hits | — |
| 8 | `grep -rn "ClassicLayout\|ModernLayout\|MinimalLayout" src/pages/` | 1 (no match) | ✅ OK | — |

## Diagnostics

Quick check after any homepage edit:
```bash
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -20
grep -c "data-affiliate=" apps/generator/.generated-sites/fixture/dist/index.html  # must be 4

# Verify affiliate URLs are well-formed (not empty)
grep 'href=""' apps/generator/.generated-sites/fixture/dist/index.html && echo "WARN: empty href" || echo "OK"

# Verify hero image present
grep "unsplash" apps/generator/.generated-sites/fixture/dist/index.html | head -1
```

If `original_price` is added to fixture products, verify the discount badge renders:
```bash
grep 'line-through' apps/generator/.generated-sites/fixture/dist/index.html
grep -o '\-[0-9]*%' apps/generator/.generated-sites/fixture/dist/index.html
```

## Deviations

- Added `metaDescription` computation in frontmatter (not mentioned in plan) — required to pass it to `TsaLayout`. The plan says to replace the placeholder but didn't mention updating the metaDescription; added it as good SEO practice. Zero risk.

## Known Issues

- All fixture products have `original_price: null`, so the discount badge and strikethrough price are not exercised in the fixture build. The logic is implemented correctly and will activate when real product data includes `original_price`. This is a fixture data limitation, not a code issue.
- The `category_image` field exists in `CategoryData` but is not used in category grid cards — the milestone spec mentions "vertical image" for categories. The plan for T01 only asked for text cards (description text). If category images are needed in the grid, that's a T02 or future enhancement.

## Files Created/Modified

- `apps/generator/src/pages/index.astro` — full homepage implementation (hero + category grid + featured products), replaced placeholder
- `.gsd/milestones/M013/slices/S02/S02-PLAN.md` — created (slice plan scaffolded for T01 execution)
