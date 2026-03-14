# S03: ContentGenerator

**Goal:** AI-generated content (SEO texts, product descriptions, pros/cons, opinion summaries, meta descriptions) is written to Supabase before the Astro build — fully idempotent, throttle-aware, in the site's configured language, with `focus_keyword` populated for every entity.
**Demo:** Generation job runs with real Anthropic API; after completion, `tsa_categories.focus_keyword` and `tsa_products.focus_keyword` are non-null in Supabase, and the built site HTML contains AI-written product descriptions and category SEO texts.

## Must-Haves

- `ContentGenerator` class in `packages/agents/src/content-generator.ts` using `@anthropic-ai/sdk` + Zod v4 structured output
- `CategoryContentSchema` and `ProductContentSchema` — Zod v4 schemas, exported
- Idempotency: skip generation if `focus_keyword` is already non-null in the DB row
- `generate_content` phase inserted between `process_images` and `build` in `GenerateSiteJob`
- Pacing: 1.5s sleep between Claude calls + `maxRetries: 5` on Anthropic client
- `lockDuration: 300000` on BullMQ Worker to survive 60s+ content generation
- `focus_keyword` written to `tsa_categories` and `tsa_products` before build phase
- All prompts instruct Claude to generate in `site.language` (never hardcoded Spanish)
- `meta_description`, `user_opinions_summary`, `focus_keyword` added to `SiteData` interfaces in `data.ts`
- `<meta name="description">` emitted in `BaseLayout.astro` when `metaDescription` prop is present
- `tsc --noEmit` and `pnpm -r build` exit 0 after all three tasks

## Proof Level

- This slice proves: integration (real Claude API call + DB writes + HTML output)
- Real runtime required: yes — Anthropic API key must be in `.env`
- Human/UAT required: no — verification is CLI-level (DB state check + HTML grep)

## Verification

```bash
# 1. TypeScript clean across all packages
cd /home/daniel/monster && pnpm --filter @monster/agents typecheck
cd /home/daniel/monster && pnpm --filter @monster/generator build  # or tsc --noEmit equivalent

# 2. agents package builds
pnpm --filter @monster/agents build

# 3. ContentGenerator unit check — instantiate + schema inspect (no API call)
node -e "
import('@monster/agents/worker').then(() => console.log('worker loads OK'))
.catch(e => { console.error(e); process.exit(1); })
" 2>&1 | grep -E "OK|Error"

# 4. After a real job run: focus_keyword populated in DB (via Supabase MCP or direct query)
# SELECT focus_keyword FROM tsa_categories WHERE site_id = '<id>' LIMIT 5;
# SELECT focus_keyword FROM tsa_products WHERE site_id = '<id>' LIMIT 5;

# 5. AI content in built HTML
grep -r "focus_keyword\|detailed_description" .generated-sites/*/dist/products/*.html | head -5
# Verify meta description present in at least one page
grep -r '<meta name="description"' .generated-sites/*/dist/index.html

# 6. Failure-path diagnostics — verify error state is surfaced
# After a job failure, error column should be set:
# SELECT id, status, error FROM ai_jobs WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 5;
# ContentGenerator auth failure surfaces as SDK 401 — verify key presence check at startup:
node -e "
process.env.ANTHROPIC_API_KEY = '';
import('./packages/agents/dist/content-generator.js').then(m => {
  try { new m.ContentGenerator(); console.error('FAIL: should have thrown'); process.exit(1); }
  catch(e) { console.log('PASS: missing key throws:', e.message); }
}).catch(e => console.log('PASS (import error):', e.message));
" 2>&1
```

## Observability / Diagnostics

- Runtime signals: `[ContentGenerator] category "<name>" — skipped (already generated)` / `[ContentGenerator] category "<name>" — generated focus_keyword="<kw>"` / `[ContentGenerator] product "<asin>" — generated` / `[ContentGenerator] generate_content: done N/total`
- Inspection surfaces: `ai_jobs.payload` in Supabase (`{phase: "generate_content", done, total}`); `tsa_categories.focus_keyword` and `tsa_products.focus_keyword` non-null after phase
- Failure visibility: `ai_jobs.error` column set by the existing `worker.on('failed')` handler; Claude API errors surface as thrown exceptions with descriptive SDK messages
- Redaction constraints: `ANTHROPIC_API_KEY` must never appear in logs; log only key presence at startup

## Integration Closure

- Upstream consumed: `tsa_categories` and `tsa_products` rows with real ASINs (from S02); `@anthropic-ai/sdk` (new dep); Zod v4 (new dep in `packages/agents`)
- New wiring: `generate_content` phase in `GenerateSiteJob`; `ContentGenerator` import in `generate-site.ts`; extended `SiteData` interfaces flowing into Astro templates via `site.json`
- What remains: S04 (SEO Scorer reads `focus_keyword` from built HTML + DB, scores each page)

## Tasks

- [x] **T01: Implement ContentGenerator class with Zod v4 schemas** `est:1h`
  - Why: Core Claude API integration — structured output for category SEO texts and product content in the site's language, with idempotency and pacing baked in
  - Files: `packages/agents/src/content-generator.ts`, `packages/agents/package.json`
  - Do: Install `@anthropic-ai/sdk@^0.78.0` and `zod@^4.0.0` in `packages/agents` deps; implement `ContentGenerator` class with `CategoryContentSchema`, `ProductContentSchema` (Zod v4), `generateCategoryContent()`, `generateProductContent()`, 1.5s sleep between calls, `maxRetries: 5`, idempotency check on `focus_keyword !== null`
  - Verify: `pnpm --filter @monster/agents typecheck` exits 0; `pnpm --filter @monster/agents build` exits 0
  - Done when: `ContentGenerator` class builds without errors and both Zod schemas are exportable

- [x] **T02: Wire generate_content phase into GenerateSiteJob** `est:45m`
  - Why: Connects ContentGenerator to the real generation pipeline, adds BullMQ lock extension for long-running jobs, and writes content to Supabase before the build phase
  - Files: `packages/agents/src/jobs/generate-site.ts`
  - Do: Add `lockDuration: 300000` to Worker options; import `ContentGenerator`; insert `generate_content` phase between `process_images` completion and the DB fetch for assembly; call `generateCategoryContent()` for each category then `generateProductContent()` for each product; write content fields to Supabase after each call; update `ai_jobs.payload` with `{phase: "generate_content", done, total}`
  - Verify: `pnpm --filter @monster/agents typecheck` exits 0; `pnpm --filter @monster/agents build` exits 0; `grep "generate_content\|lockDuration" packages/agents/src/jobs/generate-site.ts` shows both present
  - Done when: Worker builds cleanly with `generate_content` phase wired and `lockDuration` set

- [x] **T03: Extend SiteData contract and wire meta_description into templates** `est:45m`
  - Why: ContentGenerator writes `focus_keyword`, `user_opinions_summary`, and `meta_description` to DB — the Astro templates must consume them so the built HTML contains AI content and correct meta tags for S04 to score
  - Files: `apps/generator/src/lib/data.ts`, `apps/generator/src/layouts/BaseLayout.astro`, `apps/generator/src/layouts/classic/Layout.astro`, `apps/generator/src/layouts/modern/Layout.astro`, `apps/generator/src/layouts/minimal/Layout.astro`, `packages/agents/src/jobs/generate-site.ts`
  - Do: Add `focus_keyword: string | null`, `meta_description: string | null`, `user_opinions_summary: string | null` to `ProductData`; add `focus_keyword: string | null`, `meta_description: string | null` to `CategoryData`; add `focus_keyword: string | null` to `SiteInfo`; update `siteData` assembly in `generate-site.ts` to include new fields from DB rows; add `metaDescription?: string` prop to `BaseLayout.astro` Props and emit `<meta name="description">` in `<head>`; forward `metaDescription` from each template layout to `BaseLayout`; update product and category page components to pass `meta_description` to layout
  - Verify: `pnpm --filter @monster/agents typecheck` exits 0; `pnpm --filter @monster/generator build` (or `tsc --noEmit` in generator) exits 0; `grep 'meta name="description"' apps/generator/src/layouts/BaseLayout.astro` shows the tag
  - Done when: All type checks pass, BaseLayout emits `<meta name="description">`, SiteData includes all new fields

## Files Likely Touched

- `packages/agents/src/content-generator.ts` — new
- `packages/agents/package.json` — add `@anthropic-ai/sdk`, `zod` deps
- `packages/agents/src/jobs/generate-site.ts` — generate_content phase, lockDuration
- `apps/generator/src/lib/data.ts` — extend SiteData interfaces
- `apps/generator/src/layouts/BaseLayout.astro` — metaDescription prop + meta tag
- `apps/generator/src/layouts/classic/Layout.astro` — forward metaDescription
- `apps/generator/src/layouts/modern/Layout.astro` — forward metaDescription
- `apps/generator/src/layouts/minimal/Layout.astro` — forward metaDescription
- `apps/generator/src/pages/products/[slug].astro` — pass meta_description to layout
- `apps/generator/src/pages/categories/[slug].astro` — pass meta_description to layout
