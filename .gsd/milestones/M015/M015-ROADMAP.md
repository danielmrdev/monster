# M015: SEO Content Generation

**Vision:** Four contextual buttons in the admin panel that fire BullMQ background jobs running the Claude Agent SDK to generate SEO content for homepage, categories, and products — with a `content_quality_score` feedback loop (≥80 or best-of-3) that iterates before saving to Supabase.

## Success Criteria

- "Generate Homepage SEO" button in site detail SEO tab saves `homepage_seo_text` + `focus_keyword` to the site row
- "Generate SEO" button on category detail page saves `seo_text`, `focus_keyword`, `description` to the category row
- "Generate SEO" button on a product row saves `detailed_description`, `pros_cons`, `user_opinions_summary`, `meta_description` to the product row
- "Generate All Product SEO" button on category page batch-processes all products missing content (batches of 10)
- Every generation attempt is scored via `scorePage()` — content_quality_score logged; if < 80, retry with score feedback in prompt (max 3 attempts)
- Job status visible on each relevant page via ai_jobs polling (pending → running → completed/failed)
- New worker jobs registered in `worker.ts` with graceful shutdown

## Key Risks / Unknowns

- `marked` not in `@monster/agents` deps — must be added before scoring wrapper works
- Minimal HTML wrapper for scoring must be realistic enough to produce a meaningful `content_quality_score` (not 0)
- Agent SDK `query()` without tools and with `maxTurns:3` — simple pattern but needs validation in a real job

## Proof Strategy

- `marked` missing → retire in S01 by running `pnpm add marked` in agents package and confirming build
- HTML wrapper realism → retire in S01 by running `scorePage()` against a sample wrapped text and confirming `content_quality_score > 0`
- Agent SDK `query()` without tools → retire in S02 by successfully completing a homepage job end-to-end

## Verification Classes

- Contract verification: ai_jobs row created with correct job_type; worker picks up job; DB fields updated after completion
- Integration verification: full button→job→generate→score→save flow for each of the 4 actions
- Operational verification: worker.ts registers the new SeoContentJob; SIGTERM closes it gracefully
- UAT / human verification: user clicks each button in the admin panel and observes status + saved content

## Milestone Definition of Done

This milestone is complete only when all are true:

- All 4 SEO generation actions (homepage, category, single product, all products) work end-to-end
- Scoring feedback loop iterates at least once when content_quality_score < 80 on first attempt
- Best-of-3 result saved even when 80 is not reached
- Worker registered and shuts down cleanly
- Status UI shows real-time feedback on site SEO tab, category detail page, and category product list

## Requirement Coverage

- Covers: R001, R002, R003, R004, R005, R006
- Partially covers: none
- Leaves for later: R007, R008
- Orphan risks: none

## Slices

- [ ] **S01: SEO Job Infrastructure** `risk:high` `depends:[]`
  > After this: `seo-content` queue exists, `SeoContentJob` worker skeleton registered in worker.ts, `marked` added to agents deps, `scoreContentQuality()` helper works on a sample wrapped text, `enqueueHomepageSeo()` server action creates an ai_jobs row

- [ ] **S02: Homepage SEO Generation** `risk:medium` `depends:[S01]`
  > After this: "Generate Homepage SEO" button in site detail SEO tab fires a job that generates homepage text with scoring loop and saves `homepage_seo_text` + `focus_keyword` to the site row; status visible via polling

- [ ] **S03: Category SEO Generation** `risk:medium` `depends:[S01]`
  > After this: "Generate SEO" button on category detail page generates `seo_text`, `focus_keyword`, `description` with scoring loop and saves to the category row; status visible

- [ ] **S04: Product SEO Generation** `risk:medium` `depends:[S01]`
  > After this: "Generate SEO" button per product row + "Generate All" button on category page; all 4 product SEO fields generated and saved for single and batch modes

- [ ] **S05: SEO Job Status UI** `risk:low` `depends:[S01,S02,S03,S04]`
  > After this: every SEO generate button has a co-located status badge that polls ai_jobs and shows pending/running/completed/failed with attempt count and final content_quality_score

## Boundary Map

### S01 → S02, S03, S04, S05

Produces:
- `packages/agents/src/jobs/seo-content.ts` — `SeoContentJob` class with `register()` method; handler stub that picks up job payload
- `packages/agents/src/queue.ts` additions — `createSeoContentQueue()`, `seoContentQueue()` singleton factory
- `packages/agents/src/index.ts` additions — `enqueueSeoContent()` export + `SeoContentPayload` type
- `packages/agents/src/seo-scorer-wrapper.ts` — `scoreMarkdown(text, keyword, pageType)` helper: wraps markdown in minimal HTML → calls `scorePage()` → returns `content_quality_score`
- `apps/admin/src/app/(dashboard)/sites/[id]/seo/actions.ts` — server actions: `enqueueHomepageSeo(siteId)`, `enqueuecategorySeo(siteId, categoryId)`, `enqueueProductSeo(siteId, productId)`, `enqueueAllProductsSeo(siteId, categoryId)` — each creates an ai_jobs row then calls `seoContentQueue().add()`
- `marked` added to `packages/agents/package.json`

Consumes:
- nothing (first slice)

### S02 → S05

Produces:
- `apps/admin/src/app/(dashboard)/sites/[id]/GenerateHomepageSeoButton.tsx` — client button component
- Homepage SEO job handler in `seo-content.ts` — `case 'homepage'`: Agent SDK `query()` with 3-attempt scoring loop, saves `sites.homepage_seo_text` + `focus_keyword`

Consumes from S01:
- `seoContentQueue()` factory
- `scoreMarkdown()` helper
- `enqueueHomepageSeo()` server action

### S03 → S05

Produces:
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/GenerateCategorySeoButton.tsx` — client button
- Category SEO job handler in `seo-content.ts` — `case 'category'`: Agent SDK `query()` with scoring loop, saves `tsa_categories.seo_text`, `focus_keyword`, `description`

Consumes from S01:
- `seoContentQueue()` factory
- `scoreMarkdown()` helper
- `enqueueategorySeo()` server action

### S04 → S05

Produces:
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/GenerateProductSeoButton.tsx` — single product button
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/GenerateAllProductsSeoButton.tsx` — batch button
- Product SEO job handler in `seo-content.ts` — `case 'product'` and `case 'products_batch'`: Agent SDK `query()` per product, scoring loop on `detailed_description`, saves all 4 product SEO fields

Consumes from S01:
- `seoContentQueue()` factory
- `scoreMarkdown()` helper
- `enqueueProductSeo()`, `enqueueAllProductsSeo()` server actions

### S05 consumes from S01, S02, S03, S04

Produces:
- `apps/admin/src/app/(dashboard)/sites/[id]/SeoJobStatus.tsx` — polling component for SEO job types; accepts `siteId` + optional `categoryId` + `jobType` filter
- Wired into: site detail SEO tab (homepage), category detail page (category + batch products), category product list rows (single product)

Consumes from S01–S04:
- ai_jobs rows with `job_type` in `['seo_homepage', 'seo_category', 'seo_product', 'seo_products_batch']`
- `getLatestSeoJobStatus(siteId, jobType, entityId?)` server action (added in S05)
