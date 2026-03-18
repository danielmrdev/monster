# S01: Data layer + new layout base — Research

**Date:** 2026-03-18

## Summary

S01 is straightforward data and layout work. The existing codebase is in good shape with one build-breaking issue already in `astro check` (8 errors, not 0), and three data gaps to close before any template work begins: `CategoryData` needs `description`, `ProductData` needs `original_price`, and `@tailwindcss/typography` needs to be installed.

The current generator builds successfully (`SITE_SLUG=fixture pnpm build` exits 0 and produces 11 pages), but `astro check` fails with 8 type errors — `SiteTemplate` in `packages/shared` is `'classic' | 'modern' | 'minimal'` but all four page files compare against `'tsa/modern'` and `'tsa/minimal'`. These comparisons were introduced in D159 (namespaced slugs) but `packages/shared`'s type was never updated. S01 removes all dispatch logic, so these errors disappear naturally — but the planner should note the pre-existing state.

The new layout (`src/layouts/tsa/Layout.astro`) replaces three separate layout files. It follows the established pattern: wraps `BaseLayout.astro`, accepts `site`, `categories`, `metaDescription` as props, provides a `<slot />` for page content. The hamburger nav pattern (KN013) is already proven in classic/modern/minimal — copy it exactly. The old layout files can be deleted cleanly; no other file in the generator imports them except the four page files (which S01 is replacing).

## Recommendation

Three tasks in dependency order:

1. **Data layer** — Add `description: string | null` to `CategoryData`, `original_price: number | null` to `ProductData`, add both fields to fixture `site.json` categories. Update `SiteTemplate` type in `packages/shared` to include the new unified slug (or simply widen to `string` — see below). Verify `astro check` goes from 8 errors to 0.

2. **Install `@tailwindcss/typography`** — Add to `apps/generator` package.json. Configure via `@plugin "@tailwindcss/typography"` in `BaseLayout.astro`'s inline `<style>` block (Tailwind v4 CSS `@plugin` directive, not a vite plugin). No separate CSS file needed.

3. **New layout + remove old layouts** — Write `src/layouts/tsa/Layout.astro`. Delete `src/layouts/classic/`, `src/layouts/modern/`, `src/layouts/minimal/`. Update all four page files to import only `TsaLayout` and remove the triple-dispatch. Run `SITE_SLUG=fixture pnpm build` as slice-level verification.

## Implementation Landscape

### Key Files

- `apps/generator/src/lib/data.ts` — `CategoryData` interface: add `description: string | null`. `ProductData` interface: add `original_price: number | null`. Both fields are already present in the DB (`packages/db/src/types/supabase.ts` has `original_price: number | null`; `tsa_categories.description` exists per D057). No `buildAffiliateUrl` changes — that stays as-is for S01.

- `apps/generator/src/data/fixture/site.json` — Add `"description": "..."` to both category objects. Add `"original_price": null` to all product objects (no original prices in fixture). Also add `"focus_keyword": null` and `"id": "..."` to the `site` object — both are expected by `SiteInfo` but currently absent from fixture (the build currently works because TypeScript is only checked by `astro check`, not `astro build`).

- `packages/shared/src/types/index.ts` — `SiteTemplate` type currently `'classic' | 'modern' | 'minimal'`. With M013, the single template is `tsa/classic` (D159 + D169). Two options: (a) update the type to `'classic' | 'modern' | 'minimal' | 'tsa/classic'`, or (b) widen to `string`. Option (a) is cleaner. The pages no longer switch on `template_slug` at all after S01 cleans them up — so this is mostly about making `astro check` and `tsc` pass. The fixture `site.json` has `"template_slug": "classic"` which is fine for the fixture.

- `apps/generator/src/layouts/classic/Layout.astro` — Delete. Only imported by the four page files, which S01 updates.
- `apps/generator/src/layouts/modern/Layout.astro` — Delete.
- `apps/generator/src/layouts/minimal/Layout.astro` — Delete.

- `apps/generator/src/layouts/tsa/Layout.astro` — New file. Props: `{ title: string; site: SiteInfo; categories: CategoryData[]; metaDescription?: string }`. Structure: wraps `BaseLayout.astro` with header (centered logo + horizontal cat nav + hamburger), `<main>` with `<slot />`, footer (affiliate disclosure + legal links + copyright). Uses `var(--color-primary)` and `var(--color-accent)` CSS vars already injected by `BaseLayout`. Follow KN013 hamburger pattern exactly: separate `-dropdown` div as sibling to nav row, `<script is:inline>` toggles only the dropdown. Logo: if `site.customization.logoUrl` exists, show `<img>` else show site name as text (brand-colored, large, centered or left-aligned).

- `apps/generator/src/pages/index.astro` — Remove all three layout imports + triple-dispatch. Import `TsaLayout` only. Keep data loading and slot content structure for S02 to fill in.
- `apps/generator/src/pages/categories/[slug].astro` — Same pattern.
- `apps/generator/src/pages/products/[slug].astro` — Same pattern.
- `apps/generator/src/pages/[legal].astro` — Same pattern.

- `apps/generator/src/layouts/BaseLayout.astro` — Add `@plugin "@tailwindcss/typography"` to the inline `<style>` block containing `@import "tailwindcss"`. This is the Tailwind v4 way to load plugins — no vite plugin registration needed.

### Build Order

1. Data layer first (interface + fixture) — unblocks TypeScript correctness for all downstream template work.
2. `SiteTemplate` type update in `packages/shared` (small change, triggers a `pnpm --filter @monster/shared build`).
3. Install `@tailwindcss/typography` in `apps/generator` and configure in `BaseLayout.astro`.
4. Write `src/layouts/tsa/Layout.astro`.
5. Update all four page files — replace imports, remove dispatch, import `TsaLayout`.
6. Delete old layout directories.
7. Run `SITE_SLUG=fixture pnpm --filter @monster/generator build` + `astro check` — both must exit 0.

### Verification Approach

```bash
# Build must succeed and produce 11 pages
SITE_SLUG=fixture pnpm --filter @monster/generator build

# Type check must show 0 errors (currently 8)
SITE_SLUG=fixture pnpm --filter @monster/generator check

# Confirm old layout files are gone
ls apps/generator/src/layouts/
# Expected: BaseLayout.astro  tsa/

# Confirm CategoryData.description and ProductData.original_price exist
grep -n "description\|original_price" apps/generator/src/lib/data.ts
```

## Constraints

- **Tailwind v4 typography plugin** — `@tailwindcss/typography` v0.5.19 supports Tailwind v4 (peer dep `>=4.0.0-alpha.20`). In Tailwind v4 the plugin is loaded via CSS: `@plugin "@tailwindcss/typography"` inside the `<style>` block in `BaseLayout.astro`. No vite plugin entry in `astro.config.ts`.
- **No JS framework** — Layout script uses `<script is:inline>` only (D163). Hamburger toggle is ~8 lines.
- **`SiteCustomization` type** — Already defined in `packages/shared/src/types/customization.ts` (D027). `logoUrl` and `faviconUrl` are optional strings. The layout can conditionally render a logo image if `site.customization.logoUrl` is set.
- **`SiteInfo` interface** — Has optional `id`, `supabase_url`, `supabase_anon_key` fields already used by BaseLayout. The fixture `site.json` currently lacks `id`, `focus_keyword`, and a couple of other optional `SiteInfo` fields — `astro build` ignores this (no TypeScript validation at build time) but `astro check` may flag it. Worth confirming the fixture is complete.
- **`packages/shared` rebuild** — After updating `SiteTemplate` type, run `pnpm --filter @monster/shared build` before the generator build, or the type change won't be picked up.

## Common Pitfalls

- **Fixture `template_slug` is `"classic"` not `"tsa/classic"`** — The new layout doesn't switch on `template_slug` at all, so this is fine for fixture builds. Don't change it.
- **Pre-existing `astro check` errors** — All 8 come from comparing `SiteTemplate` to `'tsa/modern'`/`'tsa/minimal'`. Removing the dispatch logic in page files clears all 8 without needing to update the type (though updating it is still correct for accuracy).
- **`prose` classes require `@tailwindcss/typography` to produce any output** — The existing `[legal].astro` already uses `prose prose-gray` and `prose prose-sm`. Without the plugin installed, these classes silently produce no output. Installing the plugin is required even though the build doesn't fail without it.
- **Don't touch `BaseLayout.astro`'s analytics substitution** — The tracker injection logic (reading `tracker.min.js` and doing `.replace()`) must stay intact. The new `tsa/Layout.astro` must pass `siteId`, `supabaseUrl`, `supabaseAnonKey` to `BaseLayout` just like the existing layouts do.
