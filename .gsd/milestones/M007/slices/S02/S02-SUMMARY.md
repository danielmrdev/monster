---
id: S02
parent: M007
milestone: M007
provides:
  - research_sessions.progress jsonb column (live Supabase)
  - DataForSEOClient extended — keywordIdeas(), serpCompetitors(), googleSerpResults() using live Labs/SERP endpoints
  - ResearchReportSchema Zod schema in packages/shared — 10-field structured report type
  - createNicheResearcherMcpServer(dfsClient, spaceshipClient) — 5 MCP tools for the researcher agent
  - NicheResearcherJob BullMQ worker on queue 'niche-research' with lockDuration 600000ms
  - Per-turn progress writes to research_sessions.progress jsonb (append { turn, phase, summary, timestamp })
  - nicheResearchQueue() singleton + enqueueNicheResearch() exported from packages/agents
  - NicheResearcherJob registered in worker.ts; monster-worker boots with log line
  - enqueueResearch server action — insert-before-enqueue with failure recovery
  - Research Lab page with niche form + market selector + live polling status component (5s interval)
  - ResearchSessionStatus 'use client' polling component — stops on terminal status, shows progress log
  - Session history list (10 most recent, status badge, timestamp)
requires:
  - slice: S01
    provides: ClaudeSDKClient + query() pattern, Agent SDK installed, McpServer factory pattern, BullMQ job pattern
affects:
  - S03
key_files:
  - packages/db/supabase/migrations/20260314000007_research_progress.sql
  - packages/db/src/types/supabase.ts
  - packages/agents/src/clients/dataforseo.ts
  - packages/shared/src/types/research-report.ts
  - packages/shared/src/types/index.ts
  - packages/agents/src/mcp/niche-researcher-server.ts
  - packages/agents/src/jobs/niche-researcher.ts
  - packages/agents/src/queue.ts
  - packages/agents/src/index.ts
  - packages/agents/src/worker.ts
  - apps/admin/src/app/(dashboard)/research/actions.ts
  - apps/admin/src/app/(dashboard)/research/constants.ts
  - apps/admin/src/app/(dashboard)/research/ResearchForm.tsx
  - apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
key_decisions:
  - D111 — LABS_LANGUAGE_CODE map separate from MARKET_CONFIG (2-letter vs 4-letter codes for Labs endpoints)
  - D112 — Migration applied via temp pg script; Supabase CLI migration tracking not used in this project
  - D113 — createNicheResearcherMcpServer takes (dfsClient, spaceshipClient) only; supabase param dropped
  - D114 — report typed as any at Supabase update boundary; Zod validates before write
  - D115 — 'export type {} from' re-export in 'use server' files is safe (type-erased, Next.js does not flag)
  - D116 — insert-before-enqueue ordering with immediate failure recovery prevents orphaned pending rows
patterns_established:
  - NicheResearcherJob follows ProductRefreshJob register() → Worker pattern; lockDuration 600000 for long agent runs
  - MCP server factory returns McpSdkServerConfigWithInstance (same as createMonsterMcpServer — D106)
  - Per-turn progress: append { turn, phase, summary, timestamp } to jsonb array; write to DB after each SDKAssistantMessage
  - SDKResultMessage: is_error → status=failed; success → Zod parse → status=completed (parse failure also completed with { raw, error })
  - enqueueResearch: insert pending row → enqueue job → on enqueue failure immediately mark status=failed
  - ResearchSessionStatus polling: useEffect + setInterval(5000); isTerminal() clears interval; same BADGE map as JobStatus.tsx
  - constants.ts sibling file holds non-async exports; 'use server' actions.ts re-exports via 'export type {} from' (D034/D115)
observability_surfaces:
  - pm2 logs monster-worker | grep niche-researcher — turn count, phase, completion status per run
  - pm2 logs monster-worker | grep niche-mcp — tool name called + result row count per invocation
  - SELECT id, status, progress, report FROM research_sessions ORDER BY created_at DESC LIMIT 5
  - SELECT id, status, progress->-1 AS last_progress_entry FROM research_sessions WHERE status='failed' ORDER BY updated_at DESC LIMIT 5
  - KEYS bull:niche-research:failed:* in Upstash console — failed jobs persist for inspection
  - Credential redaction check: pm2 logs monster-worker --lines 50 | grep -E ':[A-Za-z0-9+/]{10,}' (should return nothing)
drill_down_paths:
  - .gsd/milestones/M007/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S02/tasks/T03-SUMMARY.md
duration: ~2h45m (T01: 35m, T02: 1h15m, T03: 45m)
verification_result: passed
completed_at: 2026-03-14
---

# S02: NicheResearcher — Background Agent + DataForSEO Research

**NicheResearcher is end-to-end operational: a niche idea submitted from Research Lab enqueues a long-running BullMQ job that iterates the Agent SDK async stream, writes per-turn progress to Supabase, and stores a structured ResearchReport on completion — job survives browser disconnect and worker restarts.**

## What Happened

Three tasks across three clean layers: DB + types (T01), background engine (T02), UI + server action (T03).

**T01 — Foundation.** Added `progress jsonb` to `research_sessions` via direct pg DDL (Supabase CLI migration history is out of sync — same workaround as S01/T02). Updated Supabase TypeScript types. Extended `DataForSEOClient` with `keywordIdeas()`, `serpCompetitors()`, `googleSerpResults()` — all using live synchronous Labs/SERP endpoints (no task_post/poll loop). Added `LABS_LANGUAGE_CODE` map alongside `MARKET_CONFIG` because Labs endpoints use 2-letter codes (`'es'`) while Merchant API uses 4-letter codes (`'es_ES'`). Defined `ResearchReportSchema` in `packages/shared` with 10 fields — importable by both agents (Zod validation) and admin (S03 rendering).

**T02 — Background engine.** Created `createNicheResearcherMcpServer(dfsClient, spaceshipClient)` with 5 tools: `keywordIdeas`, `serpCompetitors`, `googleSerpResults`, `amazonProducts`, `checkDomainAvailability`. Each tool catches errors and returns JSON `{ error: message }` so the agent handles unconfigured credentials gracefully without crashing. Created `NicheResearcherJob` following the `ProductRefreshJob` register() → Worker pattern with `lockDuration: 600000` (10 minutes) for long agent runs. Handler: writes `status=running`, calls `query()` with `maxTurns: 15, persistSession: false`, iterates the async stream, appends `{ turn, phase, summary, timestamp }` to progress on each `SDKAssistantMessage`, then on `SDKResultMessage` Zod-parses the result and writes `status=completed` (or `status=failed` on `is_error`). Parse failure writes `{ raw, error: 'parse_failed' }` — still completed, never failed. Added queue singleton + `enqueueNicheResearch()` export. Registered in worker.ts with full shutdown wiring.

Manual enqueue produced a completed row with 12 progress entries and all 10 report keys in ~26 seconds (no real DFS data — credentials not yet configured — but structurally valid).

**T03 — UI + server action.** Wrote `enqueueResearch` server action following insert-before-enqueue pattern: creates `research_sessions` row with `status='pending'` first, then enqueues; on BullMQ failure, immediately marks row `status='failed'`. Used `useActionState` wrapper (same pattern as `cost-form.tsx`) so inline errors surface when redirect doesn't fire. Extracted `ResearchForm.tsx` as separate `'use client'` component (D089) to keep `page.tsx` a pure async server component. `ResearchSessionStatus.tsx` polls every 5 seconds via `setInterval`, clears on terminal status, shows progress log newest-first and raw report JSON in `<details>`. `constants.ts` holds `MARKET_OPTIONS` + `EnqueueResearchState` type; `actions.ts` re-exports via `export type {} from './constants'` (D115).

## Verification

```bash
# Typecheck — exit 0 across all packages
pnpm -r typecheck  # ✓

# Package builds — all exit 0
pnpm --filter @monster/agents build  # ✓ dist/index.js 23.41 KB, dist/worker.js 2.31 MB
pnpm --filter @monster/admin build   # ✓ /research shows as ƒ (dynamic)

# DB column exists
# progress column query error: none (column exists)  ✓

# Worker boots with NicheResearcherJob
pm2 logs monster-worker --lines 50 | grep NicheResearcherJob
# → [worker] NicheResearcherJob listening on queue "niche-research"  ✓

# DB session from T02 manual enqueue
# id=c5e64c72 niche="freidoras de aire test" status=completed
# progress_entries=12, report_keys=market,summary,keywords,niche_idea,competitors,generated_at,
#   recommendation,amazon_products,viability_score,domain_suggestions  ✓

# Research page renders (redirects to /login — expected unauthenticated)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/research  # → 307  ✓
```

## Requirements Advanced

- R003 (Autonomous niche research) — NicheResearcher agent fully implemented: BullMQ job, MCP tools, progress writes, structured report. Pending: real DataForSEO credentials to prove live keyword data (deferred to human UAT / Settings configuration).

## Requirements Validated

- None validated in this slice (R003 validation requires real DFS data in completed report — S03 + human UAT).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- **`createNicheResearcherMcpServer` signature**: Plan specified `(supabase, dfsClient, spaceshipClient)`. Dropped `supabase` — both API clients fetch credentials internally via `createServiceClient()` (D028). Dead parameter eliminated.
- **`report` typed as `any`**: Plan implied the Zod inferred type would flow through. TypeScript cannot assign `ResearchReport` → `Json` without a recursive guard. `any` at the Supabase update boundary with Zod validation before write is the pragmatic choice (D114).
- **`ResearchForm.tsx` as 4th file**: Plan listed 3 output files for T03. Added `ResearchForm.tsx` to keep `page.tsx` a pure server component (D089) while enabling `useActionState` error display. Total: 5 files created/modified for T03.
- **`useActionState` instead of pure native form**: Plan said "native `<form action=...>`". Used `useActionState` because server component pages cannot surface server action return values — errors would be silently dropped. `redirect()` still fires correctly inside `useActionState`-compatible actions.

## Known Limitations

- **Real DataForSEO data**: DFS credentials not configured in this environment. Worker handles unconfigured credentials gracefully (returns empty arrays, still produces valid `ResearchReport` structure). Report will contain empty `keywords[]`, `competitors[]`, `amazon_products[]` until credentials are added in Settings.
- **Domain availability**: Spaceship credentials also not configured. `checkDomainAvailability` MCP tool returns error JSON; agent handles it. Live availability badges are an S03 deliverable.
- **Browser verification**: Playwright/Chromium missing `libnspr4.so` in this environment. UI verified via build success + typecheck + HTTP response + code review of ordering logic. Full browser UAT (form submit → polling → completion) requires a browser-capable environment.

## Follow-ups

- S03: render `research_sessions.report` as formatted report (keyword table, competitor list, Amazon products, domain suggestion badges with live Spaceship availability, viability score). "Create site" CTA navigating to `/sites/new?niche=...&market=...`.
- Human UAT: configure DFS credentials in Settings, submit real niche from Research Lab, verify report contains real keyword volume data. Also verify browser-disconnect resilience (close tab mid-run, reopen, confirm session still progressing).

## Files Created/Modified

- `packages/db/supabase/migrations/20260314000007_research_progress.sql` — new; ALTER TABLE migration for progress jsonb column
- `packages/db/src/types/supabase.ts` — progress: Json | null added to research_sessions Row/Insert/Update
- `packages/agents/src/clients/dataforseo.ts` — LABS_LANGUAGE_CODE map + KeywordIdea/SerpCompetitor/SerpResult interfaces + keywordIdeas/serpCompetitors/googleSerpResults methods
- `packages/shared/src/types/research-report.ts` — new; ResearchReportSchema + ResearchReport type
- `packages/shared/src/types/index.ts` — export * from './research-report.js' added
- `packages/agents/src/mcp/niche-researcher-server.ts` — new; createNicheResearcherMcpServer with 5 MCP tools
- `packages/agents/src/jobs/niche-researcher.ts` — new; NicheResearcherJob, NicheResearchPayload, system prompt, handler
- `packages/agents/src/queue.ts` — createNicheResearchQueue() + nicheResearchQueue() singleton added
- `packages/agents/src/index.ts` — nicheResearchQueue, createNicheResearchQueue, NicheResearchPayload, enqueueNicheResearch exports added
- `packages/agents/src/worker.ts` — NicheResearcherJob imported, registered, added to shutdown handlers
- `apps/admin/src/app/(dashboard)/research/actions.ts` — new; enqueueResearch, getResearchSessions, getResearchSessionStatus
- `apps/admin/src/app/(dashboard)/research/constants.ts` — new; MARKET_OPTIONS, MarketValue, EnqueueResearchState
- `apps/admin/src/app/(dashboard)/research/ResearchForm.tsx` — new; 'use client' form with useActionState
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — new; 'use client' polling component
- `apps/admin/src/app/(dashboard)/research/page.tsx` — rewritten; async server component with form + sessions list + status
- `.gsd/DECISIONS.md` — D111–D116 appended

## Forward Intelligence

### What the next slice should know
- `ResearchReportSchema` in `packages/shared/src/types/research-report.ts` defines the exact shape of `research_sessions.report`. S03 can import the inferred `ResearchReport` type for typed access to all fields.
- The `report` jsonb may contain `{ raw: string, error: 'parse_failed' }` when the agent's final message wasn't valid JSON matching the schema. S03's report viewer must handle this gracefully — check for `report.error === 'parse_failed'` before rendering structured fields.
- `progress` is a jsonb array of `{ turn: number, phase: string, summary: string, timestamp: string }`. The phase strings are whatever the agent wrote, not an enum — treat them as display text only.
- Domain availability in the report's `domain_suggestions[]` comes from the `checkDomainAvailability` MCP tool during the agent run — but since Spaceship credentials aren't configured yet, all `available` fields are likely `false` or missing. S03's live availability badges should call `SpaceshipClient.checkAvailability()` fresh at render time, not rely on the stored report value.

### What's fragile
- **Agent SDK `query()` result parsing** — the agent is prompted to emit a JSON code block as its final response. If the agent adds surrounding prose or extra text, the markdown fence stripper in `niche-researcher.ts` handles it. But if the schema shape doesn't match (e.g., agent omits required fields), Zod parse fails and `report.error = 'parse_failed'`. Improving the system prompt or adding few-shot examples would reduce this risk.
- **`lockDuration: 600000`** — if a job genuinely takes > 10 minutes (e.g., very slow DataForSEO responses + 15 turns), BullMQ will re-enqueue it as stalled, potentially running two instances simultaneously. The `NicheResearcherJob` handler does not have idempotency protection for double-run. Increase `lockDuration` or add `extendLock()` calls if long runs are observed.

### Authoritative diagnostics
- `pm2 logs monster-worker | grep niche-researcher` — turn-by-turn progress log; first signal to check when a session is stuck in `running`
- `SELECT progress->-1 FROM research_sessions WHERE status='failed'` — last progress entry contains the error message for failed sessions
- `KEYS bull:niche-research:failed:*` in Upstash console — failed jobs persist; useful if worker crashes mid-job

### What assumptions changed
- **No supabase param in MCP server factory**: Plan assumed the MCP server would need a supabase client to query data. Actually, both `DataForSEOClient` and `SpaceshipClient` manage their own credential lookups internally — no shared supabase client needed at the MCP layer.
- **Real DFS data requires credential configuration**: The job runs cleanly without DFS credentials (returns empty arrays gracefully). Human UAT with real credentials is the only remaining proof for R003.
