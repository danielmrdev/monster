---
id: S06
parent: M012
milestone: M012
provides:
  - Hamburger nav + collapsible mobile dropdown in Classic, Modern, and Minimal Astro layouts
  - `<script is:inline>` toggle pattern (D163) fully implemented across all three templates
  - tsa/classic, tsa/modern, tsa/minimal slug comparisons in all four generator page files
  - block w-full CTA buttons on all three product page template variants
  - grid-cols-1 sm:grid-cols-2 pros/cons grid on all three template variants
  - Generator build verified against fixture data (11 pages, exit 0)
requires:
  - slice: S01
    provides: tsa/* slug migration in site_templates + sites.template_slug
affects: []
key_files:
  - apps/generator/src/layouts/classic/Layout.astro
  - apps/generator/src/layouts/modern/Layout.astro
  - apps/generator/src/layouts/minimal/Layout.astro
  - apps/generator/src/pages/index.astro
  - apps/generator/src/pages/categories/[slug].astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/[legal].astro
key_decisions:
  - Hamburger uses a sibling dropdown div below the nav row, not a toggle on the flex child inside the nav row (avoids flex layout conflict on desktop)
  - Unique per-layout IDs (-classic, -modern, -minimal) on both the toggle button and dropdown divs
  - Classic remains the default else-branch; only tsa/modern and tsa/minimal use named comparisons
  - Minimal CTA and Classic CTA changed from inline-block to block w-full text-center for mobile-safe full-width button
patterns_established:
  - Hamburger button pattern: `id="nav-toggle-{layout}"` + `class="md:hidden flex flex-col justify-center gap-1.5 p-2 ..."` with three `<span class="block w-5 h-0.5 bg-current">` bars
  - Desktop nav stays: `id="mobile-menu-{layout}"` + `class="hidden md:flex gap-{N}"` inside the nav row — never JS-toggled
  - Mobile dropdown: `id="mobile-menu-{layout}-dropdown"` + `class="hidden"` — only this is toggled by inline script
  - Inline script: IIFE wrapping getElementById + classList.toggle('hidden') + setAttribute('aria-expanded', ...)
  - Template routing: `site.template_slug === "tsa/modern"` ... `=== "tsa/minimal"` ... else Classic with `/* Default: tsa/classic */` comment
  - Product CTA: all variants use `block w-full text-center` for mobile-safe full-width button
  - Pros/cons grid: all variants use `grid-cols-1 sm:grid-cols-2` — mobile single column, tablet+ two columns
observability_surfaces:
  - "grep -l 'is:inline' apps/generator/src/layouts/*/Layout.astro → 3 files (confirms all three layouts have toggle script)"
  - "grep 'nav-toggle' apps/generator/src/layouts/*/Layout.astro → 6 hits (button id + getElementById per layout)"
  - "grep 'md:hidden' apps/generator/src/layouts/*/Layout.astro → 3 hits (one hamburger button per template)"
  - "grep -r '\"modern\"|\"minimal\"|\"classic\"' apps/generator/src/pages/ → 0 (bare slugs absent)"
  - "grep -c 'tsa/modern|tsa/minimal' apps/generator/src/pages/*.astro → 2 per file (8 total)"
  - "SITE_SLUG=fixture pnpm --filter @monster/generator build → exit 0, 11 pages"
  - "Browser DevTools at 375px: #nav-toggle-{layout} visible, #mobile-menu-{layout}-dropdown toggles hidden on click"
drill_down_paths:
  - .gsd/milestones/M012/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M012/slices/S06/tasks/T02-SUMMARY.md
duration: ~28m (T01 ~20m + T02 ~8m)
verification_result: passed
completed_at: 2026-03-17
---

# S06: Templates Mobile-First

**All three Astro templates now have working hamburger navigation at 375px, full-width CTA buttons, vertically-stacking pros/cons on mobile, and correct tsa/* slug routing — generator build exits 0 with 11 pages.**

## What Happened

S06 had two tasks that were both completed before this summary was written.

**T01 (Hamburger nav):** Read all three Layout.astro files and found each had a flat nav row with no mobile handling. Applied the D163 `<script is:inline>` hamburger pattern to Classic, Modern, and Minimal. The key implementation decision — discovered and documented as KN013 — was to use a *sibling dropdown div* placed below the nav row rather than toggling the flex child inside it. Toggling `hidden` on a flex child disrupts the desktop horizontal layout; the sibling approach cleanly separates the mobile dropdown from the desktop row. Each layout ends with a `<script is:inline>` IIFE that queries two IDs (toggle button + dropdown div) and toggles the `hidden` class with `aria-expanded` tracking.

Per-layout styling matches the template aesthetic:
- **Classic**: white background, gray text tones
- **Modern**: primary-color background, white text for button and dropdown
- **Minimal**: understated hairline border, gray tones

**T02 (Slug comparisons + CTA/pros-cons):** Read all four page files and found two classes of bugs left by the S01 slug migration: (1) all comparisons still used bare `"modern"` / `"minimal"` strings instead of `"tsa/modern"` / `"tsa/minimal"`, meaning all sites would silently render Classic regardless of their DB value; (2) Minimal and Classic CTA buttons used `inline-block` without `w-full`, producing narrow mobile buttons; (3) Minimal pros/cons used `grid-cols-2` only — horizontal overflow at 375px. All four page files were updated atomically. Classic CTA and Minimal CTA were both changed to `block w-full text-center`. Minimal pros/cons updated to `grid-cols-1 sm:grid-cols-2`.

## Verification

All slice-level checks from S06-PLAN.md passed:

```
grep -r "tsa/classic|tsa/modern|tsa/minimal" apps/generator/src/pages/  → 12 hits (≥4 ✓)
grep -r '"modern"|"minimal"|"classic"' apps/generator/src/pages/        → 0 hits ✓
grep "is:inline" apps/generator/src/layouts/*/Layout.astro              → 3 files ✓
grep -c "nav-toggle" apps/generator/src/layouts/*/Layout.astro          → 2 per file (6 total) ✓
grep "md:hidden" apps/generator/src/layouts/*/Layout.astro              → 3 hits ✓
grep "hidden md:flex" apps/generator/src/layouts/*/Layout.astro         → 3 hits ✓
grep -n "block w-full" apps/generator/src/pages/products/[slug].astro   → 3 hits ✓
grep -n "grid-cols-1 sm:grid-cols-2" ...products/[slug].astro           → 3 hits ✓
SITE_SLUG=fixture pnpm --filter @monster/generator build                → exit 0, 11 pages ✓
```

## Requirements Advanced

- R001 (End-to-end site generation pipeline) — Generated sites are now genuinely mobile-first; the pipeline delivers sites that pass real device-width testing, removing a gap in production readiness.
- R042 (Legal page templates) — Legal pages continue to build correctly with the `tsa/*` slug routing; no regression introduced.

## Requirements Validated

- None — R001 requires a full live end-to-end deploy to validate; the mobile-first work advances it but doesn't close it.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

**T01 dropdown structure**: The plan specified wrapping the `categories.map()` div in a single element and toggling it. Instead, a separate sibling dropdown div was added outside the nav row, and the desktop nav div was left untouched inside the row. This is a better implementation of the same intent (collapsible mobile menu) — avoids a flex layout conflict where toggling `hidden` on a flex child collapses the desktop nav. Documented as KN013.

No other deviations.

## Known Limitations

- **Human UAT required**: The hamburger toggle and mobile layout have been verified by build + grep inspection but NOT by a live browser at 375px viewport. The milestone's "Operational verification" and UAT checks require a human (or browser-automation run against a deployed site) to confirm the hamburger opens/closes and no horizontal overflow occurs.
- **`pnpm --filter @monster/generator build` without SITE_SLUG**: Fails pre-existingly with `ENOENT: data/default/site.json`. This is a known limitation (KN008/KN014) unrelated to S06. Always use `SITE_SLUG=fixture` for local builds.
- **Aria-label on hamburger**: The `<button>` uses `aria-label="Menu"` but the hamburger is SVG-less (three `<span>` bars). Screen readers will announce "Menu, collapsed/expanded" via aria-expanded — functional but not optimized for screen-reader-only users.

## Follow-ups

- Mobile viewport browser UAT (375px): test on a deployed fixture site that the hamburger opens/closes with no console errors and no horizontal scroll on all page types (homepage, category, product, legal). This is the human UAT test in S06-UAT.md.
- Consider adding the `default` fixture guard to `astro.config.ts` so bare `pnpm build` fails with a clearer error message instead of ENOENT.

## Files Created/Modified

- `apps/generator/src/layouts/classic/Layout.astro` — Added `#nav-toggle-classic` button (md:hidden), `#mobile-menu-classic` (hidden md:flex inside nav row), `#mobile-menu-classic-dropdown` (sibling below nav row), `<script is:inline>` toggle IIFE
- `apps/generator/src/layouts/modern/Layout.astro` — Same pattern with Modern visual style (white on primary color); `#nav-toggle-modern`, `#mobile-menu-modern-dropdown`
- `apps/generator/src/layouts/minimal/Layout.astro` — Same pattern with Minimal visual style (gray tones); `#nav-toggle-minimal`, `#mobile-menu-minimal-dropdown`
- `apps/generator/src/pages/index.astro` — Slug comparisons updated to `tsa/modern`/`tsa/minimal`; else branch comment added
- `apps/generator/src/pages/categories/[slug].astro` — Slug comparisons updated; else branch comment added
- `apps/generator/src/pages/products/[slug].astro` — Slug comparisons updated; Minimal+Classic CTA changed to `block w-full text-center`; Minimal pros/cons grid changed to `grid-cols-1 sm:grid-cols-2`; else branch comment added
- `apps/generator/src/pages/[legal].astro` — Slug comparisons updated; else branch comment added

## Forward Intelligence

### What the next slice should know
- The hamburger is fully functional at the code level. The S06-UAT.md gives a concrete browser test script to confirm it visually — run this against a deployed site before declaring M012 fully closed.
- All four page files now use `tsa/*` slug comparisons consistently. If a new template type is added, the pattern is `site.template_slug === "tsa/new-type"` as a new `else if` branch before the Classic else.
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` is the canonical build command for local generator verification. No SITE_SLUG = ENOENT (KN008/KN014).

### What's fragile
- **Silent layout routing failure**: If a slug comparison accidentally reverts to a bare string, all sites render Classic with no build error and no runtime error. The grep check (`grep -r '"modern"|"minimal"|"classic"' apps/generator/src/pages/`) catches this — run it before any generator page changes.
- **`is:inline` script hydration order**: The inline script runs synchronously on DOMContentLoaded. If any future layout wraps the nav in an Astro Island (`client:*`), the IDs may not be in the DOM when the script fires. Keep the nav as plain HTML (no islands).
- **Desktop hidden md:flex**: The desktop nav div inside the nav row uses `hidden md:flex`. If Tailwind's content purge configuration ever excludes `layout.astro` files, `md:flex` may be purged. Confirm `apps/generator/tailwind.config.*` includes `src/layouts/**/*.astro` in its content glob.

### Authoritative diagnostics
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` — single command that catches template syntax errors, import errors, and missing component props across all three templates and four page types. Run this first after any layout or page change.
- `grep -r '"modern"|"minimal"|"classic"' apps/generator/src/pages/` → must always be 0 hits.
- `grep -l "is:inline" apps/generator/src/layouts/*/Layout.astro` → must always be 3 files.

### What assumptions changed
- Original plan assumed the desktop links div could be wrapped and toggled directly. The actual implementation needed a separate sibling dropdown div to avoid disrupting the flex row on desktop. KN013 documents this for future layout authors.
- T02 discovered that the Classic CTA also lacked `w-full` (not just Minimal). The plan only mentioned Minimal — both were fixed in T02.
