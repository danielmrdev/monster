# S02: DataForSEO Product Fetch + Image Pipeline

**Goal:** Replace the fixture product assembler in `GenerateSiteJob` with a real three-phase pipeline: fetch Amazon product data from DataForSEO Merchant API, download and convert images to local WebP files via Sharp, persist categories/products to Supabase, and build a real site with live product data.

**Demo:** Admin panel "Generate Site" button triggers a BullMQ job → DataForSEO fetches real products for the site's niche → images downloaded + converted to WebP in per-site public dir → `tsa_categories`, `tsa_products`, `category_products` rows written to Supabase → Astro build produces a browsable site with real product names, prices, ratings, and local image URLs. `ai_jobs.payload` shows phase progress (`fetch_products` → `process_images` → `build`).

## Must-Haves

- `DataForSEOClient` class with `searchProducts(keyword, market)` — full async task_post → poll tasks_ready → task_get/advanced flow, credentials read from Supabase `settings` table at call time
- Image pipeline `downloadAndConvertImage(imageUrl, destPath)` using Sharp (WebP quality 80), `p-limit` concurrency cap of 5, idempotent (skips if file exists)
- `astro.config.ts` adds `publicDir` driven by `SITE_SLUG` (per-site isolation)
- `GenerateSiteJob` phases: `fetch_products` → `process_images` → `build` with `ai_jobs.payload` updated at each transition
- Real `tsa_categories` and `tsa_products` rows in Supabase (upsert semantics — idempotent retry)
- `tsa_products.images` contains local WebP paths only (never Amazon CDN URLs)
- Built `dist/` HTML contains no `amazon.com` or `ssl-images-amazon.com` image URLs
- Job fails cleanly (descriptive error) when DataForSEO returns zero usable products
- `tsc --noEmit` exits 0 for `packages/agents`

## Proof Level

- This slice proves: integration (real DataForSEO API call + real Supabase writes + real Astro build)
- Real runtime required: yes
- Human/UAT required: yes — open built site in browser and verify real product names/images render

## Verification

```bash
# 1. Type-check packages/agents
cd packages/agents && npx tsc --noEmit
# → exit 0

# 2. Build packages/agents
pnpm --filter @monster/agents build
# → exit 0

# 3. Run the worker (manual integration test) — see T03 for full verification sequence
node packages/agents/dist/worker.js &
# → [worker] GenerateSiteJob listening

# 4. Trigger generate from admin panel, then verify:
# a. ai_jobs payload transitions: fetch_products → process_images → build
# b. tsa_categories rows exist in Supabase for the site
# c. tsa_products rows exist with real ASINs and non-empty images[] array
# d. WebP files exist on disk
ls apps/generator/.generated-sites/<slug>/public/images/products/*.webp

# e. No Amazon CDN URLs in built HTML
grep -r "ssl-images-amazon.com" apps/generator/.generated-sites/<slug>/dist/ && echo "FAIL" || echo "PASS"

# f. Real product titles in built HTML (not "Freidoras de Aire Product - Model A")
grep -c "B0" apps/generator/.generated-sites/<slug>/dist/products/*/index.html
# → positive matches (real ASINs in product slugs/links)

# 5. Open built site in browser
npx serve apps/generator/.generated-sites/<slug>/dist -p 4321
# → verify homepage shows real product names, category pages load, product images render

# 6. Failure-path diagnostics: verify failure state is inspectable
# a. If DataForSEO creds missing, ai_jobs.error should contain:
#    "DataForSEO credentials not configured — add dataforseo_api_key in admin Settings"
#    Check: SELECT error FROM ai_jobs WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1;
# b. Worker stdout shows [DataForSEO] log lines on each API call:
#    grep "[DataForSEO]" worker.log | head -20
# c. If zero products returned, job fails with:
#    "DataForSEO returned zero usable products for keyword: <keyword>"
# d. If poll times out, job fails with:
#    "DataForSEO task <uuid> did not complete within timeout"
# e. Image pipeline failures are non-fatal (logged as [ImagePipeline] skip/fail) — job continues
```

## Observability / Diagnostics

- Runtime signals: `[GenerateSiteJob]` prefixed stdout logs per phase; `[DataForSEO]` prefixed logs for task_post/poll/task_get; `[ImagePipeline]` prefixed logs per download
- Inspection surfaces: `ai_jobs.payload` JSON in Supabase (phase + done/total counts); worker stdout; `tsa_products` table (images[] column); disk at `.generated-sites/<slug>/public/images/products/`
- Failure visibility: `ai_jobs.error` on job failure; DataForSEO client logs raw `items[0]` structure on first call to help diagnose shape mismatches; image pipeline logs skip/fail per URL; job fails with descriptive error if zero usable products returned
- Redaction constraints: DataForSEO credentials (email:password) must never appear in logs — log only the email portion if needed for diagnostics

## Integration Closure

- Upstream surfaces consumed: `GenerateSiteJob.process()` step 3 fixture assembler → replaced; `writeDataJson()` + `build()` calls unchanged (D035); `AMAZON_MARKETS` for `se_domain` lookup; `settings` table `dataforseo_api_key` key (D028)
- New wiring introduced: `DataForSEOClient` reads creds from Supabase at job start; image pipeline writes to `apps/generator/.generated-sites/<slug>/public/images/products/`; `astro.config.ts` adds `publicDir` so Astro copies images to `dist/`
- What remains before milestone is truly usable end-to-end: S03 (AI content generation), S04 (SEO Scorer)

## Tasks

- [x] **T01: DataForSEO client — task_post → poll → task_get** `est:1.5h`
  - Why: The DataForSEO Merchant API is async-only and the response shape hasn't been validated live. This task retires the highest-risk unknown in S02 by building and smoke-testing the full polling client before any other code depends on it.
  - Files: `packages/agents/src/clients/dataforseo.ts`
  - Do: Install `sharp` and `p-limit` in `packages/agents` dependencies (needed here so install happens once). Create `DataForSEOClient` class: `fetchCredentials()` reads `dataforseo_api_key` from Supabase `settings` table (D028 pattern — `(row.value as { value: string }).value`); `searchProducts(keyword, market)` posts task, polls `tasks_ready` with exponential backoff (5s × 2^min(attempt,3), max 12 attempts), fetches `task_get/advanced/{id}`. Filter `items[]` on `type === 'amazon_serp'`. Map to internal `DataForSEOProduct` shape (all fields null-guarded; `parseFloat(item.rating?.value ?? '0')` for rating). Log raw `items[0]` structure on first call. Return `DataForSEOProduct[]`. Guard: if zero usable items after filtering, throw descriptive error. Store task IDs in returned metadata for idempotent retry. Auth: `Authorization: Basic base64(email:password)` using `Buffer.from(creds).toString('base64')`.
  - Verify: `npx tsc --noEmit` in `packages/agents` exits 0. Manual smoke test: `node -e "import('./dist/clients/dataforseo.js').then(m => new m.DataForSEOClient().searchProducts('freidoras de aire', 'ES').then(r => console.log(r.length, r[0])))"` after building — returns ≥1 product with real ASIN.
  - Done when: `DataForSEOClient` builds, type-checks, and returns real products from a live API call with real credentials configured in admin Settings.

- [x] **T02: Image pipeline — Sharp WebP download + conversion** `est:45m`
  - Why: Images must be local WebP files before Astro build runs, and the download/conversion logic is independent enough to build and verify in isolation before wiring into the job.
  - Files: `packages/agents/src/pipeline/images.ts`, `apps/generator/astro.config.ts`
  - Do: Create `downloadAndConvertImage(imageUrl: string, destPath: string): Promise<boolean>` — check if file exists (`existsSync`) and return `true` immediately if so (idempotency). Fetch image with native `fetch()`. Stream response body via `Readable.fromWeb(response.body)` → `pipe(sharp().webp({ quality: 80 }).toFile(destPath))`. Return `true` on success, `false` on error (log the error, don't throw). Create `processImages(products: DataForSEOProduct[], publicDir: string): Promise<void>` — `mkdirSync(imagesDir, { recursive: true })`, iterate products with `p-limit(5)` concurrency, call `downloadAndConvertImage` per image, assign local path `/images/products/<asin>-0.webp` to product's `localImages[]`. Add `publicDir` to `astro.config.ts`: `publicDir: \`.generated-sites/${slug}/public\`` (one-liner alongside `outDir`). Log `[ImagePipeline] downloaded <asin>` or `[ImagePipeline] skipped <asin> (exists)` per file.
  - Verify: `npx tsc --noEmit` in `packages/agents` exits 0. Unit smoke: `node -e "import('./dist/pipeline/images.js').then(m => m.downloadAndConvertImage('https://m.media-amazon.com/images/I/71abc.jpg', '/tmp/test.webp').then(console.log))"` after building — returns `true`, file exists at `/tmp/test.webp` and `file /tmp/test.webp` shows `Web/P`. `astro.config.ts` type-checks with `npx astro check`.
  - Done when: `downloadAndConvertImage` converts a real Amazon CDN URL to a local WebP file; `astro.config.ts` has `publicDir` configured; both type-check cleanly.

- [x] **T03: Wire real pipeline into GenerateSiteJob** `est:2h`
  - Why: Closes the loop — replaces the fixture assembler with real DataForSEO + image data and proves the complete generate flow end-to-end with real products, real images, and real Supabase writes.
  - Files: `packages/agents/src/jobs/generate-site.ts`
  - Do: Replace `buildFixtureSiteData()` and step 3 with real pipeline. New flow: (a) `fetch_products` phase — instantiate `DataForSEOClient`, search niche keyword + optional "accesorios ${niche}" keyword (2 DataForSEO tasks max), de-dupe products by ASIN (`Set<string>`), take top 15 per category; update `ai_jobs.payload` with `{ phase: 'fetch_products', done: 0, total: taskCount }`. (b) Upsert `tsa_categories` rows (`onConflict: 'site_id,slug'`), upsert `tsa_products` rows (`onConflict: 'site_id,asin'`) with `images: []` initially, upsert `category_products` rows. (c) `process_images` phase — call `processImages()`, update products' local image paths, upsert `tsa_products` again with real `images[]` array; set `category_image` on each `tsa_categories` row to first product image; update `ai_jobs.payload` with `{ phase: 'process_images', done, total }`. (d) Assemble `SiteData` from real DB rows + local image paths, write `site.json`. (e) `build` phase — existing `build()` call unchanged; update `ai_jobs.payload` with `{ phase: 'build', done: 0, total: 1 }`. Task IDs from DataForSEO stored in `ai_jobs.payload` at job start for retry idempotency. Worker image dir: `apps/generator/.generated-sites/<slug>/public/images/products/`.
  - Verify: Full end-to-end run: worker running → admin panel "Generate Site" → wait for `ai_jobs.status = completed` → `grep -r "ssl-images-amazon.com" .generated-sites/<slug>/dist/` returns nothing → `ls .generated-sites/<slug>/public/images/products/*.webp` shows files → Supabase `tsa_products` rows have non-empty `images[]` → open site in browser at `npx serve .generated-sites/<slug>/dist` → product pages show real titles and images load. `npx tsc --noEmit` exits 0. `pnpm --filter @monster/agents build` exits 0.
  - Done when: Full generation job completes with real product data; no Amazon CDN URLs in built HTML; product images render in browser from local WebP files; all Supabase tables populated; `ai_jobs.payload` shows all three phase transitions.

## Files Likely Touched

- `packages/agents/src/clients/dataforseo.ts` (new)
- `packages/agents/src/pipeline/images.ts` (new)
- `packages/agents/src/jobs/generate-site.ts` (replace fixture assembler with real pipeline)
- `packages/agents/package.json` (add `sharp`, `p-limit` to dependencies)
- `apps/generator/astro.config.ts` (add `publicDir`)
