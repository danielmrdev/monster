'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { getLatestJobStatus } from './actions';

type JobRow = Awaited<ReturnType<typeof getLatestJobStatus>>;
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface Props {
  siteId: string;
  pollTrigger?: number;
}

const BADGE: Record<JobStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-800' },
  running:   { label: 'Running…',  className: 'bg-blue-100 text-blue-700'    },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800'  },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800'      },
};

const PHASE_LABEL: Record<string, string> = {
  fetch_products:   'Fetching products',
  process_images:   'Processing images',
  generate_content: 'Generating content',
  astro_build:      'Building site',
  seo_files:        'Writing SEO files',
  deploy:           'Deploying',
};

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function JobStatus({ siteId, pollTrigger }: Props) {
  const [job, setJob] = useState<JobRow>(null);
  const [, startTransition] = useTransition();

  const poll = useCallback(() => {
    startTransition(async () => {
      const data = await getLatestJobStatus(siteId);
      setJob(data);
    });
  }, [siteId]);

  // Poll on mount and whenever pollTrigger changes (button clicked)
  useEffect(() => {
    poll();
  }, [poll, pollTrigger]);

  useEffect(() => {
    const status = job?.status as JobStatus | undefined;
    // Always poll while running/pending, but also poll when completed/failed
    // to catch a new job that may have been enqueued after the last terminal state.
    // Stop only when status is terminal AND the job was completed > 10s ago.
    if (status === 'completed' || status === 'failed') {
      const completedAt = job?.completed_at ? new Date(job.completed_at).getTime() : 0;
      if (Date.now() - completedAt > 10_000) return;
    }

    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [job?.status, job?.completed_at, poll]);

  if (!job) {
    return (
      <p className="text-sm text-muted-foreground/70 mt-2">No generation jobs yet.</p>
    );
  }

  const status = job.status as JobStatus;
  const badge = BADGE[status] ?? { label: status, className: 'bg-muted/50 text-foreground/80' };

  // Extract phase/progress from payload
  const payload = job.payload as { phase?: string; done?: number; total?: number } | null;
  const phase = payload?.phase;
  const done = payload?.done;
  const total = payload?.total;
  const hasProgress = typeof done === 'number' && typeof total === 'number' && total > 0;
  const pct = hasProgress ? Math.round((done! / total!) * 100) : null;

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground/80">Last job:</span>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {status === 'running' && phase && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{PHASE_LABEL[phase] ?? phase}</span>
            {hasProgress && <span>{done}/{total} ({pct}%)</span>}
          </div>
          {hasProgress && (
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      )}

      <div className="text-muted-foreground text-xs">
        <span className="font-medium">Started:</span> {fmt(job.started_at)}
      </div>
      {job.completed_at && (
        <div className="text-muted-foreground text-xs">
          <span className="font-medium">Completed:</span> {fmt(job.completed_at)}
        </div>
      )}
      {status === 'failed' && job.error && (
        <div className="text-red-600 text-xs font-mono break-all mt-1">{job.error}</div>
      )}
    </div>
  );
}
