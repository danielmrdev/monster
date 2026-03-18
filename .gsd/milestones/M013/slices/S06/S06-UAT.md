# S06: Homepage Design Completeness — UAT

**Milestone:** M013
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All four design gaps are verifiable by inspecting the built static HTML in `dist/index.html` without running a dev server. The canonical build output is deterministic and grep-able. No live server or user interaction is needed to confirm correctness.

## Preconditions

1. Working directory is `/home/daniel/monster`
2. `SITE_SLUG=fixture pnpm --filter @monster/generator build` has been run and exited 0
3. Built output exists at `apps/generator/.generated-sites/fixture/dist/index.html`

Quick precondition check:
```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
# Must exit 0 and print "15 page(s) built"
```

## Smoke Test

```bash
grep -i 'freidoras de aire' apps/generator/.generated-sites/fixture/dist/index.html | grep -i h1
```
**Expected:** One line containing `<h1` and `freidoras de aire`. If this returns nothing, S06 is broken.

---

## Test Cases

### 1. H1 uses focus_keyword, not site name

```bash
DIST=apps/generator/.generated-sites/fixture/dist/index.html
grep -i '<h1' "$DIST"
```

**Expected:**
- The `<h1>` tag contains `freidoras de aire` (the fixture `focus_keyword`)
- The `<h1>` tag does NOT contain `Airfryer Pro ES` (the site `name`)
- The H1 appears inside the hero section (before the category grid)

**Failure signal:** If `<h1>Airfryer Pro ES</h1>` appears, the `focus_keyword ?? site.name` fallback expression was reverted or not applied.

---

### 2. Prose SEO text section at bottom

```bash
DIST=apps/generator/.generated-sites/fixture/dist/index.html
grep 'prose prose-sm max-w-none text-gray-600' "$DIST"
```

**Expected:** One match showing the prose container div. The `freidoras de aire` keyword and the fixture SEO text content should appear inside this div.

Confirm content rendering:
```bash
grep -o 'freidoras de aire.*han revolucionado' apps/generator/.generated-sites/fixture/dist/index.html | head -1
```
**Expected:** Matches — the fixture `homepage_seo_text` paragraph was rendered.

**Failure signal:** No `prose` class in the HTML means the SEO section was not rendered (null check may have failed or the import of `marked` is broken).

---

### 3. Centered logo header (grid-cols-3)

```bash
DIST=apps/generator/.generated-sites/fixture/dist/index.html
grep 'grid grid-cols-3' "$DIST"
```

**Expected:** One match in the `<nav>` element. The nav should contain three cells in order: hamburger button (left), logo anchor (center), desktop nav links (right).

Verify three-cell structure:
```bash
grep -oP 'grid grid-cols-3[^>]+>.{0,200}' apps/generator/.generated-sites/fixture/dist/index.html | head -1
```
**Expected:** Output contains `hamburger`, `justify-center` (center cell), and `md:flex gap-4 justify-end` (right cell) in sequence.

**Failure signal:** `flex h-14 items-center justify-between` in the nav means the old layout was not replaced.

---

### 4. Category cards have image/placeholder block above description text

```bash
DIST=apps/generator/.generated-sites/fixture/dist/index.html
grep 'bg-gray-100' "$DIST"
```

**Expected:** At least 2 matches (one per category card) — the `bg-gray-100 h-40` placeholder div appears because fixture `category_image` is null for all categories.

Verify placeholder structure (not an empty `<img src="">`):
```bash
grep -c 'src=""' apps/generator/.generated-sites/fixture/dist/index.html
```
**Expected:** Prints `0`. Any non-zero count means null category images were rendered as broken `<img>` tags.

Verify description text appears in card:
```bash
grep 'Las mejores freidoras de aire para cocinar' apps/generator/.generated-sites/fixture/dist/index.html
```
**Expected:** Matches — the category `description` field is rendered in the card's text block below the image/placeholder.

**Failure signal:** `src=""` count > 0 means the null-guard on category_image was not applied.

---

### 5. Zero direct Amazon affiliate URLs (regression check)

```bash
grep -oP 'href="[^"]*amazon\.[^"]*"' apps/generator/.generated-sites/fixture/dist/index.html
```

**Expected:** No output (exit code 1 is fine — `grep` exits 1 when no matches found). Zero matches means affiliate link cloaking from S05 is still intact.

**Failure signal:** Any `href="https://amazon.es/dp/..."` match means a direct Amazon URL leaked into the homepage — the `/go/` cloaking from S05 was broken.

---

### 6. astro check passes with zero type errors

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check
```

**Expected:** Output ends with `0 errors` and `0 warnings`. Exit code 0.

This confirms:
- `SiteInfo.homepage_seo_text: string | null` is properly typed
- All usages of `homepage_seo_text` in `index.astro` are type-safe
- No other TypeScript regressions were introduced

**Failure signal:** Any reported error referencing `homepage_seo_text`, `SiteInfo`, or `data.ts` means the interface field was added incorrectly or the usage in `index.astro` has a type mismatch.

---

## Edge Cases

### Edge case: focus_keyword is null (fallback to site.name)

Temporarily set `focus_keyword` to `null` in the fixture and rebuild:

```bash
# Edit fixture to set focus_keyword: null
# Then: SITE_SLUG=fixture pnpm --filter @monster/generator build
grep '<h1' apps/generator/.generated-sites/fixture/dist/index.html
```

**Expected:** H1 shows `Airfryer Pro ES` (the site name fallback). This confirms the `??` null-coalescing expression works correctly.

Restore `focus_keyword: "freidoras de aire"` after this test.

---

### Edge case: homepage_seo_text is null (section omitted)

Temporarily set `homepage_seo_text` to `null` in the fixture and rebuild:

```bash
# Edit fixture to set homepage_seo_text: null
# Then: SITE_SLUG=fixture pnpm --filter @monster/generator build
grep 'prose' apps/generator/.generated-sites/fixture/dist/index.html
```

**Expected:** No `prose` class found — the entire SEO section is omitted. This confirms the truthiness guard works.

Restore `homepage_seo_text` to its original value after this test.

---

### Edge case: category_image non-null (real image renders)

Temporarily set `category_image` on one category to a valid URL in the fixture and rebuild:

```bash
# Edit fixture: "category_image": "https://example.com/img.jpg"
# Then: SITE_SLUG=fixture pnpm --filter @monster/generator build
grep 'example.com/img.jpg' apps/generator/.generated-sites/fixture/dist/index.html
```

**Expected:** An `<img src="https://example.com/img.jpg"` appears inside the category card. No `bg-gray-100 h-40` placeholder for that card. The `grep -c 'src=""'` count remains 0.

---

## Failure Signals

- `<h1>Airfryer Pro ES</h1>` in output → `focus_keyword ?? site.name` expression broken or reverted
- No `prose` class in homepage HTML → `homepage_seo_text` truthiness guard failing or `marked` import broken
- `flex h-14 items-center justify-between` in nav (instead of `grid grid-cols-3`) → Layout.astro change was reverted
- `src=""` count > 0 → null-guard on `category_image` not applied in index.astro
- Any `href="[^"]*amazon\."` match in homepage → S05 affiliate link cloaking regression
- `astro check` reports errors in `data.ts` or `index.astro` → `SiteInfo.homepage_seo_text` field missing or mistyped

## Requirements Proved By This UAT

- R045 (TSA unified template) — all four homepage design gaps from the M013 spec are verified in built output: centered logo, focus_keyword H1, category cards with image layout, prose SEO text section
- R047 (category description in generator) — category description text confirmed in card bodies in built homepage HTML
- R001 (pipeline output quality) — full 15-page build exits 0; all page types rendered; astro check exits 0

## Not Proven By This UAT

- Category card image rendering with real images (fixture has null category_image — placeholder branch is tested, image branch is an edge case only)
- Homepage rendering in a live browser (visual polish, responsive layout, CSS correctness) — artifact-driven UAT cannot verify rendering fidelity; requires `pnpm dev` + browser inspection
- Mobile hamburger menu toggle behavior — JavaScript interaction requires a live browser
- SEO text rendering with real Markdown content (fixture uses HTML directly — Markdown parsing path is untested by this UAT)
- Multi-category sites with 6+ categories (fixture has only 2)

## Notes for Tester

- The canonical artifact to inspect is `apps/generator/.generated-sites/fixture/dist/index.html`. All grep commands above operate on this single file.
- Run `SITE_SLUG=fixture pnpm --filter @monster/generator build` first; the dist file is not committed to git.
- The `astro check` command takes ~6s; it must be run as `SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check` (not `pnpm check` from root).
- Fixture `category_image` is `null` for all categories — you will see placeholder divs (`bg-gray-100 h-40`), not real images. This is correct behavior, not a bug.
- `focus_keyword: "freidoras de aire"` is all lowercase in the fixture. The H1 renders it as-is. This is intentional — focus keywords are lowercase in Spanish SEO practice.
