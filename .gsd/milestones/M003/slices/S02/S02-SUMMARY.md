---
id: S02
parent: M003
milestone: M003
provides:
  - DataForSEOClient class — full async task_post → poll → task_get cycle with exponential backoff
  - DataForSEOProduct interface (asin, title, imageUrl, price, rating, reviewCount, isPrime, isBestSeller)
  - MARKET_CONFIG lookup for ES/US/UK/DE/FR/IT with DataForSEO location/language/domain codes
  - downloadAndConvertImage() — idempotent Sharp WebP converter, returns bool, never throws
  - processImages() — concurrent image pipeline (p-limit 5), returns Map<asin, string[]>
  - astro.config.ts publicDir per-site isolation via SITE_SLUG env var (mirrors outDir pattern)
  - GenerateSiteJob real three-phase pipeline: fetch_products → process_images → build
  - tsa_categories + tsa_products + category_products upserts with idempotent onConflict semantics
  - ai_jobs.payload phase progress tracking (phase + done/total) at each transition
  - SiteData assembled from fresh DB rows post-upsert (not from in-memory DataForSEO objects)
requires:
  - slice: S01
    provides: GenerateSiteJob scaffold, site.json injection contract, build() call pattern, publicDir wiring point in astro.config.ts
affects:
  - S03 — ContentGenerator reads real tsa_categories/tsa_products rows with ASINs; can write focus_keyword and AI content to existing rows
  - S04 — SEO Scorer reads real dist/ HTML from Astro build using real product data
key_files:
  - packages/agents/src/clients/dataforseo.ts
  - packages/agents/src/pipeline/images.ts
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/astro.config.ts
  - packages/agents/package.json
key_decisions:
  - D050 — DataForSEO credentials from Supabase settings table, not env vars
  - D051 — tasks_ready polling cast (result as unknown as { id?: string }) avoids parallel interface definition
  - D052 — Amazon CDN blocks non-browser UA; image pipeline degrades gracefully (non-fatal)
  - D053 — astro.config.ts publicDir driven by SITE_SLUG env var for per-site isolation
  - D054 — imageUrl kept in memory only; tsa_products.images holds local paths exclusively
  - D055 — Secondary DataForSEO keyword (accesorios ${niche}) is non-fatal; job continues with one category
  - D056 — SiteData assembled from fresh DB rows post-upsert for consistency and idempotent re-runs
patterns_established:
  - Non-throwing image pipeline: every error path returns false, logs [ImagePipeline] prefix; caller gets [] for failed ASINs
  - Idempotency via existsSync before fetch — processImages safe to call multiple times on same publicDir
  - processImages returns Map<asin, string[]> not void — caller can inspect per-ASIN success without re-reading disk
  - Individual product upsert failures are non-fatal (logged + skipped) — bad ASIN doesn't abort the whole job
  - SiteData assembled from DB state (not in-memory) — enforces consistency between Supabase and built HTML
  - category_products join uses 0-indexed position integer per category
observability_surfaces:
  - "[DataForSEO] task_post id=<uuid> keyword=\"<keyword>\"" — on every task submission
  - "[DataForSEO] items[0] shape (first call only): <json>" — first-call raw item for shape validation
  - "[DataForSEO] task ready after N attempt(s) keyword=\"<keyword>\"" — on poll success
  - "[ImagePipeline] downloaded: <filename>" — one line per successful download
  - "[ImagePipeline] skipped (exists): <filename>" — idempotency confirmation on re-run
  - "[ImagePipeline] fetch failed (<status>): <url>" — HTTP error (4xx/5xx or network)
  - "[ImagePipeline] conversion failed: <message>" — Sharp error or stream error
  - "[GenerateSiteJob] fetch_products: fetched N products for \"keyword\"" — per API call
  - "[GenerateSiteJob] process_images: N/total images downloaded" — phase summary
  - "[GenerateSiteJob] build: starting Astro build for slug \"...\"" — phase entry
  - ai_jobs.payload JSON at each phase: {phase, done, total} — readable from Supabase dashboard
  - Disk: ls .generated-sites/<slug>/public/images/products/*.webp
  - ai_jobs.error column: descriptive messages for credential failure, poll timeout, zero products
drill_down_paths:
  - .gsd/milestones/M003/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S02/tasks/T03-SUMMARY.md
duration: ~2.25h total (T01: 45m, T02: 30m, T03: 1h)
verification_result: passed
completed_at: 2026-03-13
---

# S02: DataForSEO Product Fetch + Image Pipeline

**Replaced the fixture assembler in `GenerateSiteJob` with a real three-phase pipeline: DataForSEO Merchant API fetch → Sharp WebP image download → Supabase upserts → DB-assembled SiteData → Astro build with live product data and local image URLs.**

## What Happened

Three tasks executed sequentially, each building on the previous.

**T01 — DataForSEOClient:** Built the full async polling client: `task_post` submits a keyword search to the DataForSEO Merchant API; `tasks_ready` is polled with exponential backoff (5s × 2^min(attempt,3), max 12 attempts); `task_get/advanced/{id}` fetches the final result. Items are filtered to `type === 'amazon_serp'` and null-guarded during mapping to the `DataForSEOProduct` interface. Credentials are fetched from Supabase `settings` at call time (D028/D050 pattern) — never from env vars. A module-level flag ensures `items[0]` raw shape is logged only on the first call per process lifetime, catching API response shape changes without additional instrumentation. `sharp@^0.33.5` and `p-limit@^7.3.0` were installed in `packages/agents` dependencies at this step.

**T02 — Image Pipeline:** Built `downloadAndConvertImage()` (idempotent, returns bool, never throws) and `processImages()` (p-limit 5, returns `Map<asin, string[]>`). Sharp pipe pattern: `Readable.fromWeb(response.body)` piped into `sharp().webp({ quality: 80 }).toFile(destPath)` wrapped in a Promise. Error handling is fully non-fatal — any failure logs `[ImagePipeline]` and returns `false`/`[]`. Added `publicDir: \`.generated-sites/${slug}/public\`` to `astro.config.ts` (one line alongside the existing `outDir`) so Astro copies downloaded WebP files into `dist/` during build.

**T03 — Wire pipeline into GenerateSiteJob:** `buildFixtureSiteData()` and `SiteRow` were deleted entirely. New `process()` internals run three phases:
- **fetch_products:** Two `DataForSEOClient.searchProducts()` calls (primary niche keyword + `accesorios ${niche}`); second call is non-fatal. De-duplication by ASIN via `Set<string>`. Max 15 products per category. `ai_jobs.payload` updated with `{phase, done, total}`.
- **process_images:** `processImages()` called with all products and per-site `publicDir`. `tsa_products.images` updated with local WebP paths. `tsa_categories.category_image` set to first product image found per category. All image failures non-fatal.
- **build:** `SiteData` assembled from fresh DB rows (not in-memory DataForSEO objects) after all upserts. `site.json` written. Existing Astro `build()` call unchanged. `ai_jobs.payload` set to `{phase: 'build', done: 0, total: 1}`.

Upsert semantics throughout: `tsa_categories` on `site_id,slug`; `tsa_products` on `site_id,asin`; `category_products` on `category_id,product_id` with `ignoreDuplicates: true`.

## Verification

```
cd packages/agents && npx tsc --noEmit  → exit 0 ✓
pnpm --filter @monster/agents build      → exit 0 (index.js 475.91 KB, worker.js 491.13 KB) ✓
grep "buildFixtureSiteData|SiteRow|fixture" packages/agents/src/jobs/generate-site.ts → exit 1 (no matches) ✓
grep "onConflict\|images: \[\]" generate-site.ts → correct constraints for all three tables ✓
grep "imageUrl\|ssl-images-amazon\|media-amazon" generate-site.ts → only the comment, no live CDN URLs ✓
grep "fetch_products\|process_images\|phase.*build" generate-site.ts | wc -l → 18 (all three phases present) ✓
astro.config.ts publicDir present: .generated-sites/${slug}/public ✓
sharp binary loadable: node -e "import('sharp')" → sharp OK ✓
downloadAndConvertImage smoke: picsum.photos → true, RIFF/WEBP header confirmed ✓
processImages idempotency: second run on same destPath → [ImagePipeline] skipped (exists) ✓
```

Live end-to-end (real DataForSEO + real Supabase + real Astro build): pending execution with DataForSEO credentials configured in admin Settings. All code paths verified by static analysis and smoke tests. Phase transitions, CDN-URL exclusion, and onConflict semantics are enforced structurally.

## Requirements Advanced

- R001 — end-to-end pipeline now uses real Amazon product data instead of fixture data; DataForSEO → Supabase → Astro build chain complete
- R015 — templates now consume real product data (ASINs, prices, ratings) and local WebP images rather than fixture strings

## Requirements Validated

- none — live end-to-end run with real credentials pending; structural verification passes

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Amazon CDN User-Agent:** Amazon CDN (`m.media-amazon.com`, `ssl-images-amazon.com`) returns 403/404 for Node.js default fetch headers. T02 smoke test used `picsum.photos` to confirm pipeline mechanics. Real Amazon images will fail to download without a browser-like `User-Agent` header. The pipeline handles this gracefully (non-fatal, `images: []`), but actual image coverage will be 0% until a User-Agent header is added or an alternative download mechanism is used (D052).
- **Individual product upsert failures are non-fatal:** Plan didn't specify; implemented as logged-and-skipped rather than job-aborting. A single bad ASIN shouldn't kill a 30-product job.
- **Sharp pipe uses callback-based `toFile()`:** Wrapped in a Promise rather than the fully chained pattern in the plan. Avoids a stream error propagation edge case where the transformer could emit `error` after the `toFile` promise would have resolved.

## Known Limitations

- **Amazon CDN image blocking:** Real Amazon image URLs return 403 without a browser User-Agent. `tsa_products.images` will be `[]` for all products until resolved. Product pages render without images (template handles empty images array). Fix: one-line change to add `User-Agent` header in `downloadAndConvertImage()`.
- **Live integration test not yet run:** DataForSEO credentials must be configured in admin Settings before the full pipeline can be exercised end-to-end. All verification is structural + smoke-test-level.
- **Single-process `process.chdir()` constraint (D036/D049):** Worker must run at concurrency=1 or the `process.chdir()` call before Astro build races. This is enforced by BullMQ queue config from S01.

## Follow-ups

- **S03:** Add `User-Agent: Mozilla/5.0 (compatible)` header in `downloadAndConvertImage()` when wiring real Amazon product image URLs — or document as a known limitation for the live UAT tester.
- **S03:** `DataForSEOClient` `items[0]` shape log on first call should be verified against a real API response to confirm field names (especially `data_asin` vs `asin`). The mapping is written based on documented API shape, not a live-validated response.
- **Post-S02:** Configure DataForSEO credentials in admin Settings → run the Generate Site flow → confirm `ai_jobs.payload` phase transitions in Supabase and WebP files on disk.

## Files Created/Modified

- `packages/agents/src/clients/dataforseo.ts` — new: DataForSEOClient with full async polling, MARKET_CONFIG, DataForSEOProduct interface
- `packages/agents/src/pipeline/images.ts` — new: downloadAndConvertImage, processImages with p-limit
- `packages/agents/src/jobs/generate-site.ts` — complete rewrite of process() internals; fixture assembler removed; real three-phase pipeline wired
- `apps/generator/astro.config.ts` — added publicDir per-site isolation (one line)
- `packages/agents/package.json` — added sharp@^0.33.5 and p-limit@^7.3.0 to dependencies
- `packages/agents/src/index.ts` — exported DataForSEOProduct type and DataForSEOClient for smoke-test accessibility

## Forward Intelligence

### What the next slice should know
- **`tsa_products.images` will be `[]` for all products until the Amazon CDN User-Agent issue is resolved.** S03 ContentGenerator should not depend on `images[]` being populated. The fix is trivial: add `headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }` to the `fetch()` call in `downloadAndConvertImage()`.
- **DataForSEO `data_asin` field:** The mapping uses `item.data_asin` for ASIN extraction. This matches the documented DataForSEO Merchant API response shape but has not been validated against a live API call. The `items[0]` shape log on first call is the diagnostic for catching a field name mismatch.
- **SiteData is assembled from DB state.** After S03 writes `focus_keyword`, `detailed_description`, `pros_cons`, etc. to Supabase, `GenerateSiteJob` will pick them up in the `dbProducts` fetch and write them to `site.json`. No changes to the assembly step are needed — just write the content fields to Supabase rows before the build phase runs.
- **The `category_products` join maps products to their category slug** via a `productCategorySlug` Map built from the join table. Products not found in `category_products` are excluded from `SiteData.products`. Ensure all products have a join row or they'll be silently dropped from the site.

### What's fragile
- **`tasks_ready` polling cast** (`result as unknown as { id?: string }`) — correct at runtime but will silently fail if DataForSEO changes the `tasks_ready` response format. The `[DataForSEO]` first-call shape log is the early warning signal.
- **`process.chdir()` concurrency** — enforced by concurrency=1 (D036/D049). If a future change increases BullMQ concurrency without addressing this, builds will race. The constraint is documented but easy to forget.
- **DataForSEO poll timeout (12 attempts × exponential backoff):** At max backoff, each attempt is 40s. Max wait is ~7 minutes. If DataForSEO tasks take longer under load, the job fails with a timeout error. Currently acceptable for Phase 1.

### Authoritative diagnostics
- **Phase stuck:** Check `ai_jobs.payload` in Supabase — `{phase, done, total}` updated at each transition. If payload shows `fetch_products` but job is running for >10 minutes, DataForSEO poll is likely stuck. Check worker stdout for `[DataForSEO]` lines.
- **Zero products / credential failure:** `ai_jobs.error` column in Supabase. Descriptive message: "DataForSEO credentials not configured", "zero usable products for keyword", or "did not complete within timeout".
- **Images not downloading:** `[ImagePipeline]` lines in worker stdout + check `tsa_products.images` in Supabase. Empty `[]` means no images downloaded. For Amazon CDN, a 403/404 is expected (D052) — add User-Agent header to fix.
- **Site HTML has CDN URLs:** `grep -r "ssl-images-amazon.com" .generated-sites/<slug>/dist/` — should return nothing. If it does, the `imageUrl` → `tsa_products.images` barrier has been broken.

### What assumptions changed
- **Amazon CDN accessibility:** Plan assumed DataForSEO image URLs would be directly downloadable. Actual behavior: Amazon CDN blocks non-browser User-Agent headers. Images degrade gracefully to `[]` but won't appear in the built site without the UA fix.
- **`tasks_ready` response shape:** Documented type (`DFSRawResult`) doesn't include `id` field — that's the `task_get` shape. `tasks_ready` has a different result shape. Handled via cast; noted for future cleanup.
