'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface MessageRow {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
}

interface ChatWindowProps {
  initialMessages: MessageRow[];
  conversationId: string | null;
}

function toMessages(rows: MessageRow[]): Message[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role === 'user' ? 'user' : 'assistant',
    content: r.content,
  }));
}

/**
 * Streaming chat window. Client component.
 *
 * SSE bridge: fetch POST /api/monster/chat → read response.body as ReadableStream
 * → TextDecoderStream → line-by-line `data: {...}` parsing → accumulate text tokens.
 *
 * D099: Uses fetch + response.body (not EventSource — GET-only).
 * D103: X-Conversation-Id header read to capture new conversation ID after first turn.
 *
 * Observability:
 *  - SSE parse errors: logged to browser console with raw event text
 *  - Stream fetch/network errors: rendered as red error bubble in message list
 *  - X-Conversation-Id: visible in browser Network tab > Response Headers
 */
export function ChatWindow({ initialMessages, conversationId: initialConversationId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>(toMessages(initialMessages));
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Re-initialise when navigating to a different conversation (server re-renders props)
  useEffect(() => {
    setMessages(toMessages(initialMessages));
    setConversationId(initialConversationId);
  }, [initialConversationId, initialMessages]);

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue('');
    setIsStreaming(true);

    // Optimistically add user message
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
    ]);

    // Placeholder for streaming assistant message
    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/monster/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, conversationId }),
        signal: abort.signal,
      });

      // Capture new conversation ID from header
      const newConvId = res.headers.get('X-Conversation-Id');
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
        // Update URL without navigation to preserve state
        window.history.replaceState(null, '', `/monster?c=${newConvId}`);
      }

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `Error: ${errText}`, isStreaming: false, isError: true }
              : m,
          ),
        );
        return;
      }

      // Read SSE stream from response.body
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        // SSE events are separated by double newline
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;

          const raw = line.slice(6); // strip "data: "
          let event: { type: string; text?: string; error?: string; sessionId?: string };
          try {
            event = JSON.parse(raw);
          } catch (e) {
            console.error('[monster/chat] SSE parse error, raw:', raw, e);
            continue;
          }

          if (event.type === 'text' && event.text) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + event.text }
                  : m,
              ),
            );
          } else if (event.type === 'done') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId ? { ...m, isStreaming: false } : m,
              ),
            );
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      content: m.content
                        ? `${m.content}\n\n⚠️ ${event.error}`
                        : `⚠️ ${event.error ?? 'Unknown error'}`,
                      isStreaming: false,
                      isError: true,
                    }
                  : m,
              ),
            );
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const msg = e instanceof Error ? e.message : String(e);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ ${msg}`, isStreaming: false, isError: true }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
      // Re-focus input after response
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [inputValue, isStreaming, conversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-primary"
                aria-hidden
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Monster Chat</p>
              <p className="text-xs text-muted-foreground mt-1">
                Ask about your portfolio, sites, performance, or get content ideas.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Monster anything about your portfolio…"
            disabled={isStreaming}
            rows={1}
            className="resize-none flex-1 min-h-[40px] max-h-[160px] field-sizing-content"
          />
          <Button
            onClick={sendMessage}
            disabled={isStreaming || !inputValue.trim()}
            size="default"
            className="shrink-0 self-end h-10"
          >
            {isStreaming ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Thinking
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                Send
              </span>
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-0.5">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 mr-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
            aria-hidden
          >
            <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        </div>
      )}
      <div
        className={cn(
          'max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm'
            : message.isError
              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm'
              : 'bg-muted text-foreground rounded-tl-sm',
        )}
      >
        {message.content}
        {message.isStreaming && (
          <span className="inline-block w-[2px] h-[1em] bg-current opacity-70 ml-0.5 align-middle animate-pulse" />
        )}
        {message.isStreaming && !message.content && (
          <span className="text-muted-foreground italic text-xs">Thinking…</span>
        )}
      </div>
    </div>
  );
}
