# S06: Homepage Design Completeness — Research

**Date:** 2026-03-18
**Status:** Ready for planning

## Summary

S06 is a targeted polish slice. The build already exits 0 and `astro check` reports 0 errors. The work is four discrete gaps between the current homepage and the spec, plus two fixture data additions. All changes are confined to `apps/generator/src/pages/index.astro`, `apps/generator/src/lib/data.ts`, and `apps/generator/src/data/fixture/site.json`. The layout file (`Layout.astro`) needs a header redesign for centered logo. No new dependencies, no new libraries.

The four gaps to close:

1. **Header logo not centered.** Current `Layout.astro` header is `flex justify-between` — logo left, nav right. Spec says centered logo (two-row header or `grid-cols-3`). The `grid-cols-3` approach (left: hamburger, center: logo, right: nav links) is cleanest for a single-row header; a two-row approach (logo row + nav row below) also satisfies the spec and avoids three-column complexity on mobile.
2. **H1 from `focus_keyword` when non-null.** `SiteInfo` already has `focus_keyword: string | null`. The homepage H1 currently always shows `site.name`. Spec: use `focus_keyword` as H1 when non-null. The fixture has `"focus_keyword": null` — it must be updated to a non-null value so the path is actually exercised.
3. **Prose SEO text section at bottom.** `SiteInfo` is missing `homepage_seo_text: string | null`. The DB schema has this field (`supabase.ts` line 907). It must be added to `SiteInfo` interface and to `fixture/site.json`, then rendered at the bottom of the homepage with `prose` typography class (`@tailwindcss/typography` is already installed and `@plugin "@tailwindcss/typography"` is in `BaseLayout.astro`).
4. **Category grid cards with vertical image.** Current category cards show only text (name + description snippet). Spec adds a vertical image from `cat.category_image`. The `CategoryData` interface already has `category_image: string | null`. The fixture has `null` for both — a placeholder or fallback `div` is needed for the null case.

## Recommendation

Single task: apply all four changes together. They are all in `index.astro` + `Layout.astro` + `data.ts` + `fixture/site.json`, with no inter-dependencies between the four gaps. Doing them atomically keeps verification simple — one build + one visual check proves all four.

For the header centering: use `grid grid-cols-3` in the nav row. Left cell: hamburger (visible mobile only, hidden desktop). Center cell: logo (always visible, `justify-self-center`). Right cell: desktop category links (`justify-self-end`). This is a clean single-row header at all breakpoints. The mobile dropdown pattern (KN013) is preserved unchanged.

For the SEO text: render with `<div class="prose prose-sm max-w-none">` + `set:html={marked(site.homepage_seo_text)}` — the same `marked` pattern used in `[legal].astro` (KN009: `marked` v17 is synchronous, no await needed). Only render the section when `homepage_seo_text` is non-null.

## Implementation Landscape

### Key Files

- `apps/generator/src/layouts/tsa/Layout.astro` — header `<nav>` row needs `grid grid-cols-3` centering. Mobile hamburger stays left cell; logo becomes center cell; desktop links become right cell. Script is untouched.
- `apps/generator/src/pages/index.astro` — three changes: (a) H1 from `focus_keyword ?? site.name`, (b) category cards get vertical image block above description, (c) SEO text section added at bottom using `prose` + `marked`.
- `apps/generator/src/lib/data.ts` — add `homepage_seo_text: string | null` to `SiteInfo` interface.
- `apps/generator/src/data/fixture/site.json` — add `"homepage_seo_text": "<some SEO prose>"` and change `"focus_keyword": null` to a non-null value (e.g. `"freidoras de aire"`) under `site`.

### Build Order

1. Update `SiteInfo` interface in `data.ts` first (adding `homepage_seo_text`) — downstream files depend on this type.
2. Update `fixture/site.json` with `homepage_seo_text` and non-null `focus_keyword`.
3. Update `Layout.astro` header to `grid-cols-3` centering.
4. Update `index.astro`: H1 logic, category image block, SEO text section.
5. Run `SITE_SLUG=fixture pnpm --filter @monster/generator build` → must exit 0.
6. Run `astro check` → must report 0 errors.

### Verification Approach

```bash
# Build
SITE_SLUG=fixture pnpm --filter @monster/generator build

# astro check
SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check

# Confirm H1 uses focus_keyword (not site name)
grep -o '<h1[^>]*>.*</h1>' apps/generator/.generated-sites/fixture/dist/index.html

# Confirm seo_text prose section present
grep "prose" apps/generator/.generated-sites/fixture/dist/index.html | head -5

# Confirm no regressions: all affiliate links still /go/
grep -oP 'href="[^"]*amazon\.[^"]*"' apps/generator/.generated-sites/fixture/dist/index.html
# → must be empty (0 matches)
```

## Constraints

- `marked` is already a dependency in the generator; import from `"marked"` same as `[legal].astro`.
- `@tailwindcss/typography` is already installed and configured in `BaseLayout.astro` — no install needed.
- No JS framework in templates — `is:inline` scripts only (D163). The `set:html={marked(...)}` is server-side rendering, not a client script — compliant.
- `focus_keyword` already exists on `SiteInfo`; only `homepage_seo_text` is the new field.
- The fixture `focus_keyword` is on `site` (top level), not on `categories` (which also has its own `focus_keyword`).

## Common Pitfalls

- **`marked` import** — `[legal].astro` imports `marked` as `import { marked } from "marked"`. Use the same pattern; do not use a default import.
- **Category image fallback** — `cat.category_image` is `null` in the fixture. The card must render a placeholder div (e.g. `bg-gray-100 h-40`) when null, otherwise the card collapses or shows a broken image.
- **H1 placement** — spec says H1 from `focus_keyword`. Currently H1 is inside the hero `<section>` as an overlay on the hero image. Moving or changing the H1 content is fine; the hero section can stay with `focus_keyword` text or be replaced. The important thing is that `<h1>` content is the `focus_keyword` value when non-null.
- **`grid-cols-3` on mobile** — the logo center cell needs `min-w-0` or `overflow-hidden` to prevent the site name text from overflowing into adjacent cells when name is long.
