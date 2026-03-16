'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { enqueueProductRefresh } from './actions'

interface RefreshCardProps {
  siteId: string
  lastRefreshedAt: string | null
}

function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return 'Never refreshed'
  const diffSeconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)
  if (diffSeconds < 60) return 'Just now'
  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

/**
 * Product Refresh card — shows last_refreshed_at and a "Refresh Now" button.
 *
 * Observability:
 *  - Success: job appears in BullMQ 'product-refresh' queue; router.refresh() re-fetches
 *    sites.last_refreshed_at from DB, updating the displayed timestamp.
 *  - Pending: button disabled + spinner; user sees "Refreshing…" label.
 *  - Error: inline error message; check pm2 logs monster-worker for [ProductRefreshJob] lines.
 *  - "Refresh queued" badge auto-hides after 3s to avoid stale positive feedback.
 */
export function RefreshCard({ siteId, lastRefreshedAt }: RefreshCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)

  // Auto-clear the success message after 3 seconds
  useEffect(() => {
    if (status?.ok) {
      const timer = setTimeout(() => setStatus(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [status])

  function handleRefresh() {
    setStatus(null)
    startTransition(async () => {
      const result = await enqueueProductRefresh(siteId)
      if (result.ok) {
        setStatus({ ok: true, message: 'Refresh queued' })
        router.refresh()
      } else {
        setStatus({ ok: false, message: result.error ?? 'Unknown error' })
      }
    })
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-foreground/80">
          <span className="font-medium">Last refreshed:</span>{' '}
          {formatRelativeTime(lastRefreshedAt)}
        </p>
        {lastRefreshedAt && (
          <p className="text-xs text-muted-foreground/70 mt-0.5">
            {new Date(lastRefreshedAt).toLocaleString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {status && (
          <p className={`text-xs ${status.ok ? 'text-green-600' : 'text-red-600'}`}>
            {status.message}
          </p>
        )}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending && (
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
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
          {isPending ? 'Refreshing…' : 'Refresh Now'}
        </button>
      </div>
    </div>
  )
}
