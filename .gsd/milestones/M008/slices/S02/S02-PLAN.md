# S02: P&L Dashboard + Domain Expiry Alerts + CSV Export

**Goal:** Replace the finances page with a full P&L view: date-range filter, revenue vs costs aggregation per site, ROI calculation, domain expiry warnings for domains expiring within 60 days, and a CSV export button.

**Demo:** Navigate to `/finances`, select a date range, see a P&L summary card (total revenue, total costs, net profit), a per-site breakdown table with ROI %, a domain expiry alerts section showing domains expiring soon, and a "Export P&L CSV" button that downloads a correctly formatted file.

## Must-Haves

- Date range filter: default last 30 days; year filter option (current year). URL params (`from`, `to`) so the range is bookmarkable — same `<form method="GET">` pattern as AnalyticsFilters (D086).
- P&L computed in-memory in the server component: sum `costs` by `site_id`, sum `revenue_amazon + revenue_manual` by `site_id`, join with `sites.name`, compute net profit and ROI per site
- Portfolio-wide summary card: total revenue, total costs, net profit (positive = green, negative = red)
- Per-site P&L table: site name, revenue, costs, net profit, ROI %
- Domain expiry alerts: query `domains` where `expires_at` is within 60 days of today; show as a warning card with domain name, site name, days remaining
- CSV export: GET `/api/finances/export` route that returns `Content-Disposition: attachment; filename="pnl-export.csv"` with the P&L data for the selected range — or a client-side `Blob` download constructed from the same in-memory data (simpler: client-side, no new route needed)
- Currency warning: if costs and revenue rows have mixed currencies, surface a notice "Multiple currencies detected — amounts shown in their original currency, not converted"
- `pnpm -r typecheck` exit 0, `pnpm --filter @monster/admin build` exit 0

## Observability / Diagnostics

- **Date range on page:** Active `from`/`to` ISO dates are visible in the URL after filter submission, confirming which period is in scope.
- **P&L computation:** `computePnL` is a pure function — can be called with fixture data in a Node REPL (`node -e`) to validate totals independently of the UI.
- **Mixed-currency notice:** Rendered inline on the P&L page when `mixedCurrencies === true` — visible without opening DevTools.
- **Domain expiry alerts:** Card only appears when `expires_at IS NOT NULL AND expires_at <= now() + 60 days`. Absence of the card means no such domains exist in DB.
- **CSV export:** File download triggers a browser save dialog — its filename (`pnl-export.csv`) and row count confirm correctness without server logs.
- **Failure visibility:** Supabase errors from cost/revenue/domain queries throw (standard Next.js error boundary pattern) — error message includes table name and Postgres error detail. Rendered by Next.js error page with `message`.
- **Redaction:** No secrets or PII in logs. Supabase service key used server-side only; never passed to client components.

## Verification

```bash
# Typecheck + build
pnpm -r typecheck
pnpm --filter @monster/admin build

# pm2 reload
pm2 reload monster-admin
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/finances
# → 307

# With a few test cost rows and the revenue rows inserted in S01:
# Navigate to /finances — P&L summary shows correct total
# Manually sum costs and revenue for the period and compare to displayed values
# Click Export CSV — file downloads, numbers match displayed P&L

# Failure-path check: disconnect Supabase (set invalid URL in env), reload /finances
# → Next.js error page renders with message "Failed to fetch costs: ..."
# Restore env and reload — page recovers without restart
```

## Tasks

- [x] **T01: `computePnL` function + date range filter** `est:1h`
  - Why: Pure data aggregation logic isolated from rendering; date filter drives what data is fetched
  - Files: `apps/admin/src/app/(dashboard)/finances/lib.ts`, `apps/admin/src/app/(dashboard)/finances/page.tsx`
  - Do:
    1. Add to `lib.ts`:
       - `getDateRange(from?: string, to?: string): { from: string; to: string }` — defaults: `from` = 30 days ago (ISO date), `to` = today (ISO date). Clamps to valid dates.
       - `type SiteRevenue = { site_id: string | null; total: number; currency: string }`
       - `type SiteCost = { site_id: string | null; total: number; currency: string }`
       - `type SitePnL = { site_id: string; name: string; revenue: number; costs: number; profit: number; roi: number; currency: string }`
       - `computePnL(costs: CostRow[], revenueAmazon: RevenueAmazonRow[], revenueManual: RevenueManualRow[], sites: SiteRow[]): { sitePnL: SitePnL[]; portfolioRevenue: number; portfolioCosts: number; portfolioProfit: number; mixedCurrencies: boolean }` — pure in-memory reducer. Group costs by `site_id`, group revenue by `site_id`. ROI = `(revenue - costs) / costs * 100` (null if costs = 0). Mixed currencies: any row where `currency !== 'EUR'`. Unattributed (null site_id) costs/revenue included in portfolio total but not in per-site table.
    2. Update `page.tsx` to read `searchParams.from` + `searchParams.to` (async pattern, D120), compute `dateRange`, pass to all data fetches (add `.gte('date', dateRange.from).lte('date', dateRange.to)` to cost + revenue queries)
    3. Add `FinancesFilters` — a small `'use client'` component with `<form method="GET">` containing two date inputs (from, to) with a Submit button; uses same pattern as `AnalyticsFilters` (D086). Inline or separate file.
  - Verify: `pnpm -r typecheck` exit 0; `computePnL` called with mock data in isolation returns correct sums (manual verification or inline console.log during dev)
  - Done when: typecheck passes, `computePnL` exported from `lib.ts`, date range drives data fetch

- [x] **T02: P&L dashboard UI + domain expiry alerts + CSV export** `est:1.5h`
  - Why: Renders the P&L output and domain alerts — the user-visible deliverable of this slice
  - Files: `apps/admin/src/app/(dashboard)/finances/page.tsx`
  - Do:
    1. In `page.tsx`, add parallel fetch for `domains` (select `id, domain, expires_at, site_id`, filter where `expires_at IS NOT NULL`). Compute expiry alerts in-memory: `expires_at` within 60 days of today = `new Date(expires_at) <= new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)`. Compute days remaining.
    2. Render P&L summary card at top of Finances page (above existing Cost History section):
       - Three KPI cards: Total Revenue (EUR), Total Costs (EUR), Net Profit (green if positive, red if negative)
       - If `mixedCurrencies`: amber notice "Revenue or costs include non-EUR entries — shown in original currency, not converted"
    3. Render per-site P&L table:
       - Columns: Site, Revenue, Costs, Net Profit, ROI %
       - Sorted by profit descending (most profitable first)
       - ROI column: green if > 0, red if < 0, gray if costs = 0 (N/A)
       - Empty state when no sites have any costs or revenue in the period
    4. Render domain expiry alerts card (only if any domains expiring within 60 days):
       - Header: "Domain Renewals" with amber border
       - Rows: domain name, days remaining, associated site name
       - Sorted by days remaining ascending
    5. Add "Export P&L CSV" button — client-side: JavaScript `Blob` + `URL.createObjectURL` download (no new API route). Button calls a small inline `exportToCsv(sitePnL)` function that constructs CSV string and triggers download. Button lives in a `'use client'` leaf component (`PnLExportButton`) passed the `sitePnL` data as serializable props.
    6. Arrange page sections: [Filters] [P&L Summary] [Per-site P&L table + Export button] [Domain Expiry Alerts] [Add Cost Form] [Cost History] [Revenue Forms] [Revenue History]
  - Verify: `pnpm --filter @monster/admin build` exit 0; navigate to `/finances` — P&L section renders; filter by date range updates URL; Export CSV downloads a file
  - Done when: build passes, P&L renders with real data, domain alerts show if any domains within 60 days, CSV export works

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/finances/lib.ts`
- `apps/admin/src/app/(dashboard)/finances/page.tsx`
