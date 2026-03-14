import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createServiceClient } from '@monster/db';
import { createRedisOptions, createAnalyticsAggregationQueue } from '../queue.js';

// ---------------------------------------------------------------------------
// AnalyticsAggregationPayload
// ---------------------------------------------------------------------------

export interface AnalyticsAggregationPayload {
  /**
   * ISO date string (YYYY-MM-DD) to aggregate, or the literal string 'yesterday'.
   * Defaults to yesterday UTC when undefined or 'yesterday'.
   */
  targetDate?: string;
}

// ---------------------------------------------------------------------------
// Internal accumulator type
// ---------------------------------------------------------------------------

interface AccumRow {
  pageviews: number;
  affiliateClicks: number;
  uniqueVisitors: Set<string>;
  topCountries: Record<string, number>;
  topReferrers: Record<string, number>;
}

// ---------------------------------------------------------------------------
// AnalyticsAggregationJob
//
// Aggregates analytics_events rows for a given UTC date into analytics_daily.
// One upsert row per (site_id, page_path) pair.
//
// Queue: 'analytics-aggregation'
// Scheduler: 'analytics-daily-aggregation' — fires at 02:00 UTC every day.
// ---------------------------------------------------------------------------

export class AnalyticsAggregationJob {
  /**
   * Creates a BullMQ Worker on queue 'analytics-aggregation'.
   * Returns the Worker so the caller can add it to the shutdown array.
   */
  register(): Worker {
    const connection = new Redis(createRedisOptions());

    const worker = new Worker<AnalyticsAggregationPayload>(
      'analytics-aggregation',
      handler,
      { connection },
    );

    worker.on('failed', (job, err) => {
      console.error(`[AnalyticsAggregationJob] Job ${job?.id} failed: ${err.message}`);
    });

    return worker;
  }

  /**
   * Registers (or updates) the daily 02:00 UTC repeat scheduler.
   * Uses upsertJobScheduler with a stable ID — idempotent on repeated calls.
   */
  async registerScheduler(): Promise<void> {
    const queue = createAnalyticsAggregationQueue();
    try {
      await queue.upsertJobScheduler(
        'analytics-daily-aggregation',
        { pattern: '0 2 * * *', tz: 'UTC' },
        { name: 'aggregate', data: {} },
      );
      console.log('[AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)');
    } finally {
      await queue.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Handler — runs inside the Worker process
// ---------------------------------------------------------------------------

async function handler(job: import('bullmq').Job<AnalyticsAggregationPayload>): Promise<void> {
  const supabase = createServiceClient();

  // Resolve target date
  const raw = job.data.targetDate;
  const targetDate =
    !raw || raw === 'yesterday'
      ? new Date(Date.now() - 86400000).toISOString().slice(0, 10)
      : raw;

  console.log(`[AnalyticsAggregationJob] running for date ${targetDate}`);

  const dayStart = `${targetDate}T00:00:00.000Z`;
  const dayEnd = `${targetDate}T23:59:59.999Z`;

  // Fetch all events for the target date
  const { data: events, error: fetchError } = await supabase
    .from('analytics_events')
    .select('site_id, event_type, page_path, referrer, visitor_hash')
    .gte('created_at', dayStart)
    .lte('created_at', dayEnd);

  if (fetchError) {
    console.error(`[AnalyticsAggregationJob] ERROR: fetch failed for date ${targetDate}: ${fetchError.message}`);
    throw new Error(`fetch analytics_events: ${fetchError.message}`);
  }

  const count = events?.length ?? 0;
  console.log(`[AnalyticsAggregationJob] fetched ${count} events for date ${targetDate}`);

  if (count === 0) {
    console.log(`[AnalyticsAggregationJob] no events for date ${targetDate} — skipping`);
    return;
  }

  // Aggregate in-memory grouped by (site_id, page_path)
  const accumMap = new Map<string, AccumRow>();

  for (const event of events!) {
    const siteId: string = event.site_id;
    const pagePath: string = event.page_path ?? '';
    const key = `${siteId}::${pagePath}`;

    if (!accumMap.has(key)) {
      accumMap.set(key, {
        pageviews: 0,
        affiliateClicks: 0,
        uniqueVisitors: new Set<string>(),
        topCountries: {},
        topReferrers: {},
      });
    }

    const row = accumMap.get(key)!;

    if (event.event_type === 'pageview') {
      row.pageviews += 1;
    } else if (event.event_type === 'click_affiliate') {
      row.affiliateClicks += 1;
    }

    if (event.visitor_hash != null) {
      row.uniqueVisitors.add(event.visitor_hash);
    }

    // Country: skip null/unknown to avoid noise in Phase 1 (all null)
    // When real country data arrives, store it.
    const country: string | null = (event as Record<string, unknown>)['country'] as string | null;
    if (country && country !== 'unknown') {
      row.topCountries[country] = (row.topCountries[country] ?? 0) + 1;
    }

    // Referrer: group by origin; skip empty/direct referrers
    const ref: string | null = event.referrer;
    if (ref) {
      let origin: string;
      try {
        origin = new URL(ref).origin;
      } catch {
        origin = ref;
      }
      if (origin) {
        row.topReferrers[origin] = (row.topReferrers[origin] ?? 0) + 1;
      }
    }
  }

  // Build upsert rows
  const upsertRows = Array.from(accumMap.entries()).map(([key, row]) => {
    const separatorIdx = key.indexOf('::');
    const siteId = key.slice(0, separatorIdx);
    const pagePath = key.slice(separatorIdx + 2);

    return {
      site_id: siteId,
      date: targetDate,
      page_path: pagePath,
      pageviews: row.pageviews,
      unique_visitors: row.uniqueVisitors.size,
      affiliate_clicks: row.affiliateClicks,
      top_countries: row.topCountries,    // {} when no country data (Phase 1)
      top_referrers: row.topReferrers,
    };
  });

  // Upsert into analytics_daily
  const { error: upsertError } = await supabase
    .from('analytics_daily')
    .upsert(upsertRows, { onConflict: 'site_id,date,page_path' });

  if (upsertError) {
    console.error(
      `[AnalyticsAggregationJob] ERROR: upsert failed for date ${targetDate} (${count} events): ${upsertError.message}`,
    );
    throw new Error(`upsert analytics_daily: ${upsertError.message}`);
  }

  console.log(
    `[AnalyticsAggregationJob] upserted ${upsertRows.length} rows for date ${targetDate}`,
  );
}
