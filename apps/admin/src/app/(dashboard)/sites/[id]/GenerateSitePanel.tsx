"use client";
// keep currentJob updated for phase/progress display

// Extract progress from job payload

// Detect running from polled job (between pending enqueue and first worker tick)
/* Action button */ /* Running — phase + progress bar */ /* Pending — waiting for worker */ /* Completed */ /* Failed */

import { useState, useCallback } from "react";
import { enqueueSiteGeneration, getLatestJobStatus } from "./actions";
import { useJobPoller } from "./useJobPoller";

interface GenerateSitePanelProps {
  siteId: string;
  domain?: string | null;
}

const PHASE_LABEL: Record<string, string> = {
  fetch_products: "Fetching products",
  process_images: "Processing images",
  generate_content: "Generating content",
  astro_build: "Building site",
  seo_files: "Writing SEO files",
  deploy: "Deploying",
};

type Phase = "idle" | "enqueueing" | "pending" | "running" | "completed" | "failed";

type JobRow = Awaited<ReturnType<typeof getLatestJobStatus>>;

export function GenerateSitePanel({ siteId, domain }: GenerateSitePanelProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<JobRow>(null);
  const [polling, setPolling] = useState(false);

  const fetchStatus = useCallback(async () => {
    const job = await getLatestJobStatus(siteId);
    setCurrentJob(job);
    return job;
  }, [siteId]);

  useJobPoller({
    fetchFn: fetchStatus,
    enabled: polling,
    intervalMs: 2000,
    onResume: (job) => {
      if (!job) return false;
      if (job.status === "pending" || job.status === "running") {
        setPhase(job.status as Phase);
        setCurrentJob(job as JobRow);
        setPolling(true);
        return true;
      }
      if (job.status === "completed") {
        setPhase("completed");
        setCurrentJob(job as JobRow);
      } else if (job.status === "failed") {
        setPhase("failed");
        setError((job as { error?: string | null }).error ?? "Job failed");
        setCurrentJob(job as JobRow);
      }
      return false;
    },
    onComplete: (job) => {
      setPolling(false);
      setPhase("completed");
      setCurrentJob(job as JobRow);
    },
    onFail: (job) => {
      setPolling(false);
      setPhase("failed");
      setError((job as { error?: string | null }).error ?? "Job failed");
      setCurrentJob(job as JobRow);
    },
  });

  async function handleGenerate() {
    setError(null);
    setPhase("enqueueing");

    const result = await enqueueSiteGeneration(siteId);
    if (result.error) {
      setPhase("failed");
      setError(result.error);
      return;
    }

    setPhase("pending");
    setPolling(true);
  }

  const isActive = phase === "enqueueing" || phase === "pending" || phase === "running";
  const payload = currentJob?.payload as {
    phase?: string;
    done?: number;
    total?: number;
  } | null;
  const jobPhase = payload?.phase;
  const done = payload?.done;
  const total = payload?.total;
  const hasProgress = typeof done === "number" && typeof total === "number" && total > 0;
  const pct = hasProgress ? Math.round((done! / total!) * 100) : null;
  if (currentJob?.status === "running" && phase === "pending") {
    setPhase("running");
  }

  return (
    <div className="space-y-3">
      {}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isActive}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isActive ? (
          <>
            <svg
              className="animate-spin h-3.5 w-3.5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {phase === "enqueueing"
              ? "Queuing…"
              : phase === "pending"
                ? "Waiting for worker…"
                : "Generating…"}
          </>
        ) : (
          "Generate Site"
        )}
      </button>

      {}
      {phase === "running" && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-blue-400">
            <svg
              className="animate-spin h-3.5 w-3.5 shrink-0"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>{jobPhase ? (PHASE_LABEL[jobPhase] ?? jobPhase) : "Processing…"}</span>
            {hasProgress && (
              <span className="ml-auto font-mono">
                {done}/{total} ({pct}%)
              </span>
            )}
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

      {}
      {phase === "pending" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <svg
            className="animate-spin h-3.5 w-3.5 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Waiting in queue…
        </div>
      )}

      {}
      {phase === "completed" && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-400">
          <span>
            ✓ Site generated successfully
            {currentJob?.completed_at && (
              <span className="text-green-400/50 ml-1">
                · {new Date(currentJob.completed_at).toLocaleString()}
              </span>
            )}
          </span>
          {domain && (
            <a
              href={`https://${domain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-green-300 transition-colors"
            >
              Visit site ↗
            </a>
          )}
        </div>
      )}

      {}
      {phase === "failed" && error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 font-mono break-all">
          {error}
          {currentJob?.completed_at && (
            <span className="block text-red-400/50 mt-1 font-sans">
              {new Date(currentJob.completed_at).toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
