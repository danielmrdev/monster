# S01: Monster Chat — Streaming Agent + MCP Portfolio Tools — UAT

**Milestone:** M007
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (live-runtime + human-experience)
- Why this mode is sufficient: Streaming UX requires human observation (tokens appearing progressively before response completes). MCP tool verification requires response text to contain real DB data — cannot be inferred from build output alone.

## Preconditions

1. Admin server running on port 3004 (`pm2 show monster-admin` → online, or `pnpm dev` in `apps/admin`)
2. Supabase env vars set in `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`)
3. `ANTHROPIC_API_KEY` set in `.env` (required for Agent SDK `query()`)
4. At least one row in `sites` table (any status) — verifiable via Supabase dashboard or `SELECT id, name, status FROM sites LIMIT 5`
5. `agent_session_id text` column exists in `chat_conversations` — verifiable via `\d chat_conversations` in psql or Supabase Table Editor
6. `packages/agents` and `apps/admin` builds pass (`pnpm --filter @monster/agents build && pnpm --filter @monster/admin build` — both exit 0)

## Smoke Test

```bash
curl -s -N -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"How many sites do I have?","conversationId":null}' \
  --max-time 30
```

**Expected:** Multiple `data: {"type":"text","text":"..."}` lines appear, followed by a `data: {"type":"done","sessionId":"..."}` line. The response text references a number or site name that matches real Supabase data.

---

## Test Cases

### 1. New conversation — streaming tokens visible before response completes

**Goal:** Confirm tokens stream progressively (not all at once after a delay), and response references real DB data.

1. Open `http://localhost:3004/monster` in a browser
2. Type "Which sites do I have?" in the message input
3. Click Send (or press Enter)
4. **Watch the response area while it is generating**
5. **Expected (UX):** Individual words or short phrases appear one at a time as Claude generates them — not a blank screen followed by a complete response. The first token should appear within 3–5 seconds of sending.
6. **Expected (content):** The response mentions a specific site name, niche, or count (e.g. "1 site" or the actual site name/domain) that could only come from a DB query — not a generic "I don't know" answer.
7. **Expected (state):** URL updates to `/monster?c=<uuid>` after the first response completes (without a full page reload).

### 2. MCP tool call verified — response contains real portfolio data

**Goal:** Confirm `getPortfolioStats` (or another MCP tool) is being invoked and its data appears in the response.

1. In a fresh browser tab, open `http://localhost:3004/monster`
2. Type "What is the status of my portfolio? How many sites are live vs draft?"
3. Wait for the full response
4. **Expected:** Response includes counts or status breakdown that match the actual `sites` table (e.g. "You have 1 draft site"). Numbers must match `SELECT status, count(*) FROM sites GROUP BY status` output.
5. **Diagnostic if failing:** Run `pm2 logs monster-admin | grep '[monster-mcp]'` — if no tool log lines appear, MCP is not being invoked. Check that `ANTHROPIC_API_KEY` is set and that the server restarted after env changes.

### 3. Conversation persistence — survives page reload

**Goal:** Confirm conversations and messages are stored in Supabase and restored on page load.

1. Send at least 2 messages in a conversation (e.g. "How many sites do I have?" then "What niche is it in?")
2. Note the URL (`/monster?c=<uuid>`)
3. Hard reload the page (`Ctrl+Shift+R` / Cmd+Shift+R)
4. **Expected:** The conversation list in the left sidebar shows the conversation with its title (first 50 chars of first message). The chat area shows both the user messages and Monster's responses, in order. No blank state.
5. Click the conversation in the sidebar list
6. **Expected:** Messages load and render correctly — user messages right-aligned, assistant messages left-aligned.

### 4. Multi-turn session resume — Monster remembers prior context

**Goal:** Confirm Agent SDK session resume works so Monster has context from prior turns.

1. In a conversation, send: "I have a site about air fryers. Remember that."
2. Wait for response
3. Send: "What site did I just mention?"
4. **Expected:** Monster's second response references "air fryers" (or the site topic), demonstrating it has context from the prior turn — not starting fresh.
5. **Diagnostic if failing:** `SELECT agent_session_id FROM chat_conversations WHERE id='<conversationId>'` — must be non-null. Null means session ID wasn't persisted from turn 1, so turn 2 started a new session.

### 5. Conversation list — multiple conversations visible and clickable

**Goal:** Confirm the sidebar lists past conversations and clicking one loads it.

1. Start 2–3 separate conversations from `/monster` (New Conversation button)
2. **Expected:** Left sidebar shows all conversations with relative timestamps ("just now", "2 min ago", etc.)
3. Click a past conversation in the sidebar
4. **Expected:** URL changes to `/monster?c=<id>` and the chat area shows that conversation's messages

### 6. Error handling — empty message rejected

**Goal:** Confirm the API validates input and returns a useful error.

```bash
curl -s -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"","conversationId":null}'
```

**Expected:** HTTP 400 with body `{"error":"message is required and must be non-empty"}` (not a 500 or a hanging connection).

### 7. Error handling — unknown conversationId returns pre-stream 404

**Goal:** Confirm that a bad conversationId returns a proper HTTP error before any stream is opened.

```bash
curl -s -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"test","conversationId":"00000000-0000-0000-0000-000000000000"}'
```

**Expected:** HTTP 404 with body `{"error":"Conversation not found"}`. No SSE stream is opened. The curl command returns immediately (not hanging for 30s).

### 8. Agent session ID persisted after first turn

**Goal:** Confirm observability surface works: `agent_session_id` is non-null after a successful turn.

1. Send a message in a new conversation. Note the `X-Conversation-Id` from the response header (`curl -v ...` to see headers).
2. Query Supabase: `SELECT id, title, agent_session_id FROM chat_conversations WHERE id = '<conversationId>'`
3. **Expected:** `agent_session_id` is a non-null UUID (the Agent SDK session ID). `title` is the first 50 chars of your message.

---

## Edge Cases

### Client disconnects mid-stream

1. Start sending a long message (e.g. "Please describe in detail every aspect of the portfolio management approach")
2. Immediately navigate away or close the tab while tokens are streaming
3. **Expected:** No error logged in `pm2 logs monster-admin` for the disconnect (silently absorbed by closed guard in `send()`). Server continues cleanly. Admin panel still loads normally after reconnect.

### Shift+Enter for multiline message

1. In the chat input, press Shift+Enter to add a line break
2. **Expected:** A new line appears in the input, message is NOT sent. Press Enter alone to send.

### Very long first message (title truncation)

1. Send a message that is longer than 50 characters as the first message in a new conversation
2. **Expected:** Conversation appears in the sidebar list with only the first 50 characters as the title (truncated — no ellipsis required, just cut).

### X-Conversation-Id captured correctly

```bash
curl -si -X POST http://localhost:3004/api/monster/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"test","conversationId":null}' --max-time 30 | grep -i 'x-conversation-id'
```

**Expected:** `x-conversation-id: <uuid>` header present in response. Sending a second message with that UUID as `conversationId` should resume the session (not 404).

---

## Failure Signals

- **No streaming tokens:** Browser shows blank area then complete response appears at once → ReadableStream reader not working correctly, or server is buffering response (check `Content-Type: text/event-stream` header is present)
- **Generic response without real data:** Monster says "I don't have access to your portfolio" or gives a generic answer → MCP tools not being invoked. Check `pm2 logs | grep '[monster-mcp]'` — if no tool calls logged, the `mcpServer` isn't being passed or `ANTHROPIC_API_KEY` is missing/invalid
- **500 errors on /api/monster/chat:** Check pm2 logs for the full stack trace. Most likely cause: `ANTHROPIC_API_KEY` not set, or Agent SDK version mismatch
- **Conversation not appearing in sidebar after reload:** Check `SELECT count(*) FROM chat_conversations` — if empty, the conversation insert is failing. Check for Supabase service role key issues.
- **URL stays at /monster after first turn:** `window.history.replaceState` not called, or `X-Conversation-Id` header not read. Check browser Network tab for the POST response headers.
- **Build failures:** `pnpm -r typecheck` exits non-zero → new TypeScript errors introduced. `pnpm --filter @monster/agents build` or `pnpm --filter @monster/admin build` exits non-zero → bundling or compilation issue.

---

## Requirements Proved By This UAT

- **R010 (Monster Chat agent)** — streaming responses with real MCP tool call data visible in browser; persistent conversation history; multi-turn context via Agent SDK session resume

---

## Not Proven By This UAT

- **R003 (Autonomous niche research)** — requires S02 (NicheResearcher BullMQ job + DataForSEO integration)
- **NicheResearcher long-running job resilience** — browser disconnect survival requires S02 BullMQ job
- **Research report UI** — requires S03

---

## Notes for Tester

- The streaming speed depends on Anthropic API load. Responses typically start within 2–3 seconds. If no tokens appear after 10 seconds, check `ANTHROPIC_API_KEY` is valid and the API plan has capacity.
- MCP tool invocation is model-determined — Claude decides when to call tools. For portfolio questions ("how many sites", "what is my site about"), `getPortfolioStats` is reliably called. For general questions ("tell me a joke"), no tools are called and that is expected behavior.
- Conversation titles are the first 50 characters of the first message — they don't update as the conversation evolves. This is a known Phase 1 limitation.
- `deleteConversation` server action is implemented but not yet exposed in the UI. To delete a test conversation, call it directly or use Supabase dashboard.
- The two-column layout fills the dashboard main area edge-to-edge via `-m-8`. On smaller screens the layout may be tight — the sidebar is ~260px and the chat window takes the remainder.
