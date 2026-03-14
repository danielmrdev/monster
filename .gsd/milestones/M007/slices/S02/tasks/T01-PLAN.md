---
estimated_steps: 6
estimated_files: 5
---

# T01: DB migration + DataForSEO Lab extensions + ResearchReport schema

**Slice:** S02 — NicheResearcher — Background Agent + DataForSEO Research
**Milestone:** M007

## Description

Three pure additions that T02 depends on: (1) add `progress jsonb` column to `research_sessions` and reflect it in the TypeScript types, (2) extend `DataForSEOClient` with three synchronous (live-endpoint) Labs/SERP methods, (3) define the `ResearchReport` Zod schema in `packages/shared`. No job logic, no UI, no runtime risk — just contracts.

## Steps

1. **Write and apply the migration.** Create `packages/db/supabase/migrations/20260314000007_research_progress.sql` with `ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS progress jsonb;`. Apply to live Supabase via a temp node script using `@supabase/supabase-js` service-role client (same approach used in S01 T02). Confirm column exists with `\d research_sessions`.

2. **Update `packages/db/src/types/supabase.ts`.** Add `progress: Json | null` to `research_sessions` Row, Insert (as `progress?: Json | null`), and Update (as `progress?: Json | null`) shapes. Run `pnpm --filter @monster/db build` (D098).

3. **Add `LABS_LANGUAGE_CODE` map to `DataForSEOClient`.** Labs API uses 2-letter language codes (`'es'`, `'en'`, `'de'`, `'fr'`, `'it'`), not the 4-letter codes in `MARKET_CONFIG` (`'es_ES'`, etc.). Add a `LABS_LANGUAGE_CODE: Record<string, string>` constant mapping each market to its 2-letter code. This is a pitfall: using `MARKET_CONFIG.language_code` in Labs calls returns errors or empty results.

4. **Add `keywordIdeas(keyword, market)` to `DataForSEOClient`.** POST to `/v3/dataforseo_labs/google/keyword_ideas/live`. Body: `[{ keywords: [keyword], location_code, language_code (2-letter from LABS_LANGUAGE_CODE), limit: 20 }]`. Returns `KeywordIdea[]` (define local interface: `{ keyword, search_volume, cpc, competition }`). Extract from `tasks[0].result[0].items`. Handle empty/missing items gracefully (return `[]`).

5. **Add `serpCompetitors(keywords, market)` to `DataForSEOClient`.** POST to `/v3/dataforseo_labs/google/serp_competitors/live`. Body: `[{ keywords, location_code, language_code (2-letter), limit: 10 }]`. Returns `SerpCompetitor[]` (define: `{ domain, median_position, avg_position, competitor_metrics }`). Extract from `tasks[0].result[0].items`.

6. **Add `googleSerpResults(keyword, market)` to `DataForSEOClient`.** POST to `/v3/serp/google/organic/live/regular`. Body: `[{ keyword, location_code, language_code (2-letter), os: 'desktop', depth: 10 }]`. Returns `SerpResult[]` (define: `{ domain, url, title, description, rank_group }`). Filter by `type === 'organic'`. Extract from `tasks[0].result[0].items`.

7. **Define `ResearchReportSchema` in `packages/shared`.** Create `packages/shared/src/types/research-report.ts` with the full Zod schema (see S02-RESEARCH.md for the exact shape). Use standard `import { z } from 'zod'` (not `'zod/v4'` — `packages/shared` is not `packages/agents`). Export `ResearchReportSchema` and the inferred `ResearchReport` type. Add `export * from './research-report.js'` to `packages/shared/src/types/index.ts`. Run `pnpm --filter @monster/shared build`.

## Must-Haves

- [ ] `progress jsonb` column exists in live Supabase `research_sessions` table
- [ ] `packages/db/src/types/supabase.ts` has `progress: Json | null` in all three research_sessions shapes
- [ ] `pnpm --filter @monster/db build` exits 0 after the manual type edit
- [ ] `LABS_LANGUAGE_CODE` map present — 2-letter codes, separate from `MARKET_CONFIG.language_code`
- [ ] `keywordIdeas()`, `serpCompetitors()`, `googleSerpResults()` all use the 2-letter language code
- [ ] All three DataForSEO methods handle missing/empty `items` by returning `[]` (not throwing)
- [ ] `ResearchReportSchema` defined with all fields from the spec: `niche_idea`, `market`, `viability_score`, `summary`, `keywords[]`, `competitors[]`, `amazon_products[]`, `domain_suggestions[]`, `recommendation`, `generated_at`
- [ ] `pnpm --filter @monster/shared build` exits 0
- [ ] `pnpm -r typecheck` exits 0

## Verification

```bash
# DB
psql $SUPABASE_DB_URL -c "\d research_sessions" | grep progress
# Expected: progress | jsonb

# Build
pnpm --filter @monster/db build       # exit 0
pnpm --filter @monster/shared build   # exit 0
pnpm -r typecheck                     # exit 0

# Smoke-test new DFS methods (requires DataForSEO credentials in admin settings)
node -e "
  import('dotenv/config');
  const { DataForSEOClient } = await import('./packages/agents/dist/index.js');
  const c = new DataForSEOClient();
  const r = await c.keywordIdeas('freidoras de aire', 'ES');
  console.log('keywordIdeas count:', r.length, 'sample:', JSON.stringify(r[0]));
"
# Expected: count >= 0, no throw, sample has keyword + search_volume fields
```

## Observability Impact

- Signals added: `DataForSEOClient` logs `[dataforseo] keywordIdeas keyword="${k}" market=${m} items=${n}` — confirms live data flow
- Failure state: empty result array (`[]`) logged with `[dataforseo] keywordIdeas empty result` — distinguishes API success with no data from a thrown error

## Inputs

- `packages/db/supabase/migrations/20260313000005_ai.sql` — reference for research_sessions table shape
- `packages/db/src/types/supabase.ts` — existing structure to add `progress` field to
- `packages/agents/src/clients/dataforseo.ts` — existing `apiPost()` / `fetchAuthHeader()` / `MARKET_CONFIG` to extend
- `packages/shared/src/types/index.ts` — where to add the export
- S02-RESEARCH.md §ResearchReport Schema — exact schema fields

## Expected Output

- `packages/db/supabase/migrations/20260314000007_research_progress.sql` — new migration file
- `packages/db/src/types/supabase.ts` — `progress: Json | null` added to research_sessions Row/Insert/Update
- `packages/agents/src/clients/dataforseo.ts` — `LABS_LANGUAGE_CODE` + 3 new methods (`keywordIdeas`, `serpCompetitors`, `googleSerpResults`)
- `packages/shared/src/types/research-report.ts` — new file with `ResearchReportSchema` + `ResearchReport` type
- `packages/shared/src/types/index.ts` — export added
- All builds and typechecks pass
