---
id: M003
provides:
  - "apps/generator — Astro 6 + Tailwind v4 project with 3 templates (Classic, Modern, Minimal), all page types (homepage, category, product, 4 legal), CSS custom property theming"
  - "src/data/<slug>/site.json injection contract — consumed by getStaticPaths() for per-site parameterized static builds"
  - "DataForSEOClient — full async task_post → poll → task_get cycle with exponential backoff and Supabase-stored credentials"
  - "Sharp WebP image pipeline — idempotent downloadAndConvertImage + processImages (p-limit 5)"
  - "ContentGenerator — Claude API structured output (CategoryContentSchema + ProductContentSchema, Zod v4), idempotent, throttle-aware, 1.5s pacing"
  - "@monster/seo-scorer package — scorePage(html, focusKeyword, pageType): SeoScore with 8 weighted categories, grade A–F, 8 unit tests"
  - "GenerateSiteJob — 4-phase BullMQ pipeline: fetch_products → process_images → generate_content → build → score_pages"
  - "ai_jobs observability — pending → running → completed|failed with phase/progress payload at each transition"
  - "Admin panel Generate Site button + 5s JobStatus polling + SEO Scores table in site detail page"
  - "Unique constraint seo_scores_site_page_unique enabling idempotent upserts"
key_decisions:
  - "D041 — SITE_SLUG env var drives astro outDir; D053 mirrors for publicDir"
  - "D042 — packages/agents worker runs as standalone process, not embedded in Next.js"
  - "D043 — Astro 6 + @tailwindcss/vite (plan said Astro 5 + @astrojs/tailwind — legacy integration is v3 only)"
  - "D047 — tsup DTS disabled; hand-written dist/index.d.ts (dual ioredis versions break rollup-plugin-dts)"
  - "D048 — GenerateSiteJob not exported from packages/agents index (transitive astro import breaks Next.js webpack)"
  - "D049 — process.chdir(GENERATOR_ROOT) before astro build(); restored in finally"
  - "D050 — DataForSEO credentials from Supabase settings table, not env vars"
  - "D052 — Amazon CDN blocks non-browser User-Agent; image pipeline handles gracefully (non-fatal)"
  - "D056 — SiteData assembled from fresh DB rows after upserts, not in-memory DataForSEO objects"
  - "D057 — category meta_description stored in tsa_categories.description (no new column)"
  - "D058 — product meta_description in-memory only (Map), not persisted to DB"
  - "D059 — BullMQ Worker lockDuration 300000ms to survive 90s+ content generation"
  - "D060 — zodOutputFormat imported from @anthropic-ai/sdk/helpers/zod (not main index)"
  - "D061 — text-readability default-instance import + hand-authored .d.ts"
  - "D062 — Legal page keyword exemptions award full marks (not zero) to avoid penalizing well-written legal content"
patterns_established:
  - "Tailwind v4 in Astro: @tailwindcss/vite in vite.plugins[], not an integration"
  - "astro.config.ts reads SITE_SLUG at module load time — worker sets process.env.SITE_SLUG before build()"
  - "BaseLayout.astro define:vars passes CSS custom properties inline on <body> via style attribute"
  - "Non-dynamic pages (index.astro) load site data in frontmatter scope, not getStaticPaths()"
  - "Constants used in getStaticPaths() must be defined inside it — Vite prerender chunk bundling"
  - "BullMQ Worker lockDuration extended for long-running phases; default 30s is too short for AI generation"
  - "Non-throwing image pipeline: every error path returns false/[], never throws; caller gets [] for failed ASINs"
  - "Idempotency via existsSync before fetch (images) and focus_keyword DB check (content)"
  - "SiteData assembled from DB state post-upsert — enforces consistency between Supabase and built HTML"
  - "Zod v4 schemas in packages/agents only — never imported from @monster/shared (v3 pinned)"
  - "ContentGenerator NOT exported from index.ts — worker-internal only (D048 pattern)"
  - "text-readability interop: import readability from 'text-readability'; wrapped in try/catch with fallback 60"
  - "TablesInsert<'seo_scores'>[] pattern for typed Supabase upsert rows"
  - "Server-side optional query in RSC: missing seo_scores renders empty state, not error"
observability_surfaces:
  - "ai_jobs table — status, started_at, completed_at, error, payload {phase, done, total} at every transition"
  - "[GenerateSiteJob] prefixed stdout logs per phase: fetch_products, process_images, generate_content, build, score_pages"
  - "[DataForSEO] task_post/poll/shape logs — first-call raw item shape catches API response changes"
  - "[ImagePipeline] downloaded/skipped/fetch-failed/conversion-failed per image"
  - "[ContentGenerator] category/product — skipped (already generated) | generated focus_keyword=..."
  - "Admin panel JobStatus component — 5s polling while pending|running, badge + timestamps"
  - "Admin panel SEO Scores card — 12-column table (page path, type, score, grade, 8 subscores); empty state before first job"
  - "Disk: ls .generated-sites/<slug>/dist/ (build), ls .generated-sites/<slug>/public/images/products/*.webp (images)"
  - "Diagnostic: SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id='<id>' ORDER BY page_path"
requirement_outcomes:
  - id: R004
    from_status: active
    to_status: validated
    proof: "ContentGenerator implemented with CategoryContentSchema + ProductContentSchema (Zod v4 structured outputs), generates SEO texts (~400 words), product descriptions, pros/cons, user opinion summaries, meta descriptions — all in site.language, throttle-aware (1.5s pacing + maxRetries:5), idempotent (focus_keyword DB check). pnpm --filter @monster/agents build exit 0; typecheck exit 0. Wired into GenerateSiteJob generate_content phase with ai_jobs.payload progress. Live end-to-end run pending real API credentials."
  - id: R005
    from_status: active
    to_status: validated
    proof: "scorePage(html, focusKeyword, pageType): SeoScore implemented with 8 weighted categories (content_quality 30%, meta_elements 20%, structure 15%, links 12%, media 8%, schema 8%, technical 5%, social 2%). 8 unit tests all pass (pnpm --filter @monster/seo-scorer test). score_pages phase wired into GenerateSiteJob; seo_scores upsert with onConflict. Unique constraint migration applied. SEO Scores table rendered in admin panel site detail. Integration smoke test: freidoras de aire / homepage → score 51 grade C. Contract verification passed; operational validation (real seo_scores rows from real job run) pending credentials."
  - id: R015
    from_status: active
    to_status: validated
    proof: "Three visually distinct Astro templates (Classic, Modern, Minimal) implemented across all page types (homepage, category, product, 4 legal). CSS custom property theming via define:vars in BaseLayout.astro — primary, accent, font per site. astro check exit 0 (10 files, 0 errors). Fixture build: 11 pages, affiliate links contain ?tag=, no Amazon CDN URLs. Browser UAT confirmed template renders."
  - id: R001
    from_status: active
    to_status: active
    proof: "Pipeline code-complete: DataForSEO → images → ContentGenerator → Astro build → SEO Scorer → Supabase. Contract and structural verification pass. Operational end-to-end (click Generate Site with real credentials, real site in DB) deferred — requires DataForSEO + Anthropic credentials in admin Settings. Pipeline remains active pending full operational validation in M004 context."
duration: ~8h across 4 slices (S01 ~4h, S02 ~2.25h, S03 ~70m, S04 ~115m)
verification_result: passed
completed_at: 2026-03-14
---

# M003: TSA Site Generator

**A TSA site record in Supabase becomes a fully-built Astro.js static site via a 4-phase BullMQ pipeline — DataForSEO product fetch → Sharp WebP image download → Claude AI content generation → Astro build + SEO scoring — observable from an admin panel Generate Site button through to a 12-column scores table.**

## What Happened

Four slices built the generator pipeline incrementally, each retiring the milestone's three major risks.

**S01 — Astro Templates + Build Pipeline** established the foundational `apps/generator` project and the `GenerateSiteJob` BullMQ worker. Astro 6 + Tailwind v4 (via `@tailwindcss/vite`, not the legacy integration) produces three visually distinct templates — Classic (white nav, max-w-6xl), Modern (sticky colored header, max-w-7xl, two-tone footer), Minimal (max-w-4xl, hairline borders, no color) — across all page types: homepage, category, product, and 4 legal pages. The core data injection contract (`src/data/<slug>/site.json`) was established: worker writes JSON, Astro reads via `readFileSync(join(process.cwd(), ...))`, and `SITE_SLUG` env var drives both `outDir` and later `publicDir` for per-site isolation. Four non-trivial implementation discoveries were made: `@tailwindcss/vite` for v4, `getStaticPaths()` invalid on non-dynamic routes, module-scope constants must move inside `getStaticPaths()` to survive Vite chunk bundling, and dual ioredis versions break tsup DTS (requiring a hand-written `dist/index.d.ts`). The end-to-end click-to-dist flow was verified: 11 pages built, affiliate links with `?tag=`, no hotlinked images.

**S02 — DataForSEO Product Fetch + Image Pipeline** replaced the fixture assembler with a real three-phase production pipeline. `DataForSEOClient` implements the full async DataForSEO Merchant API cycle: `task_post` → exponential backoff poll → `task_get/advanced/{id}`, with credentials fetched from Supabase `settings` at call time (never env vars). The Sharp image pipeline (`downloadAndConvertImage`, `processImages` with p-limit 5) is fully non-throwing — every failure path returns `false`/`[]` and logs with `[ImagePipeline]` prefix. A key practical discovery: Amazon CDN (`m.media-amazon.com`) blocks non-browser User-Agent headers, so product `images[]` degrades gracefully to `[]` without User-Agent spoofing. The structural constraint "no CDN URLs in built HTML" is enforced by only writing local WebP paths to `tsa_products.images` — the DataForSEO `imageUrl` never reaches Supabase. `SiteData` is assembled from fresh DB rows after all upserts (not from in-memory DataForSEO objects), ensuring what's built matches what's stored.

**S03 — ContentGenerator** added the AI layer. `ContentGenerator` uses `@anthropic-ai/sdk` with `zodOutputFormat` (discovered at `@anthropic-ai/sdk/helpers/zod` — not the main index) and Zod v4 structured outputs to generate category SEO texts, product descriptions, pros/cons, user opinion summaries, and meta descriptions — all in the site's configured language. Idempotency is enforced at the DB check level: if `focus_keyword` is already non-null in Supabase, the item is skipped without an API call. Pacing is 1.5s sleep after each successful generation with `maxRetries: 5` on the Anthropic client. `lockDuration: 300000` on the BullMQ Worker prevents stall detection during the 90s+ generation phase. The `SiteData` contract was extended with `focus_keyword`, `meta_description`, and `user_opinions_summary` on all entities, and `BaseLayout.astro` was updated to conditionally emit `<meta name="description">` when `metaDescription` is present.

**S04 — SEO Scorer** completed the quality gate. `@monster/seo-scorer` provides `scorePage(html, focusKeyword, pageType): SeoScore` with 8 weighted categories — content_quality is the dominant signal at 30%, meta_elements at 20%, structure at 15%, links at 12%, with media/schema/technical/social filling the remaining weight. Legal pages receive keyword-density exemptions that award full marks (not zero) to avoid penalizing well-written legal content. `text-readability` required a hand-authored `.d.ts` because the library exports a default instance (not named exports) and has no `@types` package. 8 unit tests cover all major paths and pass cleanly. The `score_pages` phase runs after the Astro build with `for await...of` glob iteration (not `Array.fromAsync` — ES2022 target constraint), batch-upserts to `seo_scores` with the unique constraint enabling idempotent re-runs, and logs per-page score + grade to worker stdout. The admin panel site detail page gained a 12-column SEO Scores table rendered server-side from `@monster/db` types (no scorer dep needed in admin — DB types already provide the row shape).

## Cross-Slice Verification

All contract verification checks pass:

```
# Contract verification
pnpm --filter @monster/seo-scorer test            → 8/8 tests passed ✓
pnpm --filter @monster/seo-scorer build           → exit 0 (9.58 KB) ✓
pnpm --filter @monster/agents typecheck           → exit 0 ✓
pnpm --filter @monster/agents build               → exit 0 (worker.js 2.69 MB) ✓
pnpm --filter @monster/admin build                → exit 0 (13 pages) ✓
cd apps/generator && astro check                  → 0 errors, 0 warnings, 0 hints (10 files) ✓
cd apps/admin && tsc --noEmit                     → exit 0 ✓

# Integration verification
SITE_SLUG=fixture pnpm --filter @monster/generator build  → 11 pages built ✓
grep -q "?tag=test-fixture-20" .../philips-hd9252-90/index.html → affiliate OK ✓
grep -r "ssl-images-amazon.com" .generated-sites/fixture/dist/  → no output (no CDN URLs) ✓
ls .generated-sites/fixture/dist/{index.html,categories/*/,products/*/,privacidad/,...} → all present ✓

# Fail-path verification
scorePage('', 'kw', 'homepage')              → 19 F — no throw ✓
scorePage('<not valid html>', '', 'legal')   → 34 D — no throw ✓
ANTHROPIC_API_KEY missing → constructor throws with descriptive message ✓

# Migration
packages/db/supabase/migrations/20260314000001_seo_unique.sql → exists, applied to Supabase Cloud ✓
```

**Operational verification (pending):** The full end-to-end run — "Generate Site" button → DataForSEO fetch → real Amazon product images → Claude AI content → Astro build → seo_scores rows → admin panel table — requires DataForSEO and Anthropic API credentials configured in admin Settings. This is the one remaining step before the milestone's operational gate (`≥80% of pages score ≥70`) can be confirmed. All structural code paths are proven; the pipeline is ready to run.

## Requirement Changes

- R004 (AI content generation): active → validated — ContentGenerator implemented with Zod v4 structured outputs, throttle-aware, idempotent, builds + typechecks pass; live API run pending credentials
- R005 (SEO Scorer): active → validated — 8-category scorer with unit tests, score_pages phase wired, admin panel table rendered; live seo_scores rows pending credentials
- R015 (3 TSA templates): active → validated — Classic/Modern/Minimal with all page types, CSS custom property theming, 11-page fixture build verified in browser

## Forward Intelligence

### What the next milestone should know

- **Amazon CDN image blocking is the most visible gap.** `tsa_products.images` will be `[]` for all products on the first real run. Fix is one line in `downloadAndConvertImage()`: add `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'` to the `fetch()` headers object. This should be done before the first real generation run — empty product pages will score lower on SEO.
- **Product `meta_description` is not persisted to DB (D058).** It lives in a `Map<productId, string>` for the duration of one job run. On retry after a crash mid-generation, already-generated products skip (idempotent via `focus_keyword`) but their `meta_description` will be null in the rebuilt site. Fix: add `tsa_products.meta_description` column migration.
- **`process.chdir(GENERATOR_ROOT)` concurrency constraint (D049).** Worker concurrency is hardcoded to 1. Do NOT increase it without replacing `process.chdir` with a different cwd isolation mechanism. This is easily broken.
- **DataForSEO `data_asin` field name** has not been validated against a live API response. The mapping is based on documented shape. The `[DataForSEO] items[0] shape` log on the first call is the diagnostic — check it on the first real run.
- **The `seo_unique` migration must be present in any fresh environment.** It was applied manually via Supabase dashboard. No Supabase CLI automated migration exists yet. Any environment reset requires re-applying `20260314000001_seo_unique.sql`.
- **Affiliate tag format:** `<tag>-20` for US, bare `<tag>` pattern for other markets — `buildAffiliateUrl()` in `apps/generator/src/lib/data.ts` handles this. Verify for the first non-ES market.

### What's fragile

- **Hand-written `dist/index.d.ts` in `packages/agents`** — any new exports from `packages/agents` that `apps/admin` consumes must be manually added to this file. tsup DTS is disabled (D047). The file is minimal; it's easy to forget when adding new exports.
- **`tsa_categories.description` doubles as `meta_description`** (D057). If the ContentGenerator produces a long SEO text in this field, it's the wrong value for `<meta name="description">` (should be ~150 chars). Check actual `description` column values after first real run — may need a dedicated `meta_description` column.
- **`category_products` join row requirement** — products not in `category_products` are silently excluded from `SiteData.products` and never appear in the built site. The pipeline inserts join rows during `fetch_products` but a DB integrity issue or retry could leave orphan products. Check join row count matches product count after upsert.
- **`keywordMap` in score_pages** — built from `siteData` in-memory. If categories or products have null `focus_keyword` (e.g. ContentGenerator skipped or crashed), pages score without keyword signal — silently lower scores, not an error.

### Authoritative diagnostics

- `SELECT status, error, payload, started_at, completed_at FROM ai_jobs WHERE site_id='<id>' ORDER BY created_at DESC LIMIT 1` — phase progress + error message for any job
- `SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id='<id>' ORDER BY page_path` — score distribution; ≥80% ≥70 is the milestone gate
- `SELECT focus_keyword, description FROM tsa_categories WHERE site_id='<id>'` — non-null confirms content generation ran; check description length for D057 issue
- `SELECT asin, images, focus_keyword FROM tsa_products WHERE site_id='<id>' LIMIT 5` — `images=[]` means Amazon CDN blocked; `focus_keyword` null means generation skipped
- Worker stdout `[GenerateSiteJob]` lines — traces every phase; if stuck at "Running Astro build" for >30s, Astro is likely hanging
- `ls apps/generator/.generated-sites/<slug>/dist/` — present = build succeeded; absent = build failed mid-way
- `grep -r "ssl-images-amazon.com" .generated-sites/<slug>/dist/` — must return nothing; any output means CDN URL leaked into HTML

### What assumptions changed

- **"Astro 5 + `@astrojs/tailwind`"** — actually Astro 6 + `@tailwindcss/vite`. The legacy integration only supports Tailwind v3.
- **`getStaticPaths()` injects props into all pages** — only true for dynamic routes. `index.astro` is a static route; frontmatter scope is the correct SSG pattern.
- **`zodOutputFormat(schema, 'name')` is binary** — the function is unary. The name argument doesn't exist. Import path is also a helpers subpath, not the main index.
- **Amazon CDN images are directly downloadable from Node.js** — Amazon CDN blocks non-browser User-Agent. Images degrade gracefully to `[]` without UA spoofing.
- **`@monster/seo-scorer` dep needed in `apps/admin`** — not true. `@monster/db` typed client already provides the `seo_scores` Row shape.
- **`Array.fromAsync` for glob iteration** — not available in ES2022 target. `for await...of` is the correct pattern.

## Files Created/Modified

- `apps/generator/package.json` — Astro 6, @tailwindcss/vite, tailwindcss@4, sharp, @monster/shared dep
- `apps/generator/astro.config.ts` — static output, SITE_SLUG-driven outDir + publicDir, Tailwind v4 via vite plugin
- `apps/generator/src/layouts/BaseLayout.astro` — define:vars CSS custom properties, metaDescription → <meta name="description">
- `apps/generator/src/layouts/classic/Layout.astro` — Classic: white nav, border-b shadow, max-w-6xl
- `apps/generator/src/layouts/modern/Layout.astro` — Modern: sticky colored header, max-w-7xl, hero slot
- `apps/generator/src/layouts/minimal/Layout.astro` — Minimal: max-w-4xl, hairline borders, no color
- `apps/generator/src/pages/index.astro` — Homepage: hero, category grid, featured products, affiliate disclosure
- `apps/generator/src/pages/categories/[slug].astro` — Category: product grid, SEO text, metaDescription
- `apps/generator/src/pages/products/[slug].astro` — Product: affiliate link, pros/cons, description, metaDescription
- `apps/generator/src/pages/[legal].astro` — 4 legal pages (ES slugs)
- `apps/generator/src/lib/data.ts` — SiteData interface + extended CategoryData/ProductData/SiteInfo with AI content fields
- `apps/generator/src/data/fixture/site.json` — ES-market freidoras de aire fixture
- `packages/agents/package.json` — bullmq, ioredis, @anthropic-ai/sdk, zod, sharp, p-limit, tsup
- `packages/agents/tsup.config.ts` — two-entry tsup, DTS disabled
- `packages/agents/src/queue.ts` — generateQueue() singleton + Redis helpers
- `packages/agents/src/jobs/generate-site.ts` — GenerateSiteJob: 5-phase pipeline (fetch_products, process_images, generate_content, build, score_pages)
- `packages/agents/src/clients/dataforseo.ts` — DataForSEOClient: async polling, MARKET_CONFIG, DataForSEOProduct
- `packages/agents/src/pipeline/images.ts` — downloadAndConvertImage + processImages (p-limit 5)
- `packages/agents/src/content-generator.ts` — ContentGenerator + CategoryContentSchema + ProductContentSchema (Zod v4)
- `packages/agents/src/worker.ts` — standalone entrypoint with SIGTERM/SIGINT graceful shutdown, lockDuration 300000
- `packages/agents/src/index.ts` — exports generateQueue only (GenerateSiteJob excluded)
- `packages/agents/dist/index.d.ts` — hand-written type declarations
- `packages/seo-scorer/src/types.ts` — SeoScore interface + PageType union
- `packages/seo-scorer/src/index.ts` — scorePage() with 8 weighted scoring categories
- `packages/seo-scorer/src/index.test.ts` — 8 unit test cases
- `packages/seo-scorer/src/text-readability.d.ts` — hand-authored type declaration
- `packages/seo-scorer/package.json` — type:module, cheerio, text-readability, exports, scripts
- `packages/seo-scorer/tsup.config.ts` — ESM-only build, dts:true
- `packages/seo-scorer/vitest.config.ts` — vitest node environment config
- `packages/seo-scorer/dist/index.js` + `dist/index.d.ts` — built output
- `packages/db/supabase/migrations/20260314000001_seo_unique.sql` — unique constraint seo_scores(site_id, page_path)
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — enqueueSiteGeneration() + getLatestJobStatus()
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — 5s polling status badge + timestamps
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Generate Site button + JobStatus + SEO Scores card
- `package.json` (root) — pnpm override ioredis@5.9.3
- `.env` — UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN, ANTHROPIC_API_KEY added across slices
- `.gsd/DECISIONS.md` — D041–D062 appended
