---
estimated_steps: 4
estimated_files: 1
---

# T01: Analytics data fetching and aggregation helpers

**Slice:** S02 — Analytics Dashboard
**Milestone:** M005

## Description

Write the pure data layer for the analytics dashboard: date range helpers, Supabase fetch, and in-app JS aggregation. No UI in this task — just correctly typed, testable helpers that T02 consumes.

The key constraint: supabase-js has no GROUP BY. Fetch minimal columns (`site_id, event_type, page_path, visitor_hash`) for the selected date range and reduce in application code. At Phase 1 volumes this is negligible. Add a comment documenting the 10k row threshold where pagination or a switch to `analytics_daily` becomes warranted.

## Steps

1. Create `apps/admin/src/app/(dashboard)/analytics/lib.ts`. Define types: `DateRange` (`{ start: string; end: string }`), `SiteMetrics` (`{ siteId: string; siteName: string; pageviews: number; uniqueVisitors: number; affiliateClicks: number; topPages: Array<{ path: string; count: number }> }`), `AnalyticsData` (`{ siteMetrics: SiteMetrics[]; dailyRows: DailyRow[]; totalPageviews: number; totalUniqueVisitors: number; totalAffiliateClicks: number }`). Use `Database['public']['Tables']['analytics_events']['Row']` and `analytics_daily.Row` from `@monster/db` for raw row types.

2. Write `getDateRange(range: 'today' | '7d' | '30d'): DateRange`. Today: start = midnight UTC today (`new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z'`), end = `new Date().toISOString()`. 7d: start = `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()`. 30d: start = `new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()`. Default (unknown input) → 7d.

3. Write `computeMetrics(events: EventRow[], sites: SiteRow[]): SiteMetrics[]`. Group by `site_id`. For each group: pageviews = filter `event_type === 'pageview'`, length; uniqueVisitors = `new Set(events.filter(e => e.visitor_hash).map(e => e.visitor_hash!)).size`; affiliateClicks = filter `event_type === 'click_affiliate'`, length; topPages = reduce pageview rows by `page_path`, sort desc, take top 5. Guard null `visitor_hash`. Add comment: "D080 — visitor_hash is approximate (daily SHA-256 without IP); unique_visitors is a lower bound, not exact." Add comment: "NOTE: fetching all rows for 30d works at Phase 1 volumes (<10k rows). If event count exceeds 10k, add pagination (.range()) or switch aggregation to analytics_daily rows."

4. Write `fetchAnalyticsData(siteId: string | undefined, range: 'today' | '7d' | '30d'): Promise<AnalyticsData>`. Use `createServiceClient()`. Build events query: `supabase.from('analytics_events').select('site_id, event_type, page_path, visitor_hash').gte('created_at', dateRange.start).lte('created_at', dateRange.end)` — conditionally add `.eq('site_id', siteId)` only when `siteId` is defined. Throw on error. Also fetch `analytics_daily` rows for the date range (and optional site filter). Fetch sites list (`id, name`) for name resolution. Compute totals across all sites from the aggregated metrics array. Return full `AnalyticsData`.

## Must-Haves

- [ ] `getDateRange` handles `'today'`, `'7d'`, `'30d'`, and unknown input (default 7d)
- [ ] `computeMetrics` guards null `visitor_hash` before `new Set()`
- [ ] `fetchAnalyticsData` applies `.eq('site_id', siteId)` conditionally — not when siteId is undefined
- [ ] Both DB errors throw with descriptive message (not silently swallowed)
- [ ] 10k row threshold documented in comment
- [ ] D080 unique visitor approximation documented in comment
- [ ] No `created_at` in the events SELECT (not needed for KPIs per research — save payload bytes). Exception: include it if T02 needs it for time-series; omit if not.
- [ ] Types fully exported from `lib.ts` for use in `page.tsx` and `AnalyticsFilters.tsx`

## Verification

```bash
# Type check the admin app — catches type errors in lib.ts
pnpm --filter @monster/admin typecheck
# Must exit 0

# Quick import sanity — temporarily import lib.ts from page.tsx stub, build, remove
pnpm --filter @monster/admin build
# Must exit 0
```

## Observability Impact

- **New signals:** `fetchAnalyticsData` throws `Error('Failed to fetch analytics_events: <supabase message>')` and `Error('Failed to fetch analytics_daily: <message>')` and `Error('Failed to fetch sites: <message>')` on DB failure — these propagate to Next.js error boundaries and appear verbatim in pm2/next dev logs, making failures immediately visible and attributable to the right query.
- **Inspection surface:** A future agent can reproduce any aggregation by calling `computeMetrics(events, sites)` in isolation with raw rows from the Supabase table editor — the function is pure (no side effects, no network calls).
- **Failure state:** If `fetchAnalyticsData` fails mid-flight (e.g. one query errors), the thrown error short-circuits `Promise.all` and surfaces to the caller. No partial-success silent state.
- **Key observability comment in code:** The 10k-row threshold comment and D080 unique-visitor approximation comment are machine-readable by future agents scanning for `NOTE:` and `D080` markers.

## Inputs

- `packages/db/src/types/supabase.ts` — `Database['public']['Tables']['analytics_events']['Row']` and `analytics_daily.Row` typed row shapes
- `apps/admin/src/lib/supabase/service.ts` — `createServiceClient()` import
- S02-RESEARCH.md — constraints: no GROUP BY, guard visitor_hash nulls, conditional siteId filter, 10k threshold, D080/D081

## Expected Output

- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — exported helpers: `getDateRange`, `fetchAnalyticsData`, `computeMetrics`; exported types: `SiteMetrics`, `AnalyticsData`, `DateRange`
