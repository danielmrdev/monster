---
estimated_steps: 5
estimated_files: 3
---

# T02: Analytics dashboard page and filter UI

**Slice:** S02 — Analytics Dashboard
**Milestone:** M005

## Description

Replace the "Coming soon" analytics stub with a full server-component dashboard and a `'use client'` filter component. Renders real Supabase data from T01's helpers. Handles all Phase 1 empty/null states gracefully: empty `analytics_daily`, null `country`, zero events.

Pattern: identical to `finances/page.tsx` — async server component, `createServiceClient`, Card/Table/Badge UI primitives. The only new pattern is `searchParams: Promise<{...}>` awaited at the top (same as `login/page.tsx`).

## Steps

1. Write `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx` as `'use client'`. Props: `sites: Array<{ id: string; name: string }>`, `selectedSite: string | undefined`, `selectedRange: string`. Render a `<form method="GET" className="flex gap-3 items-end flex-wrap">` containing two `<select>` elements (site selector + range selector). Both selects must be in the same form so both params are preserved on submit. Site selector: `<option value="">All Sites</option>` + one option per site. Range selector: options for `today`, `7d` (default), `30d` with labels "Today", "Last 7 days", "Last 30 days". Add a submit `<button>` or make selects auto-submit via `onChange` with `e.currentTarget.form?.submit()`. Use Tailwind classes consistent with existing admin UI. No `useRouter`, no `useSearchParams`.

2. Write `apps/admin/src/app/(dashboard)/analytics/page.tsx` replacing the stub. Interface: `interface AnalyticsPageProps { searchParams: Promise<{ site?: string; range?: string }> }`. Await searchParams. Normalize: `range` must be `'today' | '7d' | '30d'` — default to `'7d'` if absent or unrecognized. Call `fetchAnalyticsData(site, normalizedRange)` from `lib.ts`. Fetch sites list for filter dropdown (can reuse what `fetchAnalyticsData` already fetches internally — pass it through `AnalyticsData` or refetch cheaply).

3. Render KPI row: three `<Card>` components for Total Pageviews, Unique Visitors (with "(approximate)" label), Affiliate Clicks — large number in `CardContent`, sourced from `data.totalPageviews` etc.

4. Render per-site metrics table: `<Card>` wrapping `<Table>` with columns: Site, Pageviews, Unique Visitors, Affiliate Clicks, Top Page. One row per site in `data.siteMetrics`. If `siteMetrics` is empty (no events in range), show `<TableCell colSpan={5} className="text-center text-muted-foreground py-8">No events in this period.</TableCell>`. Top Page cell: show first entry of `topPages` or "—".

5. Render three secondary sections below the per-site table:
   - **Top Pages**: `<Card>` with Table (page_path, pageviews). Derive from all siteMetrics combined, sorted desc. Empty state: "No page data in this period."
   - **Daily Aggregates** (`analytics_daily`): `<Card>` with note "Aggregated data will appear after the daily cron runs." when `data.dailyRows.length === 0`; otherwise render Table with date, page_path, pageviews, unique_visitors, affiliate_clicks.
   - **Country Breakdown**: `<Card>` with static `<p className="text-sm text-muted-foreground">No country data in Phase 1. Country tracking will be available in a future update (R024).</p>`.

## Must-Haves

- [ ] `searchParams` is typed as `Promise<{ site?: string; range?: string }>` and awaited — not accessed directly
- [ ] `range` is normalized before passing to `fetchAnalyticsData` — unknown values default to `'7d'`
- [ ] `AnalyticsFilters` is `'use client'` and uses native `<form method="GET">` — no `useRouter`
- [ ] Both site and range selects are in the same `<form>` so both params are preserved on submission
- [ ] `analytics_daily` empty state is a message, not an error or empty table
- [ ] Country section shows Phase 1 placeholder message, not an empty table
- [ ] Unique visitors labeled "(approximate)" in the UI (D080 user-visible acknowledgment)
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `pnpm --filter @monster/admin typecheck` exits 0

## Verification

```bash
# Build must pass
pnpm --filter @monster/admin build
# Must exit 0 with no type errors

# Typecheck standalone
pnpm --filter @monster/admin typecheck
# Must exit 0

# Runtime verification (admin panel must be running on port 3004 or dev server)
# 1. Navigate to http://localhost:3004/analytics (or dev port)
# 2. Page renders without error — KPI cards, per-site table visible
# 3. Site selector and date range selector present and populated
# 4. Changing date range (e.g. "Today" → submit) reloads page with range=today in URL
# 5. analytics_daily section shows graceful empty state message
# 6. Country section shows Phase 1 placeholder message
# 7. No JS console errors
```

## Observability Impact

- Signals added: Supabase query errors thrown from `fetchAnalyticsData` surface in Next.js error boundary and pm2 logs with descriptive message
- How a future agent inspects this: navigate to `/analytics` — if it throws, pm2 logs show the Supabase error; if it renders with 0s, check `analytics_events` table in Supabase dashboard
- Failure state exposed: empty-state messages distinguish "no data yet" from runtime errors (which produce Next.js error page)

## Inputs

- `apps/admin/src/app/(dashboard)/analytics/lib.ts` (T01 output) — `fetchAnalyticsData`, `SiteMetrics`, `AnalyticsData`, `DateRange` types
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — current stub to replace
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — pattern reference for Card/Table structure
- `apps/admin/src/app/(auth)/login/page.tsx` — `searchParams: Promise<{...}>` await pattern
- `apps/admin/src/components/ui/` — Card, Table, Badge, Button available

## Expected Output

- `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx` — client filter component (new)
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — full server-component dashboard (replaced)
- `/analytics` page renders real data from `analytics_events` with working filter controls
