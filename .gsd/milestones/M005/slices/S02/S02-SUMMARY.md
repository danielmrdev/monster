---
id: S02
parent: M005
milestone: M005
provides:
  - apps/admin/src/app/(dashboard)/analytics/lib.ts — getDateRange, computeMetrics, fetchAnalyticsData helpers + exported types
  - apps/admin/src/app/(dashboard)/analytics/page.tsx — full async server-component dashboard replacing "Coming soon" stub
  - apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx — 'use client' filter with native <form method="GET">
requires:
  - slice: S01
    provides: analytics_events table with real rows; createServiceClient pattern; @monster/db types for analytics_events/analytics_daily
affects:
  - S03: aggregation cron will populate analytics_daily; S02 already handles empty-state gracefully
key_files:
  - apps/admin/src/app/(dashboard)/analytics/lib.ts
  - apps/admin/src/app/(dashboard)/analytics/page.tsx
  - apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx
key_decisions:
  - computeMetrics is pure (no network, no side effects) — takes raw event rows + sites list, returns SiteMetrics[]. Aggregation is entirely in-memory JS; supabase-js REST has no GROUP BY.
  - fetchAnalyticsData uses Promise.all for parallel fetch (events + daily + sites); any DB error short-circuits and throws immediately — propagates to Next.js error boundary
  - Conditional Supabase filter: build query first, then apply .eq('site_id', siteId) only when siteId !== undefined (not ternary on full chain)
  - visitor_hash null guard uses != null (not !) before Set construction — satisfies TypeScript strict and runtime simultaneously
  - Native <select> over shadcn Select in AnalyticsFilters — shadcn Select is Base UI headless, incompatible with <form method="GET"> serialization (D086)
  - Range normalization via const tuple ['today','7d','30d'] as const — avoids any/unknown in ValidRange type
  - sites fetched twice (once in fetchAnalyticsData for name resolution, once in page.tsx for dropdown) — minor duplication acceptable; sites list is small
patterns_established:
  - Native <form method="GET"> for multi-param filter UI: both selects in one form, onChange auto-submits, Apply button fallback
  - Conditional Supabase filter pattern without ternary on the full query chain
  - computeMetrics pure aggregation: testable in isolation by copying rows from Supabase table editor
observability_surfaces:
  - fetchAnalyticsData throws 'Failed to fetch analytics_events/analytics_daily/sites: <message>' — surfaces in Next.js error boundary and pm2 logs
  - analytics_daily empty state: "Aggregated data will appear after the daily cron runs." — distinguishes "not yet" from error
  - Country section: Phase 1 placeholder with R024 reference — distinguishes planned absence from missing data
  - Per-site table: "No events in this period." when siteMetrics.length === 0
  - URL reflects active filters (?range=today, ?site=<uuid>&range=30d) — bookmarkable
drill_down_paths:
  - .gsd/milestones/M005/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S02/tasks/T02-SUMMARY.md
duration: ~55m total (T01: ~25m, T02: ~30m)
verification_result: passed
completed_at: 2026-03-13
---

# S02: Analytics Dashboard

**Real Supabase analytics rendered in the admin panel: KPI cards, per-site metrics table, top pages, and graceful empty states for daily aggregates and country — fully filterable by site and date range via native form GET.**

## What Happened

**T01** built the data layer in `analytics/lib.ts`:
- `getDateRange(range)` — maps `'today' | '7d' | '30d'` to UTC ISO start/end strings using native `Date` (no date library). Unknown input defaults to 7d.
- `computeMetrics(events, sites)` — pure reducer: groups raw `analytics_events` rows by `site_id`, computes pageviews / uniqueVisitors (via Set on null-guarded visitor_hash) / affiliateClicks / topPages (top 5 per site, sorted desc). No network calls.
- `fetchAnalyticsData(siteId, range)` — calls `createServiceClient()`, runs `Promise.all` over three queries (`analytics_events`, `analytics_daily`, `sites`). Applies `.eq('site_id', siteId)` conditionally (pattern: build query first, filter second). Throws descriptive errors on DB failure. Returns `AnalyticsData` with per-site metrics and cross-site totals.

**T02** built the page and filter component:
- `page.tsx` is an async server component with `searchParams: Promise<{site?, range?}>` awaited per Next.js 15 pattern. Normalizes range against a `const` tuple before calling `fetchAnalyticsData`. Fetches analytics data and sites-for-dropdown in parallel via `Promise.all`. Renders: (1) 3-card KPI row (total pageviews, unique visitors approximate, affiliate clicks); (2) per-site metrics table with top page column; (3) top pages table (cross-site combined, top 10); (4) Daily Aggregates section with graceful empty state; (5) Country Breakdown with Phase 1 placeholder.
- `AnalyticsFilters.tsx` is `'use client'` with a single `<form method="GET">` containing both site and range selects. `onChange` auto-submits. Native `<select>` used instead of shadcn Select — the shadcn component is Base UI headless and does not render a native select, so it cannot participate in form serialization (D086).

Both tasks passed TypeScript and production build checks on first attempt. No pre-existing errors introduced.

## Verification

```bash
# TypeScript
cd apps/admin && npx tsc --noEmit
→ exit 0, no output

# Production build
pnpm --filter @monster/admin build
→ exit 0; /analytics route compiled as ƒ (Dynamic) 1.19 kB; 13/13 static pages generated

# Runtime
# monster-admin is online (pm2, port 3004); curl http://localhost:3004/analytics → 307
# (auth middleware redirects unauthenticated requests to /login — correct)
# Navigating to /analytics in browser after login renders the dashboard with real Supabase data
```

## Requirements Advanced

- R009 (Analytics: lightweight GDPR-friendly tracking) — S02 closes the admin panel visibility half: `/analytics` now renders real pageview/click counts from Supabase instead of "Coming soon". Combined with S01 (tracker), the portfolio is no longer blind.

## Requirements Validated

- R009 remains active (not fully validated): live human UAT (visit site → confirm row in Supabase → confirm count in admin panel) and S03 (daily aggregation cron) are still pending. Both are required for milestone-level validation.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `pnpm --filter @monster/admin typecheck` fails — there is no `typecheck` script in `apps/admin/package.json`. Correct command is `cd apps/admin && npx tsc --noEmit`. Pre-existing gap (noted in T01-SUMMARY). Not introduced by S02.
- `sites` fetched twice: once inside `fetchAnalyticsData` (for name resolution in `computeMetrics`) and once in `page.tsx` (for the filter dropdown). The plan's T02 noted this minor duplication; `fetchAnalyticsData` already returns siteMetrics with resolved names, but a separate ordered sites list is needed for the dropdown. Duplication is acceptable — sites list is small and latency is hidden by parallelism.
- Shadcn `Select` component not used in `AnalyticsFilters` — incompatible with `<form method="GET">` semantics. Native `<select>` with equivalent Tailwind classes used instead (D086).

## Known Limitations

- `analytics_daily` section shows empty state until S03 (daily aggregation cron) runs. This is intentional — S03 populates it.
- Country column always `null` (Phase 1, D081). Country breakdown section shows Phase 1 placeholder.
- Unique visitors are approximate (D080) — daily SHA-256 hash without IP component. Dashboard labels "(approximate)" to set expectations.
- `pnpm --filter @monster/admin typecheck` has no backing script. Add `"typecheck": "tsc --noEmit"` to `apps/admin/package.json` if needed.
- At >10k events/30d, `fetchAnalyticsData` fetches all rows in one query (no pagination). Code comment documents threshold; acceptable for Phase 1 volumes.

## Follow-ups

- Add `"typecheck": "tsc --noEmit"` to `apps/admin/package.json` to make slice plan verification commands consistent (minor).
- S03 is next: BullMQ repeat job populates `analytics_daily`; dashboard will automatically show populated state once it runs.
- Human UAT: visit live site 5×, confirm rows in Supabase, confirm counts in admin panel — required for R009 full validation.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — new file; data layer (getDateRange, computeMetrics, fetchAnalyticsData, exported types)
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — full server-component dashboard (replaces "Coming soon" stub)
- `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx` — new 'use client' filter component (native form GET)
- `.gsd/DECISIONS.md` — D086 appended (native select vs shadcn Select for form GET)
- `.gsd/REQUIREMENTS.md` — R009 validation note updated with S02 evidence

## Forward Intelligence

### What the next slice should know
- S03 (daily aggregation) writes to `analytics_daily` with columns: `site_id, date, pageviews, unique_visitors, affiliate_clicks, top_pages, top_countries, top_referrers`. The Daily Aggregates table in `page.tsx` renders `row.date`, `row.page_path`, `row.pageviews`, `row.unique_visitors`, `row.affiliate_clicks` — if the S03 schema differs (e.g. no `page_path` column), update the Daily Aggregates render section.
- `fetchAnalyticsData`'s daily query filters by `.gte('date', ...)` / `.lte('date', ...)` — the `date` column in `analytics_daily` must be a `date` type (not `timestamptz`) for the `.slice(0, 10)` ISO string comparison to work correctly.
- The `analytics_daily` schema from M001 migration has `page_path text` — verify this is present before S03 writes to it.

### What's fragile
- Daily Aggregates table render (`row.page_path`, `row.site_id`, `row.date` as composite key) — if S03 produces rows without `page_path`, the table key will collide and the empty path will render as blank. Guard or adjust the key.
- sites fetched twice per page render — if sites list grows large (hundreds), the page response time increases. Monitor and add caching if needed.

### Authoritative diagnostics
- `/analytics` in running admin panel after login — primary inspection surface; shows real Supabase counts
- `pm2 logs monster-admin` — surfaces `Failed to fetch analytics_events: <detail>` from `fetchAnalyticsData` on DB failures
- Supabase table editor `analytics_events` — ground truth for row counts; compare with dashboard KPIs to verify aggregation correctness
- `computeMetrics` is pure — call it in Node REPL with rows copied from Supabase table editor to debug any aggregation discrepancy without a running server

### What assumptions changed
- Plan assumed shadcn Select would be usable for the filter form — it is not compatible with `<form method="GET">`. Native `<select>` is the correct solution and is equally visually consistent.
- Plan said `pnpm --filter @monster/admin typecheck` would be the verification command — this script does not exist. `tsc --noEmit` is correct.
