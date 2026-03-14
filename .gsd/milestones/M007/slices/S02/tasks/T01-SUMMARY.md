---
id: T01
parent: S02
milestone: M007
provides:
  - research_sessions.progress jsonb column (live Supabase)
  - packages/db/src/types/supabase.ts — progress field in all three research_sessions shapes
  - packages/agents/src/clients/dataforseo.ts — LABS_LANGUAGE_CODE map + keywordIdeas/serpCompetitors/googleSerpResults methods
  - packages/shared/src/types/research-report.ts — ResearchReportSchema + ResearchReport type
key_files:
  - packages/db/supabase/migrations/20260314000007_research_progress.sql
  - packages/db/src/types/supabase.ts
  - packages/agents/src/clients/dataforseo.ts
  - packages/shared/src/types/research-report.ts
  - packages/shared/src/types/index.ts
key_decisions:
  - D111 — LABS_LANGUAGE_CODE separate from MARKET_CONFIG (2-letter vs 4-letter codes)
  - D112 — Migration applied via temp pg script (Supabase CLI out of sync)
patterns_established:
  - DataForSEO live endpoints follow same fetchAuthHeader() + apiPost() pattern; synchronous (no task_post/poll loop)
  - Labs methods return [] on empty items (never throw on empty result)
  - ResearchReport schema in packages/shared — importable by both agents (validation) and admin (S03 rendering)
observability_surfaces:
  - '[dataforseo] keywordIdeas keyword="${k}" market=${m} items=${n}' — confirms live data flow
  - '[dataforseo] keywordIdeas empty result keyword="${k}" market=${m}' — distinguishes API success with no data from throw
  - Same pattern for serpCompetitors and googleSerpResults
duration: ~35m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: DB migration + DataForSEO Lab extensions + ResearchReport schema

**Three pure additions committed: `progress jsonb` column applied to live Supabase, `DataForSEOClient` extended with 3 Labs/SERP live-endpoint methods, `ResearchReportSchema` defined and building clean across all packages.**

## What Happened

1. **Migration written + applied.** Created `20260314000007_research_progress.sql` with `ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS progress jsonb;`. The Supabase CLI `db push` failed because the remote migration history table is out of sync with local (same issue as S01/T02). Applied directly via a temporary `packages/db/apply-migration.mjs` script using a temporary `pg` devDep (added then removed). Column verified via `information_schema.columns` query — `{ column_name: 'progress', data_type: 'jsonb' }`.

2. **TypeScript types updated.** Added `progress: Json | null` to `research_sessions` Row, `progress?: Json | null` to Insert and Update shapes in `packages/db/src/types/supabase.ts`. Rebuilt `@monster/db` (exit 0).

3. **`LABS_LANGUAGE_CODE` map added.** Added alongside `MARKET_CONFIG` in `dataforseo.ts` with explicit comment explaining why Labs uses 2-letter codes (`'es'`, `'en'`, `'de'`, `'fr'`, `'it'`) while Merchant API uses `'es_ES'`/`'en_US'` etc. This is the pitfall documented in S02-RESEARCH.md.

4. **Three new DataForSEO methods.** `keywordIdeas()`, `serpCompetitors()`, `googleSerpResults()` added to `DataForSEOClient`. All use live (synchronous) endpoints — no task_post/poll loop. All look up `LABS_LANGUAGE_CODE[market]` (not `MARKET_CONFIG.language_code`). All return `[]` on empty/missing `items` with a log line (never throw on empty). Also exported three new interfaces: `KeywordIdea`, `SerpCompetitor`, `SerpResult`.

5. **`ResearchReportSchema` defined.** Created `packages/shared/src/types/research-report.ts` with the full Zod schema matching S02-RESEARCH.md spec: 10 fields — `niche_idea`, `market`, `viability_score`, `summary`, `keywords[]`, `competitors[]`, `amazon_products[]`, `domain_suggestions[]`, `recommendation`, `generated_at`. Uses `import { z } from 'zod'` (not `'zod/v4'` — packages/shared doesn't use the v4 import path). Exported from `packages/shared/src/types/index.ts`.

6. **Pre-flight fix.** Added failure-path diagnostic checks to S02-PLAN.md Verification section (BullMQ failed job inspection via Redis + failed session row query + credential redaction check) per the pre-flight observation gap requirement.

## Verification

```
# DB column
packages/db/apply-migration.mjs → '[apply-migration] Verification: [{ column_name: "progress", data_type: "jsonb" }]' ✓
supabase-js query research_sessions.select('progress').limit(1) → no error, data: [] ✓

# Builds
pnpm --filter @monster/db build     → exit 0 ✓ (dist/index.d.ts 109.95 KB)
pnpm --filter @monster/shared build → exit 0 ✓ (dist/index.d.ts 10.14 KB)
pnpm --filter @monster/agents build → exit 0 ✓
pnpm --filter @monster/admin build  → exit 0 ✓

# Typecheck
pnpm -r typecheck → all 9 packages pass ✓

# Smoke tests
DataForSEOClient methods present: keywordIdeas=function, serpCompetitors=function, googleSerpResults=function ✓
ResearchReportSchema.shape keys: ['niche_idea','market','viability_score','summary','keywords','competitors','amazon_products','domain_suggestions','recommendation','generated_at'] ✓
ResearchReportSchema.parse(sampleReport) → succeeds, niche_idea='freidoras de aire', viability_score=75 ✓
```

## Diagnostics

- **DB column**: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'research_sessions' AND column_name = 'progress';` — expects 1 row with `data_type='jsonb'`
- **DFS methods in build**: `node -e "const { DataForSEOClient } = await import('./packages/agents/dist/index.js'); console.log(typeof new DataForSEOClient().keywordIdeas)"` — expects `'function'`
- **Schema shape**: `node -e "const { ResearchReportSchema } = await import('./packages/shared/dist/index.js'); console.log(Object.keys(ResearchReportSchema.shape))"` — expects all 10 fields
- **Live DFS call** (requires credentials in admin Settings): `node -e "const { DataForSEOClient } = await import('./packages/agents/dist/index.js'); const r = await new DataForSEOClient().keywordIdeas('freidoras de aire', 'ES'); console.log('items:', r.length, 'sample:', r[0])"` — logs `[dataforseo] keywordIdeas keyword="freidoras de aire" market=ES items=N`

## Deviations

- **Migration via temp pg script** (same as S01/T02 pattern): `supabase db push` failed due to migration history out of sync. Applied DDL directly via `pg` client. Migration file still created for documentation. `pg` + `@types/pg` added then removed from `packages/db` devDeps.
- **Exported three new interfaces** (`KeywordIdea`, `SerpCompetitor`, `SerpResult`) from `dataforseo.ts` — not explicitly listed in the plan but required for T02's MCP server tool return types. Low-risk addition.

## Known Issues

None. All must-haves verified.

## Files Created/Modified

- `packages/db/supabase/migrations/20260314000007_research_progress.sql` — new; ALTER TABLE migration for progress jsonb column
- `packages/db/src/types/supabase.ts` — progress: Json | null added to research_sessions Row/Insert/Update
- `packages/agents/src/clients/dataforseo.ts` — LABS_LANGUAGE_CODE map + KeywordIdea/SerpCompetitor/SerpResult interfaces + keywordIdeas/serpCompetitors/googleSerpResults methods
- `packages/shared/src/types/research-report.ts` — new; ResearchReportSchema + ResearchReport type
- `packages/shared/src/types/index.ts` — export * from './research-report.js' added
- `.gsd/milestones/M007/slices/S02/S02-PLAN.md` — failure-path diagnostic checks added to Verification section (pre-flight fix)
- `.gsd/DECISIONS.md` — D111 (LABS_LANGUAGE_CODE) + D112 (migration approach) appended
