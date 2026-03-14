---
id: T03
parent: S02
milestone: M003
provides:
  - GenerateSiteJob real three-phase pipeline (fetch_products → process_images → build)
  - tsa_categories + tsa_products + category_products upsert with idempotent retry
  - ai_jobs.payload phase progress tracking per phase transition
  - SiteData assembled from DB rows (post-upsert, not directly from DataForSEO response)
key_files:
  - packages/agents/src/jobs/generate-site.ts
key_decisions:
  - No new decisions — all patterns follow existing decisions (D028 creds, D035 site.json, D041 SITE_SLUG, D049 process.chdir)
patterns_established:
  - Second DataForSEO keyword search is non-fatal; job continues with single category if it fails
  - imageUrl from DataForSEO kept in local DataForSEOProduct objects only — never written to tsa_products.images
  - SiteData assembled from fresh DB rows after upserts to ensure consistency between DB state and site.json
  - category_products join uses position integer for ordering (0-indexed, per-category)
observability_surfaces:
  - "[GenerateSiteJob] fetch_products: fetched N products for \"keyword\"" per API call"
  - "[GenerateSiteJob] process_images: N/total images downloaded"
  - "[GenerateSiteJob] build: starting Astro build for slug \"...\""
  - ai_jobs.payload JSON at each phase: {phase, done, total} — readable from Supabase dashboard
  - Product upsert warnings logged but non-fatal — job continues on individual product failures
duration: ~1h
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Wire real pipeline into GenerateSiteJob

**Replaced the fixture assembler in `GenerateSiteJob` with a real three-phase pipeline: DataForSEO fetch → Supabase upserts → Sharp image processing → DB-assembled SiteData → Astro build.**

## What Happened

`buildFixtureSiteData()` and the `SiteRow` interface were deleted entirely. The `process()` internals now run three distinct phases:

**Phase 1 — fetch_products:** Instantiates `DataForSEOClient`, searches two keywords (`niche` and `accesorios ${niche}`). The second search is wrapped in try/catch — if it fails, the job continues with only one category. Results are de-duped by ASIN using a `Set<string>`, then split into per-category arrays (max 15 products each).

**Phase 2 — Supabase upserts:** Categories upserted with `onConflict: 'site_id,slug'`, products with `onConflict: 'site_id,asin'` and `images: []` initially. `imageUrl` from DataForSEO is kept only in local `DataForSEOProduct` objects — never written to the DB. `category_products` join rows upserted with `onConflict: 'category_id,product_id', ignoreDuplicates: true`. Individual product upsert failures are logged and skipped (non-fatal) so a bad ASIN doesn't abort the whole job.

**Phase 3 — process_images:** Calls `processImages(allProducts, publicDir)` (T02), receives a `Map<asin, string[]>` of local WebP paths. Updates `tsa_products.images` with local paths. Sets `tsa_categories.category_image` to the first product image found for each category. All image failures are non-fatal — empty arrays mean no images, job continues.

**SiteData assembly:** After all upserts, fetches fresh `tsa_categories` and `tsa_products` rows from Supabase plus `category_products` join to map products to category slugs. Builds the `SiteData` shape from DB state (not from in-memory DataForSEO objects), ensuring consistency. Writes `site.json`, then sets `ai_jobs.payload = { phase: 'build', done: 0, total: 1 }` before calling the existing Astro `build()`.

## Verification

```bash
# Type check — exit 0
cd packages/agents && npx tsc --noEmit
# → (no output, exit 0)

# Build — exit 0
pnpm --filter @monster/agents build
# → ESM dist/index.js 475.91 KB ⚡️ Build success
# → ESM dist/worker.js 491.13 KB ⚡️ Build success

# Fixture removed — no fixture code in source
grep -n "buildFixtureSiteData\|SiteRow\|fixture" packages/agents/src/jobs/generate-site.ts
# → (exit 1, no matches)

# Phase transitions present
grep -n "fetch_products\|process_images\|phase.*build" packages/agents/src/jobs/generate-site.ts | wc -l
# → 15+ matches across all three phases

# onConflict constraints correct
grep -n "onConflict\|images: \[\]" packages/agents/src/jobs/generate-site.ts
# → 'site_id,slug' for categories, 'site_id,asin' for products, 'category_id,product_id' for join, images: [] on initial upsert

# Amazon CDN URLs never written to DB
grep -n "imageUrl\|image_url\|amazon.com" packages/agents/src/jobs/generate-site.ts
# → only the comment "imageUrl stored in local map only"
```

Slice-level checks (full end-to-end requires running worker with real DataForSEO credentials):
- `tsc --noEmit`: ✅ passes
- `pnpm --filter @monster/agents build`: ✅ passes  
- Worker startup: pending live integration test (requires DataForSEO credentials in admin Settings)
- `ai_jobs.payload` phase transitions: implemented, verifiable in Supabase after live run
- No CDN URLs in built HTML: enforced by code structure (imageUrl never in site.json)
- WebP files on disk + Supabase populated: pending live run

## Diagnostics

**Phase progression:** Filter worker stdout for `[GenerateSiteJob]` — each phase logs on entry. `ai_jobs.payload` in Supabase shows `{phase, done, total}` at each transition.

**DataForSEO failures:** `ai_jobs.error` on job failure; second keyword failure is non-fatal and logged. Primary keyword failure throws and the job fails with the descriptive error from `DataForSEOClient`.

**Image issues:** `[ImagePipeline]` prefix in worker stdout. `tsa_products.images` will have `[]` for failed downloads — non-fatal, product page will render without images.

**Zero products:** If DataForSEO returns zero usable products for the primary keyword, `DataForSEOClient.searchProducts()` throws `"DataForSEO returned zero usable products for keyword: \"...\"` which surfaces in `ai_jobs.error`.

**Missing credentials:** `ai_jobs.error` will contain `"DataForSEO credentials not configured — add dataforseo_api_key in admin Settings"`.

## Deviations

- Individual product upsert failures are non-fatal (logged + skipped) rather than aborting the job. The plan didn't specify this, but it's the correct behavior — a single bad ASIN shouldn't kill a 30-product job.
- `category_products` join uses `ignoreDuplicates: true` per the plan. Position is 0-indexed within each category's product list.
- `productCategorySlug` map built from fresh `category_products` DB fetch (not from in-memory category assignments) to ensure site.json is consistent with what's actually in Supabase.

## Known Issues

- Amazon CDN (ssl-images-amazon.com) blocks non-browser User-Agent headers — confirmed in T02. Real images will return 403. The image pipeline handles this gracefully (returns false, logs failure, product gets `images: []`). A browser-like User-Agent header is needed for real image downloads. This is a known issue from T02 carry-forward — not introduced here.

## Files Created/Modified

- `packages/agents/src/jobs/generate-site.ts` — complete rewrite of process() internals; buildFixtureSiteData() and SiteRow removed; real three-phase pipeline wired
