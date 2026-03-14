---
estimated_steps: 7
estimated_files: 2
---

# T02: P&L dashboard UI + domain expiry alerts + CSV export

**Slice:** S02 — P&L Dashboard + Domain Expiry Alerts + CSV Export
**Milestone:** M008

## Description

Render the P&L summary cards, per-site breakdown table, domain expiry alerts card, and a client-side CSV export button in the Finances page. This is the user-visible output of the entire M008 milestone.

## Steps

1. In `page.tsx`, add `domains` to the `Promise.all`: `supabase.from('domains').select('id, domain, expires_at, site_id').not('expires_at', 'is', null)`. Filter in-memory for those expiring within 60 days. Compute `daysRemaining = Math.floor((expiresDate - now) / (1000 * 60 * 60 * 24))`. Join with `sites` for site name.

2. Render the `FinancesFilters` component at the top of the page (above all cards).

3. Render **Portfolio P&L Summary** card:
   - Three metric columns: Total Revenue (`portfolioRevenue` formatted EUR), Total Costs (`portfolioCosts` formatted EUR), Net Profit (formatted EUR, green text if ≥ 0, red if < 0)
   - If `pnlResult.mixedCurrencies`: amber notice inline below metrics
   - Card header: "P&L Summary — {dateRange.from} to {dateRange.to}"

4. Render **Per-Site P&L Table** card (below summary):
   - Table columns: Site, Revenue, Costs, Net Profit, ROI
   - ROI: `{roi.toFixed(1)}%` — green if > 0, red if < 0, "N/A" if null (gray)
   - Net profit: green if > 0, red if < 0, "—" if both revenue and costs are 0
   - Empty state: "No cost or revenue data for the selected period."
   - Below the table: `PnLExportButton` (see step 6)

5. Render **Domain Renewals** card (only if `expiringDomains.length > 0`):
   - Amber border/background card header
   - Table: Domain, Site, Days Remaining
   - Days remaining: red if ≤ 14, amber if ≤ 30, yellow if ≤ 60
   - Place between P&L table and Add Cost Form

6. Create `apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx` — `'use client'` component:
   - Props: `sitePnL: SitePnL[]`, `dateRange: { from: string; to: string }`
   - Button: "Export P&L CSV"
   - On click: construct CSV string (header: `Site,Revenue,Costs,Net Profit,ROI %`; rows from `sitePnL`), create `Blob`, `URL.createObjectURL`, trigger download with filename `pnl-${dateRange.from}-${dateRange.to}.csv`, revoke URL
   - No server roundtrip needed — data already available in client component via serialized props

7. Final page section order: `[FinancesFilters] [P&L Summary] [Per-Site P&L + Export Button] [Domain Renewals] [Add Cost Form] [Cost History] [Revenue Forms] [Revenue History]`

## Observability Impact

- **P&L summary card visible on `/finances`**: rendered directly in HTML — no DevTools needed to confirm totals. Green/red profit coloring is a passive signal of data correctness.
- **Mixed-currency notice**: amber inline notice appears when `mixedCurrencies === true` — a passive, always-visible diagnostic for currency data quality issues.
- **Domain expiry card visibility**: card presence/absence is itself the diagnostic signal — absence means no `expires_at` within 60 days in DB; no inference required.
- **Days-remaining color coding**: red (≤14), amber (≤30), yellow (≤60) — urgency visible at a glance without querying the database.
- **CSV export file**: downloaded file name `pnl-{from}-{to}.csv` encodes the date range; row count in spreadsheet app confirms completeness. No server log needed.
- **Domains query error**: if the `domains` Supabase fetch fails, the error throws with `Failed to fetch domains: <PG message>` — surfaced by the Next.js error boundary at `/finances`.
- **Failure state inspection**: after any Supabase error, the error boundary renders a page with the thrown message; restoring a valid env and reloading (no restart) recovers the page.

## Must-Haves

- [ ] Portfolio P&L summary renders with correct total revenue/costs/profit
- [ ] Per-site table rows match manual sum from test data
- [ ] ROI "N/A" when costs = 0 (no divide-by-zero in UI)
- [ ] Domain expiry card hidden when no domains expiring within 60 days
- [ ] "Export P&L CSV" triggers browser download of a valid CSV file
- [ ] `pnpm --filter @monster/admin build` exit 0
- [ ] pm2 reload monster-admin clean, `/finances` returns 307

## Verification

- `pnpm --filter @monster/admin build` exit 0
- `pm2 reload monster-admin`
- Navigate to `/finances` in browser:
  - P&L section visible with summary cards
  - Per-site table renders (may show "No data" if no test entries)
  - Export button downloads a CSV file
- Change `from` and `to` date inputs → URL updates → data refreshes
- If any domain with `expires_at` within 60 days exists: Domain Renewals card appears

## Inputs

- `apps/admin/src/app/(dashboard)/finances/lib.ts` (S02/T01) — `computePnL`, `SitePnL`, `PnLResult`, `getDateRange`
- `apps/admin/src/app/(dashboard)/finances/page.tsx` (S02/T01) — `pnlResult` already computed
- `apps/admin/src/app/(dashboard)/finances/finances-filters.tsx` (S02/T01) — already exists

## Expected Output

- `apps/admin/src/app/(dashboard)/finances/page.tsx` — P&L summary, per-site table, domain alerts, all rendered from `pnlResult` + `expiringDomains`
- `apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx` — new client component with CSV download
