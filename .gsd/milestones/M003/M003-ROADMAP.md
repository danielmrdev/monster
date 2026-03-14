# M003: TSA Site Generator

**Vision:** A TSA site record in Supabase becomes a fully-built, locally-browsable Astro.js static site with real Amazon product data, AI-written content, local WebP images, and per-page SEO scores — triggered from the admin panel and observable via job progress.

## Success Criteria

- User clicks "Generate Site" in admin panel → BullMQ job runs → site built without error
- Built site at `.generated-sites/<slug>/` opens in a browser and renders all page types correctly (homepage, category pages, product pages, 4 legal pages)
- All product images are local WebP files (no hotlinked Amazon URLs in the built HTML)
- All content (category SEO texts, product descriptions, meta descriptions) is AI-generated in the site's configured language
- Every generated page has an SEO score persisted in Supabase and visible in the site detail view
- All pages score ≥70 on SEO Scorer
- BullMQ job handles failure gracefully: partial progress written to `ai_jobs`, failed jobs can be retried without duplicating work (idempotent)

## Key Risks / Unknowns

- **Astro programmatic `build()` API** — never exercised in this project; data injection via `src/data/<slug>/` JSON files is the plan but needs validation that `getStaticPaths()` picks it up correctly and multi-site builds don't race
- **DataForSEO Merchant API response shape** — async-only (task_post → poll → task_get), documented but not yet validated against live API; actual `items[]` field structure (image_url, asin, price) may differ or have nulls
- **ContentGenerator rate limits on Plan Pro** — 50+ products × multi-field generation may saturate tokens/minute; pacing design must be baked in from the start, not retrofitted

## Proof Strategy

- Astro programmatic build risk → retire in S01 by producing a real `dist/` from three templates with fixture data, served locally via `npx serve dist/` and verified in browser
- DataForSEO response shape risk → retire in S02 by making a real live API call with a test keyword and inspecting the actual `items[]` structure before writing the production parser
- ContentGenerator rate limit risk → retire in S03 by running a real generation job for 10+ products against Plan Pro and verifying no unhandled overload errors; pacing implemented as `await sleep(ms)` + exponential backoff from the start

## Verification Classes

- Contract verification: `tsc --noEmit` exits 0 across all packages; `pnpm -r build` exits 0; SEO Scorer unit tests (input HTML → expected score ranges)
- Integration verification: real DataForSEO API call returns products; real Anthropic API call produces structured content matching Zod schema; Astro `build()` produces valid HTML in `dist/`
- Operational verification: BullMQ job survives simulated mid-job restart (partial progress in `ai_jobs`, retry resumes from last written product); `pm2 reload monster-admin` after each slice → 307 on all routes
- UAT / human verification: open built site in browser and confirm all page types render with correct data, images load, affiliate links contain `?tag=` parameter, no broken links

## Milestone Definition of Done

This milestone is complete only when all are true:

- All four slices are complete and verified
- A real TSA site (e.g. "freidoras de aire", ES market) has been generated end-to-end from admin panel button click
- Built site has: homepage, 3+ category pages, 10+ product pages, 4 legal pages — all browsable locally
- All product images are local WebP files (verified: no `amazon.com` or `ssl-images-amazon.com` in built HTML)
- All pages have SEO scores in `seo_scores` table; scores visible in admin panel site detail
- At least 80% of pages score ≥70 (warning threshold, not blocking)
- `tsc --noEmit` and `pnpm -r build` both exit 0
- BullMQ job is idempotent (re-running on an already-built site skips existing images and existing content)

## Requirement Coverage

- **Covers:** R001 (end-to-end pipeline — this milestone produces the site), R004 (AI content generation), R005 (SEO Scorer), R015 (3 TSA templates)
- **Partially covers:** R002 (extensible architecture — generator is type-aware via site.type field, TSA is first impl)
- **Leaves for later:** R006 (deployment to VPS2, M004), R007 (product refresh/cron, M006), R008 (product alerts, M006), R003/R010 (agents, M007), R009 (analytics, M005), R011 (domain management, M004), R012 (finances full, M008)
- **Orphan risks:** RC-M003-03 resolved — "Generate Site" button in admin is included in S01 scope; RC-M003-04 resolved — basic job progress polling in S02, real-time subscriptions deferred to M004

## Slices

- [x] **S01: Astro Templates + Build Pipeline** `risk:high` `depends:[]`
  > After this: user clicks "Generate Site" in admin panel for a site with fixture data, a BullMQ job runs, Astro builds three template variants (Classic, Modern, Minimal) producing a real `dist/` with homepage, category, product, and legal pages — browsable locally with correct CSS theming, affiliate link structure, and no broken routes.

- [x] **S02: DataForSEO Product Fetch + Image Pipeline** `risk:high` `depends:[S01]`
  > After this: generation job fetches real Amazon product data from DataForSEO Merchant API (async task → poll → get), downloads product images, converts to WebP via Sharp, writes categories and products to Supabase, then builds a real site with live product data and local images — job progress visible in admin panel site detail via `ai_jobs` polling.

- [x] **S03: ContentGenerator** `risk:medium` `depends:[S02]`
  > After this: generation job calls Claude API to produce AI-written SEO texts (~400 words), product descriptions, pros/cons, opinion summaries, and meta descriptions in the site's language — throttle-aware with exponential backoff, writes `focus_keyword` to DB for each entity, content persisted incrementally to Supabase before Astro build.

- [x] **S04: SEO Scorer** `risk:low` `depends:[S03]`
  > After this: every generated page receives a 0–100 SEO score across 8 categories (title, meta description, headings, content length, readability, keyword density, structured data, internal links), scores persisted to `seo_scores` table, and visible as a score table in the admin panel site detail view.

## Boundary Map

### S01 → S02

Produces:
- `apps/generator/` — complete Astro project with 3 templates (Classic, Modern, Minimal), all page types (homepage, category, product, legal), CSS custom property theming via `define:vars` in layout
- `apps/generator/src/data/<slug>/site.json` — data injection contract: `{ site, categories, products }` shape that `getStaticPaths()` reads
- `GenerateSiteJob` BullMQ worker scaffold — accepts `{ siteId }`, reads site from Supabase, writes fixture data to `src/data/`, calls `build()`, writes `ai_jobs` progress record
- Admin panel "Generate Site" button in site detail page → dispatches BullMQ job → polls `ai_jobs` for status display (stub: fixture products only)
- `apps/generator/package.json` with Astro, Tailwind v4, `@astrojs/tailwind`, and image deps installed

Consumes:
- `packages/shared` — `SiteCustomizationSchema`, `AMAZON_MARKETS`, `Language` types (stable from M002)
- `packages/db` — `createServiceClient()`, `Database` types for `sites`, `tsa_categories`, `tsa_products` (stable from M001)
- Supabase Cloud — `sites` table with at least one real row for fixture testing

### S02 → S03

Produces:
- DataForSEO client (`packages/agents/src/clients/dataforseo.ts`) — `searchProducts(keyword, market)` and `getProductsByAsin(asins[])` with async task → poll loop
- Image pipeline (`packages/agents/src/pipeline/images.ts`) — `downloadAndConvertImage(url, destPath)` using Sharp; `p-limit` concurrency cap of 5
- Real `tsa_categories` and `tsa_products` rows in Supabase (from live DataForSEO call)
- `tsa_products.images` — array of local WebP paths (`/images/products/<asin>-<n>.webp`) written to DB after image processing
- `GenerateSiteJob` updated — phases: `fetch_products` → `process_images` → `build`; progress written to `ai_jobs` with `{ phase, done, total }` payload

Consumes:
- S01 build pipeline — `src/data/<slug>/` injection contract, `build()` call pattern
- DataForSEO API credentials in `.env`

### S03 → S04

Produces:
- `ContentGenerator` (`packages/agents/src/content-generator.ts`) — generates per-category SEO text, per-product description/pros/cons/opinion/meta_description using `@anthropic-ai/sdk` structured outputs with Zod schemas; writes content + `focus_keyword` to Supabase incrementally
- Zod content schemas: `CategoryContentSchema`, `ProductContentSchema` (exportable for reuse)
- `GenerateSiteJob` updated — phase `generate_content` inserted between `process_images` and `build`; BullMQ rate limiter or manual `sleep(ms)` between Claude calls
- All `tsa_categories.focus_keyword` and `tsa_products.focus_keyword` fields populated in Supabase before SEO Scorer runs

Consumes:
- S02 product data in Supabase — `tsa_categories`/`tsa_products` with real ASINs, titles, prices
- Anthropic API credentials in `.env`

### S04 → milestone complete

Produces:
- `packages/seo-scorer/src/index.ts` — `scorePage(html: string, focusKeyword: string, pageType: 'homepage' | 'category' | 'product' | 'legal'): SeoScore` with 8 category subscores + total
- `SeoScore` type exported from `packages/seo-scorer`
- `seo_scores` rows written after each Astro build (upsert by site_id + page_path)
- Admin panel site detail page — SEO scores table showing page path, page type, total score, and per-category breakdown
- `GenerateSiteJob` updated — phase `score_pages` after `build`; reads `dist/` HTML files, scores each, writes to Supabase

Consumes:
- S03 build output — real AI-content-enriched `dist/` HTML files with `focus_keyword` available from DB
- `cheerio`, `text-readability` npm packages
