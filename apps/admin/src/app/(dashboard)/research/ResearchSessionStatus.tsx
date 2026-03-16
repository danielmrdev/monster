'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { getResearchSessionStatus } from './actions';

type SessionStatus = 'pending' | 'running' | 'completed' | 'failed';

interface ProgressEntry {
  turn: number;
  phase: string;
  summary: string;
  timestamp?: string;
}

interface Props {
  sessionId: string;
  initialStatus: string;
}

const BADGE: Record<SessionStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-800' },
  running:   { label: 'Running…',  className: 'bg-blue-100 text-blue-700'    },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800'  },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800'      },
};

function isTerminal(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

function parseProgress(raw: unknown): ProgressEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is ProgressEntry =>
      typeof e === 'object' && e !== null && 'turn' in e && 'summary' in e,
    )
    .sort((a, b) => b.turn - a.turn); // newest first
}

function fmt(ts?: string): string {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString();
}

export default function ResearchSessionStatus({ sessionId, initialStatus }: Props) {
  const [status, setStatus] = useState<string>(initialStatus);
  const [progress, setProgress] = useState<ProgressEntry[]>([]);
  const [report, setReport] = useState<unknown>(null);
  const [, startTransition] = useTransition();

  const poll = useCallback(() => {
    startTransition(async () => {
      const data = await getResearchSessionStatus(sessionId);
      if (!data) return;
      setStatus(data.status);
      setProgress(parseProgress(data.progress));
      if (data.report) setReport(data.report);
    });
  }, [sessionId]);

  // Initial fetch
  useEffect(() => {
    poll();
  }, [poll]);

  // Polling loop — stops automatically on terminal status
  useEffect(() => {
    if (isTerminal(status)) return;
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [status, poll]);

  const s = (status as SessionStatus) in BADGE ? (status as SessionStatus) : 'pending';
  const badge = BADGE[s];

  const lastFailedEntry = status === 'failed' ? progress[0] : null;

  return (
    <div className="space-y-4">
      {/* Status badge row */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
        {!isTerminal(status) && (
          <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        )}
      </div>

      {/* Completion message */}
      {status === 'completed' && (
        <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          ✓ Research complete — report ready for viewing in S03
        </div>
      )}

      {/* Failed message */}
      {status === 'failed' && lastFailedEntry && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">Error:</span> {lastFailedEntry.summary}
        </div>
      )}

      {/* Progress log */}
      {progress.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Progress log
          </h4>
          <ol className="space-y-1.5">
            {progress.map((entry) => (
              <li
                key={entry.turn}
                className="flex items-start gap-3 text-sm text-foreground/80"
              >
                <span className="mt-0.5 flex-shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-muted/50 text-xs font-mono text-muted-foreground">
                  {entry.turn}
                </span>
                <span className="flex-1">
                  <span className="text-muted-foreground text-xs mr-1.5">{entry.phase}</span>
                  {entry.summary}
                </span>
                {entry.timestamp && (
                  <span className="flex-shrink-0 text-xs text-muted-foreground/70">{fmt(entry.timestamp)}</span>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Pending/running placeholder when no progress yet */}
      {!isTerminal(status) && progress.length === 0 && (
        <p className="text-sm text-muted-foreground/70">Waiting for agent to start…</p>
      )}

      {/* Raw report JSON — collapsed, S03 will render properly */}
      {status === 'completed' && report != null && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Raw report JSON
          </summary>
          <pre className="mt-2 rounded-md bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(report, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
