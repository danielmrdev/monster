"use client";
/** Current content used to display a preview and pass score context. */

/**
 * SEO generation panel for individual products.
 *
 * Mirrors HomepageSeoPanel / CategorySeoPanel:
 * - useJobPoller for live status polling (2s interval)
 * - Phase-aware button labels: idle → enqueueing → pending → running → completed/failed
 * - Green success bar with content quality score + attempts
 * - router.refresh() on completion so the edit form reflects updated content
 * - Resumes in-progress job state on page navigation (onResume)
 */ /* Header */ /* Fields note */ /* Current content preview */ /* Status bar */ /* Action button */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { enqueueProductSeoFromPanel, getLatestSeoJobStatus } from "../seo/actions";
import { useJobPoller } from "../useJobPoller";

interface ProductSeoPanelProps {
  siteId: string;
  productId: string;
  currentScore?: number | null;
  currentContent?: {
    focus_keyword?: string | null;
    meta_description?: string | null;
    detailed_description?: string | null;
  };
}

type Phase = "idle" | "enqueueing" | "pending" | "running" | "completed" | "failed";
export function ProductSeoPanel({
  siteId,
  productId,
  currentScore,
  currentContent,
}: ProductSeoPanelProps) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [resultScore, setResultScore] = useState<number | null>(null);
  const [resultAttempts, setResultAttempts] = useState<number | null>(null);
  const [polling, setPolling] = useState(false);
  const [lastJob, setLastJob] = useState<{
    status: string;
    completed_at?: string | null;
    result?: unknown;
    error?: string | null;
  } | null>(null);

  const fetchStatus = useCallback(
    () => getLatestSeoJobStatus(siteId, "seo_product", productId),
    [siteId, productId],
  );

  useJobPoller({
    fetchFn: fetchStatus,
    enabled: polling,
    intervalMs: 2000,
    onResume: (job) => {
      if (!job) return false;
      setLastJob(job);
      if (job.status === "pending" || job.status === "running") {
        setPhase(job.status as Phase);
        setPolling(true);
        return true;
      }
      if (job.status === "completed") {
        setPhase("completed");
        const result = job.result as { score?: number; attempts?: number } | null;
        setResultScore(result?.score ?? null);
        setResultAttempts(result?.attempts ?? null);
      } else if (job.status === "failed") {
        setPhase("failed");
        setError(job.error ?? "Job failed");
      }
      return false;
    },
    onComplete: (job) => {
      setPolling(false);
      setPhase("completed");
      setLastJob(job);
      const result = job.result as { score?: number; attempts?: number } | null;
      setResultScore(result?.score ?? null);
      setResultAttempts(result?.attempts ?? null);
      router.refresh();
    },
    onFail: (job) => {
      setPolling(false);
      setPhase("failed");
      setLastJob(job);
      setError(job.error ?? "Job failed");
    },
  });

  async function handleGenerate() {
    setError(null);
    setResultScore(null);
    setResultAttempts(null);
    setPhase("enqueueing");

    const result = await enqueueProductSeoFromPanel(siteId, productId, {
      currentScore,
    });

    if (result.error) {
      setPhase("failed");
      setError(result.error);
      return;
    }

    setPhase("pending");
    setPolling(true);
  }

  const isActive = phase === "enqueueing" || phase === "pending" || phase === "running";
  const hasContent = !!(currentContent?.detailed_description || currentContent?.meta_description);

  const buttonLabel = (() => {
    if (phase === "enqueueing") return "Queuing…";
    if (phase === "pending") return "Waiting for worker…";
    if (phase === "running") return "Generating…";
    return hasContent ? "✦ Regenerate SEO Content" : "✦ Generate SEO Content";
  })();

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      {}
      <div>
        <p className="text-sm font-medium text-foreground">Generate with AI</p>
        {currentScore != null && (
          <p className="text-xs text-muted-foreground mt-0.5">
            Current content quality: <span className="font-mono">{currentScore}/100</span>
            {currentScore < 70
              ? " — AI will try to improve"
              : currentScore >= 80
                ? " — good"
                : " — acceptable"}
          </p>
        )}
      </div>

      {}
      <p className="text-xs text-muted-foreground">
        Generates: detailed description (320–400 words with H2s), pros &amp; cons, user opinions,
        meta description, and focus keyword.
      </p>

      {}
      {currentContent && (currentContent.focus_keyword || currentContent.meta_description) && (
        <div className="space-y-1 text-xs text-muted-foreground border-t border-border pt-2">
          {currentContent.focus_keyword && (
            <p className="truncate">
              <span className="font-medium text-foreground/60">Keyword: </span>
              {currentContent.focus_keyword}
            </p>
          )}
          {currentContent.meta_description && (
            <p className="truncate">
              <span className="font-medium text-foreground/60">Meta: </span>
              {currentContent.meta_description}
            </p>
          )}
        </div>
      )}

      {}
      {(phase === "pending" || phase === "running") && (
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
          {phase === "pending" ? "Waiting in queue…" : "AI generating content (up to 3 attempts)…"}
        </div>
      )}

      {phase === "completed" && (
        <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-400">
          <span>✓</span>
          <span>
            Content updated
            {resultScore != null && (
              <>
                {" "}
                — content quality: <span className="font-mono font-medium">{resultScore}/100</span>
              </>
            )}
            {resultAttempts != null && resultAttempts > 1 && (
              <span className="text-green-400/70"> ({resultAttempts} attempts)</span>
            )}
            {lastJob?.completed_at && (
              <span className="text-green-400/50 ml-1">
                · {new Date(lastJob.completed_at).toLocaleString()}
              </span>
            )}
          </span>
        </div>
      )}

      {phase === "failed" && error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400 font-mono break-all">
          {error}
          {lastJob?.completed_at && (
            <span className="block text-red-400/50 mt-1 font-sans">
              {new Date(lastJob.completed_at).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {}
      <div className="pt-1">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isActive}
          className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-500 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isActive && (
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
          )}
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
