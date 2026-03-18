# M015: SEO Content Generation

**Gathered:** 2026-03-18
**Status:** Ready for planning

## Project Description

Admin panel buttons that trigger AI-powered SEO content generation for TSA sites. Each action runs as a BullMQ background job using the Claude Agent SDK (`query()`). The generation loop scores the output with `@monster/seo-scorer` and iterates until `content_quality_score ≥ 80` (max 3 attempts). On each retry, the score feedback is included in the prompt so the model can correct specific weaknesses.

## Why This Milestone

The TSA skill (`/tsa` in Claude Code) already produces high-quality SEO content manually. This milestone automates that workflow into the admin panel — buttons in the right context (site detail, category page, product row) that fire-and-forget into a background job queue, with status visible via polling.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Click "Generate Homepage SEO" in the site detail SEO tab and have `homepage_seo_text` + `focus_keyword` auto-generated and saved (with scoring feedback loop)
- Click "Generate SEO" on any category detail page and have `seo_text` + `focus_keyword` + `description` auto-generated and saved
- Click "Generate All Product SEO" on a category page and have all products missing content auto-generated in batches
- Click "Generate SEO" on a single product row and have that product's SEO fields auto-generated
- See job status (pending → running → completed/failed) via polling component on each relevant page

### Entry point / environment

- Entry point: Admin panel buttons (Next.js 15 App Router)
- Environment: Production-like (VPS worker process + Upstash Redis)
- Live dependencies: Supabase, BullMQ/Redis, Anthropic API (Agent SDK)

## Completion Class

- Contract complete means: job enqueuing works, ai_jobs rows created, worker handlers process without error
- Integration complete means: buttons fire jobs, worker runs Agent SDK query, content saved to Supabase, score ≥ 80 or best-of-3 accepted
- Operational complete means: worker registered in worker.ts, graceful shutdown handles new worker

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Homepage SEO button creates an ai_jobs row, worker generates text, saves to `sites.homepage_seo_text`, score visible in logs
- Category SEO button generates and saves `tsa_categories.seo_text`, `focus_keyword`, `description` with ≥1 scoring iteration
- Product SEO (single) generates and saves all 4 product SEO fields for one ASIN
- Product SEO (all in category) processes all products missing content in batches of 10

## Risks and Unknowns

- `marked` not in `@monster/agents` deps — must add it for markdown→HTML conversion in scoring loop
- Agent SDK `query()` in a background job (without interactive MCP tools) — same pattern as NicheResearcherJob but simpler (no tools needed, just `maxTurns:3`)
- Scoring HTML wrapper must produce realistic `content_quality_score` — needs H1, meta description tag, and body text wrapped correctly

## Existing Codebase / Prior Art

- `packages/agents/src/jobs/niche-researcher.ts` — Agent SDK `query()` in BullMQ Worker, exact pattern to follow
- `packages/agents/src/content-generator.ts` — Claude API structured-output generation (NOT Agent SDK, but prompt patterns useful)
- `packages/agents/src/queue.ts` — Queue factory singletons pattern
- `packages/agents/src/worker.ts` — Worker registration and graceful shutdown
- `packages/seo-scorer/src/index.ts` — `scorePage(html, keyword, pageType)` returns `{ content_quality_score, ... }`
- `apps/admin/src/app/(dashboard)/sites/[id]/GenerateSiteButton.tsx` — client button pattern (useTransition, server action call)
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — polling status component pattern
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — server action enqueue pattern
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — SEO & Alerts tab (homepage SEO display)
- `apps/admin/src/app/(dashboard)/sites/[id]/CategoriesSection.tsx` — categories tab
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/page.tsx` — category detail page
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/CategoryProductsSection.tsx` — product list in category

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions.

## Relevant Requirements

- R001 — AI-assisted content generation for TSA sites
- R002 — SEO scoring integration in generation pipeline

## Scope

### In Scope

- Homepage SEO generation (seo_text + focus_keyword) — site level
- Category SEO generation (seo_text + focus_keyword + description/meta) — single category
- Product SEO generation — single product by ID
- Product SEO generation — all missing products in a category (batches of 10)
- Scoring feedback loop: wrap markdown in minimal HTML, score content_quality, retry up to 3× if < 80
- BullMQ job infrastructure: new `seo-content` queue + worker jobs
- ai_jobs tracking rows for each action (pending→running→completed/failed)
- Status polling UI on each relevant page

### Out of Scope / Non-Goals

- Category proposals (the `/tsa categories` action) — read-only proposal, low value to automate
- Bulk homepage generation across all sites (per-site manual trigger only in M015)
- SEO scoring of other dimensions (meta, links, schema) — only content_quality_score drives iteration
- Re-scoring/updating existing `seo_scores` table rows (that's for generate-site.ts post-build)

## Technical Constraints

- `marked` must be added to `packages/agents` dependencies (currently only in `apps/admin` and `apps/generator`)
- Agent SDK `query()` with no tools — `tools: []`, `maxTurns: 3`, `persistSession: false`
- Scoring wrapper: `<html><head><title>{focus_keyword}</title><meta name="description" content="{meta}"</head><body><h1>{focus_keyword}</h1>{html_from_marked}</body></html>`
- Products processed in batches of 10 with sequential tanda approach (mirrors the TSA skill)
- Job payload must include enough context for the worker: `{ siteId, categoryId?, productId? }`

## Integration Points

- Supabase — read site/category/product data, write generated content
- BullMQ + Redis — job queue and worker
- `@monster/seo-scorer` — already in agents deps, no change needed
- `@anthropic-ai/claude-agent-sdk` — already in agents deps

## Open Questions

- None — design confirmed in discussion
