'use server';

import { analyticsAggregationQueue } from '@monster/agents';

/**
 * Enqueue an on-demand analytics aggregation job.
 * Targets yesterday UTC by default; pass an explicit ISO date string (YYYY-MM-DD) to override.
 *
 * Observability:
 *  - Job appears in BullMQ queue 'analytics-aggregation' — inspect via Redis:
 *      KEYS bull:analytics-aggregation:*
 *  - Worker picks it up and logs:
 *      [AnalyticsAggregationJob] running for date YYYY-MM-DD
 *      [AnalyticsAggregationJob] upserted R rows for date YYYY-MM-DD
 *  - Completed jobs removed (removeOnComplete: true); failed jobs persist (removeOnFail: false):
 *      KEYS bull:analytics-aggregation:failed:*
 *  - pm2 logs: pm2 logs monster-worker --lines 20 | grep AnalyticsAggregationJob
 */
export async function enqueueAnalyticsAggregation(
  targetDate?: string,
): Promise<{ ok: boolean; jobId?: string; date?: string; error?: string }> {
  const date = targetDate ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  try {
    const queue = analyticsAggregationQueue();
    const job = await queue.add(
      'run-now',
      { targetDate: date },
      { removeOnComplete: true, removeOnFail: false },
    );
    return { ok: true, jobId: job.id ?? undefined, date };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, date, error: message };
  }
}
