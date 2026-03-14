# S04: SEO Scorer

**Goal:** Every generated page receives a 0–100 SEO score across 8 categories, persisted to `seo_scores` in Supabase, and visible as a score table in the admin panel site detail view.
**Demo:** After `GenerateSiteJob` completes, `seo_scores` table has one row per HTML file in `dist/`, each with an overall score and all 8 category subscores. The site detail page shows a score table with page path, page type, numeric score with colour band, and letter grade.

## Must-Haves

- `packages/seo-scorer` exports `scorePage(html, focusKeyword, pageType): SeoScore` with 8 category subscores + overall score
- Unique constraint on `(site_id, page_path)` in `seo_scores` enables idempotent upserts on rebuild
- `score_pages` phase runs after Astro `build()` in `GenerateSiteJob`; scores all HTML files in `dist/`, upserts to `seo_scores`
- Legal pages exempt from keyword density scoring (D039)
- Admin panel site detail page shows SEO scores table (server-side fetch, no client polling)
- `pnpm --filter @monster/seo-scorer build` exits 0; `pnpm --filter @monster/agents typecheck` exits 0; `pnpm --filter @monster/admin build` exits 0

## Proof Level

- This slice proves: contract + operational
- Real runtime required: no — verified by typecheck + unit tests + build exit codes
- Human/UAT required: no — admin panel build verification sufficient; scores visible post-job-run

## Verification

```bash
# Failure-path diagnostic: upsert error is logged without aborting the job
# Verify the per-page error catch path: error in scorePage() is caught, logged, and loop continues
# Observable: "score_pages: error scoring <relPath>:" line in worker output; job still reaches 'completed' state
# Check ai_jobs table: score_pages phase done/total reflects successfully scored pages (not total)
# Check: if seo_scores upsert fails (e.g. constraint not applied), error is logged but job still completes
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
// Verify malformed/null inputs don't throw
const cases = [
  ['', 'kw', 'homepage'],
  ['<not valid html>', '', 'legal'],
  ['<html></html>', null, 'product'],
];
for (const [html, kw, pt] of cases) {
  try {
    const r = scorePage(html, kw ?? '', pt);
    console.assert(typeof r.overall === 'number', 'overall must be number');
    console.assert(['A','B','C','D','F'].includes(r.grade), 'grade must be letter');
    console.log('FAIL-PATH PASS:', pt, '→', r.overall, r.grade);
  } catch (e) {
    console.error('FAIL-PATH FAIL: scorePage threw for', pt, e.message);
    process.exit(1);
  }
}
"

# Failure-path diagnostic: verify scorer returns structured error-safe output on minimal/broken HTML
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
const r = scorePage('', 'kw', 'homepage');
console.assert(typeof r.overall === 'number', 'overall must be a number even for empty HTML');
console.assert(['A','B','C','D','F'].includes(r.grade), 'grade must be valid letter');
console.assert(Array.isArray(r.suggestions), 'suggestions must be an array');
console.log('FAIL-PATH PASS: empty HTML returns score', r.overall, 'grade', r.grade);
"

# Scorer unit tests
pnpm --filter @monster/seo-scorer test

# Type-safety across all affected packages
pnpm --filter @monster/seo-scorer build
pnpm --filter @monster/agents typecheck
pnpm --filter @monster/admin build

# Scorer integration smoke test (CLI)
node --input-type=module <<'EOF'
import { scorePage } from './packages/seo-scorer/dist/index.js'
const html = '<html><head><title>Test freidoras de aire</title><meta name="description" content="Las mejores freidoras de aire para tu cocina en 2024. Compara precios, opiniones y encuentra la freidora perfecta para ti."><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><h1>Freidoras de Aire</h1><p>Las freidoras de aire freidoras de aire son perfectas para cocinar sano. Las freidoras de aire te permiten cocinar con poco aceite.</p><a href="/categorias/freidoras/">Ver categorías</a></body></html>'
const result = scorePage(html, 'freidoras de aire', 'homepage')
console.log('score:', result.overall, 'grade:', result.grade)
console.assert(typeof result.overall === 'number')
console.assert(result.overall >= 0 && result.overall <= 100)
console.assert(['A','B','C','D','F'].includes(result.grade))
console.assert(typeof result.content_quality === 'number')
console.log('PASS')
EOF

# Migration applied (check Supabase — constraint exists)
# After migration: .upsert([...], { onConflict: 'site_id,page_path' }) does not throw
```

## Observability / Diagnostics

- Runtime signals: `[GenerateSiteJob] score_pages: N/M pages scored` logged per page batch; `[SEOScorer] scored <path> → <score>` per page
- Inspection surfaces: `seo_scores` table in Supabase (rows visible after job run); admin panel site detail page SEO table
- Failure visibility: scorer errors logged with page path + error message; phase update writes `{phase: 'score_pages', done: N, total: M}` to `ai_jobs.payload`; fails are non-fatal per page (one bad HTML doesn't abort the phase)

## Integration Closure

- Upstream consumed: `generate-site.ts` Astro `build()` output (`dist/`), `siteData` in memory (focus keywords), `seo_scores` table
- New wiring: `@monster/seo-scorer` added to `packages/agents` deps + `apps/admin` deps; `score_pages` phase inserted after Astro build; admin page queries `seo_scores` server-side
- What remains before milestone is truly usable end-to-end: a real job run against a live site (operational verification) — all code paths are in place after S04

## Tasks

- [x] **T01: Implement `packages/seo-scorer` with unit tests** `est:90m`
  - Why: Core scoring library — all other tasks depend on it. Self-contained; can be verified standalone before touching the pipeline.
  - Files: `packages/seo-scorer/src/types.ts`, `packages/seo-scorer/src/index.ts`, `packages/seo-scorer/package.json`, `packages/seo-scorer/tsup.config.ts`, `packages/seo-scorer/tsconfig.json`, `packages/seo-scorer/src/index.test.ts`
  - Do: Install `cheerio@^1.2.0` and `text-readability@^1.1.1` as dependencies. Install `vitest` as dev dep. Add `type: "module"`, tsup config (dts:true, ESM-only, entry `src/index.ts`), test script. Define `SeoScore` type (8 category numeric fields + `overall` + `grade` + `suggestions?`). Implement `scorePage(html, focusKeyword, pageType)` using cheerio for HTML parsing and text-readability for Flesch/sentence analysis. Body word count via `$('body').clone().find('nav, header, footer').remove().end().text()`. Scoring weights per research doc §3.3 (content_quality 30%, meta_elements 20%, structure 15%, links 12%, media 8%, schema 8%, technical 5%, social 2%). Legal pages: skip keyword density, keyword-in-title/H1/first-paragraph checks. Grade mapping: 90–100→A, 70–89→B, 50–69→C, 30–49→D, 0–29→F. Handle null from `fleschReadingEase()` by treating as neutral 60. JSON-LD parsing wrapped in try/catch — malformed = missing. Write unit tests covering: homepage scoring with keyword present, product page, legal page (keyword density skipped), missing title (scores 0 on meta_elements factor), Flesch null-safety.
  - Verify: `pnpm --filter @monster/seo-scorer test` exits 0; `pnpm --filter @monster/seo-scorer build` exits 0 with `dist/index.js` and `dist/index.d.ts` produced
  - Done when: build and tests both pass, `scorePage` callable from `dist/index.js`, exports `SeoScore` type

- [x] **T02: Add unique constraint migration + wire `score_pages` phase into `GenerateSiteJob`** `est:45m`
  - Why: Without the unique constraint, `.upsert()` with `onConflict` throws a Postgres error. Without the phase, scores are never computed or stored.
  - Files: `packages/db/supabase/migrations/20260314000001_seo_unique.sql`, `packages/agents/src/jobs/generate-site.ts`, `packages/agents/package.json`
  - Do: Write migration adding `ALTER TABLE seo_scores ADD CONSTRAINT seo_scores_site_page_unique UNIQUE (site_id, page_path)`. Add `@monster/seo-scorer: workspace:*` to `packages/agents` dependencies; run `pnpm install`. In `generate-site.ts`, import `scorePage` from `@monster/seo-scorer`. Insert `score_pages` phase block immediately after the `chdir` finally block (before the `ai_jobs` 'completed' update). Phase steps: (1) phase update to `ai_jobs`; (2) glob `dist/**/*.html` using `node:fs/promises`; (3) for each file, infer `pageType` from path, derive `pagePath` (strip `dist/`, strip `index.html`, ensure leading slash), look up `focusKeyword` from `siteData` in memory; (4) call `scorePage(html, keyword ?? '', pageType)`; (5) build upsert row; (6) batch upsert to `seo_scores` with `onConflict: 'site_id,page_path'`; (7) update `ai_jobs.payload` with `{phase: 'score_pages', done: N, total: total}`. Legal path detection: paths not under `/categories/` or `/products/` and not root `/`. Log each scored page. Errors per-page are non-fatal (catch, log, continue).
  - Verify: `pnpm --filter @monster/agents typecheck` exits 0; `pnpm --filter @monster/agents build` exits 0
  - Done when: typecheck and build pass; `score_pages` logic visible in `generate-site.ts` after the Astro build block

- [x] **T03: Add SEO scores table to admin panel site detail page** `est:30m`
  - Why: Scores in Supabase are invisible without a UI surface. The milestone requires scores "visible in the admin panel site detail view."
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/package.json`
  - Do: Add `@monster/seo-scorer: workspace:*` to `apps/admin` dependencies for `SeoScore` type (optional — type can be inlined if cleaner). In `SiteDetailPage`, add a server-side Supabase query for `seo_scores` filtered by `site_id`, ordered by `page_path`. Add an "SEO Scores" card section below the "Site Generation" card. Table columns: Page Path, Type, Score (badge coloured by grade: A→green, B→emerald, C→amber, D→orange, F→red), Grade badge, and the 8 category scores as compact numbers (or a tooltip/detail row). Use existing `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead`, `Badge` imports matching `sites/page.tsx` pattern. Show "No SEO scores yet — generate the site first." when `seo_scores` is empty for this site.
  - Verify: `pnpm --filter @monster/admin build` exits 0; `pnpm --filter @monster/admin typecheck` exits 0 (if typecheck script exists)
  - Done when: admin build passes; site detail page renders SEO scores section (visible after a real job run)

## Files Likely Touched

- `packages/seo-scorer/src/types.ts` — new
- `packages/seo-scorer/src/index.ts` — new
- `packages/seo-scorer/src/index.test.ts` — new
- `packages/seo-scorer/package.json` — updated (deps, scripts, type:module)
- `packages/seo-scorer/tsup.config.ts` — new
- `packages/seo-scorer/tsconfig.json` — already exists, may need script additions
- `packages/db/supabase/migrations/20260314000001_seo_unique.sql` — new
- `packages/agents/src/jobs/generate-site.ts` — score_pages phase added
- `packages/agents/package.json` — add @monster/seo-scorer dep
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — SEO scores section added
- `apps/admin/package.json` — add @monster/seo-scorer dep (if type import needed)
