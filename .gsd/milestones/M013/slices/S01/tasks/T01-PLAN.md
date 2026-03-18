---
estimated_steps: 6
estimated_files: 3
---

# T01: Add description and original_price to data interfaces and fixture

**Slice:** S01 — Data layer + new layout base
**Milestone:** M013

## Description

The generator's `data.ts` defines its own local `CategoryData` and `ProductData` interfaces independent of `packages/shared`. Both are missing fields the milestone requires. The fixture `site.json` is also missing several fields that `SiteInfo` expects but `astro build` silently ignores (only `astro check` catches them). This task closes all data gaps before any template work begins.

**What's missing:**

- `CategoryData` in `data.ts`: needs `description: string | null` (for category grid cards and category page header — milestone spec)
- `ProductData` in `data.ts`: needs `original_price: number | null` (for discount badge — milestone spec)
- `fixture/site.json` `site` object: needs `id`, `focus_keyword`, `supabase_url`, `supabase_anon_key`, `contact_email` (all optional/nullable, all in `SiteInfo`)
- `fixture/site.json` categories: need `description` field on both category objects
- `fixture/site.json` products: need `original_price: null` on all four products
- `packages/shared/src/types/index.ts`: `SiteTemplate` type is `'classic' | 'modern' | 'minimal'` — needs `'tsa/classic'` added (the new unified slug per D159/D169)

Note: `packages/shared` already has `description` on its `CategoryData` and `original_price` on its `ProductData` — the generator's local interfaces are what needs updating.

## Steps

1. **Edit `apps/generator/src/lib/data.ts`** — Add `description: string | null` to `CategoryData` interface (after the `keywords` field). Add `original_price: number | null` to `ProductData` interface (after `current_price`). No other changes to this file.

2. **Edit `apps/generator/src/data/fixture/site.json`** — On the `site` object: add `"id": "fixture-site-001"`, `"focus_keyword": null`, `"supabase_url": ""`, `"supabase_anon_key": ""`, `"contact_email": ""`. On each of the two `categories` objects: add `"description": null` (or a short Spanish sentence). On each of the four `products` objects: add `"original_price": null`. Also add missing fields required by `ProductData`: `focus_keyword: null`, `user_opinions_summary: null`, `meta_description: null` on each product (check the full interface — the fixture must match completely).

3. **Edit `packages/shared/src/types/index.ts`** — Update line 31 from `export type SiteTemplate = 'classic' | 'modern' | 'minimal';` to `export type SiteTemplate = 'classic' | 'modern' | 'minimal' | 'tsa/classic';`.

4. **Rebuild `packages/shared`** — Run `pnpm --filter @monster/shared build` to emit updated types to `dist/`. The generator references `@monster/shared` via workspace symlink; the rebuild ensures the updated `SiteTemplate` type is available.

5. **Verify interfaces and fixture** — Run:
   ```bash
   grep -n "description\|original_price" apps/generator/src/lib/data.ts
   # Both fields must appear
   
   SITE_SLUG=fixture pnpm --filter @monster/generator check
   # Should have 0 errors related to data gaps (may still have dispatch errors — those are fixed in T03)
   ```

6. **Verify shared build** — Run `pnpm --filter @monster/shared build` exits 0 and `grep 'tsa/classic' packages/shared/dist/index.js` shows the string is present in the emitted bundle.

## Must-Haves

- [ ] `CategoryData.description: string | null` in `apps/generator/src/lib/data.ts`
- [ ] `ProductData.original_price: number | null` in `apps/generator/src/lib/data.ts`
- [ ] All `SiteInfo` fields present in fixture `site.json` site object (id, focus_keyword, supabase_url, supabase_anon_key, contact_email)
- [ ] `description` field on both fixture categories
- [ ] `original_price: null` on all four fixture products
- [ ] All `ProductData` fields present on all four fixture products (focus_keyword, user_opinions_summary, meta_description)
- [ ] `SiteTemplate` type in `packages/shared` includes `'tsa/classic'`
- [ ] `pnpm --filter @monster/shared build` exits 0

## Verification

```bash
# Confirm interface fields added
grep -n "description\|original_price" apps/generator/src/lib/data.ts

# Confirm shared rebuild succeeded
pnpm --filter @monster/shared build

# Confirm SiteTemplate updated in shared dist
grep 'tsa/classic' packages/shared/dist/index.js

# Run type check — dispatch errors (8 pre-existing) are OK, data-gap errors must be gone
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | grep -c "error"
```

## Inputs

- `apps/generator/src/lib/data.ts` — Current interfaces without `description`/`original_price`; read it fully before editing to match exact field positions
- `apps/generator/src/data/fixture/site.json` — Current fixture structure; read it fully before editing
- `packages/shared/src/types/index.ts` line 31 — current `SiteTemplate` definition

## Expected Output

- `apps/generator/src/lib/data.ts` — `CategoryData` has `description: string | null`, `ProductData` has `original_price: number | null`
- `apps/generator/src/data/fixture/site.json` — Complete fixture with all `SiteInfo`, `CategoryData`, and `ProductData` fields populated (nulls where appropriate)
- `packages/shared/src/types/index.ts` — `SiteTemplate` includes `'tsa/classic'`
- `packages/shared/dist/` — Rebuilt with updated types
