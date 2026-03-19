"use client"
// Refresh server component data so fields update without a manual reload
/* Header */ /* Field toggles */ /* Current content preview */ /* Status bar */ /* Action button */

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { enqueueHomepageSeo, getLatestSeoJobStatus } from "./seo/actions"
import { useJobPoller } from "./useJobPoller"

type HomepageField = "meta_description" | "intro" | "seo_text"

interface HomepageSeoProps {
  siteId: string
  currentContent?: {
    focus_keyword?: string | null
    meta_description?: string | null
    intro?: string | null
    seo_text?: string | null
  }
  currentScore?: number | null
}

const FIELD_LABELS: Record<HomepageField, string> = {
  meta_description: "Meta Description",
  intro: "Intro",
  seo_text: "SEO Text",
}

const ALL_FIELDS: HomepageField[] = ["meta_description", "intro", "seo_text"]

type Phase = "idle" | "enqueueing" | "pending" | "running" | "completed" | "failed"

export function HomepageSeoPanel({
  siteId,
  currentContent,
  currentScore,
}: HomepageSeoProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<HomepageField>>(
    new Set(ALL_FIELDS),
  )
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [resultScore, setResultScore] = useState<number | null>(null)
  const [resultAttempts, setResultAttempts] = useState<number | null>(null)
  const [polling, setPolling] = useState(false)
  const [lastJob, setLastJob] = useState<{
    status: string
    completed_at?: string | null
    result?: unknown
    error?: string | null
  } | null>(null)

  function toggle(field: HomepageField) {
    if (
      phase ===
        "enqueueing" ||
      phase ===
        "pending" ||
      phase ===
        "running"
    )
      return
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(field) ? next.delete(field) : next.add(field)
      return next
    })
  }

  const fetchStatus = useCallback(
    () => getLatestSeoJobStatus(siteId, "seo_homepage"),
    [siteId],
  )

  useJobPoller({
    fetchFn: fetchStatus,
    enabled: polling,
    intervalMs: 2000,
    onResume: (job) => {
      if (!job) return false
      setLastJob(job)
      if (
        job.status ===
          "pending" ||
        job.status ===
          "running"
      ) {
        setPhase(job.status)
        setPolling(true)
        return true
      }
      if (
        job.status ===
        "completed"
      ) {
        setPhase("completed")
        const result = job.result as { score?: number attempts?: number } | null
        setResultScore(
          result?.score ??
            null,
        )
        setResultAttempts(
          result?.attempts ??
            null,
        )
      } else if (
        job.status ===
        "failed"
      ) {
        setPhase("failed")
        setError(
          job.error ??
            "Job failed",
        )
      }
      return false
    },
    onComplete: (job) => {
      setPolling(false)
      setPhase("completed")
      setLastJob(job)
      const result = job.result as { score?: number attempts?: number } | null
      setResultScore(
        result?.score ??
          null,
      )
      setResultAttempts(
        result?.attempts ??
          null,
      )
      router.refresh()
    },
    onFail: (job) => {
      setPolling(false)
      setPhase("failed")
      setLastJob(job)
      setError(job.error ?? "Job failed")
    },
  })

  async function handleGenerate() {
    if (selected.size === 0) return
    setError(null)
    setResultScore(null)
    setResultAttempts(null)
    setPhase("enqueueing")

    const fields = ALL_FIELDS.every((f) => selected.has(f))
      ? undefined
      : ALL_FIELDS.filter((f) => selected.has(f))

    const result = await enqueueHomepageSeo(siteId, {
      fields,
      currentContent,
      currentScore,
    })

    if (result.error) {
      setPhase("failed")
      setError(result.error)
      return
    }

    setPhase("pending")
    setPolling(true)
  }

  const isActive =
    phase === "enqueueing" || phase === "pending" || phase === "running"
  const buttonLabel = (() => {
    if (phase === "enqueueing") return "Queuing…"
    if (phase === "pending") return "Waiting for worker…"
    if (phase === "running") return "Generating…"
    const n = selected.size
    if (n === ALL_FIELDS.length) return "✦ Generate All"
    if (n === 1) return `✦ Generate ${FIELD_LABELS[[...selected][0]]}`
    return `✦ Generate ${n} fields`
  })()

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 space-y-3">
      {}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">
            Generate with AI
          </p>
          {currentScore != null && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Current content quality:{" "}
              <span className="font-mono">{currentScore}/100</span>
              {currentScore < 70
                ? " — AI will try to improve"
                : currentScore >= 80
                  ? " — good"
                  : " — acceptable"}
            </p>
          )}
        </div>
      </div>

      {}
      <div className="flex flex-wrap gap-2">
        {ALL_FIELDS.map((field) => (
          <button
            key={field}
            type="button"
            onClick={() => toggle(field)}
            disabled={isActive}
            className={[
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-xs font-medium transition-colors",
              selected.has(field)
                ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                : "border-border bg-transparent text-muted-foreground hover:text-foreground",
              isActive ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
          >
            <span
              className={selected.has(field) ? "opacity-100" : "opacity-30"}
            >
              ✓
            </span>
            {FIELD_LABELS[field]}
          </button>
        ))}
      </div>

      {}
      {currentContent &&
        (currentContent.meta_description || currentContent.intro) && (
          <div className="space-y-1 text-xs text-muted-foreground border-t border-border pt-2">
            {currentContent.meta_description && (
              <p className="truncate">
                <span className="font-medium text-foreground/60">Meta: </span>
                {currentContent.meta_description}
              </p>
            )}
            {currentContent.intro && (
              <p className="truncate">
                <span className="font-medium text-foreground/60">Intro: </span>
                {currentContent.intro}
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
          {phase === "pending"
            ? "Waiting in queue…"
            : "AI generating content (up to 3 attempts)…"}
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
                — content quality:{" "}
                <span className="font-mono font-medium">{resultScore}/100</span>
              </>
            )}
            {resultAttempts != null && resultAttempts > 1 && (
              <span className="text-green-400/70">
                {" "}
                ({resultAttempts} attempts)
              </span>
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
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isActive || selected.size === 0}
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
        {selected.size === 0 && !isActive && (
          <p className="text-xs text-muted-foreground">
            Select at least one field
          </p>
        )}
      </div>
    </div>
  )
}
