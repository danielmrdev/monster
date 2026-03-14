# M007: Monster Chat + Research Lab — Research

**Date:** 2026-03-13
**Status:** Ready to plan

## Summary

Both features have solid scaffolding already in place. The DB schema for `chat_conversations`, `chat_messages`, `research_sessions`, and `research_results` was defined in M001 migration `20260313000005_ai.sql`. The nav sidebar already routes to `/monster` and `/research` (both stub pages). The `@monster/agents` worker infrastructure (BullMQ + Upstash Redis, tsup bundle config, pm2 process) is fully operational. The key unknowns from the M007 context document have been clarified by SDK research: streaming works cleanly via `for await` over `query()` with `includePartialMessages: true`, and session resume via the `resume: sessionId` option makes conversation history manageable without storing full message arrays in Redis.

The primary architecture risk — bridging the Agent SDK's `async for` iterator to a browser HTTP response — has a clean solution in Next.js 15 App Router: a Route Handler (`/api/monster/chat`) returning a `ReadableStream` using SSE format. The server reads SDK events, encodes them as `data: {...}\n\n`, and the client uses `EventSource` (or a `fetch` with streaming body reader). This is the canonical pattern for streaming AI responses in Next.js 15 and avoids WebSockets entirely. For NicheResearcher, the BullMQ job pattern already exists in `ProductRefreshJob` and `GenerateSiteJob` — NicheResearcher follows the same pattern, writing progress to `research_sessions.report` (jsonb) which the UI polls via Supabase Realtime or 5-second interval (the same pattern as `JobStatus.tsx`).

One critical gap: `research_sessions` has no `progress` column. The context document mentions "agent writes progress to `research_sessions.progress` jsonb" but the schema only has `report` (final jsonb). Either add a `progress` column via migration or use `report` for incremental updates. Adding `progress` is cleaner. The Agent SDK `ANTHROPIC_API_KEY` env var must be set in the worker's environment (currently only `ContentGenerator` uses it from `process.env.ANTHROPIC_API_KEY`; the Agent SDK reads the same var by default). A new `monster_agent_api_key` setting is unnecessary if `ANTHROPIC_API_KEY` is already in `.env`.

## Recommendation

**S01 first: Monster Chat.** Validate the core streaming pipeline (SDK → SSE Route Handler → browser) before adding the complexity of BullMQ + DataForSEO + Spaceship in S02. Monster Chat is the higher-risk feature technically (streaming bridge) but lower-risk in terms of external API costs. S02 (NicheResearcher) follows once the streaming pattern is proven. The DataForSEO APIs for research are different endpoints from the existing `searchProducts()` (Labs API, Keywords Data API, SERP API) — new client methods needed.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| AI agent loop with tool execution | `@anthropic-ai/claude-agent-sdk` `query()` | Handles message loop, tool dispatch, turn limits, retries — writing this from scratch is weeks of work |
| SSE streaming in Next.js 15 | Native `ReadableStream` + Route Handler | No library needed — App Router route handlers return `Response` with `ReadableStream` body natively |
| Conversation resume across page reloads | Agent SDK `resume: sessionId` option | SDK persists session state server-side; don't implement your own message history storage in Redis |
| BullMQ job + progress tracking | `GenerateSiteJob` / `ProductRefreshJob` pattern | Established pattern: phase writes to `ai_jobs.payload`, status transitions, pm2 worker already running |
| Supabase progress polling | `JobStatus.tsx` polling pattern | 5-second `setInterval` poll against Supabase already proven; use same pattern for research session status |
| Portfolio context for Monster | Custom MCP server via `createSdkMcpServer` + `tool()` | Agent SDK provides the full MCP server creation API — 4 read-only Supabase tools is ~50 lines |
| DataForSEO API client | `DataForSEOClient` in `packages/agents/src/clients/dataforseo.ts` | Already has auth, polling loop, market config — extend with Labs + Keywords + SERP methods |
| Spaceship availability check | `SpaceshipClient.checkAvailability()` in `packages/domains/src/spaceship.ts` | Already implemented and tested — NicheResearcher calls it directly (read-only, no purchase) |

## Existing Code and Patterns

- `packages/agents/src/jobs/generate-site.ts` — multi-phase BullMQ job with progress writes to `ai_jobs.payload`; NicheResearcherJob follows identical pattern, writing to `research_sessions.status` + `research_sessions.progress`
- `packages/agents/src/jobs/product-refresh.ts` — simpler BullMQ job structure for reference; no Astro dependency
- `packages/agents/src/worker.ts` — worker entrypoint; add `NicheResearcherJob.register()` here; `ANTHROPIC_API_KEY` is already read from `process.env` by `ContentGenerator` — Agent SDK reads same var by default
- `packages/agents/src/clients/dataforseo.ts` — existing client with `searchProducts()` for Merchant API; need `searchKeywords()` (Labs API), `getSerpData()` (SERP API), `getKeywordData()` (Keywords Data API) methods added
- `packages/domains/src/spaceship.ts` — `checkAvailability()` is the only method NicheResearcher needs; already handles auth, error handling
- `packages/agents/tsup.config.ts` — `noExternal: [/@monster\/.*/]`, external list for native modules; adding `@anthropic-ai/claude-agent-sdk` likely needs to go in external (it's large, 60MB unpacked)
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — polling component pattern for async job status; reuse for research session progress
- `apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx` — `'use client'` leaf in a server page; D089 pattern applies to all new interactive components in M007
- `apps/admin/src/app/(dashboard)/analytics/actions.ts` — server action enqueuing a BullMQ job; `enqueueResearch()` follows same structure
- `packages/db/supabase/migrations/20260313000005_ai.sql` — `research_sessions` already has `status`, `report` jsonb, `niche_idea`, `market`; needs `progress` jsonb column added via migration
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — `SETTINGS_KEYS` array; may need `anthropic_agent_api_key` if Monster Chat needs a different key than ContentGenerator (likely not — same `ANTHROPIC_API_KEY` env var)

## Constraints

- **`@anthropic-ai/claude-agent-sdk` is NOT installed** — must be added as a dep to `packages/agents` (and likely to `apps/admin` if the streaming route is in the admin app). Current version: `0.2.76`.
- **Agent SDK requires `ANTHROPIC_API_KEY`** env var by default (same var as `ContentGenerator`) — no new env var needed, but it must be in `.env` and loaded by the worker.
- **Custom MCP tools require streaming input mode** — `prompt` must be an async generator, not a string. This is a documented SDK requirement; passing a string prompt does NOT enable MCP tools.
- **tsup bundling**: `@anthropic-ai/claude-agent-sdk` is 60MB unpacked — must be added to tsup `external` list (same pattern as D074 for `cloudflare` and `node-ssh`). Then it also needs to be a direct dep in `packages/agents/package.json` to be resolvable at runtime (D094/D096 pattern).
- **Next.js route handler for SSE**: Route handler must return `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', ... } })`. The streaming Agent SDK call must run entirely within the route handler — not in a server action. Server actions cannot return streaming responses.
- **`research_sessions` schema gap**: No `progress` column exists. Context doc says "agent writes progress to `research_sessions.progress` jsonb" — migration needed.
- **BullMQ lockDuration**: NicheResearcher with `maxTurns: 15` and DataForSEO polling (5s × 12 attempts per keyword = up to 60s per keyword) could take 5-10 minutes. `lockDuration: 600000` (10 minutes) required.
- **No `ClaudeSDKClient` session persistence across browser reloads**: The v2 API (`unstable_v2_createSession`) is the cleaner multi-turn API, but it's marked unstable. Recommended approach: use v1 `query()` with `resume: sessionId` stored in `chat_conversations.session_id` (new column needed) — this lets the SDK handle memory and avoids storing full message history for replay.
- **DataForSEO Labs/Keywords API**: Different endpoint prefix from Merchant API (`/v3/dataforseo_labs/` vs `/v3/merchant/`). Same auth pattern, same async task_post → poll → task_get flow or use synchronous "live" endpoints where available.

## Common Pitfalls

- **Passing string prompt with MCP tools** — The SDK ignores MCP servers when `prompt` is a plain string. Must use an async generator yielding user message objects. Easy to miss; results in silent no-op (tools never called, Agent runs without portfolio context).
- **Agent SDK bundled into admin Next.js** — The SDK should run in the Next.js Route Handler (server-side) but webpack should not try to bundle it. Use `serverExternalPackages: ['@anthropic-ai/claude-agent-sdk']` in `next.config.ts` to prevent webpack from bundling it in the admin app (same reason `astro` is external in agents tsup config).
- **SSE connection drops on long research sessions** — NicheResearcher can take 5-10 minutes. Browser SSE connections drop after proxy timeouts (default 60s on many proxies). The recommended approach: store progress in DB, not SSE. Research page polls Supabase every 3-5 seconds (JobStatus.tsx pattern). SSE is for Monster Chat only (short turns, seconds not minutes).
- **`chat_conversations` has no `session_id` column** — If using Agent SDK session resume, need to store the `session_id` returned in `message.session_id` from the first query. Need a migration to add `session_id text` to `chat_conversations`, or store it in the `title` column temporarily (wrong). Add migration.
- **D034 applies to all new 'use server' files** — Any constants exported alongside async functions in a server action file will cause a build error. Pattern: constants in sibling `constants.ts`, imported by both action and page.
- **DataForSEO cost per research run** — A full NicheResearcher run (keyword research + SERP + competitor + Amazon product search) may touch 4-5 API calls at $0.0001-$0.001 each. With `maxTurns: 15`, the agent could make 15+ DFS calls. Cap tool calls, not just turns. Each DataForSEO tool call should log its cost estimate.
- **Supabase RLS on research tables** — `research_sessions` and `research_results` have RLS enabled but no policies defined in the migration (service role client bypasses RLS, so the worker is fine). Admin panel reads must use service role client, not anon client.
- **Monster Chat system prompt size** — Loading "full portfolio context" into the system prompt (all sites, analytics, products) could be thousands of tokens per turn. Use MCP tools instead: Monster queries portfolio data on-demand via tools. System prompt = owner context + instructions only.

## Open Risks

- **Agent SDK behavior in production pm2 process** — The SDK spawns a subprocess internally (it communicates with Claude via the API, not a subprocess — clarification needed). If it uses child processes, pm2's `exec_mode: 'fork'` + `max_memory_restart: '512M'` may need adjustment. The SDK is 60MB unpacked; worker memory will grow.
- **DataForSEO Labs API availability for ES market** — The Labs API (keyword ideas, related keywords) may have limited data for the ES market. NicheResearcher should degrade gracefully (use SERP-only data if Labs returns sparse results).
- **`unstable_v2_createSession` stability** — The v2 API is explicitly marked unstable and could change in minor releases. The v1 `query()` + `resume: sessionId` is the safe path for M007 despite being slightly more complex for multi-turn.
- **Admin Next.js bundle contamination** — If `@monster/agents` (which will import Agent SDK for NicheResearcher queue) is imported in admin server actions, webpack may try to bundle Agent SDK internals. Watch for `serverExternalPackages` needing expansion.

## Schema Migrations Needed

Two new migrations for M007:

1. **`research_sessions.progress`** — `ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS progress jsonb;` (incremental progress from NicheResearcher agent, written on each tool call turn)
2. **`chat_conversations.agent_session_id`** — `ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS agent_session_id text;` (Agent SDK session ID for conversation resume via `resume: sessionId` option)

## Slice Ordering Rationale

**S01: Monster Chat** (streaming bridge validation)
- Proves: Agent SDK → Next.js Route Handler → SSE → browser works end-to-end
- Proves: Custom MCP server with portfolio tools works
- Proves: `ANTHROPIC_API_KEY` in worker environment → now confirmed needed in admin env too (route handler runs in Next.js process, not worker)
- Lower cost risk: Monster Chat is conversational, bounded by user interaction

**S02: NicheResearcher** (autonomous background agent)
- Depends on: S01 having proven Agent SDK integration patterns
- Higher cost risk: DataForSEO API calls during research
- New DataForSEO endpoints: Labs, Keywords Data, SERP APIs

**S03: Research Report UI + Domain Suggestions + "Create Site" CTA**
- Depends on: S02 producing structured report data in `research_sessions.report`
- Spaceship availability check already implemented — wire it into report display

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Claude Agent SDK | `npx skills find "claude agent sdk"` | none found — platform docs used instead |
| Next.js 15 streaming | built-in App Router knowledge | n/a |

## Sources

- Agent SDK v1 `query()` function with streaming and MCP tools (source: [platform.claude.com/docs/en/agent-sdk](https://platform.claude.com/docs/en/agent-sdk/custom-tools))
- Agent SDK session resume via `resume: sessionId` option (source: [platform.claude.com/docs/en/agent-sdk/sessions](https://platform.claude.com/docs/en/agent-sdk/sessions))
- Agent SDK `includePartialMessages: true` for streaming text deltas (source: [platform.claude.com/docs/en/agent-sdk/streaming-output](https://platform.claude.com/docs/en/agent-sdk/streaming-output))
- Agent SDK v2 unstable API `unstable_v2_createSession` (source: [platform.claude.com/docs/en/agent-sdk/typescript-v2-preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview))
- `@anthropic-ai/claude-agent-sdk` v0.2.76 on npm (source: npm registry)
- Existing codebase: BullMQ job pattern, tsup external config, Supabase service client, DataForSEO client, SpaceshipClient
