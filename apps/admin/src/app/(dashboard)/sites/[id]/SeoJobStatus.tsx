"use client"

// Poll on mount

// Continue polling while pending/running; stop after 10s in terminal state

// Extract score/attempts/totalProcessed from result JSON

import { useEffect, useState, useCallback, useTransition } from "react"
import { getLatestSeoJobStatus } from "./seo/actions"

type SeoJobRow = Awaited<ReturnType<typeof getLatestSeoJobStatus>>
type JobStatus = "pending" | "running" | "completed" | "failed"

interface Props {
  siteId: string
  jobType: "seo_homepage" | "seo_category" | "seo_product" | "seo_products_batch"
  entityId?: string
  compact?: boolean
}

const BADGE: Record<JobStatus, { label: string className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-100 text-yellow-800" },
  running: { label: "Running…", className: "bg-blue-100 text-blue-700" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  failed: { label: "Failed", className: "bg-red-100 text-red-800" },
}

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—"
  return new Date(ts).toLocaleString()
}

export default function SeoJobStatus({
  siteId,
  jobType,
  entityId,
  compact,
}: Props) {
  const [job, setJob] = useState<SeoJobRow>(null)
  const [, startTransition] = useTransition()

  const poll = useCallback(() => {
    startTransition(async () => {
      const data = await getLatestSeoJobStatus(siteId, jobType, entityId)
      setJob(data)
    })
  }, [siteId, jobType, entityId])
  useEffect(() => {
    poll()
  }, [poll])
  useEffect(() => {
    const status = job?.status as JobStatus | undefined
    if (
      status ===
        "completed" ||
      status ===
        "failed"
    ) {
      const completedAt = job?.completed_at
        ? new Date(job.completed_at).getTime()
        : 0
      if (Date.now() - completedAt > 10_000) return
    }
    const id = setInterval(poll, 5000)
    return () => clearInterval(id)
  }, [job?.status, job?.completed_at, poll])

  if (!job) {
    if (compact) return null
    return (
      <p className="text-sm text-muted-foreground/70 mt-2">No SEO jobs yet.</p>
    )
  }

  const status = job.status as JobStatus
  const badge = BADGE[status] ?? {
    label: status,
    className: "bg-muted/50 text-foreground/80",
  }
  const result = job.result as {
    score?: number
    attempts?: number
    totalProcessed?: number
  } | null
  const score = result?.score
  const attempts = result?.attempts
  const totalProcessed = result?.totalProcessed

  if (compact) {
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}
        title={
          status === "completed" && score != null
            ? `Content quality (markdown): ${score}/100 — not comparable to the table's page score. Attempts: ${attempts ?? 1}`
            : undefined
        }
      >
        {badge.label}
        {status === "completed" && score != null && (
          <span
            className="ml-1 opacity-75"
            title="Content quality score of the raw markdown"
          >
            · cq:{score}
          </span>
        )}
      </span>
    )
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground/80">Last SEO job:</span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
        >
          {badge.label}
        </span>
        {status === "completed" && score != null && (
          <span
            className="text-xs text-muted-foreground"
            title="Content quality score of the raw markdown — not comparable to the SEO table's page score"
          >
            content quality: {score}
            {attempts != null && `, attempts: ${attempts}`}
          </span>
        )}
        {status === "completed" && totalProcessed != null && (
          <span className="text-xs text-muted-foreground">
            {totalProcessed} processed
          </span>
        )}
      </div>
      <div className="text-muted-foreground text-xs">
        <span className="font-medium">Started:</span> {fmt(job.started_at)}
      </div>
      {job.completed_at && (
        <div className="text-muted-foreground text-xs">
          <span className="font-medium">Completed:</span>{" "}
          {fmt(job.completed_at)}
        </div>
      )}
      {status === "failed" && job.error && (
        <div className="text-red-600 text-xs font-mono break-all mt-1">
          {job.error}
        </div>
      )}
    </div>
  )
}
