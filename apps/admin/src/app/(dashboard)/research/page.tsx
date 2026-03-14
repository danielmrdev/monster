import Link from 'next/link';
import { getResearchSessions, getResearchSessionStatus } from './actions';
import ResearchForm from './ResearchForm';
import ResearchSessionStatus from './ResearchSessionStatus';

interface ResearchPageProps {
  searchParams: Promise<{ session?: string }>;
}

type SessionStatus = 'pending' | 'running' | 'completed' | 'failed';

const BADGE: Record<SessionStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-800' },
  running:   { label: 'Running…',  className: 'bg-blue-100 text-blue-700'    },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800'  },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800'      },
};

function formatRelativeTime(isoString: string): string {
  const diffSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSeconds < 60) return 'Just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export default async function ResearchPage({ searchParams }: ResearchPageProps) {
  const { session: activeSessionId } = await searchParams;

  // Parallel fetch: session list + active session status (if any)
  const [sessions, activeSession] = await Promise.all([
    getResearchSessions(),
    activeSessionId ? getResearchSessionStatus(activeSessionId) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Research Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit a niche idea to start an autonomous AI research session.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Left: form + active session status */}
        <div className="space-y-6">
          {/* Submission form */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">New Research Session</h2>
            <ResearchForm />
          </div>

          {/* Active session status */}
          {activeSessionId && (
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold mb-4">Session Status</h2>
              {activeSession ? (
                <ResearchSessionStatus
                  sessionId={activeSessionId}
                  initialStatus={activeSession.status}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Session not found. It may have been deleted.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Right: recent sessions list */}
        <div className="rounded-lg border bg-card shadow-sm">
          <div className="px-6 py-4 border-b">
            <h2 className="text-base font-semibold">Recent Sessions</h2>
          </div>
          {sessions.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">
              No research sessions yet. Submit a niche idea to get started.
            </p>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => {
                const isActive = s.id === activeSessionId;
                const statusKey = (s.status as SessionStatus) in BADGE
                  ? (s.status as SessionStatus)
                  : 'pending';
                const badge = BADGE[statusKey];

                return (
                  <li key={s.id}>
                    <Link
                      href={`/research?session=${s.id}`}
                      className={`block px-6 py-4 hover:bg-muted/50 transition-colors ${
                        isActive ? 'bg-muted/70' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {s.niche_idea ?? '—'}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {s.market ?? '—'} · {formatRelativeTime(s.created_at)}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      {isActive && (
                        <p className="text-xs text-blue-600 mt-1.5">← Viewing this session</p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
