/**
 * Analytics data layer — fetching and aggregation helpers.
 *
 * Architecture note: supabase-js REST does not support GROUP BY. All site-level
 * aggregation happens in application code (JS Array.reduce) after fetching minimal
 * columns. At Phase 1 volumes (<10k rows / 30 days) this is negligible.
 *
 * NOTE: fetching all rows for 30d works at Phase 1 volumes (<10k rows). If event
 * count exceeds 10k, add pagination (.range()) or switch aggregation to
 * analytics_daily rows instead of raw analytics_events rows.
 */

import type { Database } from '@monster/db';
import { createServiceClient } from '@/lib/supabase/service';

// ---------------------------------------------------------------------------
// Raw row types from generated Supabase types
// ---------------------------------------------------------------------------

type EventRow = Pick<
  Database['public']['Tables']['analytics_events']['Row'],
  'site_id' | 'event_type' | 'page_path' | 'visitor_hash'
>;

type DailyRow = Database['public']['Tables']['analytics_daily']['Row'];

type SiteRow = { id: string; name: string };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type DateRange = {
  start: string;
  end: string;
};

export type SiteMetrics = {
  siteId: string;
  siteName: string;
  pageviews: number;
  uniqueVisitors: number;
  affiliateClicks: number;
  topPages: Array<{ path: string; count: number }>;
};

export type AnalyticsData = {
  siteMetrics: SiteMetrics[];
  dailyRows: DailyRow[];
  totalPageviews: number;
  totalUniqueVisitors: number;
  totalAffiliateClicks: number;
};

// Re-export for consumers that need the raw row types
export type { DailyRow, EventRow, SiteRow };

// ---------------------------------------------------------------------------
// Date range helper
// ---------------------------------------------------------------------------

/**
 * Returns UTC ISO start/end strings for the requested range.
 * Unknown range values default to 7d.
 */
export function getDateRange(range: 'today' | '7d' | '30d' | string): DateRange {
  const now = new Date();

  if (range === 'today') {
    return {
      start: now.toISOString().slice(0, 10) + 'T00:00:00.000Z',
      end: now.toISOString(),
    };
  }

  if (range === '30d') {
    return {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      end: now.toISOString(),
    };
  }

  // Default: '7d' (also handles any unrecognised input)
  return {
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    end: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// In-memory aggregation
// ---------------------------------------------------------------------------

/**
 * Aggregates raw analytics_events rows into per-site metrics.
 *
 * D080 — visitor_hash is approximate (daily SHA-256 without IP); unique_visitors
 * is a lower bound, not exact. A user visiting on multiple days within the range
 * will produce one distinct hash per day, so the Set-based count may overcount
 * across days but undercount within days. Acceptable for Phase 1 dashboards.
 */
export function computeMetrics(events: EventRow[], sites: SiteRow[]): SiteMetrics[] {
  // Build a lookup map for site names
  const siteNameById = new Map<string, string>(sites.map((s) => [s.id, s.name]));

  // Collect all site IDs that appear in events (preserving insertion order)
  const siteIds = [...new Set(events.map((e) => e.site_id))];

  return siteIds.map((siteId) => {
    const siteEvents = events.filter((e) => e.site_id === siteId);

    const pageviewEvents = siteEvents.filter((e) => e.event_type === 'pageview');
    const pageviews = pageviewEvents.length;

    // Guard null visitor_hash before building the Set
    // D080 — visitor_hash is approximate (daily SHA-256 without IP); unique_visitors is a lower bound, not exact.
    const uniqueVisitors = new Set(
      siteEvents
        .filter((e) => e.visitor_hash != null)
        .map((e) => e.visitor_hash!)
    ).size;

    const affiliateClicks = siteEvents.filter(
      (e) => e.event_type === 'click_affiliate'
    ).length;

    // Top pages: aggregate pageview events by page_path, sort desc, take top 5
    const pagePathCounts = pageviewEvents.reduce<Record<string, number>>((acc, e) => {
      const path = e.page_path ?? '(unknown)';
      acc[path] = (acc[path] ?? 0) + 1;
      return acc;
    }, {});

    const topPages = Object.entries(pagePathCounts)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      siteId,
      siteName: siteNameById.get(siteId) ?? siteId,
      pageviews,
      uniqueVisitors,
      affiliateClicks,
      topPages,
    };
  });
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

/**
 * Fetches analytics data from Supabase and aggregates it in application code.
 *
 * @param siteId - Optional site filter. When undefined, all sites are included.
 * @param range  - Date range selector: 'today' | '7d' | '30d'. Defaults to '7d'.
 *
 * Throws descriptive errors on any DB failure — callers (Next.js server components)
 * let these propagate to the error boundary, which surfaces them in pm2/next logs.
 */
export async function fetchAnalyticsData(
  siteId: string | undefined,
  range: 'today' | '7d' | '30d' | string = '7d'
): Promise<AnalyticsData> {
  const supabase = createServiceClient();
  const dateRange = getDateRange(range);

  // Build analytics_events query — minimal columns only (no created_at needed for KPIs)
  // NOTE: fetching all rows for 30d works at Phase 1 volumes (<10k rows). If event
  // count exceeds 10k, add pagination (.range()) or switch aggregation to analytics_daily rows.
  let eventsQuery = supabase
    .from('analytics_events')
    .select('site_id, event_type, page_path, visitor_hash')
    .gte('created_at', dateRange.start)
    .lte('created_at', dateRange.end);

  if (siteId !== undefined) {
    eventsQuery = eventsQuery.eq('site_id', siteId);
  }

  // Build analytics_daily query
  let dailyQuery = supabase
    .from('analytics_daily')
    .select('*')
    .gte('date', dateRange.start.slice(0, 10))
    .lte('date', dateRange.end.slice(0, 10));

  if (siteId !== undefined) {
    dailyQuery = dailyQuery.eq('site_id', siteId);
  }

  // Fetch sites for name resolution — minimal columns
  const sitesQuery = supabase.from('sites').select('id, name');

  // Parallel fetch — fail fast on any error
  const [eventsResult, dailyResult, sitesResult] = await Promise.all([
    eventsQuery,
    dailyQuery,
    sitesQuery,
  ]);

  if (eventsResult.error) {
    throw new Error(`Failed to fetch analytics_events: ${eventsResult.error.message}`);
  }
  if (dailyResult.error) {
    throw new Error(`Failed to fetch analytics_daily: ${dailyResult.error.message}`);
  }
  if (sitesResult.error) {
    throw new Error(`Failed to fetch sites: ${sitesResult.error.message}`);
  }

  const events = eventsResult.data as EventRow[];
  const dailyRows = dailyResult.data as DailyRow[];
  const sites = sitesResult.data as SiteRow[];

  const siteMetrics = computeMetrics(events, sites);

  const totalPageviews = siteMetrics.reduce((sum, m) => sum + m.pageviews, 0);
  const totalUniqueVisitors = siteMetrics.reduce((sum, m) => sum + m.uniqueVisitors, 0);
  const totalAffiliateClicks = siteMetrics.reduce((sum, m) => sum + m.affiliateClicks, 0);

  return {
    siteMetrics,
    dailyRows,
    totalPageviews,
    totalUniqueVisitors,
    totalAffiliateClicks,
  };
}
