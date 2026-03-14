---
estimated_steps: 6
estimated_files: 2
---

# T02: `/api/monster/chat` Route Handler — SSE streaming bridge + conversation persistence

**Slice:** S01 — Monster Chat — Streaming Agent + MCP Portfolio Tools
**Milestone:** M007

## Description

The hardest risk item in the slice. This Route Handler bridges the Agent SDK's async iterator to a browser-readable SSE stream, persists conversations and messages in Supabase, and handles session resume for multi-turn conversations.

Key constraints:
- D099: Route Handler returns `new Response(stream, { 'Content-Type': 'text/event-stream' })` — not WebSockets, not server actions
- D100: prompt passed to Agent SDK **must** be async generator (ClaudeSDKClient handles this internally — Route Handler just passes the message string)
- D103: `agent_session_id` from the SDK response stored in `chat_conversations` after first turn for subsequent resume
- The admin Next.js server must not try to bundle the Agent SDK — `serverExternalPackages` in next.config handles this (done in T01)

## Steps

1. Create directory `apps/admin/src/app/api/monster/chat/` and write `route.ts` with a `POST` export.

2. Parse request body: `const { message, conversationId } = await req.json()`. Validate both fields — return 400 if `message` is empty.

3. Conversation setup:
   - If no `conversationId`: insert a new row into `chat_conversations` with a generated title (first 50 chars of message or "New conversation"). Capture the returned `id` and `agent_session_id` (null on first turn).
   - If `conversationId` provided: fetch the row to get `agent_session_id` for session resume.
   
4. Persist the user message: insert into `chat_messages` with `{ conversation_id, role: 'user', content: message }`.

5. Build the SSE `ReadableStream`:
   ```typescript
   const stream = new ReadableStream({
     async start(controller) {
       const enc = new TextEncoder();
       const send = (event: object) =>
         controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
       try {
         const client = new ClaudeSDKClient();
         let fullText = '';
         let finalSessionId: string | null = null;
         for await (const event of client.streamQuery(message, {
           conversationId: activeConversationId,
           agentSessionId: existingSessionId,
           mcpServer: createMonsterMcpServer(supabase),
         })) {
           send(event);
           if (event.type === 'text') fullText += event.text;
           if (event.type === 'done') finalSessionId = event.sessionId;
         }
         // Post-stream: persist assistant message + update session ID
         await supabase.from('chat_messages').insert({
           conversation_id: activeConversationId,
           role: 'assistant',
           content: fullText,
         });
         if (finalSessionId) {
           await supabase.from('chat_conversations').update({
             agent_session_id: finalSessionId,
             updated_at: new Date().toISOString(),
           }).eq('id', activeConversationId);
         }
       } catch (e) {
         send({ type: 'error', error: (e as Error).message });
       } finally {
         controller.close();
       }
     },
   });
   ```

6. Return: `new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Conversation-Id': activeConversationId } })`. Include `X-Conversation-Id` so the client can retrieve the created conversation ID on first turn without parsing SSE events.

   Log: `console.log('[monster/chat] conversation=${activeConversationId} turn start')` at the top; `console.log('[monster/chat] conversation=${activeConversationId} turn complete')` after the loop.

## Must-Haves

- [ ] POST handler at `apps/admin/src/app/api/monster/chat/route.ts`
- [ ] Creates new `chat_conversations` row when no `conversationId` provided
- [ ] Fetches existing row's `agent_session_id` for session resume
- [ ] User message persisted to `chat_messages` before streaming starts
- [ ] Assistant message persisted to `chat_messages` after streaming completes
- [ ] `agent_session_id` updated in `chat_conversations` after first turn
- [ ] SSE format: each event is `data: ${JSON.stringify(event)}\n\n`
- [ ] Error events streamed back to client (not swallowed)
- [ ] `X-Conversation-Id` response header included for new conversations
- [ ] `Content-Type: text/event-stream` + `Cache-Control: no-cache` headers

## Verification

- Start admin dev server: `pnpm --filter @monster/admin dev`
- `curl -N -X POST http://localhost:3004/api/monster/chat -H "Content-Type: application/json" -d '{"message":"How many sites do I have?","conversationId":null}'` → outputs multiple `data:` lines; final line is `data: {"type":"done",...}`
- Check Supabase: `chat_conversations` has a new row; `chat_messages` has 2 rows (user + assistant) for that conversation; `agent_session_id` is non-null in the conversation row
- Second request with the returned `conversationId`: response continues the same conversation (session resumed)
- `pnpm --filter @monster/admin build` exits 0

## Observability Impact

- Signals added: `[monster/chat] conversation=<id> turn start/complete` in Next.js server logs
- How a future agent inspects: pm2 logs for `monster-admin` process; `X-Conversation-Id` header in curl response; direct Supabase query for rows
- Failure state exposed: errors streamed as `data: {"type":"error","error":"..."}` — client sees failure instead of silent hang; `chat_messages` row count verifies both turns persisted

## Inputs

- `packages/agents/src/clients/claude-sdk.ts` — ClaudeSDKClient (from T01)
- `packages/agents/src/mcp/monster-server.ts` — createMonsterMcpServer (from T01)
- `apps/admin/src/lib/supabase/service.ts` — service client factory
- `packages/db/src/types/supabase.ts` — chat_conversations + chat_messages types including agent_session_id (from T01)
- D099, D100, D103 — routing, prompt form, session ID decisions

## Expected Output

- `apps/admin/src/app/api/monster/chat/route.ts` — working SSE Route Handler
- Streaming curl test passes
- DB: `chat_conversations` and `chat_messages` populated; `agent_session_id` non-null
