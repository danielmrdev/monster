# S02: NicheResearcher — Background Agent + DataForSEO Research

**Goal:** A niche idea submitted from the Research Lab enqueues a BullMQ job that autonomously researches the niche using DataForSEO Labs + SERP endpoints and Spaceship domain availability, writes per-turn progress to Supabase, and stores a structured `ResearchReport` on completion — job survives browser disconnect.

**Demo:** User opens Research Lab, types a niche idea ("freidoras de aire ES"), clicks Submit. The status component begins polling and shows phase progress updates. After 1–3 minutes the session status flips to `completed`. The raw JSON report in `research_sessions.report` contains real keyword volume data from DataForSEO Labs, competitor domains from SERP, Amazon product examples, and domain suggestions with availability status. Closing and reopening the browser tab mid-run shows the same in-progress state.

## Must-Haves

- `research_sessions.progress jsonb` column added via migration and reflected in `packages/db/src/types/supabase.ts`
- `DataForSEOClient` extended with `keywordIdeas()`, `serpCompetitors()`, `googleSerpResults()` using live (synchronous) DFS Labs/SERP endpoints
- `ResearchReport` Zod schema defined in `packages/shared/src/types/research-report.ts`
- `NicheResearcherJob` BullMQ job: calls `query()` with `maxTurns: 15`, `persistSession: false`; writes `progress` on each `SDKAssistantMessage` turn; parses `SDKResultMessage.result` as `ResearchReport` and writes to `research_sessions.report`; graceful fallback stores raw result on parse failure
- `createNicheResearcherMcpServer()` with 5 tools: `keywordIdeas`, `serpCompetitors`, `googleSerpResults`, `amazonProducts`, `checkDomainAvailability`
- `nicheResearchQueue()` singleton + `enqueueNicheResearch()` exported from `packages/agents/src/index.ts`
- `NicheResearcherJob` registered in `worker.ts`; `pm2 reload monster-worker` boots cleanly with log line
- `enqueueResearch` server action in `apps/admin/src/app/(dashboard)/research/actions.ts`
- Research Lab page: niche idea form + market selector + `ResearchSessionStatus` polling component (5-second interval)
- Session list showing past research sessions (status badge + created timestamp)

## Proof Level

- This slice proves: operational — job enqueued from UI, runs in worker, survives browser disconnect, writes real DataForSEO data to DB
- Real runtime required: yes — DataForSEO API call must return live keyword data; job must survive with browser closed
- Human/UAT required: yes — verify browser-disconnect resilience and report plausibility

## Verification

```bash
# Typecheck and build
pnpm -r typecheck                          # exit 0 across all packages
pnpm --filter @monster/agents build        # exit 0
pnpm --filter @monster/admin build         # exit 0

# Migration applied
psql $SUPABASE_DB_URL -c "\d research_sessions" | grep progress

# Worker boots with NicheResearcherJob registered
pm2 reload monster-worker && sleep 3
pm2 logs monster-worker --lines 10 | grep 'NicheResearcherJob'

# End-to-end job run (submit from UI, verify DB row)
# 1. Submit "freidoras de aire" niche from Research Lab UI
# 2. Watch ResearchSessionStatus component poll and update
# 3. Verify in Supabase:
SELECT status, jsonb_typeof(progress), jsonb_typeof(report)
FROM research_sessions ORDER BY created_at DESC LIMIT 1;
# Expected: status='completed', both fields not null

# Browser disconnect resilience:
# 1. Submit job → immediately close browser tab
# 2. Wait 2 min → reopen Research Lab
# 3. Session shows completed status with report

# DataForSEO live data in report:
SELECT report->'keywords'->0->'search_volume' FROM research_sessions
WHERE status='completed' ORDER BY created_at DESC LIMIT 1;
# Expected: non-null integer (real DFS data, not mock)

# --- Failure-path diagnostics ---

# Inspect failed BullMQ jobs in Redis (survives worker restart):
# KEYS bull:niche-research:failed:*
# (run via redis-cli or Upstash console — confirms job failure is persisted)

# Inspect failed session row in Supabase (last-error + phase in progress jsonb):
SELECT id, status, progress->-1 AS last_progress_entry
FROM research_sessions
WHERE status = 'failed'
ORDER BY updated_at DESC LIMIT 5;
# Expected: last entry has { turn, phase: 'failed', summary: '<error message>' }

# Confirm redaction — DataForSEO email:password must NOT appear in pm2 logs:
pm2 logs monster-worker --lines 50 | grep -v "^$" | grep -E ':[A-Za-z0-9+/]{10,}' && echo "REDACTION FAILURE" || echo "Credentials not leaked"
```

## Observability / Diagnostics

- Runtime signals: `[niche-researcher] session=${id} phase=start/turn/complete/failed`, `[niche-mcp] tool=${name} called/rows=${n}`
- Inspection surfaces: `SELECT id, status, progress, report FROM research_sessions ORDER BY created_at DESC LIMIT 5;` — progress is a jsonb array of `{ turn, phase, summary }` objects updated per agent turn
- Failure visibility: failed jobs write `status='failed'` + last error in `progress`; BullMQ failed jobs persist in Redis (`KEYS bull:niche-research:failed:*`)
- Redaction constraints: DataForSEO credentials (email:password) must never appear in logs — log only the email prefix

## Integration Closure

- Upstream surfaces consumed: `ClaudeSDKClient` query pattern (S01), `ProductRefreshJob` BullMQ pattern, `DataForSEOClient.fetchAuthHeader() + apiPost()`, `SpaceshipClient.checkAvailability()`, `createSdkMcpServer + tool()` from Agent SDK, `JobStatus.tsx` poll pattern
- New wiring introduced: `enqueueResearch` server action → `nicheResearchQueue()` → `NicheResearcherJob` in worker → `research_sessions` DB rows; `ResearchSessionStatus.tsx` polls `research_sessions` every 5s
- What remains before milestone is end-to-end usable: S03 (report viewer UI, domain availability badges, Create Site CTA)

## Tasks

- [x] **T01: DB migration + DataForSEO Lab extensions + ResearchReport schema** `est:45m`
  - Why: Everything T02 needs to type-check and write to DB. Three pure additions with no runtime risk.
  - Files: `packages/db/supabase/migrations/20260314000007_research_progress.sql`, `packages/db/src/types/supabase.ts`, `packages/shared/src/types/research-report.ts`, `packages/shared/src/types/index.ts`, `packages/agents/src/clients/dataforseo.ts`
  - Do: Write `ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS progress jsonb;` migration and apply it to live Supabase via `pg`. Manually add `progress: Json | null` to `research_sessions` Row/Insert/Update in supabase.ts; rebuild `@monster/db`. Define `ResearchReportSchema` Zod schema in `packages/shared` and export from its index. Extend `DataForSEOClient` with `keywordIdeas()`, `serpCompetitors()`, `googleSerpResults()` using live DFS endpoints — add `LABS_LANGUAGE_CODE` map (2-letter: `'es'`, `'en'`) separate from `MARKET_CONFIG.language_code`. Methods follow existing `fetchAuthHeader()` + `apiPost()` pattern; synchronous (no task_post/poll loop).
  - Verify: `pnpm --filter @monster/db build` exits 0; `pnpm --filter @monster/shared build` exits 0; `pnpm -r typecheck` exits 0; `psql $SUPABASE_DB_URL -c "\d research_sessions" | grep progress` shows column
  - Done when: All three additions are type-clean and the `progress` column exists in live Supabase

- [x] **T02: NicheResearcherJob + MCP server + queue registration** `est:1h`
  - Why: The background engine — the job that autonomously researches, writes progress, and produces the report.
  - Files: `packages/agents/src/jobs/niche-researcher.ts`, `packages/agents/src/mcp/niche-researcher-server.ts`, `packages/agents/src/queue.ts`, `packages/agents/src/index.ts`, `packages/agents/src/worker.ts`
  - Do: Create `createNicheResearcherMcpServer(supabase, dfsClient, spaceshipClient)` following `createMonsterMcpServer` pattern with 5 tools: `keywordIdeas`, `serpCompetitors`, `googleSerpResults`, `amazonProducts` (reuses existing `searchProducts()`), `checkDomainAvailability`. Create `NicheResearcherJob.register()` returning `Worker<NicheResearchPayload>` on queue `'niche-research'` with `lockDuration: 600000`. Handler calls `query({ prompt: systemPrompt + nicheIdea, options: { maxTurns: 15, persistSession: false, tools: [], permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, mcpServers: { researcher: mcpServer } } })`. Iterate async stream: write `progress` on each `SDKAssistantMessage` turn (append `{ turn, phase, summary }` to jsonb array). On `SDKResultMessage`, `JSON.parse(result)` + `ResearchReportSchema.parse()`; write to `report` + `status: 'completed'`. Catch parse failure: write `report: { raw: result, error: 'parse_failed' }` + `status: 'completed'` (not failed). Write `status: 'failed'` + error in progress on exception. Add `createNicheResearchQueue()` + `nicheResearchQueue()` singleton to `queue.ts`. Export `nicheResearchQueue`, `createNicheResearchQueue`, `enqueueNicheResearch` from `index.ts`. Register in `worker.ts` with shutdown handler.
  - Verify: `pnpm --filter @monster/agents build` exits 0; `pm2 reload monster-worker && pm2 logs monster-worker --lines 10 | grep NicheResearcherJob`; manually enqueue via `node -e "..."` and confirm DB row updated with progress/report
  - Done when: Worker boots with NicheResearcherJob log line; a manually-enqueued job produces a `research_sessions` row with `status='completed'` and non-null `report`

- [x] **T03: Research Lab UI — form + server action + polling status** `est:45m`
  - Why: Makes the slice demoable — user can submit a niche and watch it work.
  - Files: `apps/admin/src/app/(dashboard)/research/page.tsx`, `apps/admin/src/app/(dashboard)/research/actions.ts`, `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx`
  - Do: Write `enqueueResearch(formData)` server action (D034: only async functions exported): creates `research_sessions` row with `status: 'pending'`, calls `nicheResearchQueue().add()`, returns `{ ok, sessionId, error }`. Replace placeholder `page.tsx` with async server component: niche idea form (text input + market select defaulting to ES) + sessions list (10 most recent with status badge + timestamp). Extract `ResearchSessionStatus.tsx` as `'use client'` component (D089 pattern): receives `sessionId`, polls `research_sessions` every 5s while `status` is `pending` or `running`, shows current `progress` array as phase log, stops polling on `completed` or `failed`. Sessions list links to detail which renders status component for that session. Raw report JSON shown collapsed in a `<details>` block (S03 will render it properly).
  - Verify: `pnpm --filter @monster/admin build` exits 0; `pnpm -r typecheck` exits 0; open Research Lab in browser, submit "freidoras de aire" niche, observe status component polling and updating every 5s; close and reopen tab — session still shows in list with current status
  - Done when: Niche form submits → session appears in list → status component polls and shows progress → completed session shows raw report JSON

## Files Likely Touched

- `packages/db/supabase/migrations/20260314000007_research_progress.sql`
- `packages/db/src/types/supabase.ts`
- `packages/shared/src/types/research-report.ts`
- `packages/shared/src/types/index.ts`
- `packages/agents/src/clients/dataforseo.ts`
- `packages/agents/src/mcp/niche-researcher-server.ts`
- `packages/agents/src/jobs/niche-researcher.ts`
- `packages/agents/src/queue.ts`
- `packages/agents/src/index.ts`
- `packages/agents/src/worker.ts`
- `apps/admin/src/app/(dashboard)/research/page.tsx`
- `apps/admin/src/app/(dashboard)/research/actions.ts`
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx`
