---
id: T03
parent: S01
milestone: M013
provides:
  - "apps/generator/src/layouts/tsa/Layout.astro — single unified TSA layout with centered logo, hamburger nav (KN013), and footer"
  - "All four page files now import only TsaLayout; triple-dispatch and old layout imports removed"
  - "SiteCustomization.logoUrl?: string added to data.ts interface"
  - "Old classic/modern/minimal layout directories deleted"
key_files:
  - apps/generator/src/layouts/tsa/Layout.astro
  - apps/generator/src/pages/index.astro
  - apps/generator/src/pages/categories/[slug].astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/[legal].astro
  - apps/generator/src/lib/data.ts
key_decisions:
  - Added logoUrl?: string to SiteCustomization interface in data.ts (plan assumed the field existed; it didn't — TypeScript error ts(2339) caught it at check time)
  - Placeholder variables kept in index.astro/category/product pages (CURRENCY, heroUrl, featuredProducts, etc.) for S02/S03 reuse — astro check exits 0 because TypeScript treats these as hints not errors
patterns_established:
  - TSA layout uses IDs nav-toggle-tsa and mobile-menu-tsa-dropdown for hamburger (no collision with deleted classic IDs)
  - All future page files in apps/generator should import TsaLayout from ../layouts/tsa/Layout.astro
  - SiteCustomization.logoUrl is the optional logo field; layout renders <img> if set, else site name link
observability_surfaces:
  - "SITE_SLUG=fixture pnpm --filter @monster/generator check — exit 0 = clean types; any error = regression"
  - "grep -rn 'ClassicLayout|ModernLayout|MinimalLayout' apps/generator/src/pages/ — zero output = no regression"
  - "find apps/generator/.generated-sites/fixture/dist -name '*.html' | wc -l — must print 11"
  - "ls apps/generator/src/layouts/ — must show only BaseLayout.astro and tsa/"
duration: ~20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Write tsa/Layout.astro, strip triple-dispatch from all four page files, delete old layouts

**Created `layouts/tsa/Layout.astro` as the single unified TSA layout, removed triple-dispatch from all four page files, deleted classic/modern/minimal layout directories — build exits 0, astro check exits 0 (was 8 errors).**

## What Happened

Read the classic `Layout.astro` first to copy the hamburger pattern exactly per KN013. Created `apps/generator/src/layouts/tsa/Layout.astro` with:
- Centered logo header (renders `<img>` if `customization.logoUrl` is set, else `<a>` with site name)
- Hamburger using IDs `nav-toggle-tsa` and `mobile-menu-tsa-dropdown` (separate sibling div per KN013, no ID collision)
- `<main class="mx-auto max-w-6xl px-4 py-8"><slot /></main>`
- Footer with Amazon affiliate disclosure, legal links, copyright
- BaseLayout receives all six required props: `title`, `lang`, `metaDescription`, `customization`, `siteId`, `supabaseUrl`, `supabaseAnonKey`

Hit one type error on first `astro check`: `Property 'logoUrl' does not exist on type 'SiteCustomization'`. The plan assumed the field existed; it was absent from the interface. Fixed by adding `logoUrl?: string` to the `SiteCustomization` interface in `data.ts`.

Updated all four pages to import only `TsaLayout`:
- `index.astro` — placeholder slot content, data loading vars kept for S02
- `categories/[slug].astro` — placeholder slot content, `getStaticPaths()` intact
- `products/[slug].astro` — placeholder slot content, `getStaticPaths()` intact
- `[legal].astro` — full legal rendering kept (`marked`, `interpolateLegal`, prose classes)

Deleted `src/layouts/classic/`, `modern/`, `minimal/`.

## Verification

All slice verification commands run and passed:

```
SITE_SLUG=fixture pnpm --filter @monster/generator build  → exit 0, 11 pages
SITE_SLUG=fixture pnpm --filter @monster/generator check  → exit 0, 0 errors
ls apps/generator/src/layouts/                            → BaseLayout.astro  tsa
grep -rn "ClassicLayout|ModernLayout|MinimalLayout" src/pages/  → no output
grep -n "TsaLayout" src/pages/{index,category,products,legal}   → one import per file
find dist -name "*.html" | wc -l                          → 11
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 2.41s |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 0 | ✅ pass | 6.0s |
| 3 | `ls apps/generator/src/layouts/` | 0 | ✅ pass | — |
| 4 | `grep -rn "ClassicLayout\|ModernLayout\|MinimalLayout" apps/generator/src/pages/` | 1 (no match) | ✅ pass | — |
| 5 | `grep -n "TsaLayout" pages/index.astro + 3 others` | 0 | ✅ pass | — |
| 6 | `grep -n "description\|original_price" apps/generator/src/lib/data.ts` | 0 | ✅ pass | — |
| 7 | `grep "@plugin" apps/generator/src/layouts/BaseLayout.astro` | 0 | ✅ pass | — |
| 8 | `find dist -name "*.html" \| wc -l` | — | ✅ 11 pages | — |

## Diagnostics

Quick snapshot after any future edit:
```bash
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -40
# 0 errors = clean; any error line = regression

grep -rn "ClassicLayout\|ModernLayout\|MinimalLayout\|tsa/modern\|tsa/minimal" apps/generator/src/pages/
# any output = regression (old dispatch survived)

find apps/generator/.generated-sites/fixture/dist -name "*.html" | wc -l
# must print 11 after a successful build
```

If `logoUrl` is set in customization but the image doesn't render: check that `site.customization.logoUrl` is a string (not undefined) — the layout uses `?? null` guard.

## Deviations

- Added `logoUrl?: string` to `SiteCustomization` in `data.ts` — the plan assumed this field already existed. It was absent from the interface. TypeScript caught it immediately via `astro check`. Adding it here (rather than ignoring the error) is the correct fix.

## Known Issues

- Unused variable warnings (CURRENCY, heroUrl, featuredProducts, affiliateUrl, prosCons, products) in placeholder pages — these are intentional, kept for S02/S03 to use when content is filled in. `astro check` reports them as hints (exit 0), not errors.

## Files Created/Modified

- `apps/generator/src/layouts/tsa/Layout.astro` — new unified TSA layout (created)
- `apps/generator/src/pages/index.astro` — replaced triple-dispatch with TsaLayout + placeholder
- `apps/generator/src/pages/categories/[slug].astro` — replaced triple-dispatch with TsaLayout + placeholder
- `apps/generator/src/pages/products/[slug].astro` — replaced triple-dispatch with TsaLayout + placeholder
- `apps/generator/src/pages/[legal].astro` — replaced triple-dispatch with TsaLayout, full legal rendering kept
- `apps/generator/src/lib/data.ts` — added `logoUrl?: string` to `SiteCustomization` interface
- `apps/generator/src/layouts/classic/` — deleted
- `apps/generator/src/layouts/modern/` — deleted
- `apps/generator/src/layouts/minimal/` — deleted
- `.gsd/milestones/M013/slices/S01/S01-PLAN.md` — added structured failure-path diagnostics to slice verification section (pre-flight fix)
- `.gsd/milestones/M013/slices/S01/tasks/T03-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
