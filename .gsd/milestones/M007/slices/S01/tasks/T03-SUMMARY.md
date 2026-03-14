---
id: T03
parent: S01
milestone: M007
provides:
  - "Streaming Monster Chat UI: ConversationList sidebar + ChatWindow SSE client + page.tsx server component"
  - "Server actions: getConversations(), getMessages(), deleteConversation() for conversation CRUD"
  - "SSE ReadableStream reader in ChatWindow using response.body + TextDecoderStream (not EventSource)"
  - "X-Conversation-Id header capture: new conversation ID propagated to client state + URL on first turn"
key_files:
  - apps/admin/src/app/(dashboard)/monster/actions.ts
  - apps/admin/src/app/(dashboard)/monster/ConversationList.tsx
  - apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx
  - apps/admin/src/app/(dashboard)/monster/page.tsx
key_decisions:
  - "D110 — URL state on new conversation: window.history.replaceState() used to push ?c=<id> without a router navigation, preserving React state in ChatWindow while making the URL shareable/reloadable"
patterns_established:
  - "SSE ReadableStream pattern: fetch() → response.body.pipeThrough(new TextDecoderStream()).getReader() → chunk accumulation with '\n\n' split → 'data: ' prefix strip → JSON.parse per event"
  - "X-Conversation-Id capture: res.headers.get('X-Conversation-Id') after fetch(); set to state + replaceState URL if conversationId was null"
  - "Server action pattern for chat: 'use server' + createServiceClient() + typed return array — no throws, errors logged and returned as empty array"
  - "Two-column layout with -m-8 overflow-hidden to fill the dashboard main area edge-to-edge"
observability_surfaces:
  - "SSE stream events visible via: curl -N -X POST http://localhost:3004/api/monster/chat -H 'Content-Type: application/json' -d '{\"message\":\"test\",\"conversationId\":null}'"
  - "X-Conversation-Id header visible via curl -v or browser Network tab"
  - "Conversation list source: SELECT id, title, updated_at FROM chat_conversations ORDER BY updated_at DESC LIMIT 20"
  - "Message restore source: SELECT role, content FROM chat_messages WHERE conversation_id='<id>' ORDER BY created_at ASC"
  - "SSE parse errors logged to browser console with raw event text"
  - "Stream/fetch errors rendered as red error bubbles in ChatWindow — never swallowed"
duration: ~45m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Monster Chat UI — streaming client + conversation list

**Replaced the "Coming soon" Monster Chat page with a full streaming chat UI: server-component page + sidebar conversation list + SSE-reading client ChatWindow, with real Supabase data throughout.**

## What Happened

Implemented 4 files:

1. **`actions.ts`** (`'use server'`): `getConversations()` (20 most-recent, ordered by updated_at DESC), `getMessages(conversationId)` (all messages ASC), `deleteConversation(id)` (explicit message delete first, then conversation — guards against missing FK cascade).

2. **`ConversationList.tsx`** (server component): sidebar ~260px, scrollable list of conversations with relative timestamps, each linking to `?c=<id>`. Active item highlighted with `bg-accent`. "New conversation" primary button at top linking to `/monster`.

3. **`ChatWindow.tsx`** (`'use client'`): core streaming client. Uses `fetch()` + `response.body.pipeThrough(new TextDecoderStream()).getReader()` for SSE — per D099 (not EventSource, which is GET-only). Reads `X-Conversation-Id` from response headers to capture new conversation ID, then calls `window.history.replaceState` to push `?c=<id>` without triggering a router re-render. Accumulates `text` events into streaming assistant bubble; `done` event clears streaming flag; `error` event renders red error bubble. Auto-scroll, auto-focus, Shift+Enter newline support.

4. **`page.tsx`** (async server component): reads `searchParams.c`, parallel-fetches conversations + messages, renders two-column layout with `ConversationList` left + `ChatWindow` right. `-m-8` layout fills the dashboard main area edge-to-edge.

Decision D110: chose `window.history.replaceState()` over `router.push()` to update the URL after first-turn conversation creation. `router.push()` would trigger a server re-render of page.tsx (fetching messages from DB), causing a flicker and losing in-progress streaming state. `replaceState` keeps React state in place while making the URL bookmarkable for subsequent page loads.

## Verification

- `pnpm --filter @monster/agents build` → exit 0 ✓
- `pnpm --filter @monster/admin build` → exit 0, `/monster` route present as `ƒ` (dynamic) ✓
- `pnpm -r typecheck` → exit 0, no errors across all 9 packages ✓
- SSE stream: `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"How many sites do I have?","conversationId":null}'` → streams `data: {"type":"text","text":"..."}` tokens progressively; response references real Supabase data ("1 site in **draft** status"); stream ends with `data: {"type":"done","sessionId":"..."}` ✓
- `X-Conversation-Id` header present on POST response (verified via `curl -v`) ✓
- DB persistence: `SELECT id, title, agent_session_id FROM chat_conversations` shows new conversations with non-null `agent_session_id` after first turn ✓
- Messages persisted: `SELECT role, content FROM chat_messages WHERE conversation_id='<id>'` returns user + assistant rows ✓
- Failure path: POST with `bad-uuid` conversationId → HTTP 404 `{"error":"Conversation not found"}` (pre-stream, not SSE error event, per D109) ✓
- Component boundaries: `ChatWindow.tsx` line 1 = `'use client'`; `page.tsx` has no directive (async server component); `ConversationList.tsx` has no directive (server component) ✓

## Diagnostics

- **Live SSE verification:** `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"test","conversationId":null}'`
- **Header check:** `curl -v -X POST http://localhost:3004/api/monster/chat ...` → look for `< x-conversation-id:`
- **Conversation list:** `SELECT id, title, updated_at FROM chat_conversations ORDER BY updated_at DESC LIMIT 20`
- **Message restore:** `SELECT role, content FROM chat_messages WHERE conversation_id='<id>' ORDER BY created_at ASC`
- **Session resume:** `SELECT agent_session_id FROM chat_conversations WHERE id='<id>'` → non-null after first turn
- **Browser:** SSE parse errors → browser console; stream errors → red bubble in chat

## Deviations

- None from plan. All 6 steps executed as specified.

## Known Issues

- None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/monster/actions.ts` — new; server actions for conversation CRUD
- `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx` — new; server component sidebar
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` — new; SSE streaming chat client
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — rewritten; async server component with two-column layout
- `.gsd/milestones/M007/slices/S01/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
