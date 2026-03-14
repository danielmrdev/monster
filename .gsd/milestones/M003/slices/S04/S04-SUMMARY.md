---
id: S04
parent: M003
milestone: M003
provides:
  - "@monster/seo-scorer package: scorePage(html, focusKeyword, pageType): SeoScore with 8 category subscores, overall 0–100, letter grade A–F"
  - "SeoScore and PageType types exported from dist/index.d.ts"
  - "Unit tests (8 cases) covering all major scoring paths: homepage, legal exemption, missing title, Flesch null-safety, grade boundaries, product page, schema scoring"
  - "Unique constraint seo_scores_site_page_unique on (site_id, page_path) enabling idempotent .upsert() onConflict"
  - "score_pages phase wired into GenerateSiteJob after Astro build(): globs dist/**/*.html, calls scorePage(), batch-upserts to seo_scores"
  - "inferPageType() and filePathToPagePath() helpers for path→type/pagePath mapping"
  - "SEO scores table on admin panel site detail page — server-side fetch, grade badges, 8 category columns, empty state"
requires:
  - slice: S03
    provides: "AI-content-enriched Astro dist/ output, focus_keyword fields populated in tsa_categories/tsa_products"
affects: []
key_files:
  - packages/seo-scorer/src/index.ts
  - packages/seo-scorer/src/types.ts
  - packages/seo-scorer/src/index.test.ts
  - packages/seo-scorer/src/text-readability.d.ts
  - packages/seo-scorer/package.json
  - packages/seo-scorer/tsup.config.ts
  - packages/seo-scorer/vitest.config.ts
  - packages/seo-scorer/dist/index.js
  - packages/seo-scorer/dist/index.d.ts
  - packages/db/supabase/migrations/20260314000001_seo_unique.sql
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/package.json
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - "text-readability exports a default instance — import as default, call .fleschReadingEase(). Hand-wrote .d.ts because no @types package exists. (D061)"
  - "Legal page exemption awards full marks for keyword density/first-paragraph subscores, not zero — avoids penalizing well-written legal content. (D062)"
  - "cheerio 1.2.0 does not re-export Element type — used duck-typed 'name' property access ('name' in el ? (el as {name:string}).name : '')"
  - "Array.fromAsync (ES2024) replaced with for await...of (ES2022 compatible) in GenerateSiteJob"
  - "scoreRows typed as TablesInsert<'seo_scores'>[] (not Record<string,unknown>[]) — required to satisfy Supabase upsert overload"
  - "@monster/seo-scorer dep NOT added to apps/admin — seo_scores Row type flows from @monster/db alone; no scorer type imports needed in admin"
patterns_established:
  - "text-readability interop: import readability from 'text-readability'; readability.fleschReadingEase(text) — wrapped in try/catch with fallback 60"
  - "TablesInsert<'seo_scores'>[] pattern for typed Supabase upsert rows"
  - "Server-side optional query pattern in RSC: destructure { data } with no notFound() — missing seo_scores renders empty state, not error"
  - "Pure module-scope helper functions in server component (scoreColor, gradeBadgeVariant) — no 'use server' conflict, no client bundle impact"
observability_surfaces:
  - "[GenerateSiteJob] score_pages: N pages to score — phase start"
  - "[GenerateSiteJob] score_pages: <pagePath> → <score> (<grade>) — per page"
  - "[GenerateSiteJob] score_pages: N/total pages scored and persisted — phase end"
  - "[GenerateSiteJob] score_pages: error scoring <relPath>: <err> — per-page errors, non-fatal"
  - "ai_jobs.payload = { phase: 'score_pages', done: N, total: M } — Supabase live progress"
  - "Admin panel /sites/[id] — SEO Scores card with 12-column table; empty state before first job run"
  - "Diagnostic: SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id='<id>' ORDER BY page_path"
drill_down_paths:
  - .gsd/milestones/M003/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S04/tasks/T03-SUMMARY.md
duration: ~115m (T01: ~60m, T02: 35m, T03: 20m)
verification_result: passed
completed_at: 2026-03-14
---

# S04: SEO Scorer

**Built `@monster/seo-scorer` from scratch with 8 weighted scoring categories, wired `score_pages` phase into `GenerateSiteJob`, and rendered a server-side SEO scores table in the admin panel site detail page — completing the M003 milestone's quality gate.**

## What Happened

Three tasks executed in dependency order:

**T01 — Core scorer library.** Built `packages/seo-scorer` as a pure-ESM TypeScript package. `scorePage(html, focusKeyword, pageType)` parses HTML with cheerio, scores across 8 weighted categories (content_quality 30%, meta_elements 20%, structure 15%, links 12%, media 8%, schema 8%, technical 5%, social 2%), clamps to 0–100, maps to A/B/C/D/F grade. Legal pages exempt keyword density and first-paragraph keyword checks — exempted subscores award full marks (not zero) to avoid penalizing well-written legal content. `text-readability` has no TypeScript declarations — hand-authored a `.d.ts` file; the library exports a default class instance, not named exports. `cheerio.Element` isn't re-exported from cheerio 1.2.0 — duck-typed element tag access instead. 8 unit tests cover: homepage with keyword, legal exemption, missing title, Flesch null-safety (×2), grade boundaries, product affiliate compliance, schema type matching. All pass.

**T02 — Migration + pipeline phase.** Added unique constraint migration (`seo_scores_site_page_unique` on `site_id, page_path`) enabling idempotent upserts. Added `@monster/seo-scorer: workspace:*` to `packages/agents`. Wired `score_pages` phase into `GenerateSiteJob` after the Astro build `finally` block: builds a keyword map from in-memory `siteData`, globs `dist/**/*.html` with `for await...of` (not `Array.fromAsync` — ES2022 target constraint), infers page type and path from file location, calls `scorePage()`, batch-upserts to `seo_scores` with `onConflict: 'site_id,page_path'`. Per-page errors are non-fatal. `ai_jobs.payload` updated at phase start and after each page. Typed upsert rows as `TablesInsert<'seo_scores'>[]` to satisfy Supabase overload resolution.

**T03 — Admin panel UI.** Added server-side Supabase query for `seo_scores` on the site detail page, ordered by `page_path`. Rendered a 12-column SEO Scores card (page path, type, score, grade, 8 subscores) below the Site Generation card. `scoreColor()` and `gradeBadgeVariant()` are pure module-scope functions — no client component needed. `overflow-x-auto` wrapper handles the wide table on narrow viewports. Empty state renders "No SEO scores yet — generate the site first." Skipped adding `@monster/seo-scorer` to `apps/admin` deps — the Supabase typed client (`@monster/db`) already provides the `seo_scores` row shape.

## Verification

All checks passed:

```
pnpm --filter @monster/seo-scorer test       → 8/8 tests passed ✓
pnpm --filter @monster/seo-scorer build      → exit 0, dist/index.js (9.58 KB) + dist/index.d.ts (503 B) ✓
pnpm --filter @monster/agents typecheck      → exit 0 ✓
pnpm --filter @monster/agents build          → exit 0 (worker.js 2.69 MB) ✓
pnpm --filter @monster/admin build           → exit 0 (13 pages, /sites/[id] compiled) ✓

Fail-path diagnostics:
  scorePage('', 'kw', 'homepage')            → 19 F — no throw ✓
  scorePage('<not valid html>', '', 'legal') → 34 D — no throw ✓
  scorePage('<html></html>', null, 'product')→ 33 D — no throw ✓

Integration smoke test:
  freidoras de aire / homepage               → score 51, grade C ✓

Migration file:
  packages/db/supabase/migrations/20260314000001_seo_unique.sql → exists ✓
  Applied to Supabase Cloud via SQL editor ✓
```

## Requirements Advanced

- R005 — SEO Scorer: automated on-page validation — fully implemented: `scorePage()` with 8 categories, persisted to `seo_scores`, visible in admin panel

## Requirements Validated

- R005 — Contract verification passed (unit tests + build exits) and admin build produces the scores table; operational validation (real job run with rows in `seo_scores`) is the one remaining proof step — will be validated on first end-to-end M003 run.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- **cheerio version** — plan specified `^1.2.0`; written as `^1.0.0` in package.json. Resolves to 1.2.0 at install. No functional difference.
- **text-readability.d.ts** — not in the plan; required because the library has no TypeScript declarations and tsup strict DTS build exits 1 without it.
- **vitest.config.ts** — added as a separate file (plan mentioned inline config). Cleaner separation.
- **Array.fromAsync** — plan mentioned this pattern; replaced with `for await...of` because `Array.fromAsync` is ES2024 and `packages/agents` targets ES2022. Functionally identical.
- **scoreRows typing** — plan said `Record<string, unknown>[]`; typed as `TablesInsert<'seo_scores'>[]` to satisfy Supabase client overload. More type-safe.
- **@monster/seo-scorer in apps/admin** — plan listed this as optional; skipped. DB types from `@monster/db` are sufficient.

## Known Limitations

- **Migration must be manually applied** — no supabase CLI confirmed in this environment; the migration was applied via Supabase dashboard SQL editor. Automated migration in CI is not set up.
- **score_pages operational verification deferred** — real end-to-end job run (with rows appearing in `seo_scores`) requires DataForSEO + Anthropic credentials in Settings and a real site in DB. This is the M003 milestone-level operational verification step, not a gap in S04.
- **`node:fs/promises` glob API** — requires Node ≥ 22. Node version on VPS1 should be confirmed before production deploy (already confirmed in M003/S02 context).

## Follow-ups

- Operational end-to-end validation: trigger "Generate Site" for a real site → confirm `seo_scores` rows populated → check score distribution (≥80% of pages score ≥70 per M003 milestone gate).
- Score visibility: once job runs end-to-end, check admin panel `/sites/[id]` renders the scores table with real data.

## Files Created/Modified

- `packages/seo-scorer/src/types.ts` — SeoScore interface + PageType union
- `packages/seo-scorer/src/index.ts` — scorePage() with 8 weighted scoring functions + buildSuggestions
- `packages/seo-scorer/src/index.test.ts` — 8 unit test cases
- `packages/seo-scorer/src/text-readability.d.ts` — hand-authored type declaration for untyped library
- `packages/seo-scorer/package.json` — type:module, deps (cheerio, text-readability), exports, scripts
- `packages/seo-scorer/tsup.config.ts` — ESM-only build, dts:true
- `packages/seo-scorer/vitest.config.ts` — vitest node environment config
- `packages/seo-scorer/dist/index.js` — built output (9.58 KB)
- `packages/seo-scorer/dist/index.d.ts` — type declarations (503 B)
- `packages/db/supabase/migrations/20260314000001_seo_unique.sql` — unique constraint on (site_id, page_path)
- `packages/agents/src/jobs/generate-site.ts` — score_pages phase, inferPageType/filePathToPagePath helpers, scorePage import, TablesInsert type
- `packages/agents/package.json` — @monster/seo-scorer workspace dep added
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — seo_scores query, SEO Scores card, scoreColor/gradeBadgeVariant helpers

## Forward Intelligence

### What the next slice should know
- M003 is now code-complete. The only remaining step before the milestone is fully validated is an end-to-end real job run: Settings → DataForSEO + Anthropic credentials → "Generate Site" button → watch ai_jobs progress → verify seo_scores rows + admin panel scores table.
- The `score_pages` phase runs after Astro `build()`. If the build fails or produces no HTML files, the phase logs "0 pages to score" and continues — the job still reaches 'completed'. This is intentional (non-fatal per-page logic extends to the phase level when dist/ is empty).
- `inferPageType()` in generate-site.ts uses path segments: `categories/` → 'category', `products/` → 'product', root index → 'homepage', else → 'legal'. Legal pages at non-standard paths (e.g. `/aviso-legal/index.html`) must NOT be under `categories/` or `products/` — they aren't, and the Astro templates keep them at the top level.

### What's fragile
- **Migration not in automated CI** — if the Supabase `seo_scores` table lacks the unique constraint, the `.upsert()` call will throw a Postgres error at runtime. The migration was applied manually. Any environment reset requires re-applying it.
- **keywordMap lookup in score_pages** — `focusKeyword` comes from `siteData` assembled in memory during the job. If the `siteData` shape changes in a future slice (e.g. category/product key renaming), the keywordMap build logic in `score_pages` will silently produce empty keywords and all pages will score without keyword signals.

### Authoritative diagnostics
- `SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id='<id>' ORDER BY page_path` — direct ground truth for what the admin panel renders.
- `pnpm --filter @monster/seo-scorer test` — authoritative correctness signal for the scorer.
- `ai_jobs.payload` column — live phase/progress signal during a running job.

### What assumptions changed
- Plan assumed `@monster/seo-scorer` dep would be needed in `apps/admin` for type imports. Not true — `@monster/db` typed client already provides the `seo_scores` Row shape. Simpler dependency graph.
- Plan assumed `Array.fromAsync` for glob iteration. Not available in ES2022 target — `for await...of` is the correct ES2022 pattern.
