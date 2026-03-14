---
estimated_steps: 7
estimated_files: 8
---

# T01: Install Agent SDK, add DB migration, build ClaudeSDKClient + Monster MCP server

**Slice:** S01 — Monster Chat — Streaming Agent + MCP Portfolio Tools
**Milestone:** M007

## Description

Establish the three backend building blocks that the Route Handler (T02) composes:
1. `@anthropic-ai/claude-agent-sdk` installed and externalized so it's never bundled into Next.js or the worker artifact
2. DB migration adding `agent_session_id` to `chat_conversations` (required for multi-turn session resume per D103)
3. `ClaudeSDKClient` — thin async-iterable wrapper around the Agent SDK that yields typed streaming events
4. `createMonsterMcpServer(supabase)` — MCP server with 4 read-only portfolio tools that Monster will call during chat

The critical constraint is D100: the `prompt` passed to the Agent SDK **must** be an async generator function (not a string) when MCP servers are in use. A string prompt causes silent failure — tools are never invoked.

## Steps

1. Install `@anthropic-ai/claude-agent-sdk` as a dep of `packages/agents`. Add to `external` list in `tsup.config.ts` for both index and worker entries (D101 pattern — same as `node-ssh`, `cloudflare`). Add `serverExternalPackages: ['@anthropic-ai/claude-agent-sdk']` to `apps/admin/next.config.ts`.

2. Write migration `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql`:
   ```sql
   ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS agent_session_id text;
   ```
   Update `packages/db/src/types/supabase.ts` — add `agent_session_id: string | null` to `chat_conversations` Row, Insert, and Update shapes. Run `pnpm --filter @monster/db build`.

3. Create `packages/agents/src/mcp/` directory. Write `monster-server.ts` exporting `createMonsterMcpServer(supabase: SupabaseClient): McpServer`. Import `McpServer` from `@anthropic-ai/claude-agent-sdk` (or the correct SDK import path — verify against installed package). Register 4 tools:
   - `getPortfolioStats` — no params; SELECT COUNT(*), COUNT(*) by status FROM sites; return `{ total, live, generating, deploying, paused, error }`
   - `getSiteDetail` — param `{ identifier: string }` (name or id); SELECT from sites WHERE name ILIKE or id = identifier; return site row or null
   - `getAnalytics` — param `{ site_id: string, days?: number }` (default 30); SELECT SUM(pageviews), SUM(affiliate_clicks) FROM analytics_daily WHERE site_id = ... AND date >= now()-days; return aggregated stats
   - `getAlerts` — param `{ site_id?: string }` (optional filter); SELECT from product_alerts WHERE status = 'open' (optionally filtered); return array
   
   Each tool handler logs `[monster-mcp] tool=${name} called` and `[monster-mcp] tool=${name} result rows=${n}`. Return value must be JSON-serializable.

4. Write `packages/agents/src/clients/claude-sdk.ts` exporting `ClaudeSDKClient` class with:
   ```typescript
   interface StreamEvent {
     type: 'text';
     text: string;
   } | {
     type: 'done';
     sessionId: string;
   } | {
     type: 'error';
     error: string;
   }
   
   interface StreamOptions {
     conversationId: string;
     agentSessionId?: string | null;
     mcpServer?: McpServer;
   }
   
   class ClaudeSDKClient {
     async *streamQuery(message: string, opts: StreamOptions): AsyncIterable<StreamEvent>
   }
   ```
   
   Implementation: `query()` from the Agent SDK with prompt as async generator (`async function* () { yield { role: 'user', content: message } }`). Pass `resume: agentSessionId` when provided. Pass `mcpServers: [mcpServer]` when provided. Iterate the returned async iterator, yield `{ type: 'text', text }` for each text delta, yield `{ type: 'done', sessionId: result.session_id }` on completion. Wrap in try/catch; yield `{ type: 'error', error: e.message }` on failure. Log `[claude-sdk] turn start sessionId=${opts.agentSessionId ?? 'new'}`.

5. Export from `packages/agents/src/index.ts`:
   ```typescript
   export { ClaudeSDKClient } from './clients/claude-sdk.js';
   export { createMonsterMcpServer } from './mcp/monster-server.js';
   ```

6. Run `pnpm --filter @monster/agents build` and `pnpm -r typecheck`. Fix any type errors. Common issues: MCP server API shape (check installed SDK types), async generator yield type, supabase.ts type sync after manual edit.

7. Verify the external list works: inspect `packages/agents/dist/index.js` — should reference `@anthropic-ai/claude-agent-sdk` as an external import, not inline its code.

## Must-Haves

- [ ] `@anthropic-ai/claude-agent-sdk` in `packages/agents/package.json` dependencies
- [ ] `@anthropic-ai/claude-agent-sdk` in tsup external list (both index + worker entries)
- [ ] `serverExternalPackages` array in `apps/admin/next.config.ts` containing the SDK
- [ ] Migration `20260314000006_chat_agent_session.sql` exists with `ADD COLUMN IF NOT EXISTS agent_session_id text`
- [ ] `chat_conversations` supabase.ts types include `agent_session_id: string | null`
- [ ] `@monster/db` built after types update
- [ ] `ClaudeSDKClient.streamQuery()` uses async generator prompt form (not string)
- [ ] `createMonsterMcpServer()` registers all 4 tools
- [ ] Both exported from `packages/agents/src/index.ts`
- [ ] `pnpm --filter @monster/agents build` exits 0
- [ ] `pnpm -r typecheck` exits 0

## Verification

- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/db build` exits 0
- `pnpm -r typecheck` exits 0
- `grep -c 'claude-agent-sdk' packages/agents/dist/index.js` → returns a line (import statement present, not bundled code)
- `ls packages/db/supabase/migrations/20260314000006_chat_agent_session.sql` exists
- `grep 'agent_session_id' packages/db/src/types/supabase.ts` → found in chat_conversations Row/Insert/Update

## Observability Impact

- Signals added: `[monster-mcp] tool=${name} called`, `[monster-mcp] tool=${name} result rows=${n}`, `[claude-sdk] turn start sessionId=...`
- How a future agent inspects this: grep pm2/worker logs for `[monster-mcp]` or `[claude-sdk]` prefixes
- Failure state exposed: `ClaudeSDKClient.streamQuery()` catches and yields `{ type: 'error', error }` — failure surfaces at the iterator consumer (Route Handler) without crashing

## Inputs

- `packages/agents/package.json` — existing dep list; Agent SDK goes here
- `packages/agents/tsup.config.ts` — existing external list; SDK added alongside node-ssh, cloudflare
- `packages/db/src/types/supabase.ts` — manual type update for agent_session_id
- D100, D101, D103 — SDK prompt form, externalization, session ID storage decisions

## Expected Output

- `packages/agents/src/clients/claude-sdk.ts` — ClaudeSDKClient with streamQuery()
- `packages/agents/src/mcp/monster-server.ts` — createMonsterMcpServer() with 4 tools
- `packages/agents/src/index.ts` — updated with new exports
- `packages/db/supabase/migrations/20260314000006_chat_agent_session.sql` — migration
- `packages/db/src/types/supabase.ts` — agent_session_id added to chat_conversations
- `apps/admin/next.config.ts` — serverExternalPackages added
- `packages/agents/tsup.config.ts` — Agent SDK in external list
- All builds + typechecks pass
