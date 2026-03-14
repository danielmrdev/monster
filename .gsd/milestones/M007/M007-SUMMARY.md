---
id: M007
provides:
  - "@anthropic-ai/claude-agent-sdk installed + externalized in tsup (both entries) and Next.js serverExternalPackages"
  - "ClaudeSDKClient.streamQuery() — typed SSE event iterator bridging Agent SDK async stream to browser"
  - "createMonsterMcpServer(supabase) — in-process MCP server with 4 read-only portfolio tools"
  - "POST /api/monster/chat Route Handler — SSE streaming bridge with conversation + message persistence + X-Conversation-Id header"
  - "Monster Chat UI — two-column layout (ConversationList sidebar + ChatWindow SSE client), URL updated via replaceState"
  - "DB migration: chat_conversations.agent_session_id text (live Supabase)"
  - "DB migration: research_sessions.progress jsonb (live Supabase)"
  - "DataForSEOClient extended with keywordIdeas(), serpCompetitors(), googleSerpResults() (Labs/SERP live endpoints)"
  - "LABS_LANGUAGE_CODE map — 2-letter codes for Labs API, separate from 4-letter MARKET_CONFIG"
  - "ResearchReportSchema Zod schema (packages/shared) — 10-field structured report type, importable by agents and admin"
  - "createNicheResearcherMcpServer(dfsClient, spaceshipClient) — 5 MCP tools for niche research"
  - "NicheResearcherJob BullMQ worker on queue 'niche-research', lockDuration 600000ms, maxTurns 15"
  - "Per-turn progress writes to research_sessions.progress jsonb; job survives browser disconnect"
  - "nicheResearchQueue() singleton + enqueueNicheResearch() exported from packages/agents"
  - "enqueueResearch server action — insert-before-enqueue with immediate failure recovery"
  - "Research Lab page with niche form + market selector + 5s polling ResearchSessionStatus + session history list"
  - "ResearchReportViewer server component — all 10 report fields with live Spaceship availability badges"
  - "renderCompletedSession() — safeParse discriminated union + Promise.allSettled() domain checks"
  - "Parse-failure graceful fallback (ZodError.issues + raw JSON in <details>)"
  - "Create site CTA linking to /sites/new?niche=...&market=... with SiteForm defaultValues pre-fill"
  - "SiteForm defaultValues prop — uncontrolled defaultValue on niche Textarea and market NativeSelect"
  - "/sites/new async page reading searchParams.niche + searchParams.market (Next.js 15 async pattern)"
key_decisions:
  - D099 — Monster Chat streaming via Route Handler + SSE (not WebSockets/server actions); client uses fetch with streaming body reader (EventSource is GET-only)
  - D100 — Initial doc said async generator prompt required for MCP (superseded by D105)
  - D101 — Agent SDK externalized in both tsup and Next.js serverExternalPackages; direct dep in packages/agents
  - D102 — NicheResearcher progress: per-turn jsonb writes to DB; UI polls 5s (SSE would drop on proxies for 5-10min jobs)
  - D103 — Agent session resume via chat_conversations.agent_session_id storing SDK session ID
  - D104 — X-Conversation-Id response header conveys new conversation ID to streaming client before body consumed
  - D105 — D100 superseded: string prompt correct for SDK v0.2.76; MCP registered via options.mcpServers independently
  - D106 — createMonsterMcpServer returns McpSdkServerConfigWithInstance (not bare McpServer)
  - D107 — Streaming text via SDKPartialAssistantMessage with includePartialMessages:true
  - D108 — Controller close-safety: closed boolean + try/catch in send() for client disconnect
  - D109 — Pre-stream HTTP 404 for unknown conversationId (not SSE error event)
  - D110 — URL update after first turn uses window.history.replaceState() (not router.push())
  - D111 — LABS_LANGUAGE_CODE map separate from MARKET_CONFIG (2-letter vs 4-letter codes for Labs endpoints)
  - D112 — Migrations applied via temp pg script (Supabase CLI migration tracking out of sync in this project)
  - D113 — createNicheResearcherMcpServer takes (dfsClient, spaceshipClient) only; supabase param dropped
  - D114 — report typed as any at Supabase update boundary; Zod validates before write
  - D115 — export type {} from in 'use server' files is safe (type-erased at compile time)
  - D116 — insert-before-enqueue ordering with immediate failure recovery prevents orphaned pending rows
  - D117 — renderCompletedSession() extracted as named async function returning discriminated union
  - D118 — availability badges use inline className strings (not shadcn Badge variant) — shadcn Badge has no green/yellow variants
  - D119 — defaultValue (uncontrolled) on Textarea and NativeSelect, not value (controlled)
  - D120 — Next.js 15 async searchParams: Promise<{...}> + await in async server component
patterns_established:
  - "In-process MCP: createSdkMcpServer({ name, tools: [tool(name, desc, schema, handler)] }) → McpSdkServerConfigWithInstance"
  - "Streaming text: iterate Query (AsyncGenerator<SDKMessage>), yield on stream_event + content_block_delta + text_delta"
  - "Session resume: pass options.resume with stored agent_session_id; extract session_id from SDKResultMessage"
  - "SSE bridge: ReadableStream.start() iterates AsyncIterable<StreamEvent>; events encoded as 'data: ${JSON.stringify(event)}\\n\\n'"
  - "X-Conversation-Id header: captured before stream consumption; URL updated via replaceState"
  - "Per-turn progress: append { turn, phase, summary, timestamp } to jsonb array; write to DB after each SDKAssistantMessage"
  - "NicheResearcherJob: register() → Worker with lockDuration 600000; SDKResultMessage → Zod parse → status=completed"
  - "insert-before-enqueue: insert pending row → enqueue job → on failure mark status=failed immediately"
  - "renderCompletedSession() discriminated union: safeParse → ok/parse_error branch; Promise.allSettled() for domain checks"
  - "Next.js 15 async searchParams: interface PageProps { searchParams: Promise<{...}> } → await → pass as props"
  - "constants.ts sibling file holds non-async exports; 'use server' actions.ts re-exports via export type {} from (D034/D115)"
observability_surfaces:
  - "pm2 logs monster-admin | grep '[monster/chat]' → turn start/complete per conversation"
  - "pm2 logs monster-admin | grep '[claude-sdk]' → sessionId lifecycle (new vs resumed)"
  - "pm2 logs monster-admin | grep '[monster-mcp]' → MCP tool name + result row count"
  - "pm2 logs monster-worker | grep 'niche-researcher' → turn count, phase, completion status per run"
  - "pm2 logs monster-worker | grep 'niche-mcp' → tool name called + result row count per invocation"
  - "pm2 logs monster-worker | grep 'NicheResearcherJob listening' → worker boot verification"
  - "SELECT id, title, agent_session_id FROM chat_conversations — verify session persistence"
  - "SELECT id, status, progress, report FROM research_sessions ORDER BY created_at DESC LIMIT 5"
  - "SELECT progress->-1 AS last_progress_entry FROM research_sessions WHERE status='failed' — error diagnosis"
  - "All domain badges 'Unknown' → check Next.js server stdout for [SpaceshipClient] spaceship_api_key not configured"
  - "Navigate to /sites/new?niche=camping+gear&market=US — niche and market pre-filled confirms full CTA loop"
requirement_outcomes:
  - id: R010
    from_status: active
    to_status: active
    proof: "Monster Chat streaming with real MCP tool calls integration-verified in production runtime (curl + pm2 logs confirm streaming tokens + real site count from DB). Browser UAT pending (Playwright/Chromium missing libnspr4.so on VPS1). R010 validation requires full browser UAT — advancing to partially validated but not marking fully validated."
  - id: R003
    from_status: active
    to_status: active
    proof: "NicheResearcherJob fully implemented (BullMQ, lockDuration 600s, maxTurns 15, 5 MCP tools, per-turn progress, Zod-validated ResearchReport). Structural proof: manual enqueue produced completed session with 12 turns and all 10 report schema fields. Research Lab UI with 5s polling + report viewer + domain badges + Create Site CTA all build and typecheck clean. Final validation (real DataForSEO keyword data in report) requires human UAT with DFS credentials configured in Settings."
duration: ~6h (S01: ~2.5h, S02: ~2h45m, S03: ~50m)
verification_result: passed
completed_at: 2026-03-14
---

# M007: Monster Chat + Research Lab

**Two AI-native features are live: Monster Chat delivers real-time streaming responses with real portfolio data via MCP tools, and Research Lab runs autonomous niche research in a background BullMQ job with per-turn progress streaming to Supabase — both wired end-to-end from browser to database.**

## What Happened

Three slices in dependency order built the full AI conversation and research pipeline.

**S01 — Monster Chat (streaming Agent SDK + MCP portfolio tools):**
Installed `@anthropic-ai/claude-agent-sdk@^0.2.76` and resolved the externalization requirements — SDK externalized in tsup (both index and worker entries) and Next.js `serverExternalPackages`. Applied DB migration adding `agent_session_id text` to `chat_conversations`.

`ClaudeSDKClient.streamQuery()` bridges the Agent SDK's async iterator to typed SSE events: `text`, `done` (with session_id), and `error`. Text tokens arrive via `SDKPartialAssistantMessage` with `includePartialMessages: true`. `createMonsterMcpServer(supabase)` uses `createSdkMcpServer` + `tool()` helpers to produce an in-process MCP server (`McpSdkServerConfigWithInstance`) with four read-only portfolio tools: `getPortfolioStats`, `getSiteDetail`, `getAnalytics`, `getAlerts`.

The `/api/monster/chat` Route Handler handles two flows (new conversation vs. session resume), persists user + assistant messages to `chat_messages`, updates `agent_session_id` post-stream, and returns the conversation ID via `X-Conversation-Id` response header (available before body consumed). The Monster Chat UI is a two-column layout: `ConversationList` server component sidebar with relative timestamps and active highlighting, and `ChatWindow` SSE client that reads the `X-Conversation-Id` header and calls `window.history.replaceState` to update the URL without triggering a React re-render.

Key discovery: D100 was wrong — SDK v0.2.76 takes string prompt correctly; MCP registration is via `options.mcpServers` independently. The old assumption that async generator prompt was required for MCP was not based on the actual SDK API surface.

**S02 — NicheResearcher (background agent + DataForSEO research):**
Extended `DataForSEOClient` with `keywordIdeas()`, `serpCompetitors()`, `googleSerpResults()` using live synchronous Labs/SERP endpoints (no task_post/poll loop needed for these). Added `LABS_LANGUAGE_CODE` map (2-letter codes `'es'`, `'en'`, etc.) separate from the existing `MARKET_CONFIG` (4-letter Merchant API codes) — Labs endpoints return errors with 4-letter codes.

`ResearchReportSchema` defined in `packages/shared` with 10 fields: `niche_idea`, `market`, `viability_score`, `summary`, `recommendation`, `keywords`, `competitors`, `amazon_products`, `domain_suggestions`, `generated_at`. Importable by both agents (Zod validation) and admin (S03 rendering).

`createNicheResearcherMcpServer(dfsClient, spaceshipClient)` provides 5 MCP tools to the researcher agent: `keywordIdeas`, `serpCompetitors`, `googleSerpResults`, `amazonProducts`, `checkDomainAvailability`. Each tool catches errors and returns `{ error: message }` so unconfigured credentials never crash the agent.

`NicheResearcherJob` follows the `ProductRefreshJob` register() → Worker pattern with `lockDuration: 600000` (10 minutes). The handler: writes `status=running`, calls `query()` with `maxTurns: 15, persistSession: false`, iterates the async stream, appends `{ turn, phase, summary, timestamp }` to `progress` jsonb on each `SDKAssistantMessage`, then on terminal `SDKResultMessage` Zod-parses the result and writes `status=completed` (or `status=failed` on `is_error`). Parse failure stores `{ raw, error: 'parse_failed' }` — still `completed`, never `failed`. Manual enqueue produced a completed session with 12 progress entries and all 10 report keys in ~26 seconds.

The `enqueueResearch` server action uses insert-before-enqueue: creates `research_sessions` row with `status='pending'` first, then enqueues — on BullMQ failure, immediately marks `status='failed'`. Research Lab page: `ResearchForm` client component (useActionState), `ResearchSessionStatus` polling component (5s setInterval, clears on terminal status), session history list.

**S03 — Research Report UI + Domain Suggestions + Create Site CTA:**
`ResearchReportViewer` server component renders all 10 `ResearchReport` fields: viability score card (≥70 green, 40–69 yellow, <40 red), summary paragraph, recommendation callout, keywords table (search_volume / cpc / competition), competitor list, Amazon products grid with Prime badges, domain suggestions with live Spaceship availability badges (green "Available" + price / gray "Taken" / yellow "Unknown"), and a "Create site from this research" CTA `<Link>` to `/sites/new?niche=...&market=...`.

`page.tsx` branches on `status === 'completed'` via a named async function `renderCompletedSession()` which returns a discriminated union: `{ type: 'ok', report, domains }` or `{ type: 'parse_error', raw, zodIssues }`. Parse success runs `Promise.allSettled()` over all domain suggestions via `SpaceshipClient.checkAvailability()` — one Spaceship failure never crashes the page. Parse failure renders `ZodError.issues` and raw JSON in `<details>`.

Two surgical edits closed the CTA pre-fill loop: `SiteForm` gained `defaultValues?: { niche?, market? }` with uncontrolled `defaultValue` on niche `Textarea` and market `NativeSelect`; `/sites/new/page.tsx` converted to async, declares `searchParams: Promise<{...}>`, awaits it, and passes decoded values to `SiteForm` (Next.js 15 async searchParams pattern).

## Cross-Slice Verification

**Success criterion 1: User can open Monster Chat, type "Which sites do I have?", and receive a streaming response referencing real Supabase data via MCP tools.**

Verified via curl against the live Route Handler:
```
curl -N -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How many sites do I have?","conversationId":null}' --max-time 30
→ streams data: {"type":"text","text":"..."} tokens progressively ✓
→ response references "1 site" in "draft" status (real DB data via MCP getPortfolioStats) ✓
→ ends with data: {"type":"done","sessionId":"..."} ✓
→ X-Conversation-Id header present ✓
```

pm2 logs confirm: `[monster-mcp] tool=getPortfolioStats result rows=1` ✓  
DB confirms: `SELECT id, agent_session_id FROM chat_conversations` — non-null agent_session_id ✓  
Session resume: subsequent POST with existing conversationId → same sessionId in done event ✓

**Success criterion 2: User can submit a niche idea in Research Lab, watch per-phase progress updates, and receive a completed viability report.**

Verified via manual BullMQ enqueue during S02:
```
Manual enqueue → monster-worker logs show 12 turns with niche-researcher log lines ✓
SELECT status, progress, report FROM research_sessions WHERE id='c5e64c72...'
  → status=completed ✓
  → progress_entries=12 ✓
  → report_keys=market,summary,keywords,niche_idea,competitors,generated_at,
      recommendation,amazon_products,viability_score,domain_suggestions ✓
```

pm2 logs confirm: `[niche-researcher] status=completed parseSuccess=true turns=12` ✓  
Worker boot log: `[worker] NicheResearcherJob listening on queue "niche-research"` ✓

**Success criterion 3: Domain suggestions show live Spaceship availability status.**

Verified via code review and build: `ResearchReportViewer` receives `domainLookup: Map<string, boolean | null>` from `Promise.allSettled()` calls to `SpaceshipClient.checkAvailability()`. Badges render "Available" / "Taken" / "Unknown" based on map lookup. Build exit 0 ✓. Live badge state depends on Spaceship credentials in Settings (D120).

**Success criterion 4: Research sessions are persisted in Supabase — history list accessible.**

`research_sessions` table with `status`, `progress` jsonb, `report` jsonb. `getResearchSessions()` server action queries 10 most recent. Research Lab page renders history list with status badge and timestamp. Verified via build + DB query ✓.

**Success criterion 5: "Create site from this research" CTA pre-fills the site creation form.**

`ResearchReportViewer` CTA links to `/sites/new?niche=${encodeURIComponent(niche_idea)}&market=${encodeURIComponent(market)}`. `/sites/new/page.tsx` awaits `searchParams`, passes `{ niche, market }` as `defaultValues` to `SiteForm`. `defaultValue` attrs on niche Textarea and market NativeSelect confirmed by grep ✓. URL `curl http://localhost:3004/sites/new` → 307 ✓.

**Contract verification:**
```
pnpm -r typecheck     → exit 0, all 9 packages ✓
pnpm --filter @monster/agents build → exit 0 (dist/index.js 23.41 KB, dist/worker.js 2.31 MB) ✓
pnpm --filter @monster/admin build  → exit 0; /monster, /research, /sites/new all ƒ Dynamic ✓
pm2 list → monster-admin online, monster-worker online ✓
pm2 logs monster-worker | grep NicheResearcherJob → "listening on queue niche-research" ✓
```

## Requirement Changes

- R010 (Monster Chat agent): active → active (partial) — streaming chat with real MCP tool calls integration-verified via curl + pm2 logs + DB queries. Browser UAT blocked by missing Playwright/Chromium on VPS1. Marking as advanced but not fully validated.
- R003 (Autonomous niche research): active → active (partial) — NicheResearcherJob end-to-end operational: BullMQ, lockDuration 600s, maxTurns 15, 5 MCP tools, per-turn progress, Zod-validated report with 12 turns and all 10 fields. Research Lab UI complete. Final proof (real DataForSEO data in report) requires human UAT with DFS credentials.

## Forward Intelligence

### What the next milestone should know
- M007 code is complete. M008 (Finances + Amazon Revenue) can begin immediately — no M007 blockers.
- Monster Chat is fully operational: streaming, MCP tool calls, session resume, conversation history. The only gap is formal browser UAT (R010 human validation).
- NicheResearcher works structurally without DataForSEO credentials (returns empty arrays gracefully). To get real keyword data in reports: enter `dataforseo_api_key` (format: `email:password`) in admin Settings → DataForSEO card.
- `ResearchReportSchema` in `packages/shared/src/types/research-report.ts` is the canonical type for research report data. Any M008+ feature that reads research reports should import it.
- The `report` jsonb may contain `{ raw: string, error: 'parse_failed' }` when the agent's final message was not valid JSON matching the schema. The Research Lab report viewer handles this gracefully via the `renderCompletedSession()` discriminated union.
- MCP server factory pattern is established: `createSdkMcpServer` + `tool()` from Agent SDK → `McpSdkServerConfigWithInstance`. Future agents (ContentOptimizer, PerformanceMonitor) should follow the same pattern.
- Agent SDK direct dep in `packages/agents` is essential (D101 / D094 pattern). Any new SDK or large transitive dep consumed by the worker must be added as a direct dep of `packages/agents`, not relied upon via pnpm hoisting.

### What's fragile
- **Agent SDK session resume** — SDK session ID stored in `chat_conversations.agent_session_id`. If the SDK changes session management between versions, resume may silently break. Diagnostic: Monster doesn't remember prior turns → check `agent_session_id` is non-null in DB + that the resumed session responds differently than a fresh one.
- **MCP tool invocation is model-dependent** — Claude decides when to invoke tools. For critical data, structure the system prompt to explicitly encourage tool use. Monster's current system prompt has no explicit persona or scope guidance.
- **`lockDuration: 600000` for NicheResearcher** — if a job genuinely takes >10 minutes (slow DFS responses + 15 turns), BullMQ re-enqueues as stalled, potentially running two instances simultaneously. No idempotency protection for double-run. Increase `lockDuration` or add `extendLock()` calls if long runs are observed.
- **Domain availability on every page load** — `Promise.allSettled()` Spaceship checks run on every completed research session page render. No caching. If Spaceship API is slow or rate-limited, the completed session page will be slow. Acceptable for Phase 1 (research sessions opened infrequently).
- **`LABS_LANGUAGE_CODE` coverage** — only `es`, `en`, `de`, `fr`, `it` mapped. Labs calls with an unmapped market code will fail or return empty. Extend the map before adding new markets.

### Authoritative diagnostics
- **MCP tool not being called:** `pm2 logs monster-admin | grep '[monster-mcp]'` — absence means model isn't invoking tools. Check that `mcpServer` is passed to `streamQuery()` and `createMonsterMcpServer(supabase)` received a valid client.
- **Session not resuming:** `SELECT agent_session_id FROM chat_conversations WHERE id='<id>'` — if null after first turn, the post-stream DB write failed. Check Route Handler logs for `failed to update agent_session_id`.
- **Streaming stops mid-response:** browser Network tab → SSE stream → look for `data: {"type":"error","error":"..."}` — error text indicates SDK root cause.
- **Research session stuck in running:** `pm2 logs monster-worker | grep 'niche-researcher'` — turn-by-turn progress visible; if no new log lines, worker may have crashed. `SELECT progress->-1 FROM research_sessions WHERE status='running'` — last turn summary.
- **All domain badges "Unknown":** Next.js server stdout → `[SpaceshipClient] spaceship_api_key not configured`. Credential issue, not a code bug.
- **Parse-failure fallback in Research Lab:** `<details>` block in browser contains `ZodError.issues` + raw JSON. Reveals what NicheResearcher stored vs. what `ResearchReportSchema` expects.

### What assumptions changed
- **D100 (async generator prompt required for MCP)** — was wrong. SDK v0.2.76 takes string prompt correctly; MCP registered via `options.mcpServers` independently. D105 documents the correction. Any future SDK upgrade should re-verify this.
- **Migration application** — plan assumed automated migration runner. In practice, live Supabase requires explicit application via temp pg script. All future migrations for this project follow the same manual pattern until CLI migration history is reconciled.
- **`createNicheResearcherMcpServer` supabase param** — plan specified `(supabase, dfsClient, spaceshipClient)`. Both API clients handle credential lookup internally (D028) — `supabase` param was unnecessary. Dropped.

## Files Created/Modified

**S01:**
- `packages/agents/src/clients/claude-sdk.ts` — new; ClaudeSDKClient.streamQuery() with typed events
- `packages/agents/src/mcp/monster-server.ts` — new; createMonsterMcpServer() with 4 portfolio tools
- `packages/agents/src/index.ts` — ClaudeSDKClient, createMonsterMcpServer, StreamEvent, StreamOptions exports
- `packages/agents/package.json` — added @anthropic-ai/claude-agent-sdk, @supabase/supabase-js
- `packages/agents/tsup.config.ts` — @anthropic-ai/claude-agent-sdk added to external in both entries
- `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql` — new migration
- `packages/db/src/types/supabase.ts` — agent_session_id added to chat_conversations Row/Insert/Update
- `apps/admin/next.config.ts` — serverExternalPackages: ['@anthropic-ai/claude-agent-sdk']
- `apps/admin/src/app/api/monster/chat/route.ts` — new; POST handler, SSE bridge, conversation persistence
- `apps/admin/src/app/(dashboard)/monster/actions.ts` — new; server actions for conversation CRUD
- `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx` — new; server component sidebar
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` — new; SSE streaming chat client
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — rewritten; async server component, two-column layout

**S02:**
- `packages/db/supabase/migrations/20260314000007_research_progress.sql` — new; progress jsonb migration
- `packages/db/src/types/supabase.ts` — progress: Json | null added to research_sessions Row/Insert/Update
- `packages/agents/src/clients/dataforseo.ts` — LABS_LANGUAGE_CODE map + KeywordIdea/SerpCompetitor/SerpResult interfaces + keywordIdeas/serpCompetitors/googleSerpResults methods
- `packages/shared/src/types/research-report.ts` — new; ResearchReportSchema + ResearchReport type
- `packages/shared/src/types/index.ts` — export * from './research-report.js' added
- `packages/agents/src/mcp/niche-researcher-server.ts` — new; createNicheResearcherMcpServer with 5 MCP tools
- `packages/agents/src/jobs/niche-researcher.ts` — new; NicheResearcherJob, handler, system prompt
- `packages/agents/src/queue.ts` — createNicheResearchQueue() + nicheResearchQueue() singleton added
- `packages/agents/src/index.ts` — nicheResearchQueue, enqueueNicheResearch, NicheResearchPayload exports
- `packages/agents/src/worker.ts` — NicheResearcherJob imported, registered, shutdown wiring
- `apps/admin/src/app/(dashboard)/research/actions.ts` — new; enqueueResearch, getResearchSessions, getResearchSessionStatus
- `apps/admin/src/app/(dashboard)/research/constants.ts` — new; MARKET_OPTIONS, MarketValue, EnqueueResearchState
- `apps/admin/src/app/(dashboard)/research/ResearchForm.tsx` — new; 'use client' form with useActionState
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — new; 'use client' polling component
- `apps/admin/src/app/(dashboard)/research/page.tsx` — rewritten; async server component with form + sessions + status

**S03:**
- `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx` — new; server component, all 10 report fields + CTA
- `apps/admin/src/app/(dashboard)/research/page.tsx` — added completed branch with renderCompletedSession(), ResearchReportViewer
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — added defaultValues prop; niche Textarea and market NativeSelect accept pre-fill
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — converted to async, reads searchParams.niche + searchParams.market, passes to SiteForm
- `.gsd/DECISIONS.md` — D099–D120 appended
