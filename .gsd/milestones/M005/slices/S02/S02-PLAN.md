# S02: Analytics Dashboard

**Goal:** Replace the "Coming soon" analytics page with a real server-rendered dashboard showing visits, pageviews, affiliate clicks per site, top pages, and country breakdown — filterable by site and date range (today/7d/30d) — sourced from `analytics_events` (raw) and `analytics_daily` (aggregated).

**Demo:** Visit `/analytics` in the admin panel, select a site and date range, see real event counts from Supabase. `analytics_daily` section shows "No aggregated data yet" gracefully. Country breakdown shows "No country data in Phase 1" placeholder.

## Must-Haves

- `analytics/page.tsx` is a proper Next.js 15 server component that awaits `searchParams`
- `analytics_events` queried with `.gte/.lte` date filter; aggregated in app code (no GROUP BY)
- Per-site metrics: total pageviews, unique visitors (approximate), affiliate clicks
- Top pages list ordered by pageviews desc
- `analytics_daily` section handles empty table gracefully
- Country breakdown shows Phase 1 placeholder (country always null per D081)
- Filter form (site selector + date range) uses native `<form method="GET">` — both selects in same form
- All aggregation server-side; `AnalyticsFilters` is the only `'use client'` boundary
- `pnpm --filter @monster/admin build` exits 0; `pnpm --filter @monster/admin typecheck` exits 0

## Proof Level

- This slice proves: integration (real Supabase data rendered in admin panel)
- Real runtime required: yes (verify page renders with live Supabase data)
- Human/UAT required: yes (confirm counts match Supabase table editor)

## Verification

```bash
# Type check
pnpm --filter @monster/admin typecheck

# Production build
pnpm --filter @monster/admin build

# Runtime: admin panel running, navigate to /analytics
# - Page renders without error with default filter (7d, all sites)
# - Site selector and date range selector visible and functional
# - Counts are numeric (may be 0 if no events yet)
# - analytics_daily section shows graceful empty state
# - Country section shows Phase 1 placeholder
# - Switching date range / site filter updates the page

# Failure-path diagnostics:
# - Simulate a Supabase error: temporarily set SUPABASE_SERVICE_ROLE_KEY to an invalid value,
#   then navigate to /analytics — Next.js error boundary must render (not a silent blank page).
#   pm2 logs (or next dev stdout) must show the thrown error message from fetchAnalyticsData.
# - With a bad key, the thrown message should contain "Failed to fetch analytics_events:" followed
#   by the Supabase error detail — confirming errors are not silently swallowed.
# - Restore the correct key after the check.
```

## Observability / Diagnostics

- Runtime signals: Next.js server component errors surface in pm2 logs; Supabase query errors thrown and caught by Next.js error boundary
- Inspection surfaces: `/analytics` page in running admin panel; Supabase dashboard `analytics_events` table for ground truth
- Failure visibility: `throw new Error(\`Failed to fetch analytics_events: \${error.message}\`)` for DB errors; empty-state renders for 0 rows
- Redaction constraints: service role key never logged; only event counts and paths in UI

## Integration Closure

- Upstream surfaces consumed: `analytics_events` table (S01 produces rows); `analytics_daily` table (S03 will populate; S02 reads gracefully when empty); `createServiceClient()` from `@/lib/supabase/service`; `Database['public']['Tables']['analytics_events']['Row']` and `analytics_daily.Row` types from `@monster/db`
- New wiring introduced: `analytics/page.tsx` (server component + searchParams), `analytics/AnalyticsFilters.tsx` (client filter component)
- What remains before milestone is truly usable end-to-end: S03 (daily aggregation cron populates `analytics_daily`); human UAT confirming event rows match tracker posts

## Tasks

- [x] **T01: Analytics data fetching and aggregation helpers** `est:45m`
  - Why: The aggregation logic (fetch raw events, reduce to per-site metrics, derive top pages) must be correct and typed before the UI can consume it. Isolating it makes T02 straightforward and makes the logic reviewable independently.
  - Files: `apps/admin/src/app/(dashboard)/analytics/lib.ts`
  - Do: Write `computeAnalytics(events, sites)` function that takes raw `analytics_events` rows + sites list and returns typed per-site metrics (pageviews, unique_visitors, affiliate_clicks, top_pages[]). Write `getDateRange(range)` helper (today/7d/30d → ISO start/end strings). Write `fetchAnalyticsData(siteId, range)` that calls `createServiceClient()`, fetches minimal columns (`site_id, event_type, page_path, visitor_hash`), applies `.gte/.lte` filter, also fetches `analytics_daily` rows. Guard `visitor_hash` nulls. Add code comment on 10k row threshold per research constraint.
  - Verify: `pnpm --filter @monster/admin typecheck` exits 0 with the new file imported from page.tsx stub
  - Done when: typed helpers exported from `analytics/lib.ts`; no type errors

- [x] **T02: Analytics dashboard page and filter UI** `est:1h`
  - Why: Closes the slice — renders real data in the admin panel via the helpers from T01, adds the filter client component, handles all empty and Phase 1 states.
  - Files: `apps/admin/src/app/(dashboard)/analytics/page.tsx`, `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx`
  - Do: Replace stub `page.tsx` with an async server component: `interface Props { searchParams: Promise<{ site?: string; range?: string }> }`. Await searchParams, call `fetchAnalyticsData()`, pass results to pure rendering. Render: (1) KPI row — total pageviews, unique visitors, affiliate clicks across filtered scope; (2) per-site table — site name, pageviews, unique visitors, clicks, top page; (3) top pages section — page_path + pageview count ordered desc; (4) `analytics_daily` section — empty state "Aggregated data will appear after the daily cron runs" when 0 rows; (5) country section — "No country data in Phase 1" placeholder. Write `AnalyticsFilters.tsx` as `'use client'` with site selector + range selector inside a `<form method="GET">` (both selects in one form). Import Card, Table, Badge from existing shadcn components. Mark filter defaults: range=7d, no site filter = all sites.
  - Verify: `pnpm --filter @monster/admin build` exits 0; navigate to `/analytics` in running admin panel — page renders, filter controls visible, no console errors
  - Done when: `/analytics` renders real data (or graceful zero-state), filter controls work, build exits 0

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/analytics/page.tsx`
- `apps/admin/src/app/(dashboard)/analytics/lib.ts` (new)
- `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx` (new)
