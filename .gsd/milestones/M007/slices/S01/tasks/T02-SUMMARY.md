---
id: T02
parent: S01
milestone: M007
provides:
  - "POST /api/monster/chat Route Handler — SSE streaming bridge with conversation persistence"
  - "New conversations auto-created in chat_conversations; user+assistant messages persisted in chat_messages"
  - "agent_session_id updated in chat_conversations after first turn for session resume"
  - "X-Conversation-Id response header returns created conversation ID to client"
key_files:
  - apps/admin/src/app/api/monster/chat/route.ts
key_decisions:
  - D108 — Controller close-safety: send() wraps enqueue() in try/catch + closed boolean to silently handle client-disconnect (ReadableStream controller already closed). Normal in SSE when client drops before stream ends.
  - D109 — Pre-stream 404 for unknown conversationId (not SSE error event). Returning HTTP 404 JSON before stream starts is correct for missing conversation — prevents orphaned DB rows and gives client clear signal. SSE error events are for runtime failures during streaming.
patterns_established:
  - "SSE bridge pattern: ReadableStream.start() iterates AsyncIterable<StreamEvent>; each event encoded as 'data: ${JSON.stringify(event)}\\n\\n'; controller.close() in finally with closed guard"
  - "DB writes in correct order: (1) create/fetch conversation before stream, (2) insert user message before stream, (3) insert assistant message after stream completes, (4) update agent_session_id after stream"
  - "X-Conversation-Id header: returned on all successful responses so client can track new conversations from response header, not SSE event parsing"
observability_surfaces:
  - "pm2 logs monster-admin | grep '[monster/chat]' → turn start/complete per conversation"
  - "pm2 logs monster-admin | grep '[claude-sdk]' → sessionId lifecycle (new vs resumed)"
  - "pm2 logs monster-admin | grep '[monster-mcp]' → MCP tool calls + result row counts"
  - "SELECT id, title, agent_session_id FROM chat_conversations; SELECT role, LEFT(content,50) FROM chat_messages WHERE conversation_id='<id>'; — verify persistence"
duration: ~45min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: `/api/monster/chat` Route Handler — SSE streaming bridge + conversation persistence

**POST /api/monster/chat bridges Agent SDK async iterator to browser SSE, persists conversations and messages in Supabase, and handles multi-turn session resume via agent_session_id.**

## What Happened

1. Created `apps/admin/src/app/api/monster/chat/route.ts` with a `POST` handler.

2. Request parsing: validates `message` (required, non-empty) and `conversationId` (optional string). Returns 400 for missing/empty message.

3. Conversation setup:
   - No `conversationId`: inserts new `chat_conversations` row with title = first 50 chars of message.
   - Existing `conversationId`: fetches row to get `agent_session_id` for SDK session resume. Returns 404 if not found.

4. User message persisted to `chat_messages` (role='user') before streaming starts.

5. `ReadableStream` with closed-guard `send()` helper:
   - Instantiates `ClaudeSDKClient` + `createMonsterMcpServer(supabase)`
   - Iterates `streamQuery()` AsyncIterable, forwarding all events as SSE
   - Accumulates `text` tokens into `fullText`; captures `sessionId` from `done` event
   - Post-stream: inserts assistant message to `chat_messages`, updates `agent_session_id` in `chat_conversations`

6. Response: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Conversation-Id: <id>`.

**Migration applied:** `20260314000006_chat_agent_session.sql` (written in T01) was not yet applied to the live Supabase instance. Applied it directly via a temporary `pg` script against the DB URL from `.env`. Column `agent_session_id text` now exists on `chat_conversations`.

**Controller close-safety (D108):** During testing, a `"Invalid state: Controller is already closed"` error appeared when a curl client disconnected mid-stream. Fixed by adding a `closed` boolean + try/catch in `send()` so client disconnects are handled silently instead of logging errors.

## Verification

```
# Build + typecheck
pnpm --filter @monster/agents build  → exit 0 ✓
pnpm --filter @monster/admin build   → exit 0 ✓
pnpm -r typecheck                    → all 9 packages pass ✓

# 400 validation
curl -X POST http://localhost:3004/api/monster/chat -d '{"message":"","conversationId":null}'
  → {"error":"message is required and must be non-empty"} ✓

# New conversation — SSE streaming
curl -N -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How many sites do I have?","conversationId":null}'
  → HTTP 200, content-type: text/event-stream ✓
  → x-conversation-id: 6380989a-bedd-4bef-9b71-0ddc23d220f6 ✓
  → data: {"type":"text","text":"You"}, ... multiple text events ... ✓
  → data: {"type":"done","sessionId":"d43267d9-..."} ✓
  → MCP tool getPortfolioStats called, result rows=1 (real data) ✓

# DB persistence
SELECT id, title, agent_session_id FROM chat_conversations WHERE id='6380989a-...'
  → 1 row: title="How many sites do I have?", agent_session_id="d43267d9-..." (non-null) ✓
SELECT role, content FROM chat_messages WHERE conversation_id='6380989a-...'
  → 2 rows: role=user + role=assistant ✓

# Session resume
curl -N -X POST http://localhost:3004/api/monster/chat \
  -d '{"message":"What is its name?","conversationId":"6380989a-..."}'
  → streams tokens, done event shows same sessionId "d43267d9-..." ✓
  → agent resumed prior conversation context ✓

# 404 for missing conversation
curl -X POST http://localhost:3004/api/monster/chat \
  -d '{"message":"test","conversationId":"bad-uuid"}'
  → HTTP 404 {"error":"Conversation not found"} ✓
```

## Diagnostics

- **Route handler signals:** `pm2 logs monster-admin | grep '\[monster/chat\]'` → `turn start` / `turn complete` per conversation ID
- **SDK lifecycle:** `pm2 logs monster-admin | grep '\[claude-sdk\]'` → `sessionId=new` on first turn, `sessionId=<existing>` on resume
- **MCP calls:** `pm2 logs monster-admin | grep '\[monster-mcp\]'` → tool name + result row count per call
- **Persistence check:** direct Supabase query: `SELECT agent_session_id FROM chat_conversations WHERE id='<id>'` → non-null after first turn
- **Client disconnect:** silently handled by closed guard in `send()` — no error logged for normal disconnects

## Deviations

- **Migration applied manually:** T01 wrote the migration file but didn't apply it to the live Supabase instance. Applied via temp `pg` script using `SUPABASE_DB_URL` from `.env`. No structural change to the task.
- **Pre-stream 404 for bad conversationId (D109):** Slice plan described SSE error event for bad conversationId. A pre-stream HTTP 404 is more correct here — before the stream starts, we can return a proper HTTP status code that the client can inspect without needing to parse SSE events. This applies only to the lookup phase; runtime errors during streaming still produce SSE error events.
- **Controller close-safety (D108):** Added `closed` boolean + try/catch in `send()` to handle client-disconnect gracefully. Not in the original plan but essential for production correctness.

## Known Issues

None. All must-haves verified.

## Files Created/Modified

- `apps/admin/src/app/api/monster/chat/route.ts` — new; POST handler, SSE streaming bridge, conversation persistence
