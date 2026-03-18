---
estimated_steps: 7
estimated_files: 4
---

# T01: Apply all four homepage design gaps

**Slice:** S06 — Homepage Design Completeness
**Milestone:** M013

## Description

Closes all four design gaps between the current homepage and the M013 spec in a single atomic pass. The four gaps are:

1. **Header logo not centered** — `Layout.astro` nav row is `flex justify-between`; needs `grid grid-cols-3` so the logo is always in the center cell.
2. **H1 from `focus_keyword`** — homepage `<h1>` currently always shows `site.name`; must use `focus_keyword` when non-null.
3. **Prose SEO text at bottom** — `SiteInfo` is missing `homepage_seo_text: string | null`; must be added to the interface, the fixture, and rendered at the bottom of `index.astro` using `prose` class + `marked()`.
4. **Category cards with vertical image** — current cards have no image block; spec requires a vertical image (or `bg-gray-100 h-40` placeholder when `category_image` is null).

All four changes touch the same 4 files. There are no inter-dependencies between the four gaps that require sequencing within this task.

## Steps

1. **Add `homepage_seo_text` to `SiteInfo` in `data.ts`:**
   In `apps/generator/src/lib/data.ts`, add to the `SiteInfo` interface:
   ```ts
   /** Homepage SEO prose text rendered at the bottom of the homepage. */
   homepage_seo_text: string | null;
   ```
   Place it after the `focus_keyword` field. This is the only change to `data.ts`.

2. **Update `fixture/site.json` with non-null `focus_keyword` and `homepage_seo_text`:**
   In `apps/generator/src/data/fixture/site.json`, under the `"site"` key:
   - Change `"focus_keyword": null` → `"focus_keyword": "freidoras de aire"`
   - Add `"homepage_seo_text": "<p>Las <strong>freidoras de aire</strong> han revolucionado la cocina saludable. Con tecnología de aire caliente circulante, permiten obtener resultados crujientes con hasta un 80% menos de aceite que una freidora tradicional. En <strong>Airfryer Pro ES</strong> encontrarás análisis independientes, comparativas de precios y guías de compra para elegir la freidora de aire perfecta según tu presupuesto y necesidades. Descubre los modelos más valorados por miles de usuarios en Amazon España.</p>"`

3. **Redesign `Layout.astro` header to `grid-cols-3`:**
   Replace the current `<nav class="flex h-14 items-center justify-between gap-6">` row content with a three-column grid:
   ```html
   <nav class="grid grid-cols-3 h-14 items-center">
     <!-- Left cell: hamburger (mobile only) -->
     <div class="flex items-center">
       <button id="nav-toggle-tsa" class="md:hidden ..." ...>...</button>
     </div>
     <!-- Center cell: logo (always visible) -->
     <div class="flex justify-center min-w-0">
       {logoUrl ? (
         <a href="/" class="shrink-0"><img src={logoUrl} alt={site.name} class="h-8" /></a>
       ) : (
         <a href="/" class="text-xl font-bold truncate" style="color: var(--color-primary)">{site.name}</a>
       )}
     </div>
     <!-- Right cell: desktop category links -->
     <div id="mobile-menu-tsa" class="hidden md:flex gap-4 justify-end">
       {categories.map((cat) => (
         <a href={`/categories/${cat.slug}/`} class="text-sm text-gray-600 hover:text-gray-900 transition-colors">{cat.name}</a>
       ))}
     </div>
   </nav>
   ```
   Keep the mobile dropdown `<div id="mobile-menu-tsa-dropdown">` and the `<script is:inline>` unchanged — only the nav row interior changes.
   Add `min-w-0` to the center cell's logo `<a>` to prevent overflow when site name is long. Use `truncate` on text-only logo to clip gracefully.

4. **Update `index.astro` — H1 from `focus_keyword`:**
   In the hero section, change the `<h1>` to use `focus_keyword` when non-null:
   ```astro
   <h1 class="text-3xl sm:text-4xl font-bold text-white leading-tight mb-2">
     {site.focus_keyword ?? site.name}
   </h1>
   ```
   The hero subtitle `<p>` that already conditionally references `focus_keyword` can stay as-is.

5. **Update `index.astro` — category cards with vertical image:**
   In the category grid section, update each card to include an image block above the text:
   ```astro
   <a href={`/categories/${cat.slug}/`} class="group block rounded-lg border border-gray-200 bg-white overflow-hidden hover:border-gray-300 hover:shadow-md transition-all duration-150">
     <!-- Vertical image or placeholder -->
     {cat.category_image ? (
       <img
         src={cat.category_image}
         alt={cat.name}
         class="w-full h-40 object-cover"
         loading="lazy"
       />
     ) : (
       <div class="w-full h-40 bg-gray-100 flex items-center justify-center">
         <span class="text-gray-300 text-xs">Sin imagen</span>
       </div>
     )}
     <!-- Card text -->
     <div class="p-5">
       <h3 class="font-semibold text-gray-800 group-hover:text-[var(--color-primary)] transition-colors mb-2">
         {cat.name}
       </h3>
       <p class="text-sm text-gray-500 line-clamp-3 leading-relaxed">
         {cat.description ?? cat.seo_text}
       </p>
     </div>
   </a>
   ```
   Remove the `p-5` from the outer `<a>` (it's now on the inner `<div>`), and remove the card's existing `<h3>` and `<p>` since they move inside the `<div class="p-5">`.

6. **Update `index.astro` — SEO text section at bottom:**
   Add `import { marked } from "marked";` to the frontmatter imports (same pattern as `[legal].astro`).
   After the "Productos Destacados" section, before `</TsaLayout>`, add:
   ```astro
   {site.homepage_seo_text && (
     <section class="mt-12 border-t border-gray-100 pt-10">
       <div class="prose prose-sm max-w-none text-gray-600"
         set:html={marked(site.homepage_seo_text)}
       />
     </section>
   )}
   ```
   `marked` v17 is synchronous — no `await` needed (KN009).

7. **Build and verify:**
   ```bash
   SITE_SLUG=fixture pnpm --filter @monster/generator build
   SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check
   grep -i 'freidoras de aire' apps/generator/.generated-sites/fixture/dist/index.html
   grep 'prose' apps/generator/.generated-sites/fixture/dist/index.html | head -3
   grep -oP 'href="[^"]*amazon\.[^"]*"' apps/generator/.generated-sites/fixture/dist/index.html
   ```
   The last command must print nothing (zero matches). The first four must succeed/match.

## Must-Haves

- [ ] `SiteInfo.homepage_seo_text: string | null` exists in `data.ts`
- [ ] Fixture `focus_keyword` is `"freidoras de aire"` (non-null string)
- [ ] Fixture `homepage_seo_text` is a non-null HTML string
- [ ] `Layout.astro` header nav row uses `grid grid-cols-3` with hamburger left, logo center, nav right
- [ ] Logo center cell has `min-w-0` on its wrapper and logo anchor to prevent overflow
- [ ] Homepage `<h1>` renders `focus_keyword` when non-null (`{site.focus_keyword ?? site.name}`)
- [ ] Each category card in the grid has a `h-40` image or `bg-gray-100 h-40` placeholder div above the text
- [ ] Homepage has a `prose prose-sm max-w-none` SEO text section at the bottom rendered with `marked()`
- [ ] SEO text section is conditionally rendered (only when `homepage_seo_text` non-null)
- [ ] `marked` import uses named import: `import { marked } from "marked"` (KN009)
- [ ] `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- [ ] `astro check` exits 0
- [ ] Zero `amazon.` URLs in `<a href>` in `dist/index.html`

## Observability Impact

**Signals that change after this task:**
- `dist/index.html` becomes the primary inspection surface. All four design gaps are verifiable by grepping the built output:
  - `grep -i 'freidoras de aire' dist/index.html` → confirms H1 uses `focus_keyword`
  - `grep 'grid-cols-3' dist/index.html` → confirms centered-logo nav
  - `grep 'prose' dist/index.html` → confirms SEO prose section exists
  - `grep 'bg-gray-100 h-40' dist/index.html` → confirms category image placeholder rendered
  - `grep -oP 'href="[^"]*amazon\.[^"]*"' dist/index.html` → must return empty (affiliate regression check)
- `astro check` reports type errors if `homepage_seo_text` is referenced before being added to `SiteInfo` — a type error here means the interface update was missed.

**Failure states that become visible:**
- If `marked` import fails (wrong specifier), the Astro build will throw a module-not-found error at build time — visible in `astro build` stdout.
- If `homepage_seo_text` is missing from `SiteInfo` but used in `index.astro`, `astro check` will report a type error on that property access.
- If the fixture JSON is missing `homepage_seo_text`, the `{site.homepage_seo_text && ...}` guard silently skips rendering — `grep 'prose' dist/index.html` will return no matches, catching this.
- Category placeholder: if `category_image` check is absent, an `<img src="">` with empty src is rendered — catchable by inspecting the built card HTML.

**Redaction:** No secrets baked into these static assets; `supabase_url` and `supabase_anon_key` in fixture are empty strings, so no credentials appear in `dist/index.html`.

## Verification

```bash
# Build
SITE_SLUG=fixture pnpm --filter @monster/generator build
# → exit code 0

# Type check
SITE_SLUG=fixture pnpm --filter @monster/generator exec astro check
# → "Found 0 errors"

# H1 contains focus_keyword
grep -i 'freidoras de aire' apps/generator/.generated-sites/fixture/dist/index.html
# → at least one match (the <h1> content)

# Prose section present
grep 'prose' apps/generator/.generated-sites/fixture/dist/index.html | head -3
# → at least one line with "prose"

# No direct Amazon URLs (affiliate link regression check)
grep -oP 'href="[^"]*amazon\.[^"]*"' apps/generator/.generated-sites/fixture/dist/index.html
# → zero matches (command may exit 1 — that is correct/expected)
```

## Inputs

- `apps/generator/src/lib/data.ts` — current `SiteInfo` interface (missing `homepage_seo_text`); `CategoryData` already has `category_image: string | null`
- `apps/generator/src/data/fixture/site.json` — `focus_keyword` currently `null`; `homepage_seo_text` field absent
- `apps/generator/src/layouts/tsa/Layout.astro` — current header is `flex justify-between` (logo left, nav right); needs `grid-cols-3` centering
- `apps/generator/src/pages/index.astro` — current homepage: H1 shows `site.name`, category cards have no image block, no SEO text section

**Key constraints from research:**
- `marked` v17 is synchronous (KN009) — use `import { marked } from "marked"`, no `await`
- Category image is `null` in fixture — placeholder div is required; do not use `<img>` unconditionally
- `@tailwindcss/typography` is already installed and configured in `BaseLayout.astro` — no install needed
- Mobile hamburger pattern (KN013): the `<script is:inline>` toggles `mobile-menu-tsa-dropdown`, NOT `mobile-menu-tsa` — keep the dropdown div and script unchanged
- `grid-cols-3` center cell: logo `<a>` must have `min-w-0` + `truncate` to prevent text overflow on long site names

## Expected Output

- `apps/generator/src/lib/data.ts` — `SiteInfo` has `homepage_seo_text: string | null`
- `apps/generator/src/data/fixture/site.json` — `focus_keyword: "freidoras de aire"`, `homepage_seo_text: "<p>...</p>"`
- `apps/generator/src/layouts/tsa/Layout.astro` — header nav row uses `grid grid-cols-3`; logo centered
- `apps/generator/src/pages/index.astro` — H1 uses `focus_keyword ?? site.name`; category cards have image/placeholder block; prose SEO text section at bottom
- Build succeeds, `astro check` reports 0 errors, `grep` confirms H1 and prose content, zero Amazon URLs
