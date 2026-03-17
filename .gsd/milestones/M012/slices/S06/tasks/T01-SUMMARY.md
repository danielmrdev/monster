---
id: T01
parent: S06
milestone: M012
provides:
  - Hamburger nav + collapsible mobile menu in Classic, Modern, and Minimal Astro layouts
  - `<script is:inline>` toggle pattern (D163) for zero-bundle mobile nav across all three templates
key_files:
  - apps/generator/src/layouts/classic/Layout.astro
  - apps/generator/src/layouts/modern/Layout.astro
  - apps/generator/src/layouts/minimal/Layout.astro
key_decisions:
  - Used a separate dropdown `<div>` below the `<nav>` row (not inside it) so the mobile menu expands below the header without disrupting the flex row layout
  - Used unique suffixed IDs (`-classic`, `-modern`, `-minimal`) per layout to future-proof against nested layout scenarios
  - Desktop `hidden md:flex` div retained inside the `<nav>` row; mobile dropdown is a sibling `<div>` of the `<header>` inner container
patterns_established:
  - Hamburger button: `id="nav-toggle-{layout}"` + `class="md:hidden flex flex-col justify-center gap-1.5 p-2 ..."` with three `<span class="block w-5 h-0.5 bg-current">` bars
  - Desktop category links: `id="mobile-menu-{layout}"` + `class="hidden md:flex gap-{N}"` — hidden mobile, flex desktop
  - Mobile dropdown: `id="mobile-menu-{layout}-dropdown"` + `class="hidden"` — toggled by inline script
  - Inline script: IIFE wrapping `getElementById` + `classList.toggle('hidden')` + `setAttribute('aria-expanded', ...)`
observability_surfaces:
  - "grep -l 'is:inline' apps/generator/src/layouts/*/Layout.astro → 3 files (confirms all three templates have toggle script)"
  - "grep 'nav-toggle' apps/generator/src/layouts/*/Layout.astro → 6 hits (button id + getElementById per layout)"
  - "grep 'md:hidden' apps/generator/src/layouts/*/Layout.astro → 3 hits (one hamburger button per template)"
  - "Browser DevTools: #nav-toggle-{layout} button, #mobile-menu-{layout}-dropdown div — toggle 'hidden' class on click"
  - "SITE_SLUG=fixture pnpm --filter @monster/generator build → exits 0 (fixture build verifies template compilation)"
duration: ~20m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Add hamburger nav to Classic, Modern, and Minimal layouts

**Added hamburger button + collapsible mobile dropdown to all three Astro layout files using `<script is:inline>` pattern with unique per-layout IDs.**

## What Happened

Read all three Layout.astro files to understand existing nav structure. Each had a flat `<nav>` row with the site name and a `div` of category links — no mobile handling.

Applied the D163 `<script is:inline>` hamburger pattern to each:

1. **Classic** (`border-b bg-white` header): Added `#nav-toggle-classic` button (`md:hidden`) and `#mobile-menu-classic-dropdown` sibling div. Desktop links kept in `#mobile-menu-classic hidden md:flex gap-4` inside the nav row.

2. **Modern** (sticky colored header with `var(--color-primary)` background): Same pattern with white-tinted button and dropdown matching header background color. IDs: `-modern`.

3. **Minimal** (understated hairline border header): Used text-gray tones matching the minimal aesthetic. The existing `<nav>` element was preserved as the desktop link container. IDs: `-minimal`.

Each layout ends with a `<script is:inline>` IIFE that queries the two IDs and toggles `hidden` + updates `aria-expanded` on click.

Pre-flight: Added `## Observability / Diagnostics` section to S06-PLAN.md and `## Observability Impact` section to T01-PLAN.md as required.

## Verification

```
# All 3 layouts have is:inline
grep -l "is:inline" apps/generator/src/layouts/*/Layout.astro
→ 3 files ✓

# Hamburger md:hidden present in all 3
grep "md:hidden" apps/generator/src/layouts/*/Layout.astro
→ 3 hits ✓

# nav-toggle IDs present (button + getElementById = 2 hits per file)
grep "nav-toggle" apps/generator/src/layouts/*/Layout.astro
→ 6 hits ✓

# Desktop hidden md:flex preserved in all 3
grep "hidden md:flex" apps/generator/src/layouts/*/Layout.astro
→ 3 hits ✓

# Build with fixture site data exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator build
→ 11 pages built ✓
```

The `pnpm --filter @monster/generator build` (no SITE_SLUG) fails with `ENOENT: no such file or directory, open .../data/default/site.json` — confirmed pre-existing before our changes (verified via `git stash` + rebuild). The fixture-based build exits 0 and renders all template variants correctly.

## Diagnostics

- `grep -l "is:inline" apps/generator/src/layouts/*/Layout.astro` → 3 files (missing = that layout lacks toggle script)
- `grep "md:hidden" apps/generator/src/layouts/*/Layout.astro` → 3 hits (missing = hamburger button absent)
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` → exits 0 with 11 pages (template parse errors surface here)
- Browser DevTools at 375px: `#nav-toggle-{layout}` button visible, `#mobile-menu-{layout}` div hidden, `#mobile-menu-{layout}-dropdown` div hidden; click button → dropdown appears (no console errors expected)

## Deviations

- **Dropdown structure**: Plan specified wrapping the `categories.map()` div in a single element and toggling it. Instead, kept the desktop `hidden md:flex` div inside the nav row (desktop layout preserved) and added a separate sibling dropdown `<div>` outside the nav row for the mobile expanded menu. This avoids a flex-layout conflict where toggling `hidden` on a flex child would break the horizontal nav row on desktop. The plan intent (collapsible mobile menu) is fully met.

## Known Issues

- `pnpm --filter @monster/generator build` (default SITE_SLUG) fails pre-existingly due to missing `apps/generator/src/data/default/site.json`. This is unrelated to T01 and should be addressed by ensuring the `default` slug is either removed from the config or a fixture is provided.

## Files Created/Modified

- `apps/generator/src/layouts/classic/Layout.astro` — Added hamburger button (`#nav-toggle-classic`), desktop `hidden md:flex` nav, mobile dropdown (`#mobile-menu-classic-dropdown`), `<script is:inline>` toggle
- `apps/generator/src/layouts/modern/Layout.astro` — Same pattern with Modern visual style (white on primary color); `#nav-toggle-modern`, `#mobile-menu-modern-dropdown`
- `apps/generator/src/layouts/minimal/Layout.astro` — Same pattern with Minimal visual style (gray tones); `#nav-toggle-minimal`, `#mobile-menu-minimal-dropdown`
- `.gsd/milestones/M012/slices/S06/S06-PLAN.md` — Added `## Observability / Diagnostics` section and enhanced Verification block
- `.gsd/milestones/M012/slices/S06/tasks/T01-PLAN.md` — Added `## Observability Impact` section
