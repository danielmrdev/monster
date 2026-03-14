---
estimated_steps: 6
estimated_files: 4
---

# T02: Add unique constraint migration + wire `score_pages` phase into `GenerateSiteJob`

**Slice:** S04 — SEO Scorer
**Milestone:** M003

## Description

Two things must happen before scores can be persisted: (1) the `seo_scores` table needs a unique constraint on `(site_id, page_path)` — without it, Supabase `.upsert()` with `onConflict` throws a Postgres error; (2) the `score_pages` phase must be wired into `GenerateSiteJob` after the Astro `build()` call. This task does both.

Depends on T01 (`@monster/seo-scorer` built and linked in workspace).

## Steps

1. **Write migration `20260314000001_seo_unique.sql`**:
   ```sql
   -- Add unique constraint to seo_scores for idempotent upserts on rebuild.
   -- Required by packages/agents score_pages phase (.upsert with onConflict).
   ALTER TABLE seo_scores
     ADD CONSTRAINT seo_scores_site_page_unique UNIQUE (site_id, page_path);
   ```
   Place in `packages/db/supabase/migrations/`. Apply to Supabase Cloud via `supabase db push` or via the Supabase dashboard SQL editor. (In auto-mode: use the SQL editor — `supabase` CLI is not confirmed available.)

2. **Add `@monster/seo-scorer` to `packages/agents`** — in `packages/agents/package.json`, add `"@monster/seo-scorer": "workspace:*"` to `dependencies`. Run `pnpm install` from monorepo root.

3. **Import `scorePage` in `generate-site.ts`**:
   ```ts
   import { scorePage } from '@monster/seo-scorer';
   import type { PageType } from '@monster/seo-scorer';
   ```
   Add after existing imports. Confirm the import resolves to `packages/seo-scorer/dist/index.js` via workspace symlink.

4. **Add `pageType` inference helper** — inline function (or inline logic) in the worker file:
   ```ts
   function inferPageType(filePath: string): PageType {
     const rel = filePath.replace(/\\/g, '/');
     if (rel === 'index.html') return 'homepage';
     if (rel.startsWith('categories/')) return 'category';
     if (rel.startsWith('products/')) return 'product';
     return 'legal';
   }
   function filePathToPagePath(filePath: string): string {
     // filePath is relative to dist/ (from glob)
     let p = filePath.replace(/\\/g, '/');
     p = p.replace(/index\.html$/, '').replace(/\.html$/, '/');
     if (!p.startsWith('/')) p = '/' + p;
     return p || '/';
   }
   ```

5. **Build focus keyword map from `siteData`** — just before the `score_pages` phase block, construct:
   ```ts
   const keywordMap = new Map<string, string>();
   // homepage
   keywordMap.set('/', siteData.site.focus_keyword ?? '');
   // categories
   for (const cat of siteData.categories) {
     keywordMap.set(`/categories/${cat.slug}/`, cat.focus_keyword ?? '');
   }
   // products
   for (const prod of siteData.products) {
     keywordMap.set(`/products/${prod.slug}/`, prod.focus_keyword ?? '');
   }
   // legal pages have no keyword — left absent from map ('' default)
   ```

6. **Insert `score_pages` phase block** — immediately after the `chdir` finally block, before the `ai_jobs` 'completed' update:
   ```ts
   // ── 6. Score pages ────────────────────────────────────────────────
   await supabase
     .from('ai_jobs')
     .update({ payload: { phase: 'score_pages', done: 0, total: 0 } })
     .eq('bull_job_id', job.id ?? '');

   const distDir = join(GENERATOR_ROOT, '.generated-sites', slug, 'dist');
   const { glob } = await import('node:fs/promises');
   const htmlFiles = await Array.fromAsync(glob('**/*.html', { cwd: distDir }));
   const total = htmlFiles.length;
   console.log(`[GenerateSiteJob] score_pages: ${total} pages to score`);

   const scoreRows: Array<Record<string, unknown>> = [];
   let done = 0;
   for (const relPath of htmlFiles) {
     try {
       const absPath = join(distDir, relPath);
       const html = readFileSync(absPath, 'utf-8');
       const pageType = inferPageType(relPath);
       const pagePath = filePathToPagePath(relPath);
       const focusKeyword = keywordMap.get(pagePath) ?? '';
       const score = scorePage(html, focusKeyword, pageType);
       console.log(`[GenerateSiteJob] score_pages: ${pagePath} → ${score.overall} (${score.grade})`);
       scoreRows.push({
         site_id: site.id,
         page_path: pagePath,
         page_type: pageType,
         overall_score: score.overall,
         grade: score.grade,
         content_quality_score: score.content_quality,
         meta_elements_score: score.meta_elements,
         structure_score: score.structure,
         links_score: score.links,
         media_score: score.media,
         schema_score: score.schema,
         technical_score: score.technical,
         social_score: score.social,
         suggestions: score.suggestions ?? [],
       });
       done++;
       await supabase
         .from('ai_jobs')
         .update({ payload: { phase: 'score_pages', done, total } })
         .eq('bull_job_id', job.id ?? '');
     } catch (err) {
       console.error(`[GenerateSiteJob] score_pages: error scoring ${relPath}:`, err);
     }
   }

   if (scoreRows.length > 0) {
     const { error: upsertError } = await supabase
       .from('seo_scores')
       .upsert(scoreRows, { onConflict: 'site_id,page_path' });
     if (upsertError) {
       console.error('[GenerateSiteJob] score_pages: upsert error:', upsertError.message);
     } else {
       console.log(`[GenerateSiteJob] score_pages: ${scoreRows.length}/${total} pages scored and persisted`);
     }
   }
   ```
   Note: `readFileSync` is already imported in `generate-site.ts`. `join` is already imported.

## Must-Haves

- [ ] Migration file `20260314000001_seo_unique.sql` written with correct `ALTER TABLE` statement
- [ ] `@monster/seo-scorer` added to `packages/agents/package.json` dependencies
- [ ] `scorePage` imported in `generate-site.ts` without TypeScript errors
- [ ] `score_pages` phase block appears after the Astro build's `finally` block and before `ai_jobs` 'completed' update
- [ ] Legal pages inferred correctly (not homepage/category/product)
- [ ] Per-page errors are caught and logged without aborting the phase
- [ ] `pnpm --filter @monster/agents typecheck` exits 0
- [ ] `pnpm --filter @monster/agents build` exits 0

## Verification

- `pnpm --filter @monster/agents typecheck` exits 0
- `pnpm --filter @monster/agents build` exits 0 (worker.js produced)
- `grep -n "score_pages\|scorePage\|inferPageType" packages/agents/src/jobs/generate-site.ts` — all three present
- Migration file exists: `ls packages/db/supabase/migrations/20260314000001_seo_unique.sql`

## Observability Impact

- Signals added: `[GenerateSiteJob] score_pages: <pagePath> → <score> (<grade>)` per page; `[GenerateSiteJob] score_pages: N/M pages scored and persisted` on phase completion; error lines on per-page failures
- How a future agent inspects this: `SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id = '<id>' ORDER BY page_path` after a job run; `ai_jobs.payload.phase = 'score_pages'` + `done/total` for live progress
- Failure state exposed: per-page errors logged with `relPath` and error message; upsert errors logged with Supabase error message; phase does not abort job on individual page failure

## Inputs

- `packages/seo-scorer/dist/index.js` + `dist/index.d.ts` — produced by T01
- `packages/agents/src/jobs/generate-site.ts` — current file; `score_pages` phase inserts after line ~520 (after `chdir` finally block)
- `packages/db/supabase/migrations/` — migration directory
- S04-RESEARCH.md — `score_pages` insertion point, `pageType` inference logic, `keywordMap` construction

## Expected Output

- `packages/db/supabase/migrations/20260314000001_seo_unique.sql` — unique constraint migration
- `packages/agents/src/jobs/generate-site.ts` — updated with `score_pages` phase, `scorePage` import, helpers
- `packages/agents/package.json` — `@monster/seo-scorer: workspace:*` added to dependencies
