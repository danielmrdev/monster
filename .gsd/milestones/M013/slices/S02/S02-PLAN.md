# S02: Homepage + category page content

**Goal:** Replace placeholders in `index.astro` and `categories/[slug].astro` with real homepage and category page designs: hero banner, category grid, product grid with price/discount logic.
**Demo:** `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0. Homepage renders hero + category grid + featured products. Category page renders category header + product grid.

## Must-Haves

- Hero banner with Unsplash background, site name H1, focus_keyword subtitle
- Category grid: all categories shown, links to `/categories/{slug}/`, description or seo_text shown
- Featured products: image, title, price, original_price strikethrough if set, affiliate CTA with `rel="nofollow sponsored"`, `data-affiliate={asin}`
- Category page: H1 with category name, seo_text/description, product grid with price/discount badges, links to product pages
- No TypeScript errors (`astro check` exits 0)
- Build exits 0, 11 pages

## Proof Level

- This slice proves: contract
- Real runtime required: yes (Astro build + check + HTML verification)
- Human/UAT required: no

## Verification

```bash
# Build exits 0, produces all 11 pages
SITE_SLUG=fixture pnpm --filter @monster/generator build

# Type-check exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator check

# No old dispatch
grep -rn "ClassicLayout\|ModernLayout\|MinimalLayout" apps/generator/src/pages/

# Homepage: affiliate data-attributes present
grep -c "data-affiliate=" apps/generator/.generated-sites/fixture/dist/index.html

# Homepage: hero image present
grep "unsplash" apps/generator/.generated-sites/fixture/dist/index.html

# Homepage: category links present
grep -c "/categories/" apps/generator/.generated-sites/fixture/dist/index.html

# Category page: product links present
grep -c "/products/" apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html

# No empty affiliate hrefs (sign that MARKET or TAG is missing)
grep 'href=""' apps/generator/.generated-sites/fixture/dist/index.html && echo "WARN: empty href" || echo "OK"

# Diagnostic: structured error surface on build failure
SITE_SLUG=fixture pnpm --filter @monster/generator build 2>&1 | tail -20

# Diagnostic: confirm astro check has 0 errors
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | grep -E "^Result" | head -5
```

## Observability / Diagnostics

**Runtime signals introduced by this slice:**
- `data-affiliate={asin}` on every affiliate CTA — analytics can trace which product drove each Amazon click
- `href="/categories/{slug}/"` on category grid cards — crawlability of category pages from homepage
- `href="/products/{slug}/"` on product cards — crawlability of product pages from category pages
- Discount badge `-%` text rendered when `original_price > current_price` — visual signal for data quality

**Failure visibility:**
- Null reference in product/category data → Astro build error with line-precise context
- `buildAffiliateUrl` with empty market/tag → `href=""` — detectable via grep on built HTML
- Missing category description → falls back to `seo_text` — always renders, never crashes

**Inspection surface:** After any edit:
```bash
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -20
grep -c "data-affiliate=" apps/generator/.generated-sites/fixture/dist/index.html
```

## Tasks

- [x] **T01: Homepage — hero, category grid, featured products** `est:45m`
  - Why: `index.astro` has a placeholder. This task builds the real homepage layout.
  - Files: `apps/generator/src/pages/index.astro`
  - Do: See T01-PLAN.md
  - Verify: Build exits 0, astro check exits 0, data-affiliate grep hits on homepage HTML
  - Done when: Hero + category grid + featured products render in built HTML with correct structure

- [x] **T02: Category page — header, product grid, SEO text** `est:45m`
  - Why: `categories/[slug].astro` has a placeholder. This task builds the real category page.
  - Files: `apps/generator/src/pages/categories/[slug].astro`
  - Do: See T02-PLAN.md
  - Verify: Build exits 0, astro check exits 0, product links grep hits on category page HTML
  - Done when: Category H1, description, product grid with price/discount badges all render in built HTML

## Files Likely Touched

- `apps/generator/src/pages/index.astro`
- `apps/generator/src/pages/categories/[slug].astro`
