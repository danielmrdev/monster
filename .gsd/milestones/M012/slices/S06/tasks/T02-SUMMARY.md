---
id: T02
parent: S06
milestone: M012
provides:
  - tsa/modern and tsa/minimal slug comparisons in all four generator page files
  - w-full CTA buttons on Minimal and Classic product page variants
  - grid-cols-1 sm:grid-cols-2 pros/cons grid on Minimal product page variant
  - Observability Impact section added to T02-PLAN.md
key_files:
  - apps/generator/src/pages/index.astro
  - apps/generator/src/pages/categories/[slug].astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/[legal].astro
  - .gsd/milestones/M012/slices/S06/tasks/T02-PLAN.md
key_decisions:
  - Classic remains the default else-branch; only Modern and Minimal use named tsa/* comparisons
  - Minimal CTA changed from inline-block to block w-full text-center to match Modern's pattern
  - Classic CTA changed from inline-block to block w-full text-center for mobile consistency
patterns_established:
  - Template routing: `site.template_slug === "tsa/modern"` ... `=== "tsa/minimal"` ... else Classic; comment `/* Default: tsa/classic is the default */` marks the else branch
  - Product page CTA: all three variants use `block w-full text-center` for mobile-safe full-width button
  - Pros/cons grid: all three variants use `grid-cols-1 sm:grid-cols-2` so mobile stacks to single column
observability_surfaces:
  - "grep -r '\"modern\"|\"minimal\"|\"classic\"' apps/generator/src/pages/ → 0 (bare slugs absent)"
  - "grep -c 'tsa/modern|tsa/minimal' apps/generator/src/pages/index.astro apps/generator/src/pages/categories/[slug].astro apps/generator/src/pages/products/[slug].astro apps/generator/src/pages/[legal].astro → 2 per file (8 total)"
  - "grep -n 'block w-full' apps/generator/src/pages/products/[slug].astro → 3 hits (Modern/Minimal/Classic CTAs)"
  - "grep -n 'grid-cols-1 sm:grid-cols-2' apps/generator/src/pages/products/[slug].astro → 3 hits (all template pros/cons)"
  - "SITE_SLUG=fixture pnpm --filter @monster/generator build → exit 0, 11 pages"
duration: ~8min
verification_result: passed
completed_at: 2026-03-17T12:34:00Z
blocker_discovered: false
---

# T02: Update template slug comparisons and verify CTA/pros-cons mobile classes

**Updated all four generator page files from bare `"modern"`/`"minimal"` to `"tsa/modern"`/`"tsa/minimal"` slugs; made product CTA buttons full-width and pros/cons grids mobile-responsive across all three template variants.**

## What Happened

Read all four page files and identified two classes of issues:

1. **Slug comparisons**: All four pages (`index.astro`, `categories/[slug].astro`, `products/[slug].astro`, `[legal].astro`) used bare `"modern"` and `"minimal"` strings. Since S01 migrated DB values to `tsa/modern` and `tsa/minimal`, these comparisons would always fall through to the Classic default — a silent layout routing bug.

2. **CTA button width**: The Minimal and Classic product page variants used `inline-block` without `w-full`. Only Modern already had `block w-full`. This caused narrow, content-sized buttons on mobile at 375px.

3. **Pros/cons grid**: The Minimal variant used `grid-cols-2` only — two columns always, causing horizontal overflow on 375px screens. Classic and Modern already had `grid-cols-1 sm:grid-cols-2`.

All four files were updated with `tsa/modern` and `tsa/minimal` comparisons and `/* Default: tsa/classic is the default */` comments on the else branches. The Minimal and Classic CTAs were updated to `block w-full text-center`. The Minimal pros/cons grid was updated to `grid-cols-1 sm:grid-cols-2`.

Additionally, the pre-flight-flagged `## Observability Impact` section was added to `T02-PLAN.md`.

## Verification

- `grep -r '"modern"\|"minimal"\|"classic"' apps/generator/src/pages/` → **0 results** (PASS)
- `grep -c "tsa/modern\|tsa/minimal" ...` → **2 per file, 8 total** (PASS)
- `grep -n "block w-full" apps/generator/src/pages/products/[slug].astro` → **3 hits** (lines 51, 99, 150) (PASS)
- `grep -n "grid-cols-1 sm:grid-cols-2" apps/generator/src/pages/products/[slug].astro` → **3 hits** (lines 63, 112, 162) (PASS)
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` → **exit 0, 11 pages built in 2.33s** (PASS)

Slice-level checks also verified: `tsa/*` references ≥4 files, bare slug check 0 hits, `is:inline` in Classic layout, `nav-toggle` in all three layouts.

## Diagnostics

- Silent routing failure mode: if slug comparisons revert to bare strings, all sites render Classic regardless of DB value. No build error — only visible by inspecting the rendered layout visually or checking `site.template_slug` in fixture data.
- CTA mobile check: open browser DevTools at 375px on a product page; the "Comprar en Amazon" / "Ver en Amazon" button should span the full content column width.
- Pros/cons mobile check: at 375px the two boxes should stack vertically; at ≥640px they sit side by side.

## Deviations

None — all changes matched the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `apps/generator/src/pages/index.astro` — slug comparisons updated to `tsa/modern`/`tsa/minimal`; else branch comment added
- `apps/generator/src/pages/categories/[slug].astro` — slug comparisons updated; else branch comment added
- `apps/generator/src/pages/products/[slug].astro` — slug comparisons updated; Minimal+Classic CTA changed to `block w-full text-center`; Minimal pros/cons grid changed to `grid-cols-1 sm:grid-cols-2`; else branch comment added
- `apps/generator/src/pages/[legal].astro` — slug comparisons updated; else branch comment added
- `.gsd/milestones/M012/slices/S06/tasks/T02-PLAN.md` — `## Observability Impact` section added (pre-flight fix)
