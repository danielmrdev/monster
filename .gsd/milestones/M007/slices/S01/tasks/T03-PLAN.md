---
estimated_steps: 6
estimated_files: 5
---

# T03: Monster Chat UI — streaming client + conversation list

**Slice:** S01 — Monster Chat — Streaming Agent + MCP Portfolio Tools
**Milestone:** M007

## Description

Closes the slice. Replaces the "Coming soon" Monster Chat page with a real streaming chat UI. The browser reads the SSE stream from T02's Route Handler, renders tokens progressively as they arrive, and persists conversation state. Conversation list allows resuming past sessions.

This is the UAT-visible proof that the slice goal is met: tokens appear before the response completes, and the response names real portfolio data from MCP tool calls.

## Steps

1. Write `apps/admin/src/app/(dashboard)/monster/actions.ts` (`'use server'`):
   - `getConversations()` — fetch from `chat_conversations` ordered by `updated_at DESC`, limit 20; returns `id, title, created_at, updated_at`
   - `getMessages(conversationId: string)` — fetch from `chat_messages` WHERE `conversation_id = conversationId` ordered by `created_at ASC`; returns array of `{ id, role, content, created_at }`
   - `deleteConversation(id: string)` — delete from `chat_conversations` (cascades to `chat_messages` if FK configured; otherwise delete messages first)

2. Write `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx` (server component, no `'use client'`):
   - Props: `conversations: ConversationRow[], activeId?: string`
   - Renders a scrollable list of conversation titles + timestamps
   - Each item is a `<Link href={/monster?c=${id}}>` — active item has highlighted style
   - "New conversation" button at top → links to `/monster` (no query param)
   - Widths: sidebar-style, ~250px, left panel

3. Write `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` (`'use client'`):
   - Props: `initialMessages: MessageRow[], conversationId: string | null`
   - State: `messages` (accumulated), `conversationId` (may be null initially), `inputValue`, `isStreaming`
   - On send: `fetch('/api/monster/chat', { method: 'POST', body: JSON.stringify({ message: inputValue, conversationId }) })`. Read `response.headers.get('X-Conversation-Id')` — set as `conversationId` state if currently null (new conversation). Read `response.body` as a `ReadableStream` with `TextDecoderStream` + line-by-line parsing: split on `\n\n`, extract `data: ` prefix, `JSON.parse` each event; accumulate `text` events into the current assistant message; on `done` event, stop streaming. On error event, show error in the message list.
   - Render: scrollable messages area (auto-scroll to bottom on new tokens via `useEffect` + ref); user messages right-aligned in a rounded bubble; assistant messages left-aligned; streaming in-progress shows a cursor indicator.
   - Textarea input + Send button (disabled while streaming); Enter sends (Shift+Enter newline).
   - Auto-focus input on mount.

4. Rewrite `apps/admin/src/app/(dashboard)/monster/page.tsx` as an async server component:
   - Read `searchParams.c` for active conversation ID
   - Call `getConversations()` and (if `c` provided) `getMessages(c)`
   - Layout: two-column — left `<ConversationList>`, right `<ChatWindow initialMessages={messages} conversationId={c ?? null} />`
   - Wrap `ChatWindow` in a `Suspense` fallback for the messages load
   - Title: "Monster Chat"

5. Apply styling consistent with existing admin UI (shadcn cards, muted backgrounds). Message bubbles: user = `bg-primary text-primary-foreground`, assistant = `bg-muted`. Streaming cursor: blinking `|` appended to in-progress text.

6. Verify in browser: start admin dev server, navigate to `/monster`, send "Which sites do I have?", observe tokens streaming. Reload page, confirm conversation appears in list, click it, confirm messages restore.

## Must-Haves

- [ ] `page.tsx` is an async server component — not a client component
- [ ] `ChatWindow.tsx` has `'use client'` directive
- [ ] Streaming reader uses `response.body` ReadableStream (not EventSource — GET-only per D099)
- [ ] `X-Conversation-Id` header read to capture new conversation ID
- [ ] Tokens appear progressively in the assistant bubble before response completes
- [ ] User and assistant messages visually distinct
- [ ] Conversation list renders with real data from Supabase
- [ ] Clicking a conversation navigates to `?c=<id>` and restores messages
- [ ] Input auto-focuses on mount
- [ ] Error events from SSE stream displayed in chat (not swallowed)

## Verification

- Browser at `http://localhost:3004/monster`: type "Which sites do I have?" → text tokens stream into the assistant bubble before the response finishes → full response references real site names/count
- Reload page → conversation appears in left panel list
- Click the conversation → messages restore
- `pnpm --filter @monster/admin build` exits 0 (no type errors in new components)

## Inputs

- `apps/admin/src/app/api/monster/chat/route.ts` — the SSE endpoint (from T02)
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — existing "Coming soon" placeholder to overwrite
- Existing admin UI patterns (shadcn `Card`, `Button`, `Textarea`, `Badge`) from `apps/admin/src/components/ui/`
- `JobStatus.tsx` pattern for polling reference (though this slice uses streaming, not polling)

## Expected Output

- `apps/admin/src/app/(dashboard)/monster/actions.ts` — server actions for conversation CRUD
- `apps/admin/src/app/(dashboard)/monster/ConversationList.tsx` — sidebar conversation list
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` — streaming chat UI client component
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — rewritten server component page
- Streaming chat UI works in browser; slice UAT condition met

## Observability Impact

**New signals this task introduces:**
- Client-side SSE stream errors rendered as red error bubbles in the chat window — visible without inspecting logs
- `X-Conversation-Id` response header captured from fetch — propagates new conversation ID to client state (verifiable via browser Network tab or `curl -v`)

**How a future agent inspects this task:**
- **Conversation list data:** `SELECT id, title, updated_at FROM chat_conversations ORDER BY updated_at DESC LIMIT 20` — verifies the source for the sidebar list
- **Message restore:** `SELECT role, content FROM chat_messages WHERE conversation_id='<id>' ORDER BY created_at ASC` — verifies what the UI loads when navigating to `?c=<id>`
- **Streaming end-to-end:** `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"test","conversationId":null}'` → SSE `data:` events arrive before stream closes; `X-Conversation-Id` header present in response
- **Component boundaries:** `page.tsx` has no `'use client'` directive (async server component); `ChatWindow.tsx` has `'use client'` at line 1; `ConversationList.tsx` has no `'use client'` (server component)

**Failure state visibility:**
- SSE parse errors: `JSON.parse` failure logged to browser console with raw event text; non-fatal, stream continues
- Stream fetch errors: caught in `ChatWindow`, rendered as a red inline error message in the assistant bubble — never silently swallowed
- Missing conversation on page load: 404 from Route Handler on next send attempt; shown as error bubble in chat
- `deleteConversation` cascade: if FK cascade on `chat_messages` is not set, messages are deleted first explicitly — verify with `SELECT COUNT(*) FROM chat_messages WHERE conversation_id='<deleted-id>'` = 0 after delete
