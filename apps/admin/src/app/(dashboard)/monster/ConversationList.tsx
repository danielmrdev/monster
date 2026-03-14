import Link from 'next/link';
import { cn } from '@/lib/utils';

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ConversationListProps {
  conversations: ConversationRow[];
  activeId?: string;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Server component: conversation sidebar list.
 * Each item links to /monster?c=<id>. Active item is highlighted.
 * "New conversation" button at top links to /monster (no query param).
 */
export function ConversationList({ conversations, activeId }: ConversationListProps) {
  return (
    <aside className="w-[260px] shrink-0 flex flex-col border-r border-border bg-background h-full overflow-hidden">
      {/* Header */}
      <div className="px-3 py-3 border-b border-border">
        <Link
          href="/monster"
          className={cn(
            'flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm font-medium transition-colors',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New conversation
        </Link>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {conversations.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground">No conversations yet.</p>
        ) : (
          <ul className="space-y-0.5 px-2">
            {conversations.map((conv) => {
              const isActive = conv.id === activeId;
              const label = conv.title?.trim() || 'Untitled conversation';
              return (
                <li key={conv.id}>
                  <Link
                    href={`/monster?c=${conv.id}`}
                    className={cn(
                      'flex flex-col gap-0.5 w-full rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                    title={label}
                  >
                    <span className="truncate leading-snug">{label}</span>
                    <span className="text-[10px] opacity-60 tabular-nums">
                      {formatRelativeTime(conv.updated_at)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
