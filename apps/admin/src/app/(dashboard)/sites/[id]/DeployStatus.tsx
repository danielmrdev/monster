'use client';

import { useEffect, useState, useCallback, useTransition } from 'react';
import { getLatestDeployStatus } from './actions';

type DeployRow = Awaited<ReturnType<typeof getLatestDeployStatus>>;
type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

interface Props {
  siteId: string;
}

const BADGE: Record<JobStatus, { label: string; className: string }> = {
  pending:   { label: 'Pending',   className: 'bg-yellow-100 text-yellow-800' },
  running:   { label: 'Running…',  className: 'bg-blue-100 text-blue-700'    },
  completed: { label: 'Completed', className: 'bg-green-100 text-green-800'  },
  failed:    { label: 'Failed',    className: 'bg-red-100 text-red-800'      },
};

function fmt(ts: string | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

export default function DeployStatus({ siteId }: Props) {
  const [job, setJob] = useState<DeployRow>(null);
  const [, startTransition] = useTransition();

  const poll = useCallback(() => {
    startTransition(async () => {
      const data = await getLatestDeployStatus(siteId);
      setJob(data);
    });
  }, [siteId]);

  useEffect(() => {
    poll();
  }, [poll]);

  useEffect(() => {
    const status = job?.status as JobStatus | undefined;
    if (!status || status === 'completed' || status === 'failed') return;

    // Poll every 5 seconds while pending or running
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [job?.status, poll]);

  if (!job) {
    return (
      <p className="text-sm text-gray-400 mt-2">No deploy jobs yet.</p>
    );
  }

  const status = job.status as JobStatus;
  const badge = BADGE[status] ?? { label: status, className: 'bg-gray-100 text-gray-700' };

  // payload.phase and progress tracking for running jobs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = job.payload as Record<string, any> | null;
  const phase = payload?.phase as string | undefined;
  const done = payload?.done as number | undefined;
  const total = payload?.total as number | undefined;

  return (
    <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-700">Last deploy:</span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>
      {/* Phase progress — visible while job is running, surfaces rsync/caddy/cloudflare steps */}
      {status === 'running' && phase && (
        <div className="text-blue-700 text-xs font-medium">
          Phase: {phase}
          {done !== undefined && total !== undefined ? ` (${done}/${total})` : ''}
        </div>
      )}
      <div className="text-gray-500">
        <span className="font-medium">Started:</span> {fmt(job.started_at)}
      </div>
      <div className="text-gray-500">
        <span className="font-medium">Completed:</span> {fmt(job.completed_at)}
      </div>
      {status === 'failed' && job.error && (
        <div className="text-red-600 text-xs font-mono break-all">{job.error}</div>
      )}
    </div>
  );
}
