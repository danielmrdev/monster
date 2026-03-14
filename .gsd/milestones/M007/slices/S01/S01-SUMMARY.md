---
id: S01
parent: M007
milestone: M007
provides:
  - "@anthropic-ai/claude-agent-sdk installed and externalized in tsup + Next.js serverExternalPackages"
  - "DB migration adding agent_session_id to chat_conversations (applied to live Supabase)"
  - "ClaudeSDKClient with streamQuery() returning typed streaming events (text/done/error)"
  - "createMonsterMcpServer() with 4 read-only portfolio tools (getPortfolioStats, getSiteDetail, getAnalytics, getAlerts)"
  - "POST /api/monster/chat Route Handler — SSE streaming bridge with conversation + message persistence"
  - "agent_session_id persisted in chat_conversations for multi-turn session resume"
  - "X-Conversation-Id response header for new conversation ID delivery to client"
  - "Streaming Monster Chat UI: ConversationList sidebar + ChatWindow SSE client + page.tsx server component"
  - "Server actions: getConversations(), getMessages(), deleteConversation()"
requires: []
affects:
  - S02
key_files:
  - packages/agents/src/clients/claude-sdk.ts
  - packages/agents/src/mcp/monster-server.ts
  - packages/agents/src/index.ts
  - packages/agents/package.json
  - packages/agents/tsup.config.ts
  - packages/db/supabase/migrations/20260314000006_chat_agent_session.sql
  - packages/db/src/types/supabase.ts
  - apps/admin/next.config.ts
  - apps/admin/src/app/api/monster/chat/route.ts
  - apps/admin/src/app/(dashboard)/monster/page.tsx
  - apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx
  - apps/admin/src/app/(dashboard)/monster/ConversationList.tsx
  - apps/admin/src/app/(dashboard)/monster/actions.ts
key_decisions:
  - D101 — Agent SDK externalized in tsup (both entries) and Next.js serverExternalPackages
  - D104 — X-Conversation-Id response header conveys new conversation ID to streaming client
  - D105 — D100 superseded; string prompt is correct for Agent SDK v0.2.76; MCP via options.mcpServers
  - D106 — createMonsterMcpServer returns McpSdkServerConfigWithInstance (not bare McpServer)
  - D107 — Streaming text via SDKPartialAssistantMessage with includePartialMessages:true
  - D108 — Controller close-safety: closed boolean + try/catch in send() for client disconnect
  - D109 — Pre-stream HTTP 404 for unknown conversationId (not SSE error event)
  - D110 — URL update after first turn uses window.history.replaceState() (not router.push())
patterns_established:
  - "In-process MCP: createSdkMcpServer({ name, tools: [tool(name, desc, schema, handler)] }) → McpSdkServerConfigWithInstance"
  - "Streaming text: iterate Query (AsyncGenerator<SDKMessage>), yield on stream_event + content_block_delta + text_delta"
  - "Session resume: pass options.resume with stored agent_session_id; extract session_id from SDKResultMessage"
  - "SSE bridge: ReadableStream.start() iterates AsyncIterable<StreamEvent>; events encoded as 'data: ${JSON.stringify(event)}\\n\\n'"
  - "X-Conversation-Id header: captured before stream consumption; URL updated via replaceState"
  - "Server actions for chat: 'use server' + createServiceClient() + typed return, no throws"
observability_surfaces:
  - "pm2 logs monster-admin | grep '[monster/chat]' → turn start/complete per conversation"
  - "pm2 logs monster-admin | grep '[claude-sdk]' → sessionId lifecycle (new vs resumed)"
  - "pm2 logs monster-admin | grep '[monster-mcp]' → MCP tool name + result row count"
  - "SELECT id, title, agent_session_id FROM chat_conversations — verify session persistence"
  - "SELECT role, content FROM chat_messages WHERE conversation_id='<id>' — verify message persistence"
  - "curl -N -X POST http://localhost:3004/api/monster/chat ... — live SSE stream verification"
drill_down_paths:
  - .gsd/milestones/M007/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M007/slices/S01/tasks/T03-SUMMARY.md
duration: ~2.5h (3 tasks × ~45min each)
verification_result: passed
completed_at: 2026-03-14
---

# S01: Monster Chat — Streaming Agent + MCP Portfolio Tools

**Wired the full Agent SDK streaming pipeline from browser to Supabase and back: Monster Chat now delivers real-time streaming responses that reference actual portfolio data fetched via MCP tool calls, with conversation history persisted across page reloads.**

## What Happened

Three tasks built the stack in dependency order:

**T01 — SDK install + ClaudeSDKClient + Monster MCP server:**
Installed `@anthropic-ai/claude-agent-sdk@^0.2.76` in `packages/agents`. Added to tsup `external` in both index and worker entries; added `serverExternalPackages` to `apps/admin/next.config.ts`. Applied DB migration adding `agent_session_id text` to `chat_conversations`.

`ClaudeSDKClient.streamQuery()` calls `query({ prompt: message, options: { includePartialMessages: true, mcpServers, resume? } })`. Text tokens arrive as `SDKPartialAssistantMessage` events (type `stream_event`, inner type `content_block_delta`, delta type `text_delta`). Session ID extracted from the terminal `SDKResultMessage`. The client yields three event shapes: `{ type: 'text', text }`, `{ type: 'done', sessionId }`, `{ type: 'error', error }`.

`createMonsterMcpServer(supabase)` uses `createSdkMcpServer` + `tool()` helpers from the SDK to build an in-process MCP server returning `McpSdkServerConfigWithInstance`. Four tools: `getPortfolioStats` (site counts by status), `getSiteDetail` (site by id/name), `getAnalytics` (30-day pageviews/clicks), `getAlerts` (open alerts). Each logs its call and result row count.

Key discovery: D100 was wrong. SDK v0.2.76 takes string prompt correctly; MCP tool registration is via `options.mcpServers` independently of prompt form. `SDKUserMessage` is not constructible from the public API surface. D100 superseded by D105.

**T02 — /api/monster/chat Route Handler:**
POST handler handles two flows: new conversation (creates `chat_conversations` row, title = first 50 chars) or existing conversation (fetches `agent_session_id` for session resume; HTTP 404 pre-stream if not found per D109). User message persisted before stream opens.

`ReadableStream` bridges Agent SDK's async iterator to browser SSE: each `StreamEvent` encoded as `data: ${JSON.stringify(event)}\n\n`. Text tokens accumulated into `fullText`; `done` event captures `sessionId`. Post-stream: assistant message inserted to `chat_messages`, `agent_session_id` updated in `chat_conversations`. Response includes `X-Conversation-Id` header.

Controller close-safety (D108): `send()` helper checks `closed` boolean and wraps `controller.enqueue()` in try/catch — client disconnects are silently absorbed without spurious error logging. Migration not yet applied to live Supabase at T01 time; applied manually via `pg` script in T02.

**T03 — Monster Chat UI:**
Four files replaced the "Coming soon" placeholder:

- `actions.ts` (`'use server'`): `getConversations()` (20 most recent), `getMessages(id)` (all ASC), `deleteConversation(id)` (messages first, then conversation).
- `ConversationList.tsx` (server component): ~260px sidebar, relative timestamps, `?c=<id>` links, active item highlighted.
- `ChatWindow.tsx` (`'use client'`): SSE via `fetch()` + `response.body.pipeThrough(new TextDecoderStream()).getReader()` (EventSource is GET-only — D099). Reads `X-Conversation-Id` header from response; calls `window.history.replaceState` to push `?c=<id>` without router re-render (D110). Accumulates text events into streaming bubble; `done` event clears streaming flag; `error` renders red bubble. Auto-scroll, auto-focus, Shift+Enter newline.
- `page.tsx` (async server component): reads `searchParams.c`, parallel-fetches conversations + messages, renders two-column edge-to-edge layout.

## Verification

```
pnpm --filter @monster/agents build   → exit 0 ✓
pnpm --filter @monster/admin build    → exit 0 ✓
pnpm -r typecheck                     → exit 0, all 9 packages ✓

grep 'claude-agent-sdk' packages/agents/dist/index.js
  → import { query } from "@anthropic-ai/claude-agent-sdk";
  → import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
  (external, not bundled) ✓

curl -N -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How many sites do I have?","conversationId":null}' --max-time 30
  → streams data: {"type":"text","text":"..."} tokens ✓
  → response references "1 site" in "draft" status (real DB data via MCP getPortfolioStats) ✓
  → ends with data: {"type":"done","sessionId":"..."} ✓
  → X-Conversation-Id header present ✓

Session resume: POST with existing conversationId → same sessionId in done event ✓
400 on empty message: {"error":"message is required and must be non-empty"} ✓
404 on unknown conversationId: {"error":"Conversation not found"} ✓

SELECT id, title, agent_session_id FROM chat_conversations
  → new row with non-null agent_session_id ✓
SELECT role, content FROM chat_messages WHERE conversation_id='<id>'
  → user + assistant rows ✓
```

## Requirements Advanced

- R010 (Monster Chat agent) — advanced from unmapped to integration-verified: streaming chat with real MCP tool calls confirmed in production runtime.

## Requirements Validated

- None validated in this slice (R010 requires browser UAT to validate).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- **D100 superseded (D105):** Slice plan required async generator prompt form for MCP. SDK v0.2.76 uses string prompt correctly; MCP registered via `options.mcpServers` independently. D100 text preserved in DECISIONS.md for audit; D105 documents the correction.
- **MCP server return type (D106):** Plan described returning bare `McpServer`. SDK requires `McpSdkServerConfigWithInstance`. Fixed in implementation; `ClaudeSDKClient.StreamOptions.mcpServer` typed accordingly.
- **Migration applied manually (T02):** T01 wrote the migration file but didn't apply it live. Applied via a temp `pg` script against `SUPABASE_DB_URL`. No structural impact — column exists and working.
- **Pre-stream 404 for bad conversationId (D109):** Plan implied SSE error event. HTTP 404 before stream start is more correct — client can inspect status code without consuming the body.
- **Controller close-safety (D108):** Not in original plan but added during T02 testing when client-disconnect produced spurious errors. Essential for production correctness.
- **URL update via replaceState (D110):** Plan didn't specify mechanism. `router.push()` would re-render the server component and lose streaming state; `replaceState` preserves React state while making URL bookmarkable.

## Known Limitations

- MCP tool `getAnalytics` and `getAlerts` return real data but are only exercised when Monster explicitly decides to call them — depends on Claude's tool selection. `getPortfolioStats` is reliably called for portfolio questions.
- Conversation titles are set to the first 50 chars of the first message and never updated. Phase 2 could auto-generate a title from the conversation content.
- Monster's system prompt does not yet describe the full portfolio context or agent capabilities — it relies on tool calls for data, but has no predefined persona or scope guidance beyond what the SDK default provides.

## Follow-ups

- S02 (NicheResearcher) is unblocked — Agent SDK is installed and the BullMQ + `query()` pattern is proven.
- Consider adding an explicit Monster system prompt in `ClaudeSDKClient` or the Route Handler to give Monster a persona + scope context.
- `deleteConversation` server action exists but no UI button exposes it yet — add to ConversationList hover state in a future polish pass.

## Files Created/Modified

- `packages/agents/src/clients/claude-sdk.ts` — new; ClaudeSDKClient.streamQuery() with typed events
- `packages/agents/src/mcp/monster-server.ts` — new; createMonsterMcpServer() with 4 portfolio tools
- `packages/agents/src/index.ts` — exports ClaudeSDKClient, createMonsterMcpServer, StreamEvent, StreamOptions
- `packages/agents/package.json` — added @anthropic-ai/claude-agent-sdk, @supabase/supabase-js
- `packages/agents/tsup.config.ts` — added @anthropic-ai/claude-agent-sdk to external in both entries
- `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql` — new migration
- `packages/db/src/types/supabase.ts` — agent_session_id added to chat_conversations Row/Insert/Update
- `apps/admin/next.config.ts` — serverExternalPackages: ['@anthropic-ai/claude-agent-sdk']
- `apps/admin/src/app/api/monster/chat/route.ts` — new; POST handler, SSE bridge, conversation persistence
- `apps/admin/src/app/(dashboard)/monster/actions.ts` — new; server actions for conversation CRUD
- `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx` — new; server component sidebar
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` — new; SSE streaming chat client
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — rewritten; async server component with two-column layout

## Forward Intelligence

### What the next slice should know

- Agent SDK `query()` with `maxTurns` works for autonomous agents (S02's NicheResearcher pattern). Use `maxTurns: 15` and `lockDuration: 600000` on the BullMQ worker — same SDK, different call site (BullMQ job, not Route Handler).
- `@supabase/supabase-js` must be a direct dep of `packages/agents` (not relying on pnpm hoisting from sibling packages). D094 pattern applies to any new SDK or large transitive dep.
- MCP tool logging pattern is established: `console.log('[monster-mcp] tool=${name} called')` + `console.log('[monster-mcp] tool=${name} result rows=${n}')`. NicheResearcher tools should follow the same convention.
- The `McpSdkServerConfigWithInstance` type (not `McpServer`) is what `mcpServers` expects. Keep `createSdkMcpServer` + `tool()` from the SDK for all MCP server factories.

### What's fragile

- **Agent SDK session resume** — the SDK session ID is stored in `chat_conversations.agent_session_id`. If the SDK changes its session management semantics between versions, resume may silently break (model won't have prior context). Diagnostic: if Monster doesn't remember prior turns, check that `agent_session_id` is non-null in DB and that the resumed session responds differently than a fresh one.
- **MCP tool invocation is model-dependent** — Claude may not always call a tool when expected. The model decides when to invoke MCP tools. For critical data, structure the system prompt to explicitly encourage tool use, or include a fallback.
- **SSE streaming and proxy timeouts** — SSE connections through Nginx/Caddy/proxy may close after 60–90s idle. Monster Chat responses are short enough (seconds) that this isn't a problem, but any NicheResearcher attempt to use SSE would fail. S02 correctly uses DB polling for long-running jobs.

### Authoritative diagnostics

- **MCP tool not being called:** `pm2 logs monster-admin | grep '[monster-mcp]'` — absence of log lines means the model isn't invoking tools. Check that `mcpServer` is passed to `streamQuery()` and that `createMonsterMcpServer(supabase)` received a valid Supabase client.
- **Session not resuming:** `SELECT agent_session_id FROM chat_conversations WHERE id='<id>'` — if null after first turn, the `done` event sessionId capture or the `chat_conversations` update failed. Check Route Handler post-stream DB write.
- **Streaming stops mid-response:** browser Network tab, check the SSE stream for an `error` event. Route Handler catches and forwards SDK errors as `data: {"type":"error","error":"..."}` — the error text will indicate the root cause.

### What assumptions changed

- **D100 (async generator prompt required for MCP)** — was based on docs/design intent, not verified against SDK v0.2.76 types. The actual SDK API takes string prompt and registers MCP servers independently via `options.mcpServers`. Any future SDK upgrade should verify this hasn't changed.
- **Migration application** — plan assumed the migration runner would apply new files automatically. In practice, the live Supabase instance requires explicit application. For S02, apply `research_sessions.progress` migration explicitly before testing.
