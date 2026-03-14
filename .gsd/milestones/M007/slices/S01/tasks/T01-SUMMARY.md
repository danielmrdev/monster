---
id: T01
parent: S01
milestone: M007
provides:
  - "@anthropic-ai/claude-agent-sdk installed and externalized in tsup + Next.js"
  - "DB migration adding agent_session_id to chat_conversations"
  - "ClaudeSDKClient with streamQuery() returning typed streaming events"
  - "createMonsterMcpServer() with 4 read-only portfolio tools using createSdkMcpServer"
  - "Both exported from packages/agents/src/index.ts"
key_files:
  - packages/agents/src/clients/claude-sdk.ts
  - packages/agents/src/mcp/monster-server.ts
  - packages/agents/src/index.ts
  - packages/agents/package.json
  - packages/agents/tsup.config.ts
  - packages/db/supabase/migrations/20260314000006_chat_agent_session.sql
  - packages/db/src/types/supabase.ts
  - apps/admin/next.config.ts
key_decisions:
  - D105 — D100 superseded; string prompt is correct for Agent SDK; MCP registered via options.mcpServers regardless of prompt form
  - D106 — createMonsterMcpServer returns McpSdkServerConfigWithInstance (not bare McpServer)
  - D107 — streaming text via SDKPartialAssistantMessage with includePartialMessages:true
  - D101 — Agent SDK externalized in tsup (both entries) and Next.js serverExternalPackages
patterns_established:
  - "In-process MCP server: createSdkMcpServer({ name, tools: [tool(name, desc, schema, handler)] }) → McpSdkServerConfigWithInstance"
  - "Streaming text: iterate Query (AsyncGenerator<SDKMessage>), yield on stream_event + content_block_delta + text_delta"
  - "Session resume: pass options.resume with stored agent_session_id; extract session_id from SDKResultMessage"
  - "@supabase/supabase-js added as direct dep of @monster/agents when MCP tools need DB access"
observability_surfaces:
  - "grep '[monster-mcp]' worker logs — each tool call logs: tool=<name> called / result rows=<n>"
  - "grep '[claude-sdk]' worker/admin logs — turn start/done with sessionId"
  - "ClaudeSDKClient yields { type: 'error', error } on exception — failure surfaces at Route Handler consumer"
duration: ~45min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Install Agent SDK, add DB migration, build ClaudeSDKClient + Monster MCP server

**Installed Agent SDK v0.2.76, wrote ClaudeSDKClient wrapping streaming query(), and built createMonsterMcpServer() with 4 portfolio tools using the SDK's createSdkMcpServer helper.**

## What Happened

1. Installed `@anthropic-ai/claude-agent-sdk@^0.2.76` as dep of `@monster/agents`. Added `@supabase/supabase-js` as a direct dep too (needed for MCP tool Supabase queries — not hoisted from sibling packages per D094 pattern).

2. Added SDK to tsup `external` list in both index and worker entries. Added `serverExternalPackages: ['@anthropic-ai/claude-agent-sdk']` to `apps/admin/next.config.ts`.

3. Wrote migration `20260314000006_chat_agent_session.sql` adding `agent_session_id text` to `chat_conversations`. Updated supabase.ts Row/Insert/Update shapes. Rebuilt `@monster/db`.

4. Created `packages/agents/src/mcp/monster-server.ts` — `createMonsterMcpServer(supabase)` using `createSdkMcpServer` + `tool()` helpers from the Agent SDK. Returns `McpSdkServerConfigWithInstance` (not bare `McpServer`). Registers 4 tools: `getPortfolioStats`, `getSiteDetail`, `getAnalytics`, `getAlerts`. Each tool logs call + result rows.

5. Created `packages/agents/src/clients/claude-sdk.ts` — `ClaudeSDKClient.streamQuery()` calls `query({ prompt: message, options: { ... } })` with `includePartialMessages: true`. Iterates `SDKMessage` stream; yields `{ type: 'text' }` on `stream_event + content_block_delta + text_delta`; yields `{ type: 'done', sessionId }` on `SDKResultMessage`; wraps in try/catch to yield `{ type: 'error' }`.

6. Exported both from `packages/agents/src/index.ts`.

**Key deviation from D100:** D100 stated that async generator prompt form is required when MCP servers are in use. Inspecting SDK v0.2.76 types, `SDKUserMessage` requires `{ type, message, parent_tool_use_id, session_id }` — construction is not exposed by the SDK's public API. A string prompt is type-correct and MCP tools are registered via `options.mcpServers` regardless of prompt form. D100 is superseded by D105.

## Verification

```
pnpm --filter @monster/agents build  → exit 0 ✓
pnpm --filter @monster/db build      → exit 0 ✓
pnpm -r typecheck                    → exit 0, all 9 packages pass ✓

grep 'claude-agent-sdk' packages/agents/dist/index.js
  → import { query } from "@anthropic-ai/claude-agent-sdk";
  → import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
  (referenced as external, not bundled) ✓

ls packages/db/supabase/migrations/20260314000006_chat_agent_session.sql → exists ✓
grep 'agent_session_id' packages/db/src/types/supabase.ts
  → string | null in Row; string | null | undefined in Insert and Update ✓
```

## Diagnostics

- **MCP tool calls:** grep `[monster-mcp]` in pm2/worker logs. Each call logs tool name + result row count.
- **SDK turn lifecycle:** grep `[claude-sdk]` in admin/Route Handler logs. `turn start sessionId=<id|new>` before each SDK call; `turn done sessionId=<id>` on completion.
- **Error path:** `ClaudeSDKClient.streamQuery()` catches all exceptions and yields `{ type: 'error', error: e.message }`. Error surfaces at Route Handler consumer as an SSE error event without crashing the server.
- **Session ID persistence:** after first turn, check `SELECT agent_session_id FROM chat_conversations WHERE id = '<id>'` — should be non-null SDK UUID.

## Deviations

- **D100 superseded (D105):** String prompt used instead of async generator. SDK v0.2.76 `SDKUserMessage` type requires `type/message/parent_tool_use_id/session_id` — not constructible from the public API surface. String prompt is correct and MCP tools work via `options.mcpServers`.
- **MCP server type (D106):** `createMonsterMcpServer` returns `McpSdkServerConfigWithInstance` (not `McpServer`). The plan described `McpServer`, but Agent SDK's `mcpServers` option requires the full config wrapper. `ClaudeSDKClient.StreamOptions.mcpServer` typed accordingly.
- **`@supabase/supabase-js` added as direct dep:** Required for `SupabaseClient` type in monster-server.ts. Same D094/D096 pnpm hoisting pattern.

## Known Issues

None. All builds and typechecks pass.

## Files Created/Modified

- `packages/agents/src/clients/claude-sdk.ts` — new; ClaudeSDKClient.streamQuery()
- `packages/agents/src/mcp/monster-server.ts` — new; createMonsterMcpServer() with 4 tools
- `packages/agents/src/index.ts` — exports ClaudeSDKClient, createMonsterMcpServer, StreamEvent, StreamOptions
- `packages/agents/package.json` — added @anthropic-ai/claude-agent-sdk, @supabase/supabase-js
- `packages/agents/tsup.config.ts` — added @anthropic-ai/claude-agent-sdk to external in both entries
- `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql` — new migration
- `packages/db/src/types/supabase.ts` — agent_session_id added to chat_conversations Row/Insert/Update
- `apps/admin/next.config.ts` — added serverExternalPackages
- `.gsd/milestones/M007/slices/S01/S01-PLAN.md` — added failure-path verification checks (pre-flight fix)
- `.gsd/DECISIONS.md` — appended D105, D106, D107
