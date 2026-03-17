# S06: Templates Mobile-First

**Goal:** Add working hamburger navigation to all three Astro templates at 375px viewport, ensure product page CTAs are full-width on mobile, and update all template switch logic to use `tsa/*` slugs (migrated in S01).
**Demo:** Resize browser to 375px on any generated site — hamburger icon appears in the header; clicking it toggles a dropdown nav menu. Product page "View on Amazon" button spans the full width on mobile. No horizontal scroll on any page type.

## Must-Haves

- Classic, Modern, and Minimal Layout.astro each have a hamburger button + mobile menu using `<script is:inline>` toggle (D163)
- Hamburger shows on mobile (≤768px), horizontal nav hides on mobile
- All product page CTA buttons have `w-full` class at mobile breakpoint across all three templates
- Pros/cons grid uses `grid-cols-1 sm:grid-cols-2` on all three templates (already done on Classic per code inspection — verify Modern/Minimal)
- All four page files (`index.astro`, `[slug].astro` (categories), `[slug].astro` (products), `[legal].astro`) updated to use `tsa/classic`, `tsa/modern`, `tsa/minimal` comparison strings
- `pnpm --filter @monster/generator build` exits 0

## Observability / Diagnostics

- **Hamburger toggle:** Open browser DevTools console on any generated site at 375px — clicking hamburger should show no JS errors; `#mobile-menu-*` elements should toggle `hidden` class.
- **Build signals:** `pnpm --filter @monster/generator build` prints Astro build summary to stdout; any template syntax error surfaces as a red error with file path and line number.
- **Grep inspection surfaces:**
  - `grep -r "is:inline" apps/generator/src/layouts/` — confirms inline scripts are present
  - `grep -r "nav-toggle" apps/generator/src/layouts/` — confirms hamburger button IDs
  - `grep -r "mobile-menu" apps/generator/src/layouts/` — confirms menu div IDs
- **Failure visibility:** If a layout is missing the inline script, the hamburger button renders but clicking it has no effect (silent failure). The grep checks above catch this before deployment. If Tailwind classes are wrong, `md:hidden`/`hidden md:flex` mismatches cause visible layout breaks at desktop or mobile widths.
- **Redaction:** No secrets, API keys, or user data in template files — safe to grep and log freely.

## Verification

- `grep -r "tsa/classic\|tsa/modern\|tsa/minimal" apps/generator/src/pages/` → ≥4 hits (one per page file)
- `grep -r '"modern"\|"minimal"\|"classic"' apps/generator/src/pages/` → 0 hits (bare slug references removed)
- `grep "is:inline" apps/generator/src/layouts/classic/Layout.astro` → hit
- `grep "nav-toggle" apps/generator/src/layouts/classic/Layout.astro apps/generator/src/layouts/modern/Layout.astro apps/generator/src/layouts/minimal/Layout.astro` → 3 hits (one per layout, failure state = missing hamburger in that template)
- `pnpm --filter @monster/generator build` exits 0

## Tasks

- [x] **T01: Add hamburger nav to Classic, Modern, and Minimal layouts** `est:45m`
  - Why: All three templates have horizontal nav that breaks on 375px — no mobile menu exists.
  - Files: `apps/generator/src/layouts/classic/Layout.astro`, `apps/generator/src/layouts/modern/Layout.astro`, `apps/generator/src/layouts/minimal/Layout.astro`
  - Do: For each layout: (1) Add a hamburger `<button id="nav-toggle" class="md:hidden ..." aria-label="Menu">` with a simple SVG icon (3 bars) to the `<nav>` header. (2) Wrap the category link list in a `<div id="mobile-menu" class="hidden md:flex flex-col md:flex-row ...">`. (3) Add `<script is:inline>` at the end of the layout file with: `document.getElementById('nav-toggle').addEventListener('click', function() { document.getElementById('mobile-menu').classList.toggle('hidden'); });`. (4) Keep the desktop horizontal layout intact using `md:flex`. Use `hidden` / `md:flex` for the category nav div; `md:hidden` for the hamburger button. D163 pattern.
  - Verify: `grep "is:inline" apps/generator/src/layouts/classic/Layout.astro apps/generator/src/layouts/modern/Layout.astro apps/generator/src/layouts/minimal/Layout.astro` → 3 hits; `pnpm --filter @monster/generator build` exits 0.
  - Done when: All three layouts have hamburger + inline script; build exits 0.

- [x] **T02: Update template slug comparisons and verify CTA/pros-cons mobile classes** `est:30m`
  - Why: S01 migrated DB slugs to `tsa/*` — page files still compare against bare strings. CTA button and pros-cons grid mobile responsiveness must be consistent across all templates.
  - Files: `apps/generator/src/pages/index.astro`, `apps/generator/src/pages/categories/[slug].astro`, `apps/generator/src/pages/products/[slug].astro`, `apps/generator/src/pages/[legal].astro`
  - Do: In all four page files, replace all `site.template_slug === "modern"` with `site.template_slug === "tsa/modern"` and `=== "minimal"` with `=== "tsa/minimal"`. The default/else branch serves `tsa/classic` — no explicit check needed but add a comment. Check each product page template variant for the CTA button: confirm `w-full` class on all three template branches. Check pros/cons grid on Modern and Minimal product page variants — if they don't have `grid-cols-1 sm:grid-cols-2`, add it. Run `pnpm --filter @monster/generator build`.
  - Verify: `grep -r '"modern"\|"minimal"\|"classic"' apps/generator/src/pages/` returns 0 hits; `grep -r "tsa/modern\|tsa/minimal" apps/generator/src/pages/` returns ≥4 hits; `pnpm --filter @monster/generator build` exits 0.
  - Done when: No bare slug strings remain; build exits 0.

## Files Likely Touched

- `apps/generator/src/layouts/classic/Layout.astro`
- `apps/generator/src/layouts/modern/Layout.astro`
- `apps/generator/src/layouts/minimal/Layout.astro`
- `apps/generator/src/pages/index.astro`
- `apps/generator/src/pages/categories/[slug].astro`
- `apps/generator/src/pages/products/[slug].astro`
- `apps/generator/src/pages/[legal].astro`
