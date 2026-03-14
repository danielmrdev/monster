---
id: T02
parent: S02
milestone: M007
provides:
  - createNicheResearcherMcpServer() with 5 tools — keywordIdeas, serpCompetitors, googleSerpResults, amazonProducts, checkDomainAvailability
  - NicheResearcherJob BullMQ worker on queue 'niche-research' with lockDuration 600000ms
  - Per-turn progress writes to research_sessions.progress jsonb
  - SDKResultMessage parsed as ResearchReportSchema; parse failure stores raw result with status=completed
  - nicheResearchQueue() singleton + enqueueNicheResearch() exported from packages/agents/src/index.ts
  - Worker boots with NicheResearcherJob log line; full graceful shutdown wiring
key_files:
  - packages/agents/src/mcp/niche-researcher-server.ts
  - packages/agents/src/jobs/niche-researcher.ts
  - packages/agents/src/queue.ts
  - packages/agents/src/index.ts
  - packages/agents/src/worker.ts
key_decisions:
  - D113 — createNicheResearcherMcpServer takes (dfsClient, spaceshipClient) only — no supabase param; both clients fetch credentials internally (D028 pattern)
  - D114 — report variable typed as any for Supabase Json assignability; Zod validates before write
patterns_established:
  - NicheResearcherJob follows ProductRefreshJob register() → Worker pattern exactly; lockDuration 600000 (10 min) for long agent runs
  - MCP server factory returns McpSdkServerConfigWithInstance (same as createMonsterMcpServer — D106 pattern)
  - includePartialMessages absent (default false) — only SDKAssistantMessage + SDKResultMessage emitted; no stream_event filtering needed
  - Per-turn progress: append { turn, phase, summary, timestamp } to array, write to DB after each assistant turn
  - SDKResultMessage on is_error=true → write status=failed + progress entry; on success → Zod parse → status=completed either way
observability_surfaces:
  - pm2 logs monster-worker | grep niche-researcher — turn count + completion status per run
  - pm2 logs monster-worker | grep niche-mcp — tool call + result row count per tool invocation
  - SELECT id, status, progress, report FROM research_sessions ORDER BY created_at DESC LIMIT 5 — full turn-by-turn progress as jsonb
  - SELECT id, status, progress->-1 AS last_progress_entry FROM research_sessions WHERE status='failed' — last error entry for failed sessions
  - KEYS bull:niche-research:failed:* in Redis/Upstash — failed jobs persist for inspection
duration: 1h15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: NicheResearcherJob + MCP server + queue registration

**NicheResearcherJob wired end-to-end: manual enqueue produced a completed research_sessions row with 12 turns and a valid ResearchReport structure in ~26 seconds.**

## What Happened

Created three new files and modified three existing ones:

1. **`niche-researcher-server.ts`** — `createNicheResearcherMcpServer(dfsClient, spaceshipClient)` with 5 tools following the `createMonsterMcpServer` pattern exactly. Each tool logs `[niche-mcp] tool=<name> called` and `[niche-mcp] tool=<name> result rows=N`. All errors caught and returned as JSON `{ error: message }` so the agent can handle credential-not-configured gracefully without crashing the job.

2. **`niche-researcher.ts`** — `NicheResearcherJob` class + `NicheResearchPayload` type + system prompt constant. Handler: writes `status=running` immediately, instantiates `DataForSEOClient` + `SpaceshipClient`, calls `query()` with `maxTurns: 15, persistSession: false`, iterates the stream. On each `SDKAssistantMessage`, extracts summary from first content block (text or tool_use name) and appends `{ turn, phase, summary, timestamp }` to progress array, then writes to DB. On `SDKResultMessage`: if `is_error` → writes `status=failed`; if success → strips markdown fences, JSON.parse, Zod.parse → if clean writes `status=completed`; if parse fails writes `{ raw, error: 'parse_failed' }` still with `status=completed`. Re-throws on catch so BullMQ persists the failed job in Redis.

3. **`queue.ts`** — Added `createNicheResearchQueue()` and `nicheResearchQueue()` singleton following the identical pattern to `productRefreshQueue`.

4. **`index.ts`** — Added `nicheResearchQueue`, `createNicheResearchQueue` re-exports + a private import of `nicheResearchQueue` for use by `enqueueNicheResearch()`. Added `NicheResearchPayload` type export. `NicheResearcherJob` stays internal to worker (D048 pattern).

5. **`worker.ts`** — Imported `NicheResearcherJob`, instantiated and registered it, added `nicheResearcherWorker.close()` to both SIGTERM and SIGINT handlers.

Three typecheck errors were fixed during implementation:
- `nicheResearchQueue` not in scope for `enqueueNicheResearch` → added explicit import alongside the re-export
- `content.slice()` on `never` (BetaMessage.content is array-only, no string branch possible) → removed the dead `else if (typeof content === 'string')` branch
- `unknown` not assignable to `Json` for the `report` column → typed `report` as `any` (D114)

## Verification

```
# Build — exit 0
pnpm --filter @monster/agents build
# ESM dist/index.js 23.41 KB / dist/worker.js 2.31 MB — ✓

# Typecheck — exit 0 across all packages
pnpm -r typecheck  # ✓

# Worker boot log
pm2 logs monster-worker --lines 25 | grep NicheResearcherJob
# → [worker] NicheResearcherJob listening on queue "niche-research"  ✓

# Manual enqueue
node --input-type=module: inserted research_sessions row, called enqueueNicheResearch()
# jobId: 1  ✓

# DB verification
SELECT status, report keys FROM research_sessions WHERE niche_idea='freidoras de aire test'
# status=completed, 12 progress entries, report has all 10 expected keys:
# market, summary, keywords, niche_idea, competitors, generated_at, recommendation,
# amazon_products, viability_score, domain_suggestions  ✓
```

Slice-level checks passing at T02:
- ✅ `pnpm -r typecheck` exit 0
- ✅ `pnpm --filter @monster/agents build` exit 0
- ✅ Worker boots with NicheResearcherJob log line
- ⏳ `pnpm --filter @monster/admin build` — not checked (T03 will do this)
- ⏳ End-to-end from UI — not checked (T03 will implement the UI)
- ⏳ Real DataForSEO data in report — DataForSEO credentials not configured in this env; job handles gracefully (returns empty arrays) and still produces valid schema

## Diagnostics

```bash
# Worker turn-by-turn progress
pm2 logs monster-worker | grep niche-researcher
# Emits: status=running, turn=N progress_entries=N, status=completed parseSuccess=true turns=N

# MCP tool calls
pm2 logs monster-worker | grep niche-mcp
# Emits: tool=<name> called, tool=<name> result rows=N (or error: <message>)

# DB session state
SELECT id, status, jsonb_array_length(progress), jsonb_typeof(report)
FROM research_sessions ORDER BY created_at DESC LIMIT 5;

# Failed session last error
SELECT id, status, progress->-1 AS last_progress_entry
FROM research_sessions WHERE status='failed' ORDER BY updated_at DESC LIMIT 5;

# BullMQ failed jobs (Upstash console or redis-cli)
KEYS bull:niche-research:failed:*
```

## Deviations

- **`createNicheResearcherMcpServer` signature**: Plan spec said `(supabase, dfsClient, spaceshipClient)`. Dropped `supabase` param — both clients handle credential fetch internally via their own `createServiceClient()` call (D028). Adding an unused `supabase` param would be dead code. Logged as D113.
- **`report` typed as `any`**: Plan implied `unknown`. TypeScript cannot assign `unknown` to Supabase's `Json` type without a recursive type guard; `any` is the pragmatic choice given Zod validation before write. Logged as D114.

## Known Issues

- Real DataForSEO data in report will be null/empty until DFS credentials are configured in admin Settings. The agent handles the error responses gracefully and generates a structurally valid report with empty keyword/competitor/product arrays.
- `first keyword: undefined` in verification — expected when DFS returns error; the report schema allows empty `keywords` array.

## Files Created/Modified

- `packages/agents/src/mcp/niche-researcher-server.ts` — new; `createNicheResearcherMcpServer(dfsClient, spaceshipClient)` with 5 MCP tools
- `packages/agents/src/jobs/niche-researcher.ts` — new; `NicheResearcherJob` class, `NicheResearchPayload` type, system prompt, handler
- `packages/agents/src/queue.ts` — added `createNicheResearchQueue()` + `nicheResearchQueue()` singleton
- `packages/agents/src/index.ts` — added `nicheResearchQueue`, `createNicheResearchQueue`, `NicheResearchPayload`, `enqueueNicheResearch` exports
- `packages/agents/src/worker.ts` — imported + registered `NicheResearcherJob`, added to shutdown handlers
