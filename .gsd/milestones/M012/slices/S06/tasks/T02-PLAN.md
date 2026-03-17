---
estimated_steps: 5
estimated_files: 4
---

# T02: Update template slug comparisons and verify CTA/pros-cons mobile classes

**Slice:** S06 — Templates Mobile-First
**Milestone:** M012

## Description

Update all four Astro page files to compare against `tsa/classic`, `tsa/modern`, `tsa/minimal` slugs (S01 migrated the DB). Verify and fix CTA button and pros/cons grid mobile classes on all template variants.

## Steps

1. Read all four page files: `index.astro`, `categories/[slug].astro`, `products/[slug].astro`, `[legal].astro`. Note all `site.template_slug === "modern"` and `=== "minimal"` comparisons.
2. Replace `=== "modern"` with `=== "tsa/modern"` and `=== "minimal"` with `=== "tsa/minimal"` across all four files. Add comment `{/* tsa/classic is the default */}` near each else branch.
3. In `products/[slug].astro`: inspect all three template variants' CTA button — ensure each has `w-full` class (not just `block` or `text-center` alone). Add `w-full` where missing.
4. In `products/[slug].astro`: inspect pros/cons grid on Modern and Minimal variants — ensure `grid-cols-1 sm:grid-cols-2` is present. Classic already has this (line 63). Add to Modern/Minimal if missing.
5. Run `pnpm --filter @monster/generator build` and fix any errors.

## Must-Haves

- [ ] No bare `"modern"` or `"minimal"` comparison strings in any page file
- [ ] `tsa/modern` and `tsa/minimal` used in comparisons
- [ ] CTA button has `w-full` on all three template variants in products page
- [ ] Pros/cons grid uses `grid-cols-1 sm:grid-cols-2` on all three template variants
- [ ] `pnpm --filter @monster/generator build` exits 0

## Verification

- `grep -r '"modern"\|"minimal"\|"classic"' apps/generator/src/pages/` → 0 results
- `grep -c "tsa/modern\|tsa/minimal" apps/generator/src/pages/index.astro apps/generator/src/pages/categories/[slug].astro apps/generator/src/pages/products/[slug].astro apps/generator/src/pages/[legal].astro` → ≥8 total (2 per file)
- `pnpm --filter @monster/generator build` exits 0

## Inputs

- `apps/generator/src/pages/index.astro` — read first
- `apps/generator/src/pages/categories/[slug].astro`
- `apps/generator/src/pages/products/[slug].astro`
- `apps/generator/src/pages/[legal].astro`
- S01 completed — DB slugs are `tsa/*`; slug comparisons must match

## Expected Output

- All four page files updated with `tsa/*` slug comparisons
- CTA and pros/cons mobile classes consistent across templates

## Observability Impact

**What changes are observable at runtime:**
- Template routing branches now activate correctly when `site.template_slug` is `"tsa/modern"` or `"tsa/minimal"`. Previously, no site using the new DB slugs would render a Modern or Minimal layout — all fell through to Classic silently.
- CTA button is now full-width (`block w-full`) on Minimal and Classic product pages — visible at 375px viewport as a button that spans the content column.
- Minimal pros/cons grid stacks to single column on mobile (`grid-cols-1`) and splits at `sm:` breakpoint — previously the two columns were always side-by-side on narrow screens causing overflow.

**How a future agent inspects this task:**
- `grep -r '"modern"\|"minimal"\|"classic"' apps/generator/src/pages/` → must return 0 results (bare slugs removed)
- `grep -c "tsa/modern\|tsa/minimal" apps/generator/src/pages/index.astro apps/generator/src/pages/categories/[slug].astro apps/generator/src/pages/products/[slug].astro apps/generator/src/pages/[legal].astro` → 2 per file (8 total)
- `grep -n "block w-full" apps/generator/src/pages/products/[slug].astro` → 3 hits (one per template CTA)
- `grep -n "grid-cols-1 sm:grid-cols-2" apps/generator/src/pages/products/[slug].astro` → 3 hits (one per template pros/cons grid)

**Failure state visibility:**
- If slug comparisons are wrong: all sites render Classic layout regardless of DB value. No build error — purely a silent rendering bug detectable only visually or via template_slug fixture test.
- If CTA is `inline-block` without `w-full`: button width is content-driven on mobile, causing misaligned or narrow buttons on small screens. Visible in browser at 375px.
- If pros/cons uses `grid-cols-2` only: two-column layout appears on 375px causing text overflow or horizontal scroll on narrow viewports.
