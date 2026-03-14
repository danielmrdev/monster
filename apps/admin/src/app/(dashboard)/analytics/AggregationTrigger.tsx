'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { enqueueAnalyticsAggregation } from './actions'

/**
 * "Run Aggregation" button — enqueues an on-demand analytics aggregation job
 * for yesterday UTC. Displays inline status after the action resolves.
 *
 * Observability:
 *  - Success shows "Queued for YYYY-MM-DD" inline; job visible in BullMQ queue 'analytics-aggregation'
 *  - Failure shows "Error: <message>" inline; check Redis for failed jobs:
 *      KEYS bull:analytics-aggregation:failed:*
 *  - Worker logs: pm2 logs monster-worker --lines 20 | grep AnalyticsAggregationJob
 */
export function AggregationTrigger() {
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setStatus(null)
    startTransition(async () => {
      const result = await enqueueAnalyticsAggregation()
      if (result.ok) {
        setStatus({ ok: true, message: `Queued for ${result.date}` })
      } else {
        setStatus({ ok: false, message: `Error: ${result.error ?? 'Unknown error'}` })
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        className="whitespace-nowrap"
      >
        {isPending ? 'Queuing…' : 'Run Aggregation'}
      </Button>
      {status && (
        <p
          className={`text-xs ${status.ok ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {status.message}
        </p>
      )}
    </div>
  )
}
