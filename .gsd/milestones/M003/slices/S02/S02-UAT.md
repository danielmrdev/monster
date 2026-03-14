# S02: DataForSEO Product Fetch + Image Pipeline — UAT

**Milestone:** M003
**Written:** 2026-03-13

## UAT Type

- UAT mode: live-runtime + artifact-driven
- Why this mode is sufficient: S02 integrates two external services (DataForSEO API and Supabase) and produces disk artifacts (WebP files, built HTML). Static analysis and smoke tests verified the code paths; live-runtime UAT is required to confirm the full pipeline actually executes against real credentials, real API responses, and real Supabase writes. Artifact-driven checks (file presence, HTML grep, DB query) are the authoritative pass criteria.

## Preconditions

1. Worker process is not running — kill any existing `node dist/worker.js` process before this test
2. DataForSEO API credentials are configured in admin Settings (key: `dataforseo_api_key`, format: `email:password`)
3. A test site exists in Supabase with `niche` set (e.g. "freidoras de aire"), `market = "ES"`, and a valid `affiliate_tag`
4. Upstash Redis is reachable (check `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` in `.env`)
5. Clean state for the test site: no prior `tsa_categories`, `tsa_products`, or `category_products` rows for this site_id (or accept idempotency behavior — re-runs are valid, check for upsert not duplicate)
6. Working directory: `/home/daniel/monster` (monorepo root)

## Smoke Test

Build the agents package and confirm no TypeScript errors:

```bash
cd packages/agents && npx tsc --noEmit && echo "PASS" || echo "FAIL"
pnpm --filter @monster/agents build && echo "PASS" || echo "FAIL"
```

Both must print `PASS` before proceeding.

## Test Cases

### 1. Worker startup

```bash
node packages/agents/dist/worker.js &
sleep 2
# Check stdout for:
# "[worker] GenerateSiteJob listening"
```

**Expected:** Worker starts without error and logs readiness. No crash, no unhandled rejection.

### 2. Generate Site button dispatches job

1. Navigate to `http://localhost:3004/sites/<site-id>` in the admin panel
2. Click the **"Generate Site"** button
3. Observe the job status component update

**Expected:** Button click dispatches a BullMQ job. The job status area shows "running" within a few seconds (polling interval ~5s). No 500 error, no unhandled rejection in admin server logs.

### 3. Phase 1 — fetch_products: DataForSEO API call

After clicking Generate Site, wait ~60 seconds for DataForSEO tasks to post and poll.

In worker stdout, look for:
```
[DataForSEO] task_post id=<uuid> keyword="freidoras de aire"
[DataForSEO] items[0] shape (first call only): { ... }
[DataForSEO] task ready after N attempt(s) keyword="freidoras de aire"
[DataForSEO] task_post id=<uuid> keyword="accesorios freidoras de aire"
[GenerateSiteJob] fetch_products: fetched N products for "freidoras de aire"
```

In Supabase (`ai_jobs` table):
```sql
SELECT payload FROM ai_jobs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1;
-- Expected: {"phase": "fetch_products", "done": 2, "total": 2}
```

**Expected:** At least 1 product returned for the primary keyword. Secondary keyword may fail (non-fatal). `ai_jobs.payload.phase` transitions from `fetch_products` with `done: 0` to `done: 2`.

### 4. Phase 1 — verify tsa_categories and tsa_products written to Supabase

```sql
-- After fetch_products completes:
SELECT name, slug, keywords FROM tsa_categories WHERE site_id = '<site-id>';
-- Expected: 1-2 rows (one for "freidoras de aire", optionally one for "accesorios freidoras de aire")

SELECT asin, title, current_price, rating FROM tsa_products WHERE site_id = '<site-id>' LIMIT 5;
-- Expected: rows with real ASINs (format: B0XXXXXXXX), real titles in Spanish, price > 0

SELECT COUNT(*) FROM tsa_products WHERE site_id = '<site-id>';
-- Expected: between 1 and 30 rows (max 15 per category × 2 categories)

SELECT COUNT(*) FROM category_products cp
  JOIN tsa_categories tc ON cp.category_id = tc.id
  WHERE tc.site_id = '<site-id>';
-- Expected: same count as tsa_products (each product joined to one category)
```

**Expected:** Real ASINs in `tsa_products.asin`. Non-empty `title`. `images` column is `[]` at this point (not yet populated). `tsa_categories.keywords` is an array containing the keyword string.

### 5. Phase 2 — process_images: WebP download

In worker stdout, look for:
```
[GenerateSiteJob] process_images: processing N product images
[ImagePipeline] downloaded: B0XXXXXXXX-0.webp   (OR)
[ImagePipeline] fetch failed (403): https://m.media-amazon.com/...   (expected — Amazon CDN blocks Node.js UA)
[GenerateSiteJob] process_images: 0/N images downloaded   (expected if CDN blocking)
```

**Expected (given known Amazon CDN blocking — D052):** Image download fails gracefully. Worker does NOT crash. Job continues to the build phase. No unhandled exception.

```bash
ls apps/generator/.generated-sites/<slug>/public/images/products/
# Expected: may be empty (if Amazon CDN blocks) OR contain *.webp files (if UA bypass added)
```

```sql
SELECT asin, images FROM tsa_products WHERE site_id = '<site-id>' LIMIT 5;
-- Expected: images = [] (Amazon CDN blocking) or images = ['/images/products/<asin>-0.webp']
```

In Supabase:
```sql
SELECT payload FROM ai_jobs WHERE status = 'running' ORDER BY created_at DESC LIMIT 1;
-- Expected: {"phase": "process_images", "done": N, "total": N}
```

### 6. Phase 3 — build: Astro site built with real product data

In worker stdout:
```
[GenerateSiteJob] build: starting Astro build for slug "<slug>"
[GenerateSiteJob] Astro build complete for "<slug>"
[GenerateSiteJob] Job <id> completed
```

In admin panel: job status component shows **"completed"** (within polling cycle after build finishes).

```bash
# Built HTML exists
ls apps/generator/.generated-sites/<slug>/dist/index.html
# → file exists

# Count product pages — should match number of products in tsa_products
ls apps/generator/.generated-sites/<slug>/dist/products/ | wc -l

# Count category pages
ls apps/generator/.generated-sites/<slug>/dist/categories/ | wc -l
# → 1-2 directories (one per category)

# Legal pages present
ls apps/generator/.generated-sites/<slug>/dist/aviso-legal/index.html
ls apps/generator/.generated-sites/<slug>/dist/privacidad/index.html
ls apps/generator/.generated-sites/<slug>/dist/cookies/index.html
ls apps/generator/.generated-sites/<slug>/dist/contacto/index.html
```

**Expected:** `dist/` contains `index.html`, product pages, category pages, and 4 legal pages.

### 7. No Amazon CDN URLs in built HTML

```bash
grep -r "ssl-images-amazon.com\|m.media-amazon.com" \
  apps/generator/.generated-sites/<slug>/dist/ && echo "FAIL" || echo "PASS"
```

**Expected:** `PASS` — no Amazon CDN URLs anywhere in the built HTML. This is the structural guarantee from D054 (imageUrl never written to DB, SiteData assembled from DB rows only).

### 8. Real product data in built HTML (not fixture strings)

```bash
# Real ASINs appear in product page URLs
ls apps/generator/.generated-sites/<slug>/dist/products/
# → directory names should contain real ASIN-derived slugs (not "product-model-a")

# Real product titles in homepage HTML (not fixture "Freidoras de Aire Product")
grep -c "freidoras\|airfryer\|B0" apps/generator/.generated-sites/<slug>/dist/index.html
# → positive match count

# Affiliate tag present in product links
grep "affiliate_tag\|tag=" apps/generator/.generated-sites/<slug>/dist/products/*/index.html | head -5
```

**Expected:** Product slugs derived from real ASINs/titles. Homepage references real product names. Affiliate tag appears in link structure.

### 9. ai_jobs record shows completed with phase history

```sql
SELECT status, payload, error, started_at, completed_at
FROM ai_jobs
WHERE site_id = '<site-id>'
ORDER BY created_at DESC LIMIT 1;
```

**Expected:**
- `status = 'completed'`
- `error IS NULL`
- `payload.phase = 'build'` (last phase written)
- `completed_at IS NOT NULL`
- `started_at IS NOT NULL`

### 10. Open built site in browser and verify rendering

```bash
npx serve apps/generator/.generated-sites/<slug>/dist -p 4321
```

Navigate to `http://localhost:4321` in a browser.

**Expected:**
- Homepage renders without JavaScript errors; shows product grid or category grid with real names
- Click a category link → category page loads, shows product cards
- Click a product card → product detail page loads, shows real title, price, rating
- Product images: either renders WebP files (if download succeeded) or shows placeholder/no-image state gracefully
- Legal pages accessible: `/aviso-legal`, `/privacidad`, `/cookies`, `/contacto` — all load without 404

### 11. Idempotent re-run

1. Stop the worker
2. Start a fresh worker
3. Click **"Generate Site"** again for the same site
4. Wait for completion

**Expected:** Job completes successfully. Supabase `tsa_categories` and `tsa_products` show the same rows (no duplicates). Any already-downloaded WebP files are skipped by `[ImagePipeline] skipped (exists)` logs. `dist/` is rebuilt clean. No unique constraint violations in worker stdout.

## Edge Cases

### Missing DataForSEO credentials

Remove the `dataforseo_api_key` setting from Supabase (or clear its value) and trigger a Generate Site job.

**Expected:** Job fails quickly (no API call made). `ai_jobs.status = 'failed'`. `ai_jobs.error` contains:
```
DataForSEO credentials not configured — add dataforseo_api_key in admin Settings
```

### Secondary keyword returns zero products

If `accesorios freidoras de aire` returns zero products (DataForSEO returns empty items):

**Expected:** Worker logs `[GenerateSiteJob] fetch_products: secondary keyword failed (non-fatal) — DataForSEO returned zero usable products for keyword: "accesorios freidoras de aire"`. Job continues with a single category. Site is built successfully with one category.

### All image downloads fail (Amazon CDN blocking — expected in Phase 1)

**Expected:** `[ImagePipeline] fetch failed (403): ...` logged for each product. `tsa_products.images = []` for all products. `category_image = null` on all categories. Job does NOT fail — it proceeds to the build phase. Built site renders without product images (template handles empty array). `grep ssl-images-amazon.com dist/` returns nothing (CDN URLs never in site.json).

### DataForSEO task poll timeout (simulate by reducing max attempts or using a slow keyword)

**Expected:** After 12 poll attempts, worker throws `"DataForSEO task <uuid> did not complete within timeout (12 attempts)"`. Job fails. `ai_jobs.status = 'failed'`, `ai_jobs.error` contains the timeout message. No partial site written to `dist/`.

### Site with no niche field set

If `site.niche` is null (falls back to `site.name`):

**Expected:** Worker uses `site.name` as the keyword. Job proceeds normally. This is a fallback documented in the code (`site.niche ?? site.name`).

## Failure Signals

- **Worker crashes on startup:** Check that `pnpm --filter @monster/agents build` succeeded. Ensure `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` are set in `.env`.
- **`ai_jobs` row never created:** Check worker stdout for `[GenerateSiteJob] Failed to insert ai_jobs`. Non-fatal — job continues but progress tracking is lost.
- **Job stuck in `running` state for >15 minutes:** DataForSEO poll likely timed out but `worker.on('failed')` didn't fire. Check worker stdout for `[DataForSEO]` lines. Manually inspect the DataForSEO dashboard.
- **Amazon CDN URLs appear in built HTML:** `grep ssl-images-amazon.com dist/` returns matches — the `imageUrl → tsa_products.images` barrier (D054) has been broken. Check the `images` column in `tsa_products` for CDN URLs.
- **Duplicate rows in tsa_products:** `onConflict: 'site_id,asin'` constraint missing or incorrect. Check migration has the unique constraint on `(site_id, asin)`.
- **Built site shows fixture product names:** `buildFixtureSiteData()` is somehow still running. Verify: `grep "buildFixtureSiteData" packages/agents/src/jobs/generate-site.ts` returns nothing.
- **Category pages return 404:** `tsa_categories.slug` doesn't match the route generated in Astro. Check that `slugify()` output matches what Astro generates from the same string.

## Requirements Proved By This UAT

- R001 — end-to-end pipeline (partial): real Amazon product data flows DataForSEO → Supabase → Astro build → browsable site; no fixture data
- R015 — TSA templates consume real product data: real ASINs, real prices, real ratings visible in built HTML

## Not Proven By This UAT

- R001 (full): deployment to VPS2 and public accessibility — deferred to M004
- R004: AI content generation (SEO texts, descriptions, pros/cons) — S03's concern; S02 products have empty `seo_text` and `detailed_description`
- R005: SEO Scorer and per-page scores — S04's concern
- Real image rendering in browser: Amazon CDN blocking means product images will not appear unless User-Agent header is added (known limitation, D052)
- High-volume product generation (50+ products): not exercised in this UAT; rate limit behavior is S03's concern

## Notes for Tester

- **Amazon CDN blocking is expected and non-fatal.** Product pages will not show images. The key test is that no CDN URLs appear in the built HTML and the job doesn't crash. If you want to see images render, add a `User-Agent` header (one line) to `downloadAndConvertImage()` and rebuild.
- **DataForSEO API calls take time.** The first keyword search posts a task and polls; expect 30–120 seconds for the `fetch_products` phase. The secondary keyword adds another 30–120 seconds. Total job time with no images: 2–5 minutes. With Astro build: add ~30 seconds.
- **The `items[0]` shape log** appears in worker stdout on the very first `searchProducts()` call. Capture this log line — it shows the raw DataForSEO response structure and is invaluable for debugging field name mismatches (e.g. if `data_asin` turns out to be `asin` in live responses).
- **Slug format:** The site slug is derived from `site.domain` (dots replaced with hyphens) or `site.id` as fallback. Verify the `SITE_SLUG` env var is set correctly in worker stdout: `[GenerateSiteJob] Site: "...", slug: "..."`.
- **If this is a re-run** on a site that was already generated, `tsa_categories` and `tsa_products` will be upserted (not duplicated), and any previously downloaded WebP files will be skipped. This is correct behavior.
