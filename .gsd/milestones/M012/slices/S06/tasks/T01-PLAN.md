---
estimated_steps: 5
estimated_files: 3
---

# T01: Add hamburger nav to Classic, Modern, and Minimal layouts

**Slice:** S06 — Templates Mobile-First
**Milestone:** M012

## Description

Add a hamburger button + collapsible mobile menu to all three Astro layout files using the `<script is:inline>` pattern (D163). No JS bundle, no dependencies.

## Steps

1. Read all three Layout.astro files (classic, modern, minimal) — understand current nav structure.
2. For Classic: in the `<nav>` element, add a hamburger `<button id="nav-toggle-classic" class="md:hidden flex flex-col gap-1 p-2">` with three `<span class="block w-5 h-0.5 bg-current">` bars. Wrap the `categories.map()` div in `<div id="mobile-menu-classic" class="hidden md:flex gap-4 flex-col md:flex-row ...">`. Add `<script is:inline>` before `</body>` that queries by id and toggles `hidden`.
3. Repeat the same pattern for Modern and Minimal, using unique IDs (`-modern`, `-minimal`) to avoid any potential ID collisions if layouts are somehow nested (future-proofing).
4. Ensure the desktop nav layout is preserved: `hidden md:flex` on the categories div keeps horizontal layout on desktop.
5. Run `pnpm --filter @monster/generator check` then `pnpm --filter @monster/generator build`.

## Must-Haves

- [ ] Classic/Modern/Minimal each have hamburger button hidden on `md:` and above
- [ ] Category nav div hidden on mobile, flex on `md:` and above
- [ ] `<script is:inline>` toggle present in each layout
- [ ] `pnpm --filter @monster/generator build` exits 0

## Observability Impact

- **New DOM elements:** Each layout gains `#nav-toggle-{classic|modern|minimal}` button and `#mobile-menu-{classic|modern|minimal}` div — inspectable via browser DevTools or `querySelector`.
- **Inline script signal:** `<script is:inline>` block adds a click listener; errors surface in the browser console at runtime (e.g., if the element IDs don't match).
- **Verification surfaces:**
  - `grep -l "is:inline" apps/generator/src/layouts/*/Layout.astro` → should return 3 file paths
  - `grep "md:hidden" apps/generator/src/layouts/*/Layout.astro` → 3 hits (one hamburger button per template)
  - `grep "mobile-menu" apps/generator/src/layouts/*/Layout.astro` → 6 hits (ID + querySelector reference per template)
- **Failure state:** If a layout has the button but no inline script, the hamburger renders but click does nothing — detectable via missing `is:inline` grep hit for that file. If `hidden md:flex` classes are wrong, desktop nav collapses — detectable visually at ≥768px or via Tailwind class audit.
- **No secrets or PII involved.**

## Verification

- `grep -l "is:inline" apps/generator/src/layouts/classic/Layout.astro apps/generator/src/layouts/modern/Layout.astro apps/generator/src/layouts/minimal/Layout.astro` → 3 files
- `grep "md:hidden" apps/generator/src/layouts/classic/Layout.astro` → hit (hamburger)
- `pnpm --filter @monster/generator build` exits 0

## Inputs

- `apps/generator/src/layouts/classic/Layout.astro` — read first
- `apps/generator/src/layouts/modern/Layout.astro` — read first
- `apps/generator/src/layouts/minimal/Layout.astro` — read first

## Expected Output

- All three Layout.astro files updated with hamburger nav + inline toggle script
