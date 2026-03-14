# S02: NicheResearcher — Background Agent + DataForSEO Research

**Date:** 2026-03-14
**Status:** Ready to plan

## Summary

S01 delivered everything S02 depends on: Agent SDK installed and proven in production, `query()` call pattern established, `ClaudeSDKClient` working end-to-end. S02 is now straightforward — it reuses the BullMQ worker pattern (established in 5 prior jobs), extends the DataForSEO client with 3 new live-endpoint methods, and wraps the Agent SDK `query()` call inside a BullMQ job handler (not a Route Handler, so no SSE complexity). The schema gap (`research_sessions.progress`) requires a migration. There is no new dependency to install — everything S02 needs is already in `packages/agents/package.json`.

The biggest architectural decision is **how the NicheResearcher agent calls DataForSEO and Spaceship**. Two approaches: (A) the agent runs `query()` with no external tool MCP server — the job handler wraps the full `query()` call and writes progress periodically by polling the async iterator; (B) the agent uses a custom in-process MCP server (same `createSdkMcpServer` pattern as Monster) with DataForSEO and Spaceship tools, allowing Claude to decide what to search and when. Approach B is the correct one per the spec — NicheResearcher is described as an autonomous agent with tools. The job handler wraps `query()`, iterates the message stream, persists progress on each `SDKAssistantMessage` turn, and writes the final structured report from `SDKResultMessage.result` on completion.

One critical constraint: the Agent SDK writes session files to `~/.claude/projects/`. In a BullMQ job, the `cwd` option should point to a deterministic directory per session (or `persistSession: false` can be used since NicheResearcher sessions don't need resume). Setting `persistSession: false` avoids session file accumulation on disk from hundreds of research jobs.

## Recommendation

**Three tasks, same T01→T02→T03 pattern as S01:**

- **T01**: DB migration (`research_sessions.progress` column) + `DataForSEOClient` extended with `keywordIdeas()`, `serpCompetitors()`, `searchKeywordsForMarket()` using live endpoints (synchronous, no task_post/poll) + `ResearchReport` Zod schema defined in `packages/shared`
- **T02**: `NicheResearcherJob` in `packages/agents/src/jobs/niche-researcher.ts` — BullMQ job that calls `query()` with a NicheResearcher MCP server providing DataForSEO + Spaceship tools; iterates the message stream; writes `progress` per agent turn; writes final `report` on completion; registered in `worker.ts`; queue + enqueue exported from `packages/agents/src/index.ts`
- **T03**: Research Lab UI — niche idea form + `enqueueResearch` server action + `ResearchSessionStatus` polling client component (5-second interval, `JobStatus.tsx` pattern)

**Key constraints driving this order:** migration must precede job (job writes `progress` on every turn — TypeScript types need to be correct); DataForSEO client extension in T01 is tested as pure HTTP calls before wiring into the agent in T02; UI in T03 can poll whatever is in DB regardless of report content (S03 renders the formatted report).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| BullMQ job with long lock | `GenerateSiteJob` + `ProductRefreshJob` pattern | Same Worker + handler + register() pattern; lockDuration=600000 is the only change |
| Agent SDK `query()` in a job | `ClaudeSDKClient.streamQuery()` — same `query()` call | NicheResearcher calls `query()` directly without the SSE bridge; same iteration pattern minus ReadableStream |
| In-process MCP tools for the agent | `createSdkMcpServer` + `tool()` from `createMonsterMcpServer` | Established in S01 — NicheResearcher gets its own MCP server with DFS + Spaceship tools |
| Progress polling UI | `JobStatus.tsx` (5s setInterval + server action poll) | Exact same pattern: `ResearchSessionStatus` component polls `research_sessions.status + progress` instead of `ai_jobs` |
| DataForSEO API auth | `DataForSEOClient.fetchAuthHeader()` (existing) | Auth is already done; only new methods needed for Labs + SERP endpoints |
| Spaceship domain check | `SpaceshipClient.checkAvailability()` (already in packages/domains) | Already implemented, tested, and available — NicheResearcher MCP tool calls it directly |
| Structured output from Agent SDK | `SDKResultSuccess.result` (string) + `ResearchReport` Zod schema parse | Agent SDK returns `result` as a string; parse with `z.parse(JSON.parse(result))` after prompting the agent to emit JSON matching the schema |
| Queue factory | `createRedisConnection` + `Queue('niche-research', { connection })` pattern | Every existing queue follows this; add `createNicheResearchQueue()` + `nicheResearchQueue()` singleton |

## Existing Code and Patterns

- `packages/agents/src/jobs/product-refresh.ts` — cleanest BullMQ job pattern to follow: `register(): Worker` + standalone `handler()` function + `lockDuration` config. NicheResearcher follows this exactly.
- `packages/agents/src/jobs/analytics-aggregation.ts` — shows the scheduler registration pattern separately from `register()`. NicheResearcher doesn't need a scheduler (on-demand only).
- `packages/agents/src/queue.ts` — add `createNicheResearchQueue()` + `nicheResearchQueue()` singleton here, matching every other queue. Export from `src/index.ts`.
- `packages/agents/src/clients/dataforseo.ts` — extend with 3 new methods; same `auth = await this.fetchAuthHeader()` + `apiPost()` pattern; new methods use **live endpoints** (no task_post/poll loop).
- `packages/agents/src/mcp/monster-server.ts` — copy the `createSdkMcpServer` + `tool()` structure verbatim; NicheResearcher gets `createNicheResearcherMcpServer(supabase)` with DFS + Spaceship tools.
- `packages/agents/src/clients/claude-sdk.ts` — shows the exact `for await (const msg of sdkQuery)` loop; NicheResearcher does the same loop but writes to Supabase instead of yielding to a ReadableStream.
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — `ResearchSessionStatus.tsx` is a copy with `research_sessions` table + `progress` jsonb instead of `ai_jobs`. 5-second poll, D089 pattern (separate 'use client' file).
- `apps/admin/src/app/(dashboard)/analytics/actions.ts` — `enqueueResearch` server action follows the same structure: imports singleton queue, calls `queue.add()`, returns `{ ok, jobId, error }`. D034 applies: no constants exported alongside `'use server'` functions.
- `packages/db/supabase/migrations/20260313000005_ai.sql` — `research_sessions` already has `id, niche_idea, market, status, report, created_at, updated_at`. Need `progress jsonb` added.
- `packages/db/src/types/supabase.ts` — manually add `progress: Json | null` to `research_sessions` Row/Insert/Update after writing the migration. Then rebuild `@monster/db` (D098 — `pnpm --filter @monster/db build` after manual edit).
- `packages/shared/src/types/` — add `ResearchReport` Zod schema here (D027 pattern); import in both agents (for validation) and admin (for S03 report rendering).

## Constraints

- **`ANTHROPIC_API_KEY` is NOT in `.env`** — the Agent SDK authenticates via Claude CLI auth stored in `~/.claude/` (user's Anthropic Pro subscription). This works for the admin Route Handler (runs as the `daniel` user) and the worker (also runs as `daniel` via pm2). **No env var change needed** — but this is a production deployment constraint: if the monster-worker ever runs under a different user, CLI auth won't be available. Document in research. For now: verified working in S01.
- **DataForSEO Labs/SERP live endpoints** — unlike `searchProducts()` which uses `task_post → tasks_ready → task_get` (async, 30-60s), the Labs and SERP live endpoints are **synchronous** (POST → immediate response, no polling). This means NicheResearcher MCP tools return in ~1-3s per call instead of 30-60s. The `lockDuration: 600000` (10min) is still appropriate as a ceiling for `maxTurns: 15`.
- **DataForSEO Labs endpoint version** — two versions exist: legacy (`/v3/dataforseo_labs/keyword_ideas/live`, takes `keywords: string[]`) and new Google-specific (`/v3/dataforseo_labs/google/keyword_ideas/live`, takes `keywords: string[]` + `language_code`). Use the **Google-specific new version** for ES market: `language_code: 'es'` + `location_code: 2724`. Response field for search volume: `keyword_info.search_volume` (new version) vs `impressions_info` (legacy).
- **`research_sessions.progress` column missing** — confirmed: no `progress` field in `packages/db/src/types/supabase.ts`. Migration must be applied before the job tries to write it. New migration file: `20260314000007_research_progress.sql`.
- **`MARKET_CONFIG` already defined in `DataForSEOClient`** — location codes and language codes for ES/US/UK/DE/FR/IT are in the client. New Labs methods reuse these; the `language_code` for Labs is a shorter form (`'es'`, not `'es_ES'`). Check actual DFS docs: Labs uses 2-letter language codes like `'es'`, `'en'`; Merchant uses `'es_ES'`, `'en_US'`. Need to add a separate `LABS_MARKET_CONFIG` or pass language codes differently.
- **`persistSession: false` for NicheResearcher** — research jobs are fire-and-forget, not resumable. Pass `persistSession: false` to avoid writing session files to `~/.claude/projects/` on every research run. Without this, hundreds of session files accumulate.
- **`tools: []` + `permissionMode: 'bypassPermissions'`** — same as S01's `ClaudeSDKClient`. NicheResearcher gets no filesystem/bash tools. Only its MCP server tools (DFS + Spaceship).
- **Agent SDK `model` option** — specify `model: 'claude-sonnet-4-5-20250929'` (same as ContentGenerator, consistent with CLAUDE.md spec `claude-sonnet-4-6`) to avoid defaulting to whatever the CLI settings.json specifies. Actually: `~/.claude/settings.json` has `model: 'sonnet'` which maps to the current claude-sonnet. This may vary over time. Better to pin the model explicitly in the job.
- **`maxTurns: 15`** — hard limit per spec. The agent will stop after 15 turns regardless. This is the cost guard. With live DFS endpoints (~1-3s each), a 15-turn run completes in ~1-3 min, not 10 min. The `lockDuration: 600000` is a ceiling, not an expectation.
- **RLS on research tables** — confirmed in M007 research: service-role client bypasses RLS. All worker + admin server actions use `createServiceClient()`. No anon client in the job handler.
- **Admin panel `serverExternalPackages`** — `next.config.ts` already has `['@anthropic-ai/claude-agent-sdk']`. `@monster/agents` imports `NicheResearcherJob` only in the worker (not exported from index). The admin only imports `nicheResearchQueue()` + `enqueueNicheResearch()` — queue types only, no SDK references. No `serverExternalPackages` changes needed.

## Common Pitfalls

- **DataForSEO Labs language_code format** — Labs API uses 2-letter codes (`'es'`, `'en'`), NOT 4-letter codes like `'es_ES'` or `'en_US'` (those are for Merchant API). Using `'es_ES'` in a Labs request will return an error or empty results. Add a `LABS_LANGUAGE_CODE` map separate from the existing `language_code` in `MARKET_CONFIG`.
- **Parsing structured output from `SDKResultMessage.result`** — the `result` field is a **string** (Claude's final text output), not a parsed object. The job handler must call `JSON.parse(result)` then validate with the `ResearchReport` Zod schema. If Claude doesn't emit valid JSON matching the schema, parsing will throw — catch and write `status: 'failed'` to DB. Prompt engineering is critical: the system prompt must instruct Claude to emit JSON only, with the exact schema structure.
- **`SDKAssistantMessage` vs `SDKPartialAssistantMessage` for progress** — for NicheResearcher, `includePartialMessages` should be `false` (no streaming needed — job writes progress per full turn, not per token). Without `includePartialMessages: true`, only `SDKAssistantMessage` (full turn) and `SDKResultMessage` are emitted. Progress is written on each `SDKAssistantMessage`.
- **D034: `'use server'` exports** — `enqueueResearch` server action file must export only async functions. `ResearchSessionStatus` polling action must be in the same file or a separate action file. No constants alongside `'use server'` functions.
- **Zod v4 in packages/shared** — `packages/agents` uses `zod/v4` (explicitly imported as `from 'zod/v4'`). `packages/shared` currently uses `zod` (v4 default). Confirm the import path when writing `ResearchReport` schema to shared. In the codebase, `@anthropic-ai/sdk` helpers require v4, and `packages/agents` imports from `'zod/v4'`. For `packages/shared`, standard `import { z } from 'zod'` is correct since zod@4 is installed.
- **Queue `'niche-research'` name must match Worker name** — `new Worker<NicheResearchPayload>('niche-research', handler, { ... })` and `new Queue('niche-research', { connection })` must use the same string. Every existing job follows this.
- **Progress write overhead** — writing to Supabase on every agent turn adds ~50-100ms per turn. With `maxTurns: 15`, that's 15 Supabase writes. Acceptable. Don't try to debounce.
- **DataForSEO ES market data sparsity** — Labs keyword ideas for Spanish market may return fewer results than US/UK. NicheResearcher should handle empty or sparse results gracefully (log and continue, not throw). The agent should be instructed in the system prompt to degrade gracefully.

## Open Risks

- **Agent SDK subprocess and pm2 memory** — The Agent SDK runs Claude as a subprocess (spawns `claude` CLI binary). Each `query()` call spawns a process, runs the turns, and exits. pm2 `max_memory_restart: '512M'` for the worker may be too tight if the SDK subprocess itself uses significant memory. Monitor after first run; increase to 1024M if needed.
- **`ANTHROPIC_API_KEY` vs CLI auth in worker** — S01 verified the Route Handler (Next.js process) works with CLI auth. The BullMQ worker (`node dist/worker.js`) also runs as `daniel` on VPS1. CLI auth is in `~/.claude/` — accessible to the worker process. Risk: if pm2 runs with a different environment that doesn't have HOME=/home/daniel, SDK auth fails silently (agent runs without API access). Verify by checking pm2 ecosystem `env: { HOME: '/home/daniel' }` or by adding `ANTHROPIC_API_KEY` to `.env` as a fallback.
- **NicheResearcher structured output reliability** — Claude must emit valid JSON matching `ResearchReport` schema. This depends on prompt engineering and model compliance. Add fallback: if `SDKResultMessage.result` doesn't parse as valid `ResearchReport`, store the raw string in `report` as `{ raw: result, error: 'parse_failed' }` rather than failing the job entirely.
- **DataForSEO cost per research run** — with live endpoints, each tool call is one API call. At `maxTurns: 15` with ~3-5 DFS calls per run (keyword ideas + SERP competitors + Amazon product search), cost is ~5-10 DFS credits total (~$0.001-$0.01 per research session). Well within budget. But if the agent loops (calls the same tool repeatedly), costs multiply. System prompt must instruct the agent to be efficient.

## Schema Migrations Needed

One new migration for S02:

**`20260314000007_research_progress.sql`:**
```sql
ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS progress jsonb;
```

After applying, manually update `packages/db/src/types/supabase.ts` to add `progress: Json | null` to `research_sessions` Row/Insert/Update shapes, then `pnpm --filter @monster/db build` (D098).

## DataForSEO New Endpoints Summary

| Method to add | DFS endpoint | Sync/Async | Notes |
|---|---|---|---|
| `keywordIdeas(keyword, market)` | `POST /v3/dataforseo_labs/google/keyword_ideas/live` | Sync (live) | Returns keywords[] with search_volume, cpc, competition. Location + language from market config. language_code: 'es' (not 'es_ES'). |
| `serpCompetitors(keywords[], market)` | `POST /v3/dataforseo_labs/google/serp_competitors/live` | Sync (live) | Returns top competitor domains for given keywords. Use for niche competition analysis. |
| `searchGoogleOrganicSerp(keyword, market)` | `POST /v3/serp/google/organic/live/regular` | Sync (live) | Returns top 10 organic results for a keyword. Competitor URL + title + description. |

Amazon product search still uses `searchProducts()` (existing async task flow) — no change needed for Merchant API.

## NicheResearcher MCP Server Tools (proposed)

```
createNicheResearcherMcpServer(supabase):
  - keywordIdeas(keyword, market, limit?) → keyword[] with search_volume/cpc
  - serpCompetitors(keywords[], market) → competitor domains with median_position
  - googleSerpResults(keyword, market) → top 10 organic results
  - amazonProducts(keyword, market) → top products (reuses searchProducts())
  - checkDomainAvailability(domain) → { available, price? }
```

The agent receives a system prompt instructing it to: (1) research keyword volume, (2) analyze SERP competition, (3) search Amazon for product viability, (4) suggest 3-5 domain names and check availability, (5) emit final JSON report matching `ResearchReport` schema.

## ResearchReport Schema (to define in packages/shared)

```typescript
// packages/shared/src/types/research-report.ts
export const ResearchReportSchema = z.object({
  niche_idea: z.string(),
  market: z.string(),
  viability_score: z.number().min(0).max(100),
  summary: z.string(),
  keywords: z.array(z.object({
    keyword: z.string(),
    search_volume: z.number().nullable(),
    cpc: z.number().nullable(),
    competition: z.number().nullable(), // 0-1
  })),
  competitors: z.array(z.object({
    domain: z.string(),
    median_position: z.number().nullable(),
    relevance: z.string(),
  })),
  amazon_products: z.array(z.object({
    asin: z.string(),
    title: z.string(),
    price: z.number().nullable(),
    rating: z.number(),
    review_count: z.number(),
    is_prime: z.boolean(),
  })),
  domain_suggestions: z.array(z.object({
    domain: z.string(),
    available: z.boolean().nullable(), // null = not checked yet
    price: z.string().optional(),
  })),
  recommendation: z.string(),
  generated_at: z.string(), // ISO timestamp
});
export type ResearchReport = z.infer<typeof ResearchReportSchema>;
```

## Slice Ordering Note

S01's Forward Intelligence correctly identified that `query()` with `maxTurns` works for autonomous agents. The BullMQ job pattern (`register()` + `handler()` + `lockDuration`) is proven across 5 jobs. The main unknowns for S02 are: (1) DataForSEO Labs live endpoints returning useful ES-market data, and (2) structured output parsing from `SDKResultMessage.result`. Both de-risk by writing simple smoke tests before wiring the full job.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| BullMQ | n/a — established pattern in codebase | not needed |
| DataForSEO Labs API | n/a — docs research done above | not needed |
| Claude Agent SDK | n/a — proven in S01, types inspected | not needed |

## Sources

- DataForSEO Labs Google keyword ideas live endpoint: POST `/v3/dataforseo_labs/google/keyword_ideas/live` with `keywords[]`, `location_code`, `language_code` (2-letter) (source: [docs.dataforseo.com/v3/dataforseo_labs-google-keyword_ideas-live](https://docs.dataforseo.com/v3/dataforseo_labs-google-keyword_ideas-live/))
- DataForSEO Labs SERP competitors live endpoint: POST `/v3/dataforseo_labs/google/serp_competitors/live` (source: [docs.dataforseo.com/v3/dataforseo_labs-google-serp_competitors-live](https://docs.dataforseo.com/v3/dataforseo_labs-google-serp_competitors-live/))
- DataForSEO SERP Google organic live: POST `/v3/serp/google/organic/live/regular` returns `type:organic` items with domain/title/url (source: [docs.dataforseo.com appendix/ai_optimized_response](https://docs.dataforseo.com/v3/appendix-ai_optimized_response/))
- Agent SDK `systemPrompt`, `persistSession`, `model` options confirmed in SDK type defs (source: `@anthropic-ai/claude-agent-sdk@0.2.76` `sdk.d.ts` lines 1183-1210, 860-870)
- `SDKResultSuccess.result` is a string — structured output extracted via JSON.parse (source: `sdk.d.ts` line 2085-2101)
- `SDKAssistantMessage` emitted per full turn (without `includePartialMessages: true`) — use for per-turn progress writes (source: `sdk.d.ts` line 1644-1661)
- Existing codebase: `ProductRefreshJob`, `GenerateSiteJob`, `ClaudeSDKClient`, `DataForSEOClient`, `SpaceshipClient.checkAvailability()`, `createMonsterMcpServer`, `JobStatus.tsx`
