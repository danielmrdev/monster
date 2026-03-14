---
id: T01
parent: S02
milestone: M008
provides:
  - getDateRange helper (ISO date validation + 30-day default)
  - computePnL pure aggregator (per-site profit/ROI, portfolio totals, mixedCurrencies flag)
  - SitePnL and PnLResult exported types
  - FinancesFilters client component (<form method="GET"> with date inputs)
  - page.tsx wired to searchParams, date-filtered queries, computePnL result
key_files:
  - apps/admin/src/app/(dashboard)/finances/lib.ts
  - apps/admin/src/app/(dashboard)/finances/finances-filters.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
key_decisions:
  - computePnL is a pure in-memory reducer — no DB calls, testable with node -e
  - revenue_amazon.site_id is non-nullable in DB; revenue_manual.site_id is nullable — handled separately
  - Removed .limit(100) from revenue queries since date filter now bounds result size naturally
patterns_established:
  - getDateRange: validate ISO with regex + Date parse; clamp if from > to; fall back to defaults
  - computePnL: Map accumulators for costs/revenue by site_id; null site_id → portfolio-only
observability_surfaces:
  - Active date range visible in URL (?from=YYYY-MM-DD&to=YYYY-MM-DD) after filter submit
  - FinancesFilters form inputs reflect current dateRange.from/to as defaultValue
  - computePnL callable directly: node -e with fixture data, no DB needed
  - Supabase errors throw with table name + PG message (Next.js error boundary renders it)
duration: ~30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: `computePnL` function + date range filter

**Added `getDateRange` + `computePnL` to `lib.ts`, `FinancesFilters` client component, and wired date-range-filtered Supabase queries into `page.tsx`.**

## What Happened

Extended `lib.ts` with three additions:
1. `getDateRange(from?, to?)` — validates ISO date strings (regex + Date parse), defaults to last 30 days / today, clamps if `from > to`.
2. `SitePnL` / `PnLResult` types.
3. `computePnL(costs, revenueAmazon, revenueManual, sites)` — pure Map-based reducer. Accumulates costs by `site_id` (null → portfolio bucket), revenue from both Amazon and manual tables (null `site_id` in manual → portfolio only), joins with sites for names, computes `profit = revenue - costs` and `roi = costs > 0 ? profit/costs*100 : null`, sets `mixedCurrencies` if any row has `currency !== 'EUR'`. Returns sitePnL sorted by profit descending.

Created `finances-filters.tsx` — a `'use client'` `<form method="GET">` with two `<input type="date">` fields (`from`, `to`) and a Submit button, matching the AnalyticsFilters pattern (D086).

Updated `page.tsx` to:
- Accept `searchParams: Promise<{ from?: string; to?: string }>` (D120 async pattern).
- Call `getDateRange` to get clamped range.
- Apply `.gte('date', dateRange.from).lte('date', dateRange.to)` to all three queries (costs, revenue_amazon, revenue_manual). Also removed the `.limit(100)` from revenue queries since date filter now bounds results naturally.
- Render `<FinancesFilters>` at the top.
- Call `computePnL` and hold `pnlResult` ready for T02 rendering.

## Verification

```
pnpm -r typecheck          → exit 0 (all packages pass)
pnpm --filter @monster/admin build → exit 0, /finances renders as dynamic route
```

Manual logic verification via `node -e`:
- 1 cost row (€50) + 1 revenue row (€80) → `profit = 30`, `roi = 60` ✓
- Revenue-only site → `roi = null` (no divide-by-zero) ✓
- USD row → `mixedCurrencies = true` ✓
- All-EUR → `mixedCurrencies = false` ✓

## Diagnostics

- `getDateRange` output is deterministic for any input — log `dateRange` in page.tsx during debugging.
- `computePnL` can be invoked standalone: paste the function into `node -e` with fixture arrays to reproduce any aggregation result without DB access.
- Supabase query errors throw `Failed to fetch <table>: <pg message>` — surfaced by Next.js error boundary at `/finances`.
- Active date window always visible in URL after form submit.

## Deviations

- Removed `.limit(100)` from `revenue_amazon` and `revenue_manual` queries. The date filter makes the limit redundant and potentially misleading (a high-volume day could be silently truncated). No plan mention of this limit — removing it is strictly correct.

## Known Issues

None. T02 will render the `pnlResult` returned by `computePnL`.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — added `getDateRange`, `computePnL`, `SitePnL`, `PnLResult`
- `apps/admin/src/app/(dashboard)/finances/finances-filters.tsx` — new `'use client'` date range form component
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — reads `searchParams`, applies date filter to all three queries, calls `computePnL`
- `.gsd/milestones/M008/slices/S02/S02-PLAN.md` — added Observability / Diagnostics section + failure-path verification step (pre-flight fix)
- `.gsd/milestones/M008/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
