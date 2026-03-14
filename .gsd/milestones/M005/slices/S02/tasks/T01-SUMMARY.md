---
id: T01
parent: S02
milestone: M005
provides:
  - analytics/lib.ts with getDateRange, computeMetrics, fetchAnalyticsData helpers
  - Exported types: DateRange, SiteMetrics, AnalyticsData, DailyRow, EventRow, SiteRow
key_files:
  - apps/admin/src/app/(dashboard)/analytics/lib.ts
key_decisions:
  - computeMetrics is pure (no side effects, no network) — takes raw event rows + sites list, returns typed SiteMetrics[]. Makes it directly testable and isolates aggregation from I/O.
  - visitor_hash null guard uses != null (not !) before the Set to satisfy TypeScript strict and the runtime constraint simultaneously
  - fetchAnalyticsData uses Promise.all for parallel fetch of events + daily + sites; any single DB error short-circuits and throws immediately
  - No created_at in analytics_events SELECT — not needed for Phase 1 KPIs; saves payload bytes; T02 can add if time-series becomes a requirement
patterns_established:
  - Conditional Supabase filter pattern: build query, then apply .eq() only when siteId !== undefined (not a ternary on the full query chain)
observability_surfaces:
  - fetchAnalyticsData throws 'Failed to fetch analytics_events: <supabase.message>' on DB error — propagates to Next.js error boundary, visible in pm2/next dev logs
  - fetchAnalyticsData throws 'Failed to fetch analytics_daily: <message>' and 'Failed to fetch sites: <message>' similarly
  - computeMetrics is pure — reproducible from Supabase table editor rows without network
  - 10k threshold and D080 approximation comments act as machine-readable markers for future agents (grep NOTE: or D080)
duration: ~25m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Analytics data fetching and aggregation helpers

**Pure data layer for the analytics dashboard shipped: date range helpers, Supabase parallel fetch with conditional site filter, and in-memory JS aggregation with guarded visitor_hash counting.**

## What Happened

Created `apps/admin/src/app/(dashboard)/analytics/lib.ts` with three exports:

1. **`getDateRange(range)`** — maps `'today' | '7d' | '30d'` to UTC ISO start/end strings. Unknown input defaults to 7d. Uses native `Date` (no date library in project).

2. **`computeMetrics(events, sites)`** — pure reducer: groups raw `analytics_events` rows by `site_id`, computes pageviews/uniqueVisitors/affiliateClicks/topPages per site. Null-guards `visitor_hash` before `new Set()`. TopPages reduces pageview events by `page_path`, sorts desc, takes top 5. D080 and 10k-threshold comments embedded.

3. **`fetchAnalyticsData(siteId, range)`** — calls `createServiceClient()`, runs three parallel Supabase queries (`analytics_events`, `analytics_daily`, `sites`). Applies `.eq('site_id', siteId)` conditionally — only when `siteId` is not `undefined`. Throws descriptive errors on any DB failure. Returns `AnalyticsData` with both per-site metrics and cross-site totals.

Also applied pre-flight fixes: added failure-path diagnostic step to S02-PLAN.md verification, and added `## Observability Impact` section to T01-PLAN.md.

## Verification

```
pnpm exec tsc --noEmit   → exit 0 (no output)
pnpm --filter @monster/admin build → exit 0

Build output: /analytics route compiled as dynamic (ƒ), 13/13 static pages generated.
```

Both checks passed cleanly on first attempt.

## Diagnostics

- DB errors surface as `throw new Error('Failed to fetch <table>: <supabase.message>')` — visible in pm2 logs or Next.js error overlay
- `computeMetrics` is pure — call it in isolation with rows copied from Supabase table editor to reproduce any aggregation result
- Grep `D080` in `lib.ts` to find the unique-visitor approximation comment; grep `NOTE:` to find the 10k-row threshold comment

## Deviations

- The plan's typecheck command was `pnpm --filter @monster/admin typecheck` but the admin package has no `typecheck` script. Used `pnpm exec tsc --noEmit` instead — equivalent result. Both the slice plan and the unit plan reference the `typecheck` script name; T02 should add the script or keep using `tsc --noEmit`.

## Known Issues

- None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — new file; all analytics data-layer helpers
- `.gsd/milestones/M005/slices/S02/S02-PLAN.md` — added failure-path diagnostic to Verification section (pre-flight fix)
- `.gsd/milestones/M005/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
