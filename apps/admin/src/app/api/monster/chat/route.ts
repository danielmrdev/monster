import { type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { ClaudeSDKClient, createMonsterMcpServer } from "@monster/agents";

/**
 * POST /api/monster/chat
 *
 * SSE streaming bridge: browser → Agent SDK → MCP tools → browser.
 * Persists conversation + messages in Supabase. Handles session resume.
 *
 * D099: Returns ReadableStream with Content-Type: text/event-stream
 * D103: agent_session_id stored in chat_conversations after first turn for resume
 *
 * Signals: [monster/chat] conversation=<id> turn start/complete
 */
export async function POST(req: NextRequest) {
  // 1. Parse + validate body
  let body: { message?: unknown; conversationId?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;

  if (!message) {
    return new Response(JSON.stringify({ error: "message is required and must be non-empty" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createServiceClient();

  // 2. Conversation setup
  let activeConversationId: string;
  let existingSessionId: string | null = null;

  if (!conversationId) {
    // New conversation — create a row
    const title = message.length > 50 ? message.slice(0, 50) : message;
    const { data, error } = await supabase
      .from("chat_conversations")
      .insert({ title })
      .select("id, agent_session_id")
      .single();

    if (error || !data) {
      console.error("[monster/chat] failed to create conversation:", error?.message);
      return new Response(JSON.stringify({ error: "Failed to create conversation" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    activeConversationId = data.id;
    existingSessionId = data.agent_session_id ?? null;
  } else {
    // Resume existing conversation — fetch agent_session_id
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("id, agent_session_id")
      .eq("id", conversationId)
      .single();

    if (error || !data) {
      console.error("[monster/chat] conversation not found:", conversationId, error?.message);
      return new Response(JSON.stringify({ error: "Conversation not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    activeConversationId = data.id;
    existingSessionId = data.agent_session_id ?? null;
  }

  // 3. Persist user message before streaming starts
  const { error: msgError } = await supabase.from("chat_messages").insert({
    conversation_id: activeConversationId,
    role: "user",
    content: message,
  });

  if (msgError) {
    console.error("[monster/chat] failed to persist user message:", msgError.message);
    // Non-fatal — continue streaming even if persistence fails
  }

  console.log(`[monster/chat] conversation=${activeConversationId} turn start`);

  // 4. Build SSE ReadableStream
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let closed = false;
      const send = (event: object) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Client disconnected — controller already closed
          closed = true;
        }
      };

      try {
        const client = new ClaudeSDKClient();
        let fullText = "";
        let finalSessionId: string | null = null;

        for await (const event of client.streamQuery(message, {
          conversationId: activeConversationId,
          agentSessionId: existingSessionId,
          mcpServer: createMonsterMcpServer(supabase),
        })) {
          send(event);

          if (event.type === "text") {
            fullText += event.text;
          } else if (event.type === "done") {
            finalSessionId = event.sessionId || null;
          }
        }

        // Post-stream: persist assistant message
        if (fullText) {
          const { error: assistantMsgError } = await supabase.from("chat_messages").insert({
            conversation_id: activeConversationId,
            role: "assistant",
            content: fullText,
          });

          if (assistantMsgError) {
            console.error(
              "[monster/chat] failed to persist assistant message:",
              assistantMsgError.message,
            );
          }
        }

        // Update agent_session_id for future resume
        if (finalSessionId) {
          const { error: updateError } = await supabase
            .from("chat_conversations")
            .update({
              agent_session_id: finalSessionId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", activeConversationId);

          if (updateError) {
            console.error("[monster/chat] failed to update agent_session_id:", updateError.message);
          }
        }

        console.log(`[monster/chat] conversation=${activeConversationId} turn complete`);
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(
          `[monster/chat] conversation=${activeConversationId} unhandled error:`,
          errorMsg,
        );
        send({ type: "error", error: errorMsg });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  // 5. Return SSE response with conversation ID header
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Conversation-Id": activeConversationId,
    },
  });
}
