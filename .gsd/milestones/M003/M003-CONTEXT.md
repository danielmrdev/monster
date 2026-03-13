# M003: TSA Site Generator — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M002 is complete

## Why This Milestone

The core product value: taking a site record in the DB and producing a fully-built, SEO-optimized Astro.js static site with AI-written content. This milestone delivers the generator engine, 3 TSA templates, the ContentGenerator agent (Claude API batch via BullMQ), and the SEO Scorer. By the end, a TSA site can be built locally — deployment to VPS2 comes in M004.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Trigger site generation from admin panel (or CLI) for a TSA site record
- Watch the BullMQ job progress (categories → products → AI content → Astro build → SEO scores)
- See a complete Astro.js static site in `.generated-sites/<site-slug>/`
- See SEO scores per page in the admin panel site detail view
- Open the built site locally and verify all pages render correctly

### Entry point / environment
- Entry point: "Generate Site" button in admin panel → BullMQ job
- Environment: VPS1 (Astro build runs here), Supabase Cloud, DataForSEO API
- Live dependencies: DataForSEO Merchant API, Anthropic API (Claude), Supabase

## Completion Class

- Contract complete means: Astro build produces valid HTML for all page types; SEO scores computed and stored
- Integration complete means: ContentGenerator → Supabase → Astro template pipeline works end-to-end
- Operational complete means: BullMQ job handles failures gracefully (partial progress, retries)

## Final Integrated Acceptance

- Create a TSA site record for a real niche (e.g. "freidoras de aire", ES market)
- Trigger generation → BullMQ job completes without error
- Built site has: homepage, 3+ category pages, 10+ product pages, 4 legal pages
- All pages score ≥70 on SEO Scorer
- All product images downloaded, converted to WebP, stored as local static assets
- No hotlinked images in the built HTML

## Risks and Unknowns

- **DataForSEO Merchant API** — paid API, need real credentials to test. Rate limits and response format need to be validated against actual responses.
- **Astro programmatic build** — running Astro build programmatically from a BullMQ worker (not CLI) needs validation. Astro's Node.js API must be used correctly.
- **Image download + WebP conversion** — downloading Amazon product images (from DataForSEO `image_url`) and converting to WebP at scale needs careful implementation. Sharp is the right tool.
- **ContentGenerator throttling** — generating content for 50+ products with Plan Pro will hit rate limits. BullMQ job must implement proper delays and retries.
- **Astro template architecture** — templates must be parameterized for colors/fonts/logo via CSS custom properties. Need to validate this approach with a real Astro build.

## Existing Codebase / Prior Art

- M001/M002: DB schema (tsa_categories, tsa_products, focus_keyword fields), typed client
- `docs/PRD.md`: TSA site structure, template anatomy, image pipeline, SEO Scorer factors/weights
- `docs/research/seo-scoring-research.md`: complete SEO scoring research with exact thresholds

## Relevant Requirements

- R001 — End-to-end pipeline (this milestone produces the site)
- R002 — Extensible architecture (generator must be type-aware, not TSA-specific)
- R004 — AI content generation
- R005 — SEO Scorer
- R015 — 3 TSA templates

## Scope

### In Scope
- `apps/generator`: Astro.js project with template system
- 3 TSA templates: Classic (3-col grid), Modern (premium UX), Minimal (conversion-focused)
- All page types: homepage, category, product, legal (4 pages)
- `packages/seo-scorer`: HTML analysis, 8 categories, per-page scores
- `packages/agents`: ContentGenerator (Claude API + BullMQ + Zod schemas)
- Image pipeline: download from Amazon → resize → WebP conversion (Sharp)
- Unsplash integration for hero/banner images
- BullMQ job: orchestrates full generation pipeline with progress tracking

### Out of Scope
- Deployment to VPS2 (M004)
- NicheResearcher (M007) — product data comes from DataForSEO directly in this milestone
- Product refresh/cron (M006)

## Technical Constraints

- Astro must be fully static output (`output: 'static'`) — no SSR
- Images: all local (no hotlinking). Max 1280px wide, WebP quality 80-85%
- Sharp for image processing
- ContentGenerator model: `claude-sonnet-4-5` (cost/quality balance for content)
- BullMQ jobs must be idempotent (safe to retry on failure)
- Generator reads site config from Supabase, writes build output to `.generated-sites/<slug>/`

## Integration Points

- Supabase: reads site/categories/products config, writes SEO scores + job progress
- DataForSEO Merchant API: fetches Amazon product data by keyword/ASIN
- Anthropic API: content generation via `@anthropic-ai/sdk` (NOT Agent SDK)
- BullMQ + Upstash Redis: job queue for generation pipeline
- Unsplash API: hero/banner image fetching
