---
estimated_steps: 7
estimated_files: 1
---

# T03: Wire real pipeline into GenerateSiteJob

**Slice:** S02 — DataForSEO Product Fetch + Image Pipeline
**Milestone:** M003

## Description

Replace the fixture assembler in `GenerateSiteJob` with the real three-phase pipeline: DataForSEO fetch → Supabase writes → image processing → site.json assembly → Astro build. This is the integration closure task: it connects every piece built in T01 and T02 and proves the full generate flow works end-to-end with real data.

The seam is narrow: `buildFixtureSiteData()` (lines 22–122 of generate-site.ts) and step 3 in `process()` are replaced. Steps 4 (write site.json) and 5 (Astro build) are unchanged. The `SiteData` shape written to `site.json` is unchanged — only the data inside it becomes real.

## Steps

1. Delete `buildFixtureSiteData()` from `generate-site.ts`. It's the entire block from the `SiteRow` interface through the closing `}` of `buildFixtureSiteData`. Keep `slugify()` — it's still used.

2. Import `DataForSEOClient` and `DataForSEOProduct` from `'../clients/dataforseo.js'`. Import `processImages` from `'../pipeline/images.js'`. Import `mkdirSync` (already imported), `existsSync` from `'node:fs'`. Import `join` (already imported).

3. Replace step 3 in `process()` with `fetch_products` phase:
   ```
   - Update ai_jobs.payload: { phase: 'fetch_products', done: 0, total: 2 }
   - const client = new DataForSEOClient()
   - const niche = site.niche ?? site.name
   - const market = (site.market ?? 'ES') as string
   - Fetch keyword 1: await client.searchProducts(niche, market)
   - Fetch keyword 2 (optional, catch and log if fails — don't abort):
       await client.searchProducts(`accesorios ${niche}`, market).catch(...)
   - Combine results, de-dupe by ASIN using Set<string>
   - Split into categories: keyword1 results → category 1, keyword2 results → category 2
     (if keyword2 failed, use only category 1)
   - Take top 15 products per category
   - Update ai_jobs.payload: { phase: 'fetch_products', done: 2, total: 2 }
   ```

4. Upsert to Supabase — write categories and products before image processing:
   ```
   - For each category keyword result:
     Upsert tsa_categories: { site_id, name, slug: slugify(keyword), seo_text: '', keywords: [keyword], category_image: null }
     onConflict: 'site_id,slug', ignoreDuplicates: false
     → capture returned category id
   - For each de-duped product:
     Upsert tsa_products: { site_id, asin, title, slug: slugify(title), current_price, images: [], rating, review_count, is_prime, availability: 'available', last_checked_at: new Date().toISOString() }
     onConflict: 'site_id,asin', ignoreDuplicates: false
     → capture returned product id
   - Upsert category_products: { category_id, product_id, position }
     onConflict: 'category_id,product_id', ignoreDuplicates: true
   ```
   Note: store the raw `imageUrl` from DataForSEO in a local variable for image processing — never write it to `tsa_products.images`. The `images[]` column gets the local WebP paths only.

5. `process_images` phase:
   ```
   - publicDir = join(GENERATOR_ROOT, '.generated-sites', slug, 'public')
   - Update ai_jobs.payload: { phase: 'process_images', done: 0, total: allProducts.length }
   - const imageMap = await processImages(allProductsWithImageUrls, publicDir)
   - For each product where imageMap has paths:
     Upsert tsa_products: { images: imageMap.get(asin) } where site_id+asin match
   - For each category:
     Set category_image = first product's images[0] ?? null
     Upsert tsa_categories: { category_image }
   - Update ai_jobs.payload: { phase: 'process_images', done: allProducts.length, total: allProducts.length }
   ```

6. Assemble `SiteData` from DB rows (not from DataForSEO response — use what's in Supabase after upserts). Fetch fresh `tsa_categories` and `tsa_products` rows for this site via `createServiceClient()`. Build the same `{ site, categories, products }` shape as before — but now from real data. Write to `site.json`. Then continue with existing step 4 (`writeDataJson`) and step 5 (Astro build).

7. Update `ai_jobs.payload` to `{ phase: 'build', done: 0, total: 1 }` before the Astro build call. After build completes, the existing step 6 (`ai_jobs.status = 'completed'`) fires as before. Run `npx tsc --noEmit` — fix all type errors. Run `pnpm --filter @monster/agents build`.

## Must-Haves

- [ ] `buildFixtureSiteData()` and `SiteRow` interface removed — no fixture data remains
- [ ] `ai_jobs.payload` updated at each phase transition: `fetch_products` → `process_images` → `build`
- [ ] `tsa_categories` upsert uses `onConflict: 'site_id,slug'` — idempotent retry
- [ ] `tsa_products` upsert uses `onConflict: 'site_id,asin'` — idempotent retry; `images: []` initially
- [ ] `tsa_products.images` populated with local WebP paths after `processImages` — never Amazon CDN URLs
- [ ] `category_image` set to first product's local image path after image processing
- [ ] Second DataForSEO search failure is non-fatal (caught, logged) — job continues with category 1 only
- [ ] `SiteData` assembled from DB rows (post-upsert) — not directly from DataForSEO response
- [ ] `tsc --noEmit` exits 0; `pnpm --filter @monster/agents build` exits 0
- [ ] End-to-end: built `dist/` HTML contains no `ssl-images-amazon.com` URLs

## Verification

Full end-to-end sequence:
```bash
# 1. Build and start worker
pnpm --filter @monster/agents build
node packages/agents/dist/worker.js &

# 2. Trigger job from admin panel "Generate Site" button
# (or enqueue manually via quick node script if needed)

# 3. Wait for ai_jobs.status = 'completed' (poll Supabase or watch worker stdout)

# 4. Verify no CDN URLs in built HTML
grep -r "ssl-images-amazon.com" apps/generator/.generated-sites/<slug>/dist/ && echo "FAIL" || echo "PASS: no hotlinks"

# 5. Verify local WebP images exist
ls apps/generator/.generated-sites/<slug>/public/images/products/*.webp

# 6. Verify Supabase has real data
# In Supabase dashboard: tsa_products for the site — real ASINs, non-empty images[], real prices

# 7. Open in browser
cd apps/generator/.generated-sites/<slug>/dist && npx serve -p 4321 .
# → homepage shows real product names, category pages load, product images render (not broken)

# 8. Type-check and build
cd packages/agents && npx tsc --noEmit
pnpm --filter @monster/agents build
```

## Observability Impact

- Signals added: `[GenerateSiteJob] fetch_products: fetched ${n} products`, `[GenerateSiteJob] process_images: ${done}/${total}`, `[GenerateSiteJob] build: starting`
- `ai_jobs.payload` JSON shows current phase + done/total — readable from Supabase dashboard or admin panel `JobStatus` component
- Failure state: any phase error bubbles to `ai_jobs.error` via existing `worker.on('failed')` handler; phase logged before throw so last phase is visible in worker stdout

## Inputs

- `packages/agents/src/clients/dataforseo.ts` — `DataForSEOClient`, `DataForSEOProduct` (T01)
- `packages/agents/src/pipeline/images.ts` — `processImages` (T02)
- `apps/generator/astro.config.ts` — `publicDir` now configured (T02)
- `packages/agents/src/jobs/generate-site.ts` — existing file; steps 4 and 5 unchanged
- DB schema: `tsa_categories(UNIQUE site_id,slug)`, `tsa_products(UNIQUE site_id,asin)`, `category_products(PK category_id,product_id)` — all support upsert
- `apps/generator/src/lib/data.ts` — `SiteData`, `CategoryData`, `ProductData` interfaces (the assembly target shape)

## Expected Output

- `packages/agents/src/jobs/generate-site.ts` — complete rewrite of `process()` internals; `buildFixtureSiteData()` removed; real three-phase pipeline
- Real `tsa_categories` + `tsa_products` + `category_products` rows in Supabase
- `.generated-sites/<slug>/public/images/products/*.webp` — local WebP files
- `.generated-sites/<slug>/dist/` — Astro-built site with real product data and local image URLs
- `ai_jobs.status = 'completed'` with payload showing all three phase transitions
