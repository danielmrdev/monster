---
estimated_steps: 7
estimated_files: 5
---

# T02: NicheResearcherJob + MCP server + queue registration

**Slice:** S02 — NicheResearcher — Background Agent + DataForSEO Research
**Milestone:** M007

## Description

The background engine: a BullMQ job that runs the Agent SDK `query()` with a custom MCP server providing DataForSEO and Spaceship tools, writes per-turn progress to `research_sessions.progress`, and stores the structured `ResearchReport` on completion. Follows `ProductRefreshJob` + `createMonsterMcpServer` patterns exactly. No SSE bridge needed — the job is fire-and-forget.

## Steps

1. **Create `createNicheResearcherMcpServer(supabase, dfsClient, spaceshipClient)`** in `packages/agents/src/mcp/niche-researcher-server.ts`. Copy the `createSdkMcpServer + tool()` structure from `monster-server.ts`. Five tools:
   - `keywordIdeas(keyword, market, limit?)` → calls `dfsClient.keywordIdeas(keyword, market)`, returns JSON array
   - `serpCompetitors(keywords, market)` → calls `dfsClient.serpCompetitors(keywords, market)`
   - `googleSerpResults(keyword, market)` → calls `dfsClient.googleSerpResults(keyword, market)`
   - `amazonProducts(keyword, market)` → calls `dfsClient.searchProducts(keyword, market)` (existing async-task flow — warn: takes 30-60s per call; agent should call this sparingly)
   - `checkDomainAvailability(domain)` → calls `spaceshipClient.checkAvailability(domain)` (instantiates `SpaceshipClient` from `@monster/domains` if not passed in; reads credentials from Supabase settings at call time)
   
   All tools log `[niche-mcp] tool=${name} called` + `[niche-mcp] tool=${name} result rows/result=${n}`. Errors caught and returned as JSON `{ error: message }`.

2. **Define `NicheResearchPayload` and system prompt.** In `niche-researcher.ts`:
   ```typescript
   export interface NicheResearchPayload {
     sessionId: string;
     nicheIdea: string;
     market: string;
   }
   ```
   System prompt (constant): instruct the agent to (1) research keyword volume for the niche using `keywordIdeas`, (2) analyze SERP competition using `serpCompetitors` + `googleSerpResults`, (3) search Amazon products using `amazonProducts` (max 1 call to keep costs low), (4) suggest 3 domains and check availability using `checkDomainAvailability`, (5) emit ONLY a JSON object matching the `ResearchReport` schema — no prose before or after. Include the JSON schema shape in the prompt.

3. **Create `NicheResearcherJob` class.** `register()` returns `Worker<NicheResearchPayload>` on queue `'niche-research'` with `lockDuration: 600000` (10 min). The `handler` function:
   - Fetches the session row to confirm it exists; write `status: 'running'` immediately
   - Instantiates `DataForSEOClient` and `SpaceshipClient` (reads credentials from Supabase settings at call time)
   - Calls `createNicheResearcherMcpServer(supabase, dfsClient, spaceshipClient)`
   - Calls `query({ prompt: SYSTEM_PROMPT + nicheIdea, options: { maxTurns: 15, persistSession: false, tools: [], permissionMode: 'bypassPermissions', allowDangerouslySkipPermissions: true, mcpServers: { researcher: mcpServer } } })`
   - Iterates the async stream:
     - On `SDKAssistantMessage` (type `'assistant'`): extract a summary from the first 100 chars of content, append `{ turn, summary, timestamp }` to progress array, write to `research_sessions.progress`
     - On `SDKResultMessage` (type `'result'`): parse result string as `ResearchReport`; on success write `report` + `status: 'completed'`; on parse failure write `report: { raw: result.slice(0, 5000), error: 'parse_failed' }` + `status: 'completed'` (not failed — partial result is better than failure)
   - Catch-all: write `status: 'failed'`, append error to progress
   - Log: `[niche-researcher] sessionId=${id} turn=${n}` per turn, `[niche-researcher] sessionId=${id} completed` on finish

4. **Add `includePartialMessages: false`.** NicheResearcher does NOT need per-token streaming — only full turns. Without partial messages, the SDK emits `SDKAssistantMessage` + `SDKResultMessage` only. This reduces stream noise and simplifies the iteration loop (no `stream_event` / `content_block_delta` filtering needed — in contrast to `ClaudeSDKClient`).

5. **Add queue factory to `queue.ts`.** Add `createNicheResearchQueue()` and `nicheResearchQueue()` singleton following the existing pattern (named `'niche-research'`). Export from `queue.ts`.

6. **Export `enqueueNicheResearch` from `index.ts`.** Add to `packages/agents/src/index.ts`:
   ```typescript
   export { nicheResearchQueue, createNicheResearchQueue } from './queue.js';
   export type { NicheResearchPayload } from './jobs/niche-researcher.js';
   // enqueueNicheResearch is a thin wrapper — implement inline in index.ts or in a separate helper
   export async function enqueueNicheResearch(sessionId: string, nicheIdea: string, market: string) {
     const queue = nicheResearchQueue();
     const job = await queue.add('research', { sessionId, nicheIdea, market }, { removeOnComplete: true, removeOnFail: false });
     return job.id;
   }
   ```
   Keep `NicheResearcherJob` NOT exported from index (same as `GenerateSiteJob` — D048 pattern).

7. **Register in `worker.ts`.** Import `NicheResearcherJob`. Add after ProductRefreshJob:
   ```typescript
   const nicheResearcherJob = new NicheResearcherJob();
   const nicheResearcherWorker = nicheResearcherJob.register();
   console.log('[worker] NicheResearcherJob listening on queue "niche-research"');
   ```
   Add `nicheResearcherWorker.close()` to both SIGTERM and SIGINT handlers.

## Must-Haves

- [ ] `createNicheResearcherMcpServer()` has all 5 tools; each logs its call and result
- [ ] `NicheResearcherJob` uses `persistSession: false` and `maxTurns: 15`
- [ ] `includePartialMessages` is absent (default false) — no partial message filtering needed
- [ ] Handler writes `status: 'running'` at job start, `'completed'` or `'failed'` at end
- [ ] Per-turn progress written on each `SDKAssistantMessage` (not only on completion)
- [ ] `SDKResultMessage.result` parsing failure writes partial report, NOT `status: 'failed'`
- [ ] Queue named `'niche-research'` consistently (Worker + Queue factory + export)
- [ ] `NicheResearcherJob` NOT exported from `index.ts` (stays internal to worker)
- [ ] `nicheResearchQueue()` singleton and `enqueueNicheResearch()` ARE exported from `index.ts`
- [ ] Worker boots with `[worker] NicheResearcherJob listening on queue "niche-research"` log line
- [ ] `pnpm --filter @monster/agents build` exits 0

## Verification

```bash
# Build
pnpm --filter @monster/agents build   # exit 0
pnpm -r typecheck                     # exit 0

# Worker registration
pm2 reload monster-worker && sleep 5
pm2 logs monster-worker --lines 15 | grep -E 'NicheResearcherJob|niche-research'
# Expected: '[worker] NicheResearcherJob listening on queue "niche-research"'

# Manual job enqueue
node --input-type=module <<'EOF'
import 'dotenv/config';
const { enqueueNicheResearch } = await import('./packages/agents/dist/index.js');
const { createServiceClient } = await import('./packages/db/dist/index.js');
const db = createServiceClient();
const { data: session } = await db.from('research_sessions').insert({
  niche_idea: 'freidoras de aire test', market: 'ES', status: 'pending'
}).select().single();
console.log('sessionId:', session.id);
const jobId = await enqueueNicheResearch(session.id, 'freidoras de aire test', 'ES');
console.log('jobId:', jobId);
EOF

# After ~2 minutes, verify:
psql $SUPABASE_DB_URL -c "SELECT status, jsonb_array_length(progress), jsonb_typeof(report) FROM research_sessions WHERE niche_idea='freidoras de aire test';"
# Expected: completed | >= 1 | object

# DataForSEO live data in report:
psql $SUPABASE_DB_URL -c "SELECT report->'keywords'->0 FROM research_sessions WHERE niche_idea='freidoras de aire test';"
# Expected: JSON object with keyword, search_volume
```

## Observability Impact

- Signals added: `[niche-researcher] sessionId=${id} status=running/completed/failed`, `[niche-researcher] sessionId=${id} turn=${n} progress_entries=${n}`, `[niche-mcp] tool=${name} called`, `[niche-mcp] tool=${name} result rows=${n}`
- How a future agent inspects this: `pm2 logs monster-worker | grep niche-researcher` — turn count + completion status visible per run; `SELECT progress FROM research_sessions WHERE id='<id>'` — full turn-by-turn progress as jsonb
- Failure state exposed: `status='failed'` row in DB with error message in `progress` array; BullMQ failed job persists in Redis (`KEYS bull:niche-research:failed:*`)

## Inputs

- `packages/agents/src/clients/claude-sdk.ts` — `query()` call pattern + stream iteration (use same `for await` loop, different event handling)
- `packages/agents/src/mcp/monster-server.ts` — `createSdkMcpServer + tool()` structure to copy verbatim
- `packages/agents/src/jobs/product-refresh.ts` — `register(): Worker` + `handler()` + `lockDuration` pattern
- `packages/agents/src/queue.ts` — existing queue singleton pattern to follow
- `packages/shared/src/types/research-report.ts` — `ResearchReportSchema` (from T01) for result parsing
- `packages/agents/src/index.ts` — where to export queue factories and `enqueueNicheResearch`
- S02-RESEARCH.md §NicheResearcher MCP Server Tools — 5-tool spec
- S02-RESEARCH.md §Common Pitfalls — parse failure fallback, `includePartialMessages` guidance

## Expected Output

- `packages/agents/src/mcp/niche-researcher-server.ts` — new; `createNicheResearcherMcpServer()` with 5 tools
- `packages/agents/src/jobs/niche-researcher.ts` — new; `NicheResearcherJob` class + `NicheResearchPayload` type
- `packages/agents/src/queue.ts` — `createNicheResearchQueue()` + `nicheResearchQueue()` added
- `packages/agents/src/index.ts` — `nicheResearchQueue`, `createNicheResearchQueue`, `enqueueNicheResearch` exported
- `packages/agents/src/worker.ts` — `NicheResearcherJob` imported, registered, added to shutdown handlers
- `pnpm --filter @monster/agents build` exits 0; worker boots with NicheResearcherJob log line; manual enqueue produces completed `research_sessions` row with real DFS data
