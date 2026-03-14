import { query } from '@anthropic-ai/claude-agent-sdk';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'done'; sessionId: string }
  | { type: 'error'; error: string };

export interface StreamOptions {
  conversationId: string;
  agentSessionId?: string | null;
  mcpServer?: McpSdkServerConfigWithInstance;
}

/**
 * Thin async-iterable wrapper around the Agent SDK query().
 *
 * D100 compliance: uses string prompt. The async generator form would require
 * constructing full SDKUserMessage objects (type/message/parent_tool_use_id/session_id),
 * which is not exposed by the SDK's public types. MCP tools are registered via
 * options.mcpServers regardless of prompt form — the model calls them as needed.
 *
 * Signals:
 *   [claude-sdk] turn start sessionId=<id|new>
 *   [claude-sdk] turn done sessionId=<id> isError=<bool>
 *   [claude-sdk] error conversationId=<id>: <message>
 */
export class ClaudeSDKClient {
  async *streamQuery(
    message: string,
    opts: StreamOptions,
  ): AsyncIterable<StreamEvent> {
    console.log(`[claude-sdk] turn start sessionId=${opts.agentSessionId ?? 'new'}`);

    const mcpServers: Record<string, McpSdkServerConfigWithInstance> = {};
    if (opts.mcpServer) {
      mcpServers['monster'] = opts.mcpServer;
    }

    try {
      const sdkQuery = query({
        prompt: message,
        options: {
          resume: opts.agentSessionId ?? undefined,
          mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
          includePartialMessages: true,
          // Disable built-in tools (filesystem, bash, etc.) — Monster uses only MCP tools
          tools: [],
          permissionMode: 'bypassPermissions',
          allowDangerouslySkipPermissions: true,
          persistSession: true,
        },
      });

      for await (const msg of sdkQuery) {
        if (msg.type === 'stream_event') {
          const event = msg.event;
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            yield { type: 'text', text: event.delta.text };
          }
        } else if (msg.type === 'result') {
          const sessionId = msg.session_id;
          console.log(
            `[claude-sdk] turn done sessionId=${sessionId} isError=${msg.is_error}`,
          );
          yield { type: 'done', sessionId };
          return;
        }
      }

      // Iterator exhausted without result message
      console.warn('[claude-sdk] iterator exhausted without result message');
      yield { type: 'done', sessionId: '' };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[claude-sdk] error conversationId=${opts.conversationId}:`, error);
      yield { type: 'error', error };
    }
  }
}
