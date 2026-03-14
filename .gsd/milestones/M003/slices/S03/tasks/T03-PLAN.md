---
estimated_steps: 7
estimated_files: 8
---

# T03: Extend SiteData contract and wire meta_description into templates

**Slice:** S03 — ContentGenerator
**Milestone:** M003

## Description

Extend the Astro generator's data contract to include the new fields that `ContentGenerator` writes to the DB (`focus_keyword`, `user_opinions_summary`, `meta_description`). Update `SiteData` assembly in `generate-site.ts` to include these fields from DB rows. Wire `metaDescription` through the three template layouts to `BaseLayout.astro`, which emits the `<meta name="description">` tag. Update the product and category page components to pass `meta_description` as `metaDescription` to their layout.

This task also completes the `SiteData` assembly additions that T02 left as placeholders — the assembly block in `generate-site.ts` gets the full type-correct additions here.

After this task, a full round-trip works: ContentGenerator writes → DB → `generate-site.ts` assembles → `site.json` → Astro templates → HTML with `<meta name="description">` and AI content.

## Steps

1. **`apps/generator/src/lib/data.ts`** — extend interfaces:
   - Add to `CategoryData`: `focus_keyword: string | null`, `meta_description: string | null`
   - Add to `ProductData`: `user_opinions_summary: string | null`, `meta_description: string | null`, `focus_keyword: string | null`
   - Add to `SiteInfo`: `focus_keyword: string | null`

2. **`packages/agents/src/jobs/generate-site.ts`** — update `siteData` assembly:
   - In the `site:` object: add `focus_keyword: (site.focus_keyword ?? null) as string | null`
   - In the `categories:` `.map()`: add `focus_keyword: cat.focus_keyword ?? null`, `meta_description: cat.description ?? null`
   - In the `products:` `.map()`: add `focus_keyword: p.focus_keyword ?? null`, `user_opinions_summary: p.user_opinions_summary ?? null`, `meta_description: productMetaDescriptions.get(p.id) ?? null`

3. **`apps/generator/src/layouts/BaseLayout.astro`** — add `metaDescription` prop:
   ```astro
   interface Props {
     title: string;
     lang?: string;
     metaDescription?: string;
     customization?: { primaryColor?: string; accentColor?: string; fontFamily?: string; };
   }
   const { title, lang = "es", metaDescription, customization } = Astro.props;
   ```
   In `<head>`, after `<title>`:
   ```astro
   {metaDescription && <meta name="description" content={metaDescription} />}
   ```

4. **`apps/generator/src/layouts/classic/Layout.astro`** — add `metaDescription?: string` to `Props`, destructure it, pass `metaDescription={metaDescription}` to `<BaseLayout>`.

5. **`apps/generator/src/layouts/modern/Layout.astro`** — same pattern as Classic.

6. **`apps/generator/src/layouts/minimal/Layout.astro`** — same pattern as Classic.

7. **Page components** — pass `meta_description` to layout as `metaDescription`:
   - `apps/generator/src/pages/products/[slug].astro`: derive `const metaDescription = product.meta_description ?? undefined` and pass `metaDescription={metaDescription}` to all three template layouts (ClassicLayout, ModernLayout, MinimalLayout)
   - `apps/generator/src/pages/categories/[slug].astro`: derive `const metaDescription = category.meta_description ?? undefined` and pass to all three layouts
   - `apps/generator/src/pages/index.astro`: no `meta_description` on SiteInfo for homepage — pass `metaDescription={undefined}` or omit (optional prop, safe to skip)

   Run typechecks throughout to catch any missed props.

## Must-Haves

- [ ] `CategoryData` has `focus_keyword: string | null` and `meta_description: string | null`
- [ ] `ProductData` has `user_opinions_summary: string | null`, `meta_description: string | null`, `focus_keyword: string | null`
- [ ] `SiteInfo` has `focus_keyword: string | null`
- [ ] `siteData` assembly in `generate-site.ts` populates all new fields from DB rows and `productMetaDescriptions`
- [ ] `BaseLayout.astro` accepts `metaDescription?: string` and renders `<meta name="description">` when non-empty
- [ ] All three template layouts forward `metaDescription` to `BaseLayout`
- [ ] Product page passes `product.meta_description ?? undefined` as `metaDescription` to layout
- [ ] Category page passes `category.meta_description ?? undefined` as `metaDescription` to layout
- [ ] `pnpm --filter @monster/agents typecheck` exits 0
- [ ] `pnpm --filter @monster/generator build` (Astro build, or equivalent tsc check) exits 0 or all type errors resolved

## Verification

```bash
cd /home/daniel/monster

# agents typechecks (generate-site.ts assembly additions)
pnpm --filter @monster/agents typecheck

# BaseLayout has meta description tag
grep 'meta name="description"' apps/generator/src/layouts/BaseLayout.astro

# All three layouts forward metaDescription
grep "metaDescription" apps/generator/src/layouts/classic/Layout.astro
grep "metaDescription" apps/generator/src/layouts/modern/Layout.astro
grep "metaDescription" apps/generator/src/layouts/minimal/Layout.astro

# data.ts has new fields
grep "focus_keyword\|user_opinions_summary\|meta_description" apps/generator/src/lib/data.ts

# Astro generator builds (validates template types)
pnpm --filter @monster/generator build 2>&1 | tail -5
# OR: cd apps/generator && npx astro check
```

## Observability Impact

**Signals added by this task:**
- `site.json` written by `GenerateSiteJob` now includes `focus_keyword` on `site`, `focus_keyword`+`meta_description` on each category, and `focus_keyword`+`user_opinions_summary`+`meta_description` on each product. Inspect `apps/generator/src/data/<slug>/site.json` to verify fields are present after a job run.
- Built HTML at `.generated-sites/<slug>/dist/products/<slug>/index.html` will contain `<meta name="description" content="...">` when `meta_description` is non-null in the DB. Grep for it to verify end-to-end propagation: `grep '<meta name="description"' .generated-sites/*/dist/**/*.html`
- Failure mode (missing fields): if `productMetaDescriptions.get(p.id)` returns `undefined` (no generation ran or product had no result), `meta_description` will be `null` in `site.json` and no `<meta name="description">` tag will be emitted for that page — this is a safe default, not an error state.
- Type errors in this task surface at Astro build time: `pnpm --filter @monster/generator build` fails with TSC errors if any layout/page doesn't forward `metaDescription` correctly. This is the primary diagnostic signal.

## Inputs

- `apps/generator/src/lib/data.ts` — current interfaces; add new fields here
- `apps/generator/src/layouts/BaseLayout.astro` — add `metaDescription` prop + tag
- `apps/generator/src/layouts/classic/Layout.astro`, `modern/Layout.astro`, `minimal/Layout.astro` — forward prop
- `packages/agents/src/jobs/generate-site.ts` — assembly block; `productMetaDescriptions` Map from T02
- `packages/db/src/types/supabase.ts` — `sites.focus_keyword` exists; `tsa_categories.description` maps to `meta_description` for categories

## Expected Output

- `apps/generator/src/lib/data.ts` — `CategoryData`, `ProductData`, `SiteInfo` extended with new fields
- `apps/generator/src/layouts/BaseLayout.astro` — `metaDescription` prop + `<meta name="description">` tag
- `apps/generator/src/layouts/classic/Layout.astro` — `metaDescription` forwarded
- `apps/generator/src/layouts/modern/Layout.astro` — `metaDescription` forwarded
- `apps/generator/src/layouts/minimal/Layout.astro` — `metaDescription` forwarded
- `apps/generator/src/pages/products/[slug].astro` — `metaDescription` passed from `product.meta_description`
- `apps/generator/src/pages/categories/[slug].astro` — `metaDescription` passed from `category.meta_description`
- `packages/agents/src/jobs/generate-site.ts` — `siteData` assembly updated with all new fields
