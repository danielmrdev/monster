# S01: Monster Chat — Streaming Agent + MCP Portfolio Tools

**Goal:** Wire Agent SDK streaming end-to-end: browser → Route Handler (SSE) → Agent SDK → MCP tools → Supabase → streaming tokens back to browser. Conversation history persisted in DB. Monster responds with real portfolio data from MCP tool calls.

**Demo:** User opens `/monster`, types "Which sites do I have?", and watches tokens stream in before the response completes. The response names real sites from Supabase (data that could only come from a DB query, not training data). Conversation is saved and survives a page reload.

## Must-Haves

- `@anthropic-ai/claude-agent-sdk` installed and externalized in tsup + Next.js webpack
- DB migration: `chat_conversations.agent_session_id text` column added
- `ClaudeSDKClient` in `packages/agents/src/clients/claude-sdk.ts` — `streamQuery()` returning async iterable of SSE-compatible events; `query()` for session resume
- Monster MCP server factory in `packages/agents/src/mcp/monster-server.ts` — `createMonsterMcpServer(supabase)` with 4 read-only tools: `getPortfolioStats`, `getSiteDetail`, `getAnalytics`, `getAlerts`
- `/api/monster/chat` Route Handler — SSE stream from Agent SDK to browser; prompt is async generator (D100); conversation + message persistence in Supabase
- `apps/admin/next.config.ts` has `serverExternalPackages: ['@anthropic-ai/claude-agent-sdk']`
- Monster Chat page (`/monster`) replaces "Coming soon" with real streaming chat UI
- Tokens visibly stream in browser before response completes
- MCP tool call verified: response contains actual site names/count from DB

## Proof Level

- This slice proves: integration + real runtime
- Real runtime required: yes — streaming response must be observed in browser or via curl
- Human/UAT required: yes — streaming UX feel verified visually

## Verification

- `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"How many sites do I have?","conversationId":null}'` → streams `data:` events before connection closes; at least one event contains a text token
- Response text references a number or site name that matches real Supabase data (not a generic answer)
- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/admin build` exits 0
- `pnpm -r typecheck` exits 0
- Browser: type "Which sites do I have?" in Monster Chat → tokens appear progressively → full response names real sites
- **Failure path (diagnostic):** `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"test","conversationId":"bad-uuid"}'` → SSE stream returns `data: {"type":"error","error":"..."}` event (not a 500 or silent hang); error text is inspectable in the stream
- **Observability check:** after a successful turn, `SELECT agent_session_id FROM chat_conversations WHERE id = '<conversationId>'` in Supabase is non-null (session ID persisted)

## Observability / Diagnostics

- Runtime signals: Route Handler logs `[monster/chat] conversation=${id} turn start/end`, `[monster-mcp] tool=${name} called`, `[monster-mcp] tool=${name} result rows=${n}`
- Inspection surfaces: `supabase.from('chat_conversations').select()` and `supabase.from('chat_messages').select()` to verify persistence; curl streaming to verify SSE format
- Failure visibility: SSE error event `data: {"type":"error","error":"..."}` on any exception; Route Handler catches and streams error before closing; `agent_session_id` visible in `chat_conversations` after first turn
- Redaction constraints: no API keys, credentials, or user PII in logs

## Integration Closure

- Upstream surfaces consumed: `@monster/db` (service client), `chat_conversations` + `chat_messages` tables (existing), `sites` table (MCP tools read-only)
- New wiring introduced: `packages/agents` → Agent SDK (new dep), Next.js admin → `serverExternalPackages`, `/api/monster/chat` Route Handler, Monster Chat page replaces placeholder
- What remains before milestone is truly usable end-to-end: S02 (NicheResearcher), S03 (Report UI)

## Tasks

- [x] **T01: Install Agent SDK, add DB migration, build ClaudeSDKClient + Monster MCP server** `est:2h`
  - Why: Establishes the three backend building blocks that T02's Route Handler composes. Agent SDK install + externalization must happen first or T02 can't import it.
  - Files: `packages/agents/package.json`, `packages/agents/tsup.config.ts`, `apps/admin/next.config.ts`, `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql`, `packages/db/src/types/supabase.ts`, `packages/agents/src/clients/claude-sdk.ts`, `packages/agents/src/mcp/monster-server.ts`, `packages/agents/src/index.ts`
  - Do: (1) `pnpm --filter @monster/agents add @anthropic-ai/claude-agent-sdk`; add to tsup `external` in both entries; add `serverExternalPackages` to `apps/admin/next.config.ts`. (2) Write migration adding `agent_session_id text` to `chat_conversations`; update supabase.ts types; rebuild `@monster/db`. (3) Build `ClaudeSDKClient` with `streamQuery(message, opts)` returning an async iterable — each yielded item is `{ type: 'text', text: string } | { type: 'done', sessionId: string } | { type: 'error', error: string }`; prompt must be async generator per D100. (4) Build `createMonsterMcpServer(supabase)` — `McpServer` instance with 4 tools: `getPortfolioStats` (site counts by status, total), `getSiteDetail` (name/domain/status/niche by id or name), `getAnalytics` (last 30 days pageviews/clicks for a site), `getAlerts` (open alerts). Each tool logs its call + result row count. (5) Export `ClaudeSDKClient` and `createMonsterMcpServer` from `packages/agents/src/index.ts`.
  - Verify: `pnpm --filter @monster/agents build` exits 0; `pnpm --filter @monster/db build` exits 0; `pnpm -r typecheck` exits 0; `cat packages/agents/dist/index.js | grep -q 'claude-agent-sdk'` (not bundled, referenced as external)
  - Done when: build + typecheck both pass; `ClaudeSDKClient` and `createMonsterMcpServer` exported from agents index; migration file exists

- [x] **T02: `/api/monster/chat` Route Handler — SSE streaming bridge + conversation persistence** `est:2h`
  - Why: This is the hardest risk item (D099, D100). The Route Handler must bridge Agent SDK's async iterator to an SSE `ReadableStream`, persist conversations and messages, and handle session resume correctly.
  - Files: `apps/admin/src/app/api/monster/chat/route.ts`, `apps/admin/src/lib/supabase/service.ts` (may need minor additions)
  - Do: (1) Create `apps/admin/src/app/api/monster/` directory structure and `route.ts`. (2) POST handler: parse `{ message, conversationId? }` from body. (3) If no `conversationId`, create new row in `chat_conversations`; if provided, fetch `agent_session_id` from that row. (4) Persist user message to `chat_messages`. (5) Create `ReadableStream` whose `start(controller)` runs the Agent SDK stream: instantiate `ClaudeSDKClient`, call `streamQuery(message, { conversationId, agentSessionId, mcpServer: createMonsterMcpServer(supabase) })`, iterate events, encode each as `data: ${JSON.stringify(event)}\n\n`, enqueue to controller. (6) On `done` event: update `chat_conversations.agent_session_id` with returned sessionId; persist assistant message to `chat_messages`. (7) On error: enqueue error event, close controller. (8) Return `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } })`. (9) Handle CORS if needed (same-origin admin only — no CORS headers required). Prompt must use async generator form per D100.
  - Verify: `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"list my sites","conversationId":null}'` streams multiple `data:` lines; final event has `type:done`; `chat_conversations` and `chat_messages` rows exist in Supabase after the call
  - Done when: curl streams tokens; DB has conversation + messages rows; `agent_session_id` populated in `chat_conversations` after first message

- [x] **T03: Monster Chat UI — streaming client + conversation list** `est:2h`
  - Why: Closes the slice — the browser must consume SSE, render tokens progressively, and persist conversation state across page reloads.
  - Files: `apps/admin/src/app/(dashboard)/monster/page.tsx`, `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx`, `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx`, `apps/admin/src/app/(dashboard)/monster/actions.ts`
  - Do: (1) `page.tsx` becomes a server component: fetches recent conversations from Supabase, renders `<ConversationList>` (server, conversations passed as prop) + `<ChatWindow>` (client component). (2) `ChatWindow.tsx` (`'use client'`): text input + send button; on send, `fetch('/api/monster/chat', { method: 'POST', body: JSON.stringify({ message, conversationId }) })`; read `response.body` as a `ReadableStream` with a `TextDecoder`; parse SSE lines (`data: {...}`) and accumulate `text` tokens into current assistant message state; render messages list with user (right-aligned) and assistant (left-aligned) bubbles; assistant bubble renders in-progress text while streaming. (3) On `done` event: update `conversationId` state so subsequent messages continue the same conversation. (4) Auto-scroll to bottom on new tokens. (5) `ConversationList.tsx`: list of past conversations with title + timestamp; clicking one loads it (navigates to `/monster?c=<id>` or uses state). (6) `actions.ts` (`'use server'`): `getConversations()` — fetch from `chat_conversations`; `getMessages(conversationId)` — fetch from `chat_messages` ordered by `created_at`; `deleteConversation(id)`. (7) When `?c=<id>` query param present, `page.tsx` pre-fetches messages and passes to `ChatWindow` as initial state.
  - Verify: In browser at `http://localhost:3004/monster`: type "Which sites do I have?" → tokens stream progressively (visible before response completes) → response names real sites from DB → reload page → conversation appears in list → click it → messages restore
  - Done when: streaming tokens visible in browser; MCP tool call confirmed (response contains real site data); conversation persists across reload

## Files Likely Touched

- `packages/agents/package.json`
- `packages/agents/tsup.config.ts`
- `packages/agents/src/clients/claude-sdk.ts` (new)
- `packages/agents/src/mcp/monster-server.ts` (new)
- `packages/agents/src/index.ts`
- `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql` (new)
- `packages/db/src/types/supabase.ts`
- `apps/admin/next.config.ts`
- `apps/admin/src/app/api/monster/chat/route.ts` (new)
- `apps/admin/src/app/(dashboard)/monster/page.tsx`
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` (new)
- `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx` (new)
- `apps/admin/src/app/(dashboard)/monster/actions.ts` (new)
