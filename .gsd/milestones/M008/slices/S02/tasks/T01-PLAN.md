---
estimated_steps: 5
estimated_files: 2
---

# T01: `computePnL` function + date range filter

**Slice:** S02 — P&L Dashboard + Domain Expiry Alerts + CSV Export
**Milestone:** M008

## Description

Add `computePnL` and `getDateRange` helpers to `lib.ts`, then wire date range from URL `searchParams` into the existing finance data fetches in `page.tsx`. Add a `FinancesFilters` client component with a `<form method="GET">` date range picker.

## Steps

1. Extend `apps/admin/src/app/(dashboard)/finances/lib.ts`:
   - `getDateRange(from?: string, to?: string): { from: string; to: string }`: default `from` = today minus 30 days (ISO `YYYY-MM-DD`), default `to` = today. Validate/clamp: if provided values are invalid ISO dates, fall back to defaults.
   - Types: `SitePnL = { site_id: string; name: string; revenue: number; costs: number; profit: number; roi: number | null; currency: string }`, `PnLResult = { sitePnL: SitePnL[]; portfolioRevenue: number; portfolioCosts: number; portfolioProfit: number; mixedCurrencies: boolean }`
   - `computePnL(costs, revenueAmazon, revenueManual, sites): PnLResult`:
     - Accumulate costs per `site_id` (null → portfolio). Use `EUR` as primary currency; set `mixedCurrencies = true` if any row has a different currency.
     - Accumulate revenue per `site_id` from both `revenue_amazon` and `revenue_manual`. Null `site_id` in `revenue_manual` → portfolio-wide total only.
     - Join with `sites` by `site_id` to get site names; include only sites that appear in costs or revenue.
     - For each site: `profit = revenue - costs`, `roi = costs > 0 ? (profit / costs) * 100 : null`.
     - Portfolio totals: sum all sites + any null-site amounts.
     - Return sorted by profit descending.

2. Add `FinancesFilters` as a `'use client'` component in a separate file `finances-filters.tsx`:
   - `<form method="GET">` with two `<input type="date">` fields for `from` and `to`, plus a Submit button
   - Pattern identical to `AnalyticsFilters.tsx` (D086)
   - Shows current `from`/`to` values as `defaultValue` from props

3. Update `page.tsx`:
   - Convert to async (it already is), read `searchParams` as `Promise<{ from?: string; to?: string }>` (D120 pattern)
   - Call `getDateRange(from, to)` to get the clamped range
   - Add `.gte('date', dateRange.from).lte('date', dateRange.to)` to cost query
   - Add `.gte('date', dateRange.from).lte('date', dateRange.to)` to both revenue queries
   - Pass `dateRange` to `<FinancesFilters>` as `defaultFrom`/`defaultTo` props
   - Call `computePnL(costs, revenueAmazon, revenueManual, sites)` in the server component and pass `pnlResult` to S02/T02 render

## Must-Haves

- [ ] `getDateRange` defaults to last 30 days when no params provided
- [ ] `computePnL` produces correct `profit = revenue - costs` per site
- [ ] `roi` is `null` when costs = 0 (no divide-by-zero)
- [ ] `mixedCurrencies` is true when any row is not EUR
- [ ] Date range filters all three data fetches (costs, revenue_amazon, revenue_manual)
- [ ] `pnpm -r typecheck` exit 0

## Verification

- `pnpm -r typecheck` exit 0
- Confirm `computePnL` output: with 1 cost row (€50) and 1 revenue row (€80) for the same site, result should have `profit = 30`, `roi ≈ 60`

## Inputs

- `apps/admin/src/app/(dashboard)/finances/lib.ts` (S01/T01) — existing `parseAmazonCSV`, `ImportResult` types
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — parallel fetch pattern to extend
- `apps/admin/src/app/(dashboard)/analytics/AnalyticsFilters.tsx` — pattern for GET form filter (D086)

## Expected Output

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — `getDateRange`, `computePnL`, `SitePnL`, `PnLResult` exported
- `apps/admin/src/app/(dashboard)/finances/finances-filters.tsx` — new `'use client'` date range form
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — reads `searchParams`, filters queries by date range, calls `computePnL`
