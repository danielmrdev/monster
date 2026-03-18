# S06: Homepage Design Completeness

**Goal:** Close the four design gaps between the current homepage and the M013 spec: centered logo header, H1 from `focus_keyword`, prose SEO text section at bottom, and category grid cards with vertical image. Fixture updated with `homepage_seo_text` and a non-null `focus_keyword`. `astro check` exits 0. All previously passing criteria (build exit 0, zero direct Amazon URLs, `/go/` links) remain green.

**Demo:** `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0. Inspecting `dist/index.html` shows: `<h1>` content is `"freidoras de aire"` (the fixture `focus_keyword`), a `prose` div containing SEO text is present at the bottom, and category cards have an image block (or placeholder div) above the description text. `astro check` exits 0.

## Must-Haves

- `SiteInfo` interface has `homepage_seo_text: string | null`
- Fixture `site.json` has `homepage_seo_text` (non-null prose) and `focus_keyword` set to `"freidoras de aire"` (non-null)
- `Layout.astro` header uses `grid grid-cols-3` centering: hamburger left, logo center, desktop nav links right
- Homepage `<h1>` renders `focus_keyword` when non-null (not `site.name`)
- Category cards in the homepage grid include a vertical image block (`category_image` if non-null, else a `bg-gray-100 h-40` placeholder div)
- SEO text section at bottom of homepage rendered with `prose` class + `marked()` (only when `homepage_seo_text` non-null)
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- `astro check` exits 0
- Zero direct Amazon URLs in built `dist/index.html` `<a href>` attributes

## Observability / Diagnostics

**Runtime inspection surfaces:**
- `apps/generator/.generated-sites/fixture/dist/index.html` — the canonical artifact. All four design gaps can be verified by grepping this file without running a dev server.
- `astro check` — Astro's type checker surfaces TypeScript errors in `.astro` files. Any mismatch between `SiteInfo` and actual usage will be caught here.
- `astro build` stdout — build errors (missing imports, type errors promoted to build failures) are printed here. A non-zero exit from `astro build` is the primary failure signal.

**Failure state visibility:**
- Missing `homepage_seo_text` in `SiteInfo` → `astro check` reports type error; build may still succeed but type safety is gone.
- `marked` import using wrong syntax (e.g. default import) → build fails with module error; error includes the import path.
- Category cards rendering `<img src="">` (forgot null check) → visible in built HTML; `grep 'src=""' dist/index.html` will catch it.
- H1 still showing `site.name` (forgot the `??` expression) → `grep 'Airfryer Pro ES' dist/index.html | grep 'h1'` would match; the focus_keyword grep would miss it.

**Redaction:** `supabase_url` and `supabase_anon_key` are empty strings in fixture — no credentials in built output.

## Verification

```bash
# 1. Build must succeed
SITE_SLUG=fixture pnpm --filter @monster/generator build

# 2. astro check must exit 0
SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check

# 3. H1 uses focus_keyword ("freidoras de aire"), not site name
grep -i 'freidoras de aire' apps/generator/.generated-sites/fixture/dist/index.html

# 4. Prose SEO text section present
grep 'prose' apps/generator/.generated-sites/fixture/dist/index.html | head -3

# 5. No regressions: zero direct Amazon URLs
grep -oP 'href="[^"]*amazon\.[^"]*"' apps/generator/.generated-sites/fixture/dist/index.html
# → must return empty (exit 1 is fine; what matters is zero matches printed)

# 6. Diagnostic failure check: no empty src attributes on category card images
grep -c 'src=""' apps/generator/.generated-sites/fixture/dist/index.html || true
# → must print 0 (any non-zero means a null image was rendered as <img src="">)
```

## Tasks

- [x] **T01: Apply all four homepage design gaps** `est:45m`
  - Why: Closes all four S06 gaps in one atomic commit: data interface, fixture data, header centering, homepage template changes.
  - Files: `apps/generator/src/lib/data.ts`, `apps/generator/src/data/fixture/site.json`, `apps/generator/src/layouts/tsa/Layout.astro`, `apps/generator/src/pages/index.astro`
  - Do: See T01-PLAN.md for full steps and constraints.
  - Verify: `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0; `astro check` exits 0; `grep 'freidoras de aire' dist/index.html` matches; `grep 'prose' dist/index.html` matches; zero `amazon.` URLs in `<a href>`.
  - Done when: All five verification checks above pass.

## Files Likely Touched

- `apps/generator/src/lib/data.ts`
- `apps/generator/src/data/fixture/site.json`
- `apps/generator/src/layouts/tsa/Layout.astro`
- `apps/generator/src/pages/index.astro`
