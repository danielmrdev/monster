# M003: TSA Site Generator — Research

**Date:** 2026-03-14

## Summary

M003 is the heaviest milestone so far — it spans four technically distinct subsystems: the Astro generator with three templates, the DataForSEO data fetch pipeline, the ContentGenerator (Claude API + BullMQ), and the SEO Scorer. All of them must wire together into a single coherent BullMQ job. The milestone is feasible but has three genuine risks that must shape slice ordering: (1) Astro's programmatic `build()` API hasn't been validated in this project yet; (2) DataForSEO Merchant API is async-only (no live endpoint — confirmed 404), requiring a poll-wait loop inside the BullMQ worker; (3) ContentGenerator throughput on Plan Pro will hit rate limits for large catalogs.

The recommended approach is to build in risk-descending order: prove the Astro template + build pipeline first with hardcoded fixture data, then add DataForSEO data fetch, then ContentGenerator, then SEO Scorer. This way the most technically uncertain piece (Astro programmatic build) is validated before any paid API calls happen. The generator architecture should serialize site data to JSON files in `apps/generator/src/data/<slug>/` before each `build()` call — Astro reads these at build time via `getStaticPaths()`. This is the only reliable way to inject per-site data without re-architecting Astro's static model.

The SEO Scorer (`packages/seo-scorer`) is self-contained and can be built in parallel with later slices — it only needs HTML strings and a focus keyword. The `seo_scores` DB table is already defined with all 8 category score columns. `cheerio` for HTML parsing and `text-readability` for Flesch scoring are the right tools; both are lightweight, zero-external-runtime-dependencies, and tested for this use case. Structured outputs in `@anthropic-ai/sdk` now work natively via the `anthropic-beta: structured-outputs-2025-11-13` header — Zod schemas convert to JSON Schema automatically.

## Recommendation

Start S01 (Astro Templates + Build) with fixture data only. One working template → programmatic build confirmed → `dist/` output verified → site browsable locally. This de-risks the entire milestone. S02 (DataForSEO + Image Pipeline) adds real product data and the image download/WebP conversion. S03 (ContentGenerator) adds AI content. S04 (SEO Scorer) closes the loop. Do not skip ahead to ContentGenerator before the Astro build is validated.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| HTML parsing for SEO scoring | `cheerio` | Battle-tested jQuery-style API, handles malformed HTML, already researched in `docs/research/seo-scoring-research.md` |
| Readability scoring (Flesch) | `text-readability` (npm) | Implements Flesch, Flesch-Kincaid, passive voice, sentence length. 1.1.1 available. Zero external APIs. |
| Image download + resize + WebP | `sharp` (0.34.5, installed globally) | Streaming pipeline, handles all source formats, true WebP quality 80-85%, supports srcset generation |
| Claude structured outputs | `@anthropic-ai/sdk` 0.78.0 with `anthropic-beta: structured-outputs-2025-11-13` header | First-party SDK, Zod schemas convert automatically, guarantees valid JSON matching schema |
| Job queue and progress tracking | BullMQ (`@taskforcesh/bullmq`) + Upstash Redis | Already in stack decision (D007), `job.updateProgress()` for UI progress, idempotent retry support |
| CSS custom properties for theme | `define:vars` in Astro `<style>` tags | Native Astro — injects CSS custom properties from frontmatter variables into scoped styles |
| Astro programmatic build | `import { build } from 'astro'` | Official Node.js API — `await build({ root: './apps/generator', outDir: '...' })`. Returns Promise, no subprocess needed |

## Existing Code and Patterns

- `packages/db/src/types/supabase.ts` — Full generated types for `sites`, `tsa_categories`, `tsa_products`, `seo_scores`, `ai_jobs`. These are the read/write contracts for the pipeline. Note: `tsa_products.images` is `string[] | null` (local WebP paths after processing — NOT Amazon URLs after first build).
- `packages/shared/src/types/customization.ts` — `SiteCustomizationSchema` (Zod) with `primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, `faviconUrl`. Already shared between `apps/admin` and `apps/generator`. M003 must not redefine this.
- `packages/shared/src/constants/index.ts` — `AMAZON_MARKETS` maps market slug → `{ domain, currency }`. Use `domain` to construct affiliate links (`https://www.amazon.es/dp/<ASIN>?tag=<tag>`).
- `packages/db/src/client.ts` — `createServiceClient()` pattern: reads env vars at call time, not module scope. BullMQ workers must follow this pattern (D021).
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — Server action pattern with `createServiceClient()`. Shows the Zod + Supabase + error-return pattern established in M002.
- `apps/generator/package.json` — Scaffold only (no deps yet). Needs Astro, Tailwind, and template deps added.
- `packages/agents/package.json` — Scaffold only (no source yet). ContentGenerator goes here.
- `packages/seo-scorer/package.json` — Scaffold only with `tsup` build pattern already in place (match `packages/shared/tsup.config.ts`).
- `packages/shared/src/types/index.ts` — `SiteStatus`, `AmazonMarket`, `Language` types — reuse in generator pipeline.

## Constraints

- **Astro output must be `output: 'static'`** — No SSR, no middleware, no server endpoints. Pure HTML/CSS/JS. Every page uses `getStaticPaths()` (D007, CLAUDE.md).
- **Astro 6 requires Node 22+** — Node v22.22.1 is confirmed available. No compat issue.
- **No live endpoint for DataForSEO Merchant API** — Products search (`/v3/merchant/amazon/products`) and ASIN lookup (`/v3/merchant/amazon/asin`) are async only: `task_post` → poll `tasks_ready` → `task_get/advanced`. The BullMQ worker must implement the polling loop with exponential backoff (or use DataForSEO's `pingback_url` webhook, but that requires a public endpoint from VPS1, which is Tailscale-private — stick with polling).
- **All images must be local** — No hotlinking. `tsa_products.images` stores local WebP paths (e.g. `/images/products/<asin>-0.webp`). Images downloaded from `image_url` in DataForSEO response, processed through Sharp before first build.
- **Focus keyword is explicit** — Always read from `tsa_categories.focus_keyword` / `tsa_products.focus_keyword` / `sites.focus_keyword`. ContentGenerator generates these values and writes them to DB. SEO Scorer receives them as explicit input. (D006)
- **BullMQ jobs must be idempotent** — Safe to retry on failure at any stage. Use upsert semantics when writing to Supabase. Downloaded images should be skipped if already present on disk.
- **`packages/db` must not import Next.js** — Worker code in BullMQ cannot use `@supabase/ssr` (Next.js only). Use `createServiceClient()` from `packages/db` directly (D019).
- **Astro + data injection pattern**: The cleanest approach is to serialize site data (categories, products, customization) to JSON files in `apps/generator/src/data/<site-slug>/` before calling `build()`. The Astro templates read these via `getStaticPaths()`. Avoid trying to pass runtime config to `build()` — Astro's build is a static snapshot of `src/`.
- **ContentGenerator model**: `claude-sonnet-4-5` per CLAUDE.md. Current `@anthropic-ai/sdk` is 0.78.0 — structured outputs supported via beta header.
- **`teardownCompiler: false` for multi-site builds** — When building multiple sites in sequence in the same BullMQ worker process, pass `teardownCompiler: false` in `BuildOptions` to avoid reloading the WASM compiler for each site. Only teardown on the last build.

## Common Pitfalls

- **Astro `define:vars` only injects CSS custom properties inside `<style define:vars={...}>` blocks** — it does NOT make variables available globally. For theming, pass customization values from `Astro.props` into a root `<style>` on the layout that sets `:root { --primary: ...; }`. This is the correct pattern for CSS custom property theming.
- **DataForSEO polling loop deadlock** — If the BullMQ job holds a Redis lock and blocks polling in a tight loop, it will time out. Use `await new Promise(resolve => setTimeout(resolve, 5000))` between poll attempts, with a max-attempts ceiling (e.g., 12 attempts × 5s = 60s max wait). Write task_ids to `ai_jobs.payload` so retries can skip re-posting and jump straight to polling.
- **Amazon image URLs expire** — DataForSEO returns `image_url` values that are CDN-signed URLs with expiry. Download immediately in the same job step. Never store raw Amazon image URLs in the DB — store only the local WebP paths after processing. If the URL has already been processed (WebP file exists on disk), skip re-download (idempotency).
- **Sharp and concurrent builds** — Sharp's WASM/native binding is thread-safe but may bottleneck if processing hundreds of images concurrently. Use `p-limit` (concurrency limiter) to process images at max 5 concurrent. Batch by category.
- **ContentGenerator rate limits on Plan Pro** — Plan Pro has a rate limit on tokens/minute. For a 50-product site, ContentGenerator will need pacing. Use BullMQ's built-in rate limiting (or manual `await sleep(ms)` between Claude calls) to stay under the limit. Implement exponential backoff on `overloaded_error` responses. Write content to DB incrementally (per product), not in one final batch.
- **`getStaticPaths()` runs at build time, not per-request** — Data written to `src/data/` after `build()` starts will not be picked up. The full data serialization step must complete before calling `build()`.
- **Astro outDir must be absolute or correctly relative** — Pass an absolute path to `outDir` in `build()` config: `outDir: path.resolve(process.cwd(), '.generated-sites', site.slug)`. Relative paths resolve relative to the Astro project root, not the Node process cwd.
- **Cheerio HTML parsing for SEO Scorer** — Use `load(html, { xmlMode: false })` to get proper browser-like HTML parsing. Parse `<head>` and `<main>` separately; avoid counting navigation/footer text in word counts. Scope word count to `main` or `article` elements.
- **Affiliate link `rel` attribute** — All Amazon affiliate links MUST have `rel="sponsored noopener"`. This is both Google's requirement and the SEO Scorer's red-flag check. Bake this into the template, not as a content decision.
- **Product schema type confusion** — Use `Product` schema type (snippet variant) on product pages, NOT `Offer`/`MerchantListing`. The latter is for stores that sell directly. Affiliate pages that discuss/review products must use the snippet variant. The SEO Scorer should validate this as a red flag if wrong type is used.

## Open Risks

- **DataForSEO Merchant API response shape not yet validated** — The actual `items[]` structure (specifically `image_url`, `asin`, `price`, `title`, `rating`) needs to be confirmed against a live API call. The docs show a partial example. Real responses may have null fields for some products. The data fetch layer must handle nulls gracefully.
- **Astro `build()` isolation for multiple sites** — If two BullMQ workers call `build()` simultaneously for different sites (they would write to different `src/data/<slug>/` dirs and different `outDir`s), they share the same Astro project root. Race condition possible if Astro's build writes to shared temp dirs. Safest approach: serialize site builds (one at a time per worker, queue concurrency=1 for the generate job).
- **ContentGenerator token budget per site** — A 50-product site × (description + pros/cons + opinion + meta_description) ≈ 200-400 tokens per product call × 50 = 10k-20k tokens per site. Category SEO texts add 5k. Total ~25k tokens per site generation. Plan Pro daily limit is 500k tokens — 20 sites/day is feasible; 50+ sites/day would need Plan Max.
- **Unsplash API rate limits** — Free Unsplash API allows 50 requests/hour (production key: 5000/hour). A site with 5 hero/banner images needs 5 Unsplash requests. 10 sites/day = 50 requests — at free tier limit. Request production key early.
- **Astro `define:vars` and Tailwind v4 compatibility** — Astro 6 + Tailwind v4 (`@astrojs/tailwind`) integration needs testing. Tailwind v4 changed the config format substantially (CSS-based config instead of `tailwind.config.js`). Verify the integration package version (`@astrojs/tailwind` 6.0.2) is Tailwind v4-compatible before building templates.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Astro | `astrolicious/agent-skills@astro` (2K installs) | Available — install with `npx skills add astrolicious/agent-skills@astro` |
| BullMQ | none found | none found |
| DataForSEO | none found | none found |

## Candidate Requirements (Advisory)

These emerged from research and are worth discussing before roadmap planning — not auto-binding:

- **RC-M003-01**: SEO Scorer should check for Amazon affiliate disclaimer visibility on product pages. The `seo_scores` schema has a `factors` JSONB for this. Currently in PRD/research but not in REQUIREMENTS.md as an explicit requirement.
- **RC-M003-02**: ContentGenerator should write `focus_keyword` back to `tsa_categories`/`tsa_products` in Supabase as part of content generation — not just generate the text. The DB schema has these fields but the data flow isn't pinned in requirements. Without explicit writes, the SEO Scorer won't have keywords available for scoring.
- **RC-M003-03**: The "Generate Site" trigger in the admin panel (button in site detail view) is mentioned in M003-CONTEXT but is not part of any REQUIREMENTS.md entry. M002 (Sites CRUD) built the detail page as a stub. M003 needs to add the generate trigger UI — confirm this is in scope for M003 vs left as a CLI trigger only.
- **RC-M003-04**: BullMQ job progress should be surfaced in the admin panel site detail view in real time. The `ai_jobs` table exists. Admin panel polling or real-time via Supabase subscriptions would be needed. This may be deferred to M004.

## Sources

- DataForSEO Merchant API async model (source: [docs.dataforseo.com/v3/merchant-amazon-products](https://docs.dataforseo.com/v3/merchant-amazon-products-task_post/))
- DataForSEO Amazon Products task_get/advanced response shape (source: [dataforseo.com blog](https://dataforseo.com/blog/merchant-api-getting-big-with-e-commerce-data-part-2-amazon-api))
- Astro `build()` programmatic API and `teardownCompiler` option (source: [docs.astro.build](https://docs.astro.build/llms-full.txt))
- Astro `getStaticPaths()` + content collections pattern (source: Context7 Astro docs)
- Astro `define:vars` CSS custom property injection (source: [docs.astro.build](https://docs.astro.build/_llms-txt/build-a-blog-tutorial.txt))
- Sharp streaming pipeline for WebP conversion (source: [sharp.pixelplumbing.com](https://sharp.pixelplumbing.com/api-constructor/))
- BullMQ FlowProducer, idempotency, job progress patterns (source: Context7 BullMQ docs)
- Anthropic structured outputs via beta header (source: [platform.claude.com](https://platform.claude.com/docs/en/agent-sdk/structured-outputs))
- SEO scoring weights, factor thresholds, Yoast model (source: `docs/research/seo-scoring-research.md`)
- PRD site structure, template anatomy, image pipeline spec (source: `docs/PRD.md`)
- Existing DB schema, type contracts (source: `packages/db/src/types/supabase.ts`)
- SiteCustomization shared schema (source: `packages/shared/src/types/customization.ts`)
