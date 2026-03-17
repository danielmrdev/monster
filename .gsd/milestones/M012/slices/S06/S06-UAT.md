---
id: S06
parent: M012
milestone: M012
---

# S06: Templates Mobile-First — UAT

**Milestone:** M012
**Written:** 2026-03-17

## UAT Type

- UAT mode: live-runtime + artifact-driven
- Why this mode is sufficient: The core logic (hamburger toggle, slug routing, CTA width, pros/cons grid) can be verified by build artifact inspection for the slug/class changes, but the hamburger interaction and visual layout require a live browser at 375px. The artifact-driven checks confirm correctness of the generated HTML; the live-runtime checks confirm interactive behavior and visual rendering.

## Preconditions

1. `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 and produces output in `apps/generator/.generated-sites/fixture/dist/`
2. A static file server is running on the built output, e.g.:
   ```bash
   cd apps/generator/.generated-sites/fixture/dist
   npx serve . -p 4321
   ```
   Or: open `apps/generator/.generated-sites/fixture/dist/index.html` directly in a browser.
3. Browser DevTools available (any modern Chromium/Firefox).

## Smoke Test

Open `http://localhost:4321` (or the dist `index.html`) in a browser. Resize the viewport to 375px wide. Confirm the hamburger icon (three horizontal bars) is visible in the top-right of the header and the category nav links are hidden. If both are true, the basic mobile layout is working.

## Test Cases

### 1. Classic template — hamburger opens and closes at 375px

1. Set browser viewport to 375px wide.
2. Navigate to the homepage (fixture site uses Classic template by default).
3. Confirm: horizontal nav links (category names) are **not visible** in the header row.
4. Confirm: a hamburger button (three horizontal bars) is visible in the top-right of the header.
5. Click the hamburger button.
6. **Expected:** A vertical dropdown menu appears below the header with the category links. No JavaScript console errors. The button's `aria-expanded` attribute changes to `"true"`.
7. Click the hamburger button again.
8. **Expected:** The dropdown closes (disappears). `aria-expanded` returns to `"false"`.

### 2. Product page CTA is full-width on mobile (all three templates)

1. Navigate to any product page (e.g. `/products/philips-hd9252-90/`).
2. Set browser viewport to 375px wide.
3. Locate the affiliate CTA button ("Comprar en Amazon" or "Ver en Amazon").
4. **Expected:** The button spans the full width of the content column — it is not a narrow inline button. It should visually fill the content area.
5. If the fixture uses Classic, change the fixture's `template_slug` to `tsa/modern` in `apps/generator/src/data/fixture/site.json`, rebuild with `SITE_SLUG=fixture pnpm --filter @monster/generator build`, and repeat the test for Modern.
6. Repeat for `tsa/minimal`.
7. **Expected:** All three template variants show a full-width CTA button at 375px.

### 3. Pros/cons grid stacks vertically on mobile

1. Navigate to any product page that has pros and cons content (fixture products include pros_cons data).
2. Set browser viewport to 375px wide.
3. Locate the Pros and Cons section below the product description.
4. **Expected:** The pros box and cons box stack **vertically** (pros on top, cons below). No horizontal overflow, no side-by-side layout.
5. Widen the viewport to 640px or more.
6. **Expected:** The pros and cons boxes appear **side by side** (two-column grid).

### 4. No horizontal scroll on any page type at 375px

1. At 375px viewport, visit each page type in sequence:
   - Homepage: `http://localhost:4321/`
   - Category page: `http://localhost:4321/categories/freidoras-de-aire/`
   - Product page: `http://localhost:4321/products/philips-hd9252-90/`
   - Legal page: `http://localhost:4321/privacidad/`
2. On each page, verify: `document.documentElement.scrollWidth === window.innerWidth` (check via DevTools console).
3. **Expected:** All four page types have zero horizontal overflow (scrollWidth equals viewport width). No scrollbar appears at the bottom of any page.

### 5. Template slug routing — Modern and Minimal templates render

1. Open `apps/generator/src/data/fixture/site.json`.
2. Change `"template_slug": "tsa/classic"` to `"template_slug": "tsa/modern"`.
3. Run `SITE_SLUG=fixture pnpm --filter @monster/generator build`.
4. **Expected:** Build exits 0. Open the built homepage — it should render with the Modern template's colored header (background uses `--color-primary` CSS variable).
5. Repeat with `"tsa/minimal"`.
6. **Expected:** Build exits 0. Minimal template renders with understated hairline border header.
7. **Expected for both**: The hamburger button appears at 375px in all three template variants.

### 6. Hamburger toggle — Modern and Minimal layouts

1. Build and serve with `tsa/modern` slug (from Test Case 5).
2. At 375px viewport, click the hamburger button.
3. **Expected:** Dropdown appears with Modern template styling (primary-color background, white text links). No console errors.
4. Repeat with `tsa/minimal`.
5. **Expected:** Dropdown appears with Minimal template styling (white/light gray background, border-top separator). No console errors.

## Edge Cases

### Viewport at desktop breakpoint (1024px) — hamburger hidden, nav visible

1. Set viewport to 1024px.
2. **Expected:** Hamburger button is NOT visible. Category nav links appear in the header row horizontally. Clicking on any link in the header row navigates correctly (these are standard anchor links, not toggled by JS).

### Fixture has no categories — empty mobile menu

1. Edit `apps/generator/src/data/fixture/site.json` to set `categories: []`.
2. Rebuild and serve.
3. Click the hamburger at 375px.
4. **Expected:** Mobile dropdown opens but shows no category links (empty dropdown). No JS errors. The dropdown should still render visibly (it has a border-top).
5. Restore the original fixture data.

### Bare slug in site.json (regression check)

1. Edit `apps/generator/src/data/fixture/site.json` to set `"template_slug": "modern"` (no `tsa/` prefix).
2. Rebuild.
3. **Expected:** Build exits 0, but the rendered site uses the Classic layout (since `"modern" !== "tsa/modern"` falls through to the else-branch). This is the pre-S01 failure mode — confirm the Classic layout renders, not an error.
4. Restore `"tsa/modern"`. This test confirms the routing is defensive (no crash on unrecognized slug).

## Failure Signals

- **Hamburger visible but clicking does nothing**: `<script is:inline>` is missing or the IDs in the script don't match the button/dropdown IDs. Run `grep "is:inline" apps/generator/src/layouts/*/Layout.astro` — should return 3 files.
- **Horizontal scroll at 375px**: A fixed-width element or `min-width` constraint is causing overflow. Check the product image gallery, pros/cons grid, or nav row. The pros/cons fix is `grid-cols-1 sm:grid-cols-2` — if only `grid-cols-2`, overflow will occur at 375px.
- **Modern/Minimal templates always render Classic**: Slug comparisons reverted to bare strings. Run `grep -r '"modern"\|"minimal"\|"classic"' apps/generator/src/pages/` — must return 0 results.
- **CTA button narrow on mobile**: The `block w-full` class is missing. Check `grep -n "block w-full" apps/generator/src/pages/products/[slug].astro` — must return 3 hits.
- **Build exits non-zero**: Template syntax error. Check the Astro error output for file path and line number. Most likely cause: unclosed JSX expression or missing prop in a layout.
- **`data/default/site.json` ENOENT**: `SITE_SLUG` not set. Always use `SITE_SLUG=fixture pnpm --filter @monster/generator build`.

## Requirements Proved By This UAT

- R001 (End-to-end site generation pipeline) — Generated sites pass a real mobile viewport test. The pipeline now delivers genuinely mobile-first static sites, closing the last gap in Phase 1 production-readiness at the template layer.

## Not Proven By This UAT

- Live end-to-end deploy: A site built with `tsa/modern` or `tsa/minimal` has not been deployed to a real VPS and tested through Caddy + Cloudflare. This requires human UAT with live credentials.
- Real DB slug values: The fixture file's `template_slug` is set manually in these tests. Proof that DB sites with `tsa/modern` slug (post-S01 migration) actually render Modern requires a live deploy from the admin panel.
- Performance at mobile: Lighthouse or WebPageTest mobile score not measured. The hamburger implementation uses `<script is:inline>` with no blocking resources — the expectation is no regression from the original templates.

## Notes for Tester

- The fixture site is a Spanish air fryer affiliate site (`freidoras-de-aire`). All text and CTA buttons will be in Spanish ("Comprar en Amazon"). This is expected.
- The fixture `template_slug` defaults to `tsa/classic`. To test Modern/Minimal, manually edit `apps/generator/src/data/fixture/site.json` and rebuild — no admin panel changes needed.
- The build takes ~3 seconds. After any fixture edit, wait for the full build before refreshing the browser.
- The dropdown menu ID suffix matches the template: `-classic-dropdown`, `-modern-dropdown`, `-minimal-dropdown`. Use DevTools element inspection to confirm the correct IDs are present after a template switch.
- Known pre-existing limitation: `pnpm --filter @monster/generator build` (no SITE_SLUG) fails with ENOENT. This is not a regression from S06. Always use `SITE_SLUG=fixture`.
