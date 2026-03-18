import Link from 'next/link';
import { getResearchSessions, getResearchSessionStatus } from './actions';
import ResearchForm from './ResearchForm';
import ResearchSessionStatus from './ResearchSessionStatus';
import ResearchReportViewer from './ResearchReportViewer';
import { ResearchReportSchema } from '@monster/shared';
import { SpaceshipClient } from '@monster/domains';
import DomainManagement from '@/app/(dashboard)/sites/[id]/DomainManagement';

export const dynamic = 'force-dynamic'

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

  // ── Completed session: resolve domains + parse report ─────────────────────
  // Only runs when the selected session is completed.
  // Domain checks use Promise.allSettled — a single Spaceship error never crashes the page.
  let resolvedReport: Awaited<ReturnType<typeof renderCompletedSession>> | null = null;

  if (activeSession?.status === 'completed') {
    resolvedReport = await renderCompletedSession(activeSession.report);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Research Lab</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Submit a niche idea to start an autonomous AI research session.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* Left: form + active session status / completed report */}
        <div className="space-y-6">
          {/* Submission form */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">New Research Session</h2>
            <ResearchForm />
          </div>

          {/* Domain Management — availability check without site context */}
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="text-base font-semibold mb-4">Domain Management</h2>
            <DomainManagement />
          </div>

          {/* Active session: completed → full report; running/pending/failed → polling UI */}
          {activeSessionId && (
            <div className="rounded-lg border bg-card p-6 shadow-sm">
              {activeSession?.status === 'completed' && resolvedReport ? (
                <>
                  <h2 className="text-base font-semibold mb-4">Research Report</h2>
                  {resolvedReport.type === 'ok' ? (
                    <ResearchReportViewer
                      report={resolvedReport.report}
                      domains={resolvedReport.domains}
                    />
                  ) : (
                    /* Parse-failure graceful fallback */
                    <div className="space-y-3">
                      <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                        <span className="font-semibold">Report parse error:</span>{' '}
                        The stored report could not be validated.{' '}
                        {resolvedReport.zodIssues && (
                          <span className="font-mono text-xs">
                            {resolvedReport.zodIssues}
                          </span>
                        )}
                      </div>
                      <details>
                        <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                          Raw report JSON
                        </summary>
                        <pre className="mt-2 rounded-md bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
                          {JSON.stringify(resolvedReport.raw, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}
                </>
              ) : (
                <>
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
                </>
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

// ---------------------------------------------------------------------------
// renderCompletedSession
//
// Validates the raw report JSON and resolves domain availability.
// Isolated as a named function so the main component body stays readable.
//
// Returns a discriminated union:
//   { type: 'ok', report, domains }         — parsed successfully
//   { type: 'parse_error', raw, zodIssues } — schema validation failed
//
// Domain checks: Promise.allSettled ensures a single Spaceship error never
// causes this function to throw. Failed checks map to available: null.
// Observability: SpaceshipClient logs "[SpaceshipClient] checkAvailability: domain=..." per call.
// ---------------------------------------------------------------------------
type CompletedResult =
  | { type: 'ok'; report: import('@monster/shared').ResearchReport; domains: { domain: string; available: boolean | null; price?: string }[] }
  | { type: 'parse_error'; raw: unknown; zodIssues: string | null };

async function renderCompletedSession(rawReport: unknown): Promise<CompletedResult> {
  const parsed = ResearchReportSchema.safeParse(rawReport);

  if (!parsed.success) {
    const zodIssues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return { type: 'parse_error', raw: rawReport, zodIssues: zodIssues || null };
  }

  const report = parsed.data;
  const client = new SpaceshipClient();

  // Resolve availability for each suggested domain — errors → available: null
  const domainResults = await Promise.allSettled(
    report.domain_suggestions.map((s) => client.checkAvailability(s.domain)),
  );

  const domains = report.domain_suggestions.map((s, i) => {
    const result = domainResults[i];
    if (result.status === 'fulfilled') {
      return { domain: s.domain, available: result.value.available, price: result.value.price };
    }
    // Rejected: Spaceship error — render as "Unknown"
    return { domain: s.domain, available: null as null };
  });

  return { type: 'ok', report, domains };
}
