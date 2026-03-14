# S02: DataForSEO Product Fetch + Image Pipeline — Research

**Date:** 2026-03-14

## Summary

S02 replaces the fixture product assembler in `GenerateSiteJob` with a real three-phase pipeline: (1) fetch product data from DataForSEO Merchant API, (2) download and convert images to WebP using Sharp, (3) persist categories/products to Supabase then build. The biggest unknowns are now resolved: the DataForSEO Merchant API is confirmed async-only (task_post → tasks_ready poll → task_get), the response shape has `items[]` containing `data_asin`, `title`, `image_url`, `price_from`, `rating.value`, and `is_prime` — all nullable in practice, so every field needs a null guard. The image pipeline must write WebP files to a per-site `publicDir` before calling Astro `build()` so they land correctly in `dist/`.

The primary open risk is that DataForSEO credentials don't exist in `.env` yet — they're stored in the `settings` table via the admin panel as `{ value: "email:password" }`. The DataForSEO client must read from Supabase at job start, not from env vars. This is different from the queue/Redis pattern. The secondary risk is that the `publicDir` pattern for per-site images needs to be added to `astro.config.ts` — currently only `outDir` is SITE_SLUG-driven; `publicDir` also needs to be driven by SITE_SLUG to isolate image assets per site.

The category strategy for S02: use the site's `niche` field as the primary search keyword; derive 1–3 category keywords via simple transformations (main niche + accessories, plus niche). Post at most 2 DataForSEO tasks per site to stay cheap (~$0.002). De-duplicate products by ASIN across categories. The implementation is straightforward — no need for a sophisticated category-detection algorithm in Phase 1.

## Recommendation

Build in this order: (1) DataForSEO client module with task_post → poll → task_get cycle, (2) image pipeline with Sharp, (3) update `GenerateSiteJob` to wire all phases with Supabase writes and progress tracking. Test the DataForSEO client first with a real credential check before touching the image pipeline. The `publicDir` fix in `astro.config.ts` is a one-liner and should be the first thing changed.

S02's seam with S01 is narrow: it replaces `buildFixtureSiteData()` and the fixture assembler with real data, while the `writeDataJson()` call and Astro `build()` invocation remain unchanged. The `site.json` schema is stable — S02 just populates it with real data.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| WebP conversion from URL | `sharp` (install: `pnpm add sharp`) | Streaming pipeline, native Node.js module, quality 80-85% confirmed by research |
| Image concurrency cap | `p-limit` (install: `pnpm add p-limit`) | Single-purpose, ESM-native, prevents Sharp bottlenecking on 5+ concurrent image downloads |
| HTTP fetch for DataForSEO API | Node 22 native `fetch` | No external dep needed; Node 22.22.1 confirmed installed. No need for axios or node-fetch |
| Sharp streaming from URL | `Readable.fromWeb(response.body)` then `pipe(sharp())` | Streams image directly without buffering full file in memory |
| Slugify ASIN-based product slug | Existing `slugify()` in `generate-site.ts` | Already written, handles edge cases, consistent with fixture slugs |

## Existing Code and Patterns

- `packages/agents/src/jobs/generate-site.ts` — S02 replaces `buildFixtureSiteData()` (lines 22–122) and the fixture assembler call (step 3) with real DataForSEO fetch. Steps 4 (write site.json) and 5 (Astro build) remain unchanged. The slugify helper at line 125 is reusable.
- `packages/agents/src/queue.ts` — `createRedisOptions()` reads env at call time (D021). DataForSEO client must follow the same pattern: read credentials from Supabase at call time, not at module scope.
- `packages/db/src/client.ts` — `createServiceClient()` is the correct pattern for worker code. Used in `generate-site.ts` already. S02 adds writes to `tsa_categories`, `tsa_products`, and `category_products`.
- `apps/generator/astro.config.ts` — SITE_SLUG-driven `outDir`. **Needs `publicDir` added**: `publicDir: \`.generated-sites/${slug}/public\`` so per-site images land in that site's isolated public directory and get correctly copied to `dist/` during Astro build.
- `apps/generator/src/lib/data.ts` — `SiteData` / `ProductData` types are the contract for `site.json`. `images[]` is `string[]` — local WebP paths like `/images/products/<asin>-0.webp`. Template already handles `images[0]` in product pages (no change needed there).
- `packages/shared/src/constants/index.ts` — `AMAZON_MARKETS` maps `{ slug: 'ES', domain: 'amazon.es', currency: 'EUR' }`. Use `domain` to build `se_domain` for DataForSEO task_post.
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — `dataforseo_api_key` is the settings key. Stored in DB as `{ value: "email:password" }` (D028 pattern). DataForSEO client fetches this from `settings` table at job start.
- `packages/db/supabase/migrations/20260313000002_tsa.sql` — Defines `tsa_categories` (with `UNIQUE(site_id, slug)`), `tsa_products` (with `UNIQUE(site_id, asin)`), and `category_products` (PRIMARY KEY `(category_id, product_id)`). All three support upsert semantics, which is required for idempotent job retry.

## DataForSEO Merchant API — Confirmed Shape

**Auth:** `Authorization: Basic base64(email:password)`. Basic HTTP auth, where `email:password` is the full credential string stored in settings as `{ value: "email:password" }`.

**Endpoint flow (async-only — no live endpoint):**

1. **POST** `https://api.dataforseo.com/v3/merchant/amazon/products/task_post`
   ```json
   [{ "keyword": "freidoras de aire", "location_code": 2724, "language_code": "es_ES", "se_domain": "amazon.es", "depth": 30 }]
   ```
   Returns: `tasks[].id` (UUID) — store this in `ai_jobs.payload` for retry idempotency.

2. **GET** `https://api.dataforseo.com/v3/merchant/amazon/products/tasks_ready`
   Returns: `tasks[].result[]` with `endpoint_advanced` URL for completed tasks.
   Poll with exponential backoff: 5s, 10s, 20s, 40s, ... max 12 attempts (~60s total).
   The task ID from step 1 will appear here once done.

3. **GET** `https://api.dataforseo.com/v3/merchant/amazon/products/task_get/advanced/{id}`
   Returns: `tasks[].result[].items[]` with product data.

**Key `items[]` fields (all may be null — guard every one):**
```
items[n].type           → "amazon_serp" (filter on this — skip "amazon_paid", etc.)
items[n].data_asin      → ASIN (string, e.g. "B07G82D89J")
items[n].title          → product title (string | null)
items[n].image_url      → CDN image URL (string | null) — EXPIRES: download immediately
items[n].price_from     → float | null
items[n].rating.value   → string "4.5" (not a number!) | null  
items[n].rating.votes_count → integer | null
items[n].is_prime       → boolean (infer from delivery_info.is_free_delivery if null)
items[n].is_best_seller → boolean
```
`rating.value` is a **string**, not a number — `parseFloat(rating.value)` required.

**DataForSEO location codes for AMAZON_MARKETS:**
| Market slug | location_code | language_code | se_domain |
|-------------|---------------|---------------|-----------|
| ES | 2724 | es_ES | amazon.es |
| US | 2840 | en_US | amazon.com |
| UK | 2826 | en_GB | amazon.co.uk |
| DE | 2158 | de_DE | amazon.de |
| FR | 2250 | fr_FR | amazon.fr |
| IT | 2380 | it_IT | amazon.it |

## Constraints

- **No live endpoint for DataForSEO Merchant API** — async-only. task_post → poll tasks_ready → task_get. No workaround. Implement full polling loop with max-attempt ceiling (see Common Pitfalls).
- **`tsa_products.images` stores local WebP paths only** — never Amazon CDN URLs. The DB constraint is enforced by architecture (D006). After image processing, update `tsa_products.images` with `["/images/products/<asin>-0.webp"]` paths.
- **Image URLs from DataForSEO expire** — CDN-signed. Download immediately in the same job step as the DataForSEO fetch. Do NOT store raw Amazon `image_url` values in any field.
- **DataForSEO creds come from Supabase `settings` table** — not from `.env`. The admin settings form stores `dataforseo_api_key` as `{ value: "email:password" }`. Worker reads this via `createServiceClient().from('settings').select('value').eq('key', 'dataforseo_api_key').single()`.
- **`publicDir` must be per-site in `astro.config.ts`** — currently missing. Without this, images written for site A will appear in dist for site B (if they share the same `public/` dir). Fix: add `publicDir: \`.generated-sites/${slug}/public\`` to `astro.config.ts`. Worker writes images to `apps/generator/.generated-sites/<slug>/public/images/products/` before calling `build()`.
- **Idempotency required** — job may be retried. Use `upsert` with `onConflict` for `tsa_categories` (conflict: `site_id,slug`) and `tsa_products` (conflict: `site_id,asin`). For `category_products`, upsert on `(category_id, product_id)` primary key. For images: check if WebP file exists on disk before re-downloading (`existsSync`).
- **Worker concurrency=1 (D036)** — safe to use `process.chdir()` and per-site `publicDir` without race conditions. Do not increase concurrency without addressing this.
- **`packages/db` must not import Next.js (D019)** — worker uses `createServiceClient()` directly. No `@supabase/ssr`.

## File Architecture

New files to create:
- `packages/agents/src/clients/dataforseo.ts` — DataForSEO HTTP client. `DataForSEOClient` class with `searchProducts(keyword, market)` and `getProductsByAsin(asins[])` methods. Async task → poll → get pattern. Reads credentials from Supabase settings.
- `packages/agents/src/pipeline/images.ts` — Image download + WebP conversion. `downloadAndConvertImage(imageUrl, destPath)` using Sharp + `p-limit`. Returns `boolean` (success/skip). Handles file-exists check for idempotency.

Files to modify:
- `apps/generator/astro.config.ts` — Add `publicDir` driven by `SITE_SLUG`.
- `packages/agents/src/jobs/generate-site.ts` — Replace fixture assembler with real pipeline. Add phases: `fetch_products` → `process_images` → `build`. Update `ai_jobs.payload` with `{ phase, done, total }` at each phase transition.

## Common Pitfalls

- **Polling loop deadlock** — Never poll in a tight loop while holding resources. Pattern: `for (let attempt = 0; attempt < 12; attempt++) { await sleep(5000 * 2**Math.min(attempt,3)); ... }`. Store task IDs in `ai_jobs.payload` before starting the poll loop so a retry can re-poll instead of re-posting.
- **`rating.value` is a string in the DataForSEO response** — `parseFloat(item.rating?.value ?? '0')` — do not use it directly as a number.
- **`items[]` contains mixed types** — filter on `item.type === 'amazon_serp'` to exclude `'amazon_paid'`, `'editorial_recommendations'`, `'related_searches'`. Only `amazon_serp` items have the expected product fields.
- **`price_from` may be null** — some products have `null` price (B2B pricing, price on request). Skip or use 0 as fallback. Do not crash on null price.
- **Sharp import in ESM** — `import sharp from 'sharp'`. ESM default import works. No need for `createRequire`. But Sharp needs to be in `dependencies` (not `devDependencies`) of `packages/agents/package.json`.
- **`p-limit` ESM** — v6.x is ESM-only. Import as `import pLimit from 'p-limit'`. Ensure `packages/agents` has `"type": "module"` (it does — already ESM).
- **`publicDir` absolute vs relative in Astro config** — `publicDir` in `astro.config.ts` is resolved relative to the Astro project root (`apps/generator/`). So `.generated-sites/${slug}/public` works as a relative path from the generator root. The worker must `mkdirSync` this path before writing any images.
- **Empty `items[]` from DataForSEO** — Some keyword searches return zero `amazon_serp` items (keyword too narrow, no products). Guard with: if result has zero usable products, throw with descriptive error so the job fails cleanly rather than building an empty site.
- **ASIN uniqueness across categories** — De-duplicate products by ASIN before writing to Supabase. Same ASIN may appear in multiple keyword search results. Use a `Set<string>` to track seen ASINs.
- **`category_image` field** — Set to the first product's image path for the category (e.g., `products[0].images[0] ?? null`). This is used as the category thumbnail. Assign after image processing completes.
- **`ai_jobs.payload` size** — DataForSEO task IDs (UUIDs) are fine to store. Don't store full product arrays in `payload` — they belong in Supabase tables.
- **TypeScript: `sharp` types** — `@types/sharp` does not exist (Sharp ships its own types). Install `sharp` only, no separate types package.

## Category Strategy (Phase 1)

Given site `niche = "freidoras de aire"` and `market = "ES"`:
1. Search keyword `site.niche` → primary category (e.g., "Freidoras de Aire")
2. Optionally search `"accesorios ${site.niche}"` → secondary category ("Accesorios")
3. Each search → DataForSEO task → poll → task_get → items[]
4. Filter type=`amazon_serp`, de-dupe by ASIN, take top 15 per category
5. Write `tsa_categories` rows (upsert), `tsa_products` rows (upsert), `category_products` rows (upsert)
6. Total cost: 2 × $0.001 = $0.002 per site generation — acceptable

Category slugs: slugify the keyword (same `slugify()` helper already in `generate-site.ts`).

## Progress Tracking

Phase payload written to `ai_jobs.payload` at each transition:
```json
{ "phase": "fetch_products", "done": 0, "total": 2 }
{ "phase": "process_images",  "done": 5, "total": 18 }
{ "phase": "build",           "done": 1, "total": 1 }
```
Admin panel `JobStatus` component already displays `payload` — but the current UI only shows status/timestamps. Phase + progress can be added to the UI as a simple text label (e.g. "Running… fetch_products").

## Open Risks

- **DataForSEO credentials not in `.env`** — Need to be added via admin Settings panel before first real run. The DataForSEO client reads from Supabase, so the env var approach used for Redis doesn't apply. Document this clearly in the worker startup logs if credentials are missing.
- **DataForSEO Merchant API response shape not yet validated live** — The docs confirm the fields above, but real responses may have additional null cases or field variations. The DataForSEO client should log the raw `items[0]` structure on first call to help diagnose shape mismatches.
- **Sharp binary compatibility on VPS1** — Sharp uses libvips native bindings. Node 22 + VPS1's OS need to have compatible libvips. Sharp 0.34.x supports Node 22 natively. Verify with `node -e "require('sharp')"` during T01 install verification.
- **DataForSEO polling time** — Tasks typically complete in 5–30 seconds. If consistently slow, the BullMQ job timeout (default: no timeout) may need to be set explicitly to avoid zombie jobs. Set `timeout: 120000` (2 minutes) in the Worker options.
- **Astro `publicDir` per-site isolation** — If Astro caches the public dir between builds, old images from a previous site might bleed in. Each build creates a fresh `outDir` (`mkdirSync` not needed — Astro does it) but `publicDir` is read-only during build. Verify that Astro copies (not moves) from `publicDir` to `outDir`, leaving `publicDir` intact.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| DataForSEO | `nikhilbhansali/dataforseo-skill-claude@dataforseo` (57 installs) | Available — not directly relevant to Merchant API impl |
| DataForSEO Keywords | `leonardo-picciani/dataforseo-agent-skills@dataforseo-keywords-data-api` (16 installs) | Available — not relevant to Merchant API |
| Sharp | none | none found |

No skills are worth installing for S02 — the DataForSEO Merchant API is documented above, and Sharp's usage pattern is straightforward from the official docs.

## Sources

- DataForSEO Merchant Amazon Products task_post parameters (source: [docs.dataforseo.com/v3/merchant/amazon/products/task_post](https://docs.dataforseo.com/v3/merchant/amazon/products/task_post/))
- DataForSEO Merchant Amazon Products task_get/advanced response shape + `items[]` fields (source: [docs.dataforseo.com/v3/merchant/amazon/products/task_get/advanced](https://docs.dataforseo.com/v3/merchant/amazon/products/task_get/advanced/))
- DataForSEO tasks_ready pattern + `endpoint_advanced` URL (source: [docs.dataforseo.com/v3/merchant/amazon/products/tasks_ready](https://docs.dataforseo.com/v3/merchant/amazon/products/tasks_ready/))
- DataForSEO Amazon products DB structure: `data_asin`, `image_url`, `price_from`, `rating.value` (string) (source: Context7 DataForSEO v3 docs)
- Sharp WebP streaming from URL via `Readable.fromWeb` + pipe (source: [github.com/lovell/sharp](https://github.com/lovell/sharp/blob/main/docs/src/content/docs/api-constructor.md))
- Sharp WebP quality config: `sharp().webp({ quality: 80 }).toFile(path)` (source: Context7 Sharp docs)
- Astro `publicDir` config option (relative to project root) (source: Astro 6 config reference, M003-RESEARCH.md)
- Existing `generate-site.ts` fixture assembler — seam for S02 replacement (source: `packages/agents/src/jobs/generate-site.ts`)
- DB schema for `tsa_categories`, `tsa_products`, `category_products` with unique constraints (source: `packages/db/supabase/migrations/20260313000002_tsa.sql`)
- Settings key `dataforseo_api_key` stored as `{ value: "email:password" }` (source: `apps/admin/src/app/(dashboard)/settings/constants.ts`, D028)
- `AMAZON_MARKETS` slug→domain mapping for `se_domain` param (source: `packages/shared/src/constants/index.ts`)
