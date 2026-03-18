---
verdict: needs-remediation
remediation_round: 0
---

# Milestone Validation: M013

## Success Criteria Checklist

- [x] `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 — **evidence:** build exits 0, 15 pages produced (11 content + 4 `/go/` redirects).
- [x] `tsc --noEmit` exits 0 — **evidence:** `pnpm --filter @monster/generator exec tsc --noEmit` produced no output, exit 0.
- [x] `astro check` exits 0 — **evidence:** "Result (11 files): 0 errors, 0 warnings, 0 hints"
- [x] Zero direct Amazon affiliate URLs in built HTML `<a href>` attributes — **evidence:** `grep 'href="https://www.amazon' dist/index.html dist/categories/... dist/products/...` → all return no match (exit 1). `/go/` redirect pages themselves link to Amazon but they carry `noindex,nofollow`.
- [x] All page types render correct structure — **partial:** category, product, 4 legal pages pass; homepage has 3 gaps (see below).
- [x] `description` field present in `CategoryData` interface and fixture — **evidence:** `CategoryData.description: string | null` confirmed in `data.ts`; both fixture categories have non-null `description` strings.
- [x] `ProductData.original_price` present — **evidence:** `original_price: number | null` confirmed in `data.ts`.
- [x] `/go/<slug>` redirect pages present — **evidence:** 4 directories in `dist/go/` with correct `meta http-equiv="refresh"` + `noindex,nofollow`.
- [x] `cloaking.ts` is template-agnostic — **evidence:** module imports from `./data`, no layout-specific imports; exports `buildCloakUrl` and `buildCloakMap` only.
- [ ] Homepage: **centered logo** — **gap:** Layout.astro uses `flex h-14 items-center justify-between`; logo is left-aligned, nav is right. Not centered. Spec and vision both explicitly state "centered logo."
- [ ] Homepage: **H1 from `focus_keyword`** — **gap:** The `<h1>` always renders `{site.name}`; `focus_keyword` is used only in the hero subtitle paragraph. Spec says "H1 from `focus_keyword`." With `focus_keyword: null` in the fixture the gap is untestable at runtime, but the code path is absent.
- [ ] Homepage: **SEO text at bottom** — **gap:** No SEO text section on the homepage. `SiteInfo` has no `seo_text` or `homepage_seo_text` field in `data.ts`. The fixture has no such field. The spec and Final Integrated Acceptance both require "SEO text at bottom" on the homepage.
- [ ] Homepage: **category grid with vertical image** — **gap:** Category cards in the homepage grid show description text only; `category_image` field exists in `CategoryData` but is never rendered in the category grid on the homepage. Spec says "category grid with description + vertical image."

---

## Slice Delivery Audit

| Slice | Claimed | Delivered | Status |
|-------|---------|-----------|--------|
| S01 | `CategoryData.description` + `ProductData.original_price` added; fixture updated; `@tailwindcss/typography` installed; `tsa/Layout.astro` created; old layouts deleted; `astro check` exits 0 | All delivered — both interface fields present, fixture updated, typography wired via `@plugin` directive in BaseLayout, `layouts/tsa/` contains only `Layout.astro`, `layouts/classic/modern/minimal` deleted, `astro check` 0 errors | ✅ pass (with note: layout does not satisfy "centered logo" spec) |
| S02 | Homepage and category pages render with centered logo, category grid with description, product grid with price/discount badges | Category page: fully passes (H1, description, product grid with +info/Comprar, SEO text, related categories). Homepage: category grid description ✅; product grid price/discount logic ✅; but centered logo ✗, H1 from focus_keyword ✗, SEO text at bottom ✗, category vertical image ✗ | ❌ partial — 4 homepage spec items not delivered |
| S03 | Product page renders with image gallery, price/discount, pros/cons, AI description, breadcrumb to category | Gallery placeholder + thumbnail switcher script ✅; price/discount badge logic ✅; pros/cons rendered (Cosori fixture) ✅; breadcrumb to parent category ✅; buy button via `/go/` (added in S05) ✅; `detailed_description` null-guarded ✅ | ✅ pass |
| S04 | All four legal pages render with prose typography, coherent header/footer | All 4 legal pages (privacidad/aviso-legal/cookies/contacto) built; `class="prose prose-sm max-w-none"` confirmed in HTML; `marked()` + `interpolateLegal()` active; TsaLayout header/footer coherent | ✅ pass |
| S05 | All affiliate links use `/go/<slug>`; `/go/[slug].astro` redirect pages present; zero direct Amazon URLs on affiliate `<a>` tags; `cloaking.ts` template-agnostic | `buildCloakUrl`/`buildCloakMap` in `lib/cloaking.ts` ✅; 4 `/go/` static pages with `meta-refresh` + `noindex,nofollow` ✅; zero direct Amazon `<a href>` on content pages ✅; `rel="nofollow sponsored"` on all affiliate CTAs ✅; module has no layout-specific imports ✅ | ✅ pass |

---

## Cross-Slice Integration

**S01 → Layout.astro spec claim vs delivery:**
The S01 boundary map states: "header with centered logo + horizontal cat nav + hamburger." T03-SUMMARY describes the layout as built with `flex h-14 items-center justify-between` — which produces a left-aligned logo, not centered. The `justify-between` pattern is the KN013 hamburger pattern, which is correct for the hamburger toggle, but the logo centering requirement was silently dropped. No slice summary flags this deviation.

**S02 → Homepage completeness:**
T01-SUMMARY claims the homepage was "built to spec" and lists its verification evidence, but does not verify the "centered logo," "H1 from focus_keyword," or "SEO text at bottom" criteria. These are structural omissions from the verification checklist.

**All other boundary map entries (S01→S03, S01→S04, S02→S05, S03→S05) are satisfied.** Data flows, imports, and interface contracts all align correctly.

---

## Requirement Coverage

- **R045 (TSA unified template):** Partially satisfied — product/category/legal pages fully meet spec; homepage has 4 structural gaps.
- **R046 (link cloaking):** Fully satisfied — `cloaking.ts`, `/go/[slug].astro`, zero direct Amazon URLs, `rel="nofollow sponsored"` confirmed.
- **R047 (CategoryData.description):** Fully satisfied — field in interface, populated in fixture, rendered on category page.
- **R001 (pipeline output quality):** Partially satisfied — build exits 0, all page types produced, but homepage design quality falls short of spec on 4 points.
- **R002 (extensible architecture):** Confirmed — `template_slug` concept preserved; single render path cleanly replaces triple dispatch.

---

## Verdict Rationale

The core engineering deliverables of M013 are solid: build pipeline works, all page types are generated, link cloaking is complete and correct, type system is clean, no Amazon URLs leak into content pages. The category, product, and legal pages match their specs precisely.

However, the homepage has 4 material gaps against the milestone's explicit success criteria:

1. **Logo is left-aligned** (nav bar `flex justify-between`), not "centered" as specified in the Vision, roadmap success criteria, S02 slice after-criterion, and S01 boundary map.
2. **No H1 from `focus_keyword`** — the H1 always renders `site.name`; the focus_keyword only appears in hero subtitle text.
3. **No SEO text section at bottom** of the homepage — `SiteInfo` has no `seo_text`/`homepage_seo_text` field and no prose section is rendered.
4. **No vertical image in category grid cards** — category cards show text only; `category_image` is unused.

Of these, gaps 1 and 3 are the most material: "centered logo" is the first visual design word in the milestone vision, and "SEO text at bottom" appears in both the roadmap success criteria and the Final Integrated Acceptance checklist. Gap 4 is specified in both the roadmap and vision ("vertical image grids"). Gap 2 is less critical since the fixture can't prove it with `focus_keyword: null`.

These are remediable with a focused S06 slice: update `Layout.astro` to center the logo, add `homepage_seo_text?: string | null` to `SiteInfo` + fixture, add a prose SEO text section to `index.astro`, and add category image rendering to the homepage category grid.

---

## Remediation Plan

### S06: Homepage design completeness

**Depends on:** S01, S02  
**Risk:** low  
**Goal:** Close the 4 homepage spec gaps — centered logo, H1 from focus_keyword, SEO text at bottom, category grid vertical image.

**Deliverables:**

1. **`apps/generator/src/layouts/tsa/Layout.astro`** — Restructure header so the logo is visually centered. Accepted approaches: two-row header (logo centered on top row, cat nav below); or single-row with `grid grid-cols-3` and logo in middle column. Hamburger must still work per KN013.

2. **`apps/generator/src/lib/data.ts`** — Add `homepage_seo_text?: string | null` to `SiteInfo` interface.

3. **`apps/generator/src/data/fixture/site.json`** — Add `homepage_seo_text` field to the site object with a sample SEO text (≥ 80 words) and set `focus_keyword` to a non-null value (e.g. `"freidoras de aire"`) so the H1 criterion can be exercised.

4. **`apps/generator/src/pages/index.astro`** — 
   - Make H1 render `focus_keyword` when non-null: `{site.focus_keyword ?? site.name}`
   - Add a `homepage_seo_text` prose section at page bottom (after featured products), guarded by `site.homepage_seo_text`, using `class="prose prose-sm max-w-none"`.
   - Add category image rendering to category grid cards: when `cat.category_image` is non-null, render `<img>` above the description text with appropriate aspect-ratio/height class.

**After this slice:**
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 with 15+ pages
- Homepage HTML contains a centered logo (verifiable by grep for centering class/structure)
- Homepage H1 contains the fixture focus_keyword value
- Homepage has a prose SEO text section at the bottom
- `astro check` exits 0
- All existing passing criteria remain green
