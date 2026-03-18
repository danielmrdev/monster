---
id: S06
parent: M013
milestone: M013
provides:
  - Centered logo header (grid-cols-3) in Layout.astro — hamburger left, logo center, desktop nav right
  - H1 from focus_keyword (falls back to site.name when null)
  - Category cards with vertical image block (or bg-gray-100 h-40 placeholder when category_image is null)
  - Homepage prose SEO text section rendered via marked() at bottom
  - SiteInfo.homepage_seo_text: string | null interface field in data.ts
  - Fixture data: focus_keyword="freidoras de aire", homepage_seo_text (HTML paragraph)
requires:
  - slice: S01
    provides: Layout.astro shell, CategoryData.description, ProductData.original_price, data.ts SiteInfo interface
  - slice: S02
    provides: index.astro homepage template structure
affects: []
key_files:
  - apps/generator/src/lib/data.ts
  - apps/generator/src/data/fixture/site.json
  - apps/generator/src/layouts/tsa/Layout.astro
  - apps/generator/src/pages/index.astro
key_decisions:
  - grid-cols-3 for header centering: hamburger cell (left), logo cell (center, min-w-0 + truncate), nav cell (right)
  - marked() used synchronously without await (KN009 — marked v17 is sync); named import { marked }
  - homepage_seo_text and category card image both guarded by truthiness checks before rendering
  - placeholder div (bg-gray-100 h-40) used when category_image is null — never renders <img src="">
patterns_established:
  - Category card layout: image/placeholder block (h-40) above p-5 text block, overflow-hidden on outer anchor
  - Prose section pattern: <section class="mt-12 border-t ..."><div class="prose prose-sm max-w-none text-gray-600" set:html={...}>
  - grid-cols-3 three-cell header: reusable pattern for any layout that needs centered logo + left/right content
observability_surfaces:
  - grep -i 'freidoras de aire' apps/generator/.generated-sites/fixture/dist/index.html | grep h1
  - grep 'prose prose-sm max-w-none' apps/generator/.generated-sites/fixture/dist/index.html
  - grep 'grid-cols-3' apps/generator/.generated-sites/fixture/dist/index.html
  - grep -c 'src=""' apps/generator/.generated-sites/fixture/dist/index.html (must be 0)
  - grep -oP 'href="[^"]*amazon\.[^"]*"' dist/index.html (must be empty)
drill_down_paths:
  - .gsd/milestones/M013/slices/S06/tasks/T01-SUMMARY.md
duration: ~8m (T01 only)
verification_result: passed
completed_at: 2026-03-18
---

# S06: Homepage Design Completeness

**Closed four design gaps in the TSA homepage: centered logo header (grid-cols-3), H1 driven by focus_keyword, category grid cards with vertical image/placeholder block, and a prose SEO text section at the bottom rendered via marked().**

## What Happened

S06 had a single task (T01) that applied all four changes atomically. The work touched four files: the data interface, the fixture, the layout, and the homepage template.

**Data interface (`data.ts`):** `homepage_seo_text: string | null` was added to `SiteInfo` immediately after `focus_keyword`. The field is nullable — pages without SEO prose simply omit the section.

**Fixture (`site.json`):** `focus_keyword` was set from `null` to `"freidoras de aire"`. `homepage_seo_text` was added as a non-null HTML paragraph about the niche, serving as a realistic content test.

**Layout (`Layout.astro`):** The `flex h-14 items-center justify-between` nav was replaced with `grid grid-cols-3 h-14 items-center`. Three explicit cells: left holds the hamburger (hidden on desktop, always in DOM), center holds the logo anchor with `min-w-0 truncate` to prevent long names from overflowing, right holds the desktop category links (`hidden md:flex`). The mobile dropdown (`mobile-menu-tsa-dropdown`) and its `<script is:inline>` were not changed — per KN013, they sit outside the nav row as a sibling.

**Homepage (`index.astro`):** Three changes:
1. H1 changed from `{site.name}` to `{site.focus_keyword ?? site.name}`
2. Category cards restructured: image block (`<img>` when `category_image` non-null, else `<div class="w-full h-40 bg-gray-100 ...">` placeholder) placed above the text block
3. Prose section added at the bottom: `{site.homepage_seo_text && <section class="mt-12 ..."><div class="prose prose-sm max-w-none text-gray-600" set:html={marked(site.homepage_seo_text)} /></section>}`; named import `{ marked }` from `"marked"` added to frontmatter

Build and `astro check` passed on the first attempt with no debugging needed.

## Verification

All six slice-level verification checks ran against `apps/generator/.generated-sites/fixture/dist/index.html`:

| # | Check | Result |
|---|-------|--------|
| 1 | `SITE_SLUG=fixture pnpm build` exits 0 — 15 pages, 2.6s | ✅ pass |
| 2 | `astro check` exits 0 — 0 errors, 0 warnings | ✅ pass |
| 3 | `grep -i 'freidoras de aire' dist/index.html \| grep h1` — H1 tag contains focus_keyword | ✅ pass |
| 4 | `grep 'prose' dist/index.html` — `prose prose-sm max-w-none text-gray-600` div present | ✅ pass |
| 5 | `grep -oP 'href="[^"]*amazon\.[^"]*"'` — zero amazon. URLs in `<a href>` | ✅ pass |
| 6 | `grep -c 'src=""'` = 0 — no empty image src from null category_image | ✅ pass |

The grid-cols-3 nav structure is confirmed in built HTML. Category cards render placeholder divs (`bg-gray-100 h-40`) because fixture `category_image` is null — the null-guard works correctly.

## Requirements Advanced

- R045 (TSA unified template) — Homepage design completeness closes the last open gap in the spec. Centered logo, focus_keyword H1, prose SEO text, and category card images are all present in built output.
- R001 (pipeline output quality) — Homepage now matches the M013 spec's description of a polished, SEO-optimized page: H1 from keyword data, structured category discovery, prose content section.

## Requirements Validated

- R047 (category description in generator) — Category description is rendered in category grid cards on the homepage. Fixture confirms non-null descriptions appear in built HTML.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

None. All steps followed the plan exactly per T01 summary.

## Known Limitations

- Category cards use a gray placeholder (`bg-gray-100 h-40`) when `category_image` is null. The fixture has both categories with `category_image: null`, so the built output shows placeholder divs rather than real images. This is correct behavior — real category images come from product data during site generation, not the template layer.
- The prose SEO text in the fixture is HTML directly in the JSON field (a `<p>` tag). `marked()` is called on this content; HTML passthrough works because marked passes unknown HTML through by default. Future content from the AI pipeline will be Markdown, which `marked()` renders correctly.

## Follow-ups

None. S06 was the final slice in M013. The milestone is now feature-complete — all 6 slices are done, all M013 success criteria are met.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — added `homepage_seo_text: string | null` to `SiteInfo` interface
- `apps/generator/src/data/fixture/site.json` — set `focus_keyword: "freidoras de aire"`, added `homepage_seo_text` HTML string
- `apps/generator/src/layouts/tsa/Layout.astro` — flex nav replaced with grid-cols-3 (hamburger left, logo center, nav right)
- `apps/generator/src/pages/index.astro` — H1 uses `focus_keyword ?? site.name`; category cards have image/placeholder block; added `marked()` SEO prose section; added `import { marked } from "marked"`

## Forward Intelligence

### What the next slice should know
- The `SiteInfo` interface now has all fields the M013 spec required: `focus_keyword`, `homepage_seo_text`, `template_slug`, `customization`, `contact_email`, `supabase_url`, `supabase_anon_key`. Any new site-level field should follow the nullable pattern with a JSDoc comment.
- The `grid-cols-3` header pattern is stable and tested in built output. Do not change it without also updating the mobile hamburger toggle — the `-dropdown` sibling div must remain outside the three-cell nav grid.
- `marked()` is synchronous in v17 (KN009). No `await` needed. If the version is ever bumped, test that `set:html` still receives a string and not a Promise.

### What's fragile
- Category card images depend on `category_image` being non-null. The fixture has null values, so placeholders always appear in test builds. The first real site with actual category images will exercise the `<img>` branch for the first time — validate it then.
- `homepage_seo_text` in the fixture is raw HTML (not Markdown). `marked()` passes HTML through, which works, but if the content pipeline ever sends escaped HTML entities this will break silently. Real content should be plain Markdown.

### Authoritative diagnostics
- `apps/generator/.generated-sites/fixture/dist/index.html` is the single canonical artifact for all homepage checks. Grep it without running a dev server.
- `astro check` (run as `SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check`) is the authoritative TypeScript type checker for `.astro` files — catches interface mismatches before they reach production builds.

### What assumptions changed
- Python `json` module returns Python `None` for JSON `null` — initial fixture inspection looked like `focus_keyword: None` and `homepage_seo_text: KEY_MISSING` but the JSON file was correct all along. JSON `null` and missing key are visually similar in Python repr.
