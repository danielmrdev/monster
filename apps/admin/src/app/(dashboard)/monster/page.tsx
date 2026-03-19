import { Suspense } from "react";
import { getConversations, getMessages } from "./actions";
import { ConversationList } from "./ConversationList";
import { ChatWindow } from "./ChatWindow";

export const dynamic = "force-dynamic";

interface MonsterPageProps {
  searchParams: Promise<{ c?: string }>;
}

/**
 * Monster Chat page — async server component.
 *
 * Layout: two-column sidebar + main.
 * Left: ConversationList (conversation history, server-rendered).
 * Right: ChatWindow (streaming SSE client component).
 *
 * ?c=<id> activates a specific conversation and loads its messages.
 */
export default async function MonsterPage({ searchParams }: MonsterPageProps) {
  const params = await searchParams;
  const activeId = typeof params.c === "string" && params.c ? params.c : undefined;

  // Parallel fetch: conversation list + messages (if conversation active)
  const [conversations, messages] = await Promise.all([
    getConversations(),
    activeId ? getMessages(activeId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex -m-8 overflow-hidden h-screen">
      {/* Sidebar */}
      <ConversationList conversations={conversations} activeId={activeId} />

      {/* Chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          }
        >
          <ChatWindow initialMessages={messages} conversationId={activeId ?? null} />
        </Suspense>
      </div>
    </div>
  );
}
