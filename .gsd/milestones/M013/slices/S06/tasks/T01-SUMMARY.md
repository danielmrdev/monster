---
id: T01
parent: S06
milestone: M013
provides:
  - Centered logo header (grid-cols-3) in Layout.astro
  - H1 from focus_keyword on homepage
  - Category cards with vertical image/placeholder block
  - Homepage SEO prose text section rendered via marked()
  - SiteInfo.homepage_seo_text interface field
  - Fixture data: non-null focus_keyword and homepage_seo_text
key_files:
  - apps/generator/src/lib/data.ts
  - apps/generator/src/data/fixture/site.json
  - apps/generator/src/layouts/tsa/Layout.astro
  - apps/generator/src/pages/index.astro
key_decisions:
  - Used grid-cols-3 with explicit left/center/right cells; hamburger moves to left cell on mobile
  - min-w-0 + truncate on text-only logo anchor prevents long site names from overflowing center cell
  - marked() used synchronously (KN009 — marked v17 is sync); named import, no await
patterns_established:
  - Category card pattern: image/placeholder block above text div (overflow-hidden on outer anchor)
  - homepage_seo_text guarded by truthiness check before rendering; prose prose-sm max-w-none wraps marked() output
observability_surfaces:
  - grep -i 'freidoras de aire' apps/generator/.generated-sites/fixture/dist/index.html
  - grep 'prose' apps/generator/.generated-sites/fixture/dist/index.html
  - grep 'grid-cols-3' apps/generator/.generated-sites/fixture/dist/index.html
  - grep -c 'src=""' apps/generator/.generated-sites/fixture/dist/index.html (must be 0)
duration: ~8m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Apply all four homepage design gaps

**Closed all four S06 design gaps in one atomic pass: centered logo header (grid-cols-3), H1 from focus_keyword, category cards with vertical image placeholder, and homepage prose SEO text section rendered with marked().**

## What Happened

Applied all four changes to their respective files in sequence:

1. **`data.ts`** — added `homepage_seo_text: string | null` to `SiteInfo` after `focus_keyword`.
2. **`fixture/site.json`** — set `focus_keyword` to `"freidoras de aire"` (was `null`) and added `homepage_seo_text` with an HTML paragraph.
3. **`Layout.astro`** — replaced `<nav class="flex h-14 items-center justify-between gap-6">` with `<nav class="grid grid-cols-3 h-14 items-center">` using three explicit cells: hamburger left, logo center (with `min-w-0` + `truncate`), desktop nav right. The mobile dropdown `<div id="mobile-menu-tsa-dropdown">` and `<script is:inline>` were left unchanged per KN013.
4. **`index.astro`** — three changes: H1 uses `{site.focus_keyword ?? site.name}`, category cards restructured with a `h-40` image or `bg-gray-100 h-40` placeholder div above a `p-5` text block, and a `prose prose-sm max-w-none` SEO text section added at the bottom using `set:html={marked(site.homepage_seo_text)}` with a truthiness guard.

Build and type-check passed on the first attempt — no debugging required.

## Verification

All five slice-level verification checks passed:

1. `SITE_SLUG=fixture pnpm --filter @monster/generator build` → exit 0, 15 pages built in 2.6s
2. `SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check` → 0 errors, 0 warnings
3. `grep -i 'freidoras de aire' dist/index.html` → matched in H1 (`<h1 ...> freidoras de aire </h1>`) and in the prose SEO text section
4. `grep 'prose' dist/index.html` → matched `prose prose-sm max-w-none text-gray-600` div wrapping the SEO text
5. `grep -oP 'href="[^"]*amazon\.[^"]*"' dist/index.html` → zero matches (affiliate link regression check passes)

Additional diagnostic check: `grep -c 'src=""' dist/index.html` → 0 (no empty image srcs from missed null check on `category_image`).

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | ~4.4s |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check` | 0 | ✅ pass | ~6.2s |
| 3 | `grep -i 'freidoras de aire' dist/index.html` | 0 | ✅ pass | <1s |
| 4 | `grep 'prose' dist/index.html \| head -3` | 0 | ✅ pass | <1s |
| 5 | `grep -oP 'href="[^"]*amazon\.[^"]*"' dist/index.html` | 1 (no match) | ✅ pass | <1s |
| 6 | `grep -c 'src=""' dist/index.html` | 0 | ✅ pass | <1s |

## Diagnostics

- Primary inspection surface: `apps/generator/.generated-sites/fixture/dist/index.html` — grep this file for all four design signals without running a dev server.
- `astro check` (run with `SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check`) catches any TypeScript errors in `.astro` files, including missing `SiteInfo` fields.
- `astro build` stdout shows module-not-found or type errors promoted to build failures.
- To verify the prose section specifically: `grep 'prose prose-sm' dist/index.html`
- To verify the grid-cols-3 nav: `grep 'grid-cols-3' dist/index.html`

## Deviations

None. All steps followed the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — added `homepage_seo_text: string | null` to `SiteInfo` interface
- `apps/generator/src/data/fixture/site.json` — set `focus_keyword: "freidoras de aire"`, added `homepage_seo_text` HTML string
- `apps/generator/src/layouts/tsa/Layout.astro` — replaced flex nav with grid-cols-3 (hamburger left, logo center, nav right)
- `apps/generator/src/pages/index.astro` — H1 uses `focus_keyword ?? site.name`; category cards have image/placeholder block; added marked() SEO prose section at bottom; added `import { marked } from "marked"`
