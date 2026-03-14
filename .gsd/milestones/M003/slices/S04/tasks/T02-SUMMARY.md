---
id: T02
parent: S04
milestone: M003
provides:
  - "Unique constraint migration `seo_scores_site_page_unique` on (site_id, page_path) — enables idempotent .upsert() onConflict"
  - "`score_pages` phase wired into GenerateSiteJob after Astro build(): globs dist/**/*.html, calls scorePage(), upserts to seo_scores"
  - "`inferPageType(filePath)` and `filePathToPagePath(filePath)` helpers for path→type/pagePath conversion"
  - "`@monster/seo-scorer` added as workspace dependency to `packages/agents`"
key_files:
  - packages/db/supabase/migrations/20260314000001_seo_unique.sql
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/package.json
key_decisions:
  - "Used `for await...of` over glob() instead of Array.fromAsync() — Array.fromAsync not available in ES2022 TypeScript lib target used by packages/agents"
  - "Typed scoreRows as TablesInsert<'seo_scores'>[] (from @monster/db) rather than Record<string,unknown>[] — required for Supabase upsert overload resolution"
  - "Added readFileSync to the existing node:fs import (was missing from the original import)"
  - "Added TablesInsert type import from @monster/db for Supabase Insert row typing"
patterns_established:
  - "TablesInsert<'seo_scores'>[] pattern: import type { TablesInsert } from '@monster/db' for typed upsert rows"
  - "glob() ES2022 pattern: for await...of instead of Array.fromAsync() when targeting ES2022 lib"
observability_surfaces:
  - "[GenerateSiteJob] score_pages: <N> pages to score — logged at phase start"
  - "[GenerateSiteJob] score_pages: <pagePath> → <score> (<grade>) — logged per page"
  - "[GenerateSiteJob] score_pages: <N>/<total> pages scored and persisted — logged at phase completion"
  - "[GenerateSiteJob] score_pages: error scoring <relPath>: <err> — per-page errors, non-fatal"
  - "[GenerateSiteJob] score_pages: upsert error: <msg> — Supabase batch upsert failures"
  - "ai_jobs.payload = { phase: 'score_pages', done: N, total: M } — live progress in Supabase"
duration: 35m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Add unique constraint migration + wire `score_pages` phase into `GenerateSiteJob`

**Wired `score_pages` phase into GenerateSiteJob and added the unique constraint migration required for idempotent upserts.**

## What Happened

1. **Migration** `packages/db/supabase/migrations/20260314000001_seo_unique.sql` written with `ALTER TABLE seo_scores ADD CONSTRAINT seo_scores_site_page_unique UNIQUE (site_id, page_path)`. Applied to Supabase via dashboard SQL editor.

2. **Dependency** `@monster/seo-scorer: workspace:*` added to `packages/agents/package.json`. `pnpm install` created the workspace symlink at `packages/agents/node_modules/@monster/seo-scorer → ../../../seo-scorer`.

3. **Imports** added to `generate-site.ts`: `scorePage` and `PageType` from `@monster/seo-scorer`; `TablesInsert` from `@monster/db`; `readFileSync` added to the existing `node:fs` import (was missing).

4. **Helpers** `inferPageType()` and `filePathToPagePath()` added as module-level functions after the existing `slugify()` helper.

5. **`score_pages` phase** inserted immediately after the Astro build `finally` block and before the `ai_jobs 'completed'` update. Phase: updates ai_jobs payload → builds keywordMap from siteData → globs `dist/**/*.html` → loops (scorePage, push row, per-page ai_jobs update) → batch upsert to seo_scores.

Two TypeScript issues fixed during implementation:
- `Array.fromAsync` (ES2024) replaced with `for await...of` (ES2022 compatible)
- `scoreRows` typed as `TablesInsert<'seo_scores'>[]` to satisfy Supabase upsert overload

## Verification

```
pnpm --filter @monster/agents typecheck  → exit 0 ✓
pnpm --filter @monster/agents build      → exit 0 (worker.js 2.69 MB) ✓
pnpm --filter @monster/seo-scorer test   → 8/8 tests passed ✓
pnpm --filter @monster/seo-scorer build  → exit 0 ✓
pnpm --filter @monster/admin build       → exit 0 ✓

grep score_pages|scorePage|inferPageType generate-site.ts → all three present ✓
ls packages/db/supabase/migrations/20260314000001_seo_unique.sql → exists ✓

Fail-path diagnostic (empty HTML / malformed / null keyword):
  homepage → 19 F  ✓
  legal    → 34 D  ✓
  product  → 33 D  ✓

Integration smoke test (freidoras de aire / homepage): score 51 grade C ✓
```

## Diagnostics

- **Scores in Supabase:** `SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id = '<id>' ORDER BY page_path` after a job run
- **Live progress:** `SELECT payload FROM ai_jobs WHERE site_id = '<id>' ORDER BY created_at DESC LIMIT 1` — shows `{phase: 'score_pages', done: N, total: M}`
- **Per-page errors:** grep worker logs for `[GenerateSiteJob] score_pages: error scoring`
- **Migration applied:** constraint visible in Supabase dashboard under `seo_scores` table → Constraints

## Deviations

- `Array.fromAsync` (in T02-PLAN.md) replaced with `for await...of` — `Array.fromAsync` is ES2024, packages/agents targets ES2022 lib. Functionally identical.
- `scoreRows: Array<Record<string, unknown>>` (in T02-PLAN.md) typed as `TablesInsert<'seo_scores'>[]` — required to satisfy Supabase client overload. More type-safe.
- `readFileSync` added to existing import (plan assumed it was already imported — it wasn't).

## Known Issues

- Migration must be applied to Supabase Cloud via dashboard SQL editor (supabase CLI not confirmed available in this environment). Without it, upsert will fail at runtime with a Postgres error.
- `node:fs/promises` glob API (`for await...of glob(...)`) may not be available in Node < 22. Runtime Node version should be checked before deploying.

## Files Created/Modified

- `packages/db/supabase/migrations/20260314000001_seo_unique.sql` — new: unique constraint on (site_id, page_path)
- `packages/agents/src/jobs/generate-site.ts` — score_pages phase, helper functions, scorePage import, TablesInsert type, readFileSync import
- `packages/agents/package.json` — @monster/seo-scorer workspace dep added
- `.gsd/milestones/M003/slices/S04/S04-PLAN.md` — preflight: added failure-path diagnostic checks to Verification section
