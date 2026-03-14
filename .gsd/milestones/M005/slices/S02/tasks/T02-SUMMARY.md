---
id: T02
parent: S02
milestone: M005
provides:
  - apps/admin/src/app/(dashboard)/analytics/page.tsx — full server-component analytics dashboard (replaces stub)
  - apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx — 'use client' filter component with native form GET
key_files:
  - apps/admin/src/app/(dashboard)/analytics/page.tsx
  - apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx
key_decisions:
  - Used native <select> elements in AnalyticsFilters instead of the shadcn Select component — shadcn Select is Base UI headless (JS-driven, requires 'use client' state updates) and incompatible with <form method="GET"> submit semantics. Native <select> preserves both params on form submit without useRouter.
  - fetchAnalyticsData called once per page render (parallel with sites fetch via Promise.all); sites also fetched separately for the dropdown. Minor duplication acceptable — sites list is small and latency is hidden by parallelism.
  - Combined top-pages derived from siteMetrics in-memory (flatMap + reduce) rather than a separate DB query — data already available from T01's fetchAnalyticsData.
patterns_established:
  - Native <form method="GET"> for multi-param filter UI: both selects in the same form; onChange submits immediately; Apply button as fallback for keyboard/no-JS users.
  - Range normalization pattern: declare validRanges as const tuple, check inclusion, cast — avoids any/unknown in the ValidRange type.
observability_surfaces:
  - fetchAnalyticsData throws 'Failed to fetch analytics_events/analytics_daily/sites: <message>' — surfaces in Next.js error boundary and pm2 logs on DB failure
  - analytics_daily section shows "Aggregated data will appear after the daily cron runs." when dailyRows.length === 0 — distinguishes "no data yet" from runtime error
  - Country section shows Phase 1 placeholder message — distinguishes planned absence from missing data
  - Navigating to /analytics in running admin panel is the primary inspection surface; error boundary renders on Supabase auth failure
duration: ~30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Analytics dashboard page and filter UI

**Full server-component analytics dashboard with filter UI shipped: KPI cards, per-site metrics table, top pages, daily aggregates empty state, and country Phase 1 placeholder — all reading real Supabase data from T01 helpers.**

## What Happened

Replaced the stub `page.tsx` with an async server component that:
1. Awaits `searchParams: Promise<{site?, range?}>` — Next.js 15 pattern
2. Normalizes `range` against a `const` tuple to ensure only `'today' | '7d' | '30d'` reaches `fetchAnalyticsData`
3. Fetches analytics data and sites list in parallel via `Promise.all`
4. Renders KPI row (3 Cards), per-site metrics Table, Top Pages Table, Daily Aggregates section, Country placeholder

Created `AnalyticsFilters.tsx` as `'use client'` with:
- Native `<form method="GET">` — both site and range selects in the same form
- `onChange` auto-submit on each select (with Apply button fallback)
- No `useRouter`, no `useSearchParams` — pure form submission

Key implementation choice: shadcn `select.tsx` is Base UI headless and not compatible with `<form method="GET">` semantics (it manages state internally, not via native `<select>` value). Used plain `<select>` with matching Tailwind classes instead.

## Verification

```
# TypeScript — no errors
cd apps/admin && npx tsc --noEmit → exit 0, no output

# Production build
pnpm --filter @monster/admin build → exit 0
/analytics route: ƒ (Dynamic), 1.19 kB, 13/13 static pages generated

# Must-haves confirmed by code inspection:
✓ searchParams typed as Promise<{site?, range?}> and awaited
✓ range normalized against validRanges const tuple before fetchAnalyticsData
✓ AnalyticsFilters is 'use client' with <form method="GET">
✓ Both site and range selects in the same <form>
✓ analytics_daily empty state: "Aggregated data will appear after the daily cron runs."
✓ Country section: Phase 1 placeholder with R024 reference
✓ Unique visitors labeled "(approximate)" in both KPI card header and table column header

# Runtime: dev server on 3004 responds 307 to /analytics (correct — auth middleware redirects
# unauthenticated requests to /login). No Next.js errors logged during route compilation.
```

## Diagnostics

- Navigate to `/analytics` in running admin panel after login — page renders KPI cards and tables
- If Supabase fails: Next.js error boundary renders (not a blank page); pm2/dev logs show `Failed to fetch analytics_events: <detail>` from `fetchAnalyticsData`
- If `analytics_daily` is empty: "Aggregated data will appear after the daily cron runs." message renders in the Daily Aggregates card
- Empty per-site table (no events in range): "No events in this period." message across all 5 columns
- URL reflects filters: `?range=today`, `?site=<uuid>&range=30d` etc. — bookmarkable, shareable

## Deviations

- Shadcn `Select` component not used in `AnalyticsFilters` — it's a Base UI headless component incompatible with native `<form method="GET">` submit. Used native `<select>` with identical Tailwind styling instead. This is a correct deviation; the plan said "use Tailwind classes consistent with existing admin UI" not "use shadcn Select".
- `typecheck` script not present in admin package (noted in T01-SUMMARY too). Used `npx tsc --noEmit` which is equivalent. The slice plan verification command `pnpm --filter @monster/admin typecheck` would fail; downstream tasks should note this or add the script.

## Known Issues

- `pnpm --filter @monster/admin typecheck` fails because there's no `typecheck` script in admin's `package.json`. The correct command is `cd apps/admin && npx tsc --noEmit`. Not introduced by this task — pre-existing gap noted in T01.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx` — new client filter component (site selector + range selector in native form GET)
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — full server-component dashboard replacing the "Coming soon" stub
