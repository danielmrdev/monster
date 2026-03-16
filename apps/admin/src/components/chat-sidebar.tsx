'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { X, SendHorizonal } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
}

interface ChatSidebarProps {
  open: boolean;
  onClose: () => void;
  pageContext: string;
}

/**
 * Global chat sidebar panel.
 *
 * Lightweight standalone chat interface — does NOT depend on ChatWindow or
 * conversation history state. Renders a fresh ephemeral conversation per session.
 *
 * Page context is prepended to the first message in each new conversation
 * as a system hint: "[Context: Sites page]\n\n<user message>".
 * This is transparent to the user — only the actual message text is shown.
 *
 * D131: sidebar open/closed state managed by parent (DashboardShell) via localStorage.
 */
export function ChatSidebar({ open, onClose, pageContext }: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isFirstMessage, setIsFirstMessage] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus input when sidebar opens
  useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset conversation when sidebar is closed
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setMessages([]);
      setConversationId(null);
      setIsFirstMessage(true);
    }
  }, [open]);

  const sendMessage = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || isStreaming) return;

    setInputValue('');
    setIsStreaming(true);

    // Prepend page context to the first message of a conversation
    const apiMessage = isFirstMessage && pageContext
      ? `[Context: ${pageContext}]\n\n${text}`
      : text;

    if (isFirstMessage) setIsFirstMessage(false);

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: text },
      { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch('/api/monster/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: apiMessage, conversationId }),
        signal: abort.signal,
      });

      const newConvId = res.headers.get('X-Conversation-Id');
      if (newConvId && !conversationId) setConversationId(newConvId);

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

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          let event: { type: string; text?: string; error?: string };
          try {
            event = JSON.parse(raw);
          } catch {
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
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [inputValue, isStreaming, conversationId, pageContext, isFirstMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!open) return null;

  return (
    <aside className="w-[340px] shrink-0 flex flex-col h-full border-l border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-primary/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-foreground">Monster</span>
          {pageContext && (
            <span className="text-[11px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted/50">
              {pageContext}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/50"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 py-8">
            <p className="text-xs font-medium text-foreground">Ask Monster anything</p>
            <p className="text-xs text-muted-foreground">About your portfolio, sites, or get ideas.</p>
          </div>
        ) : (
          messages.map((msg) => (
            <SidebarMessageBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border px-3 py-3 shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask something…"
            disabled={isStreaming}
            rows={1}
            className="resize-none flex-1 min-h-[36px] max-h-[120px] field-sizing-content text-sm"
          />
          <Button
            onClick={sendMessage}
            disabled={isStreaming || !inputValue.trim()}
            size="sm"
            className="shrink-0 self-end h-9 w-9 p-0"
          >
            {isStreaming ? (
              <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            ) : (
              <SendHorizonal className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-0.5">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </aside>
  );
}

function SidebarMessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed break-words',
          isUser
            ? 'bg-primary text-primary-foreground rounded-tr-sm whitespace-pre-wrap'
            : message.isError
              ? 'bg-destructive/10 text-destructive border border-destructive/20 rounded-tl-sm whitespace-pre-wrap'
              : 'bg-muted text-foreground rounded-tl-sm',
        )}
      >
        {isUser || message.isError ? (
          message.content
        ) : (
          <>
            {message.content ? (
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  h1: ({ children }) => <h1 className="text-xs font-bold mb-1 mt-1.5">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xs font-bold mb-1 mt-1.5">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-xs font-semibold mb-0.5 mt-1">{children}</h3>,
                  code: ({ children }) => <code className="bg-black/30 rounded px-1 text-[11px] font-mono">{children}</code>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline">{children}</a>,
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : null}
            {message.isStreaming && !message.content && (
              <span className="text-muted-foreground italic text-[11px]">Thinking…</span>
            )}
          </>
        )}
        {message.isStreaming && message.content && (
          <span className="inline-block w-[2px] h-[0.9em] bg-current opacity-70 ml-0.5 align-middle animate-pulse" />
        )}
      </div>
    </div>
  );
}
