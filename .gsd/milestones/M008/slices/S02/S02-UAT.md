# S02: P&L Dashboard + Domain Expiry Alerts + CSV Export — UAT

**Milestone:** M008
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (artifact-driven + human-experience)
- Why this mode is sufficient: typecheck + build exit 0 and pm2 reload clean are proven by agent. The remaining gaps (P&L numbers match real DB data, CSV opens correctly in spreadsheet, domain alert shows for a real expiring domain) require a human with a running admin panel and real or seeded data.

## Preconditions

1. pm2 `monster-admin` is running (`pm2 status` shows `monster-admin` online, 0 restarts).
2. Supabase is reachable (Settings page loads without error).
3. At least one `costs` row exists in DB (added via the Add Cost form in Finances).
4. At least one `revenue_amazon` or `revenue_manual` row exists (imported via S01 CSV import or manual form).
5. A site exists in the `sites` table with `affiliate_tag` matching the tracking ID used in any imported revenue row.

## Smoke Test

Navigate to `/finances`. Page renders without an error boundary. The "P&L Summary" card appears above the "Add Cost" section. Date range inputs are pre-populated with values (default: last 30 days).

---

## Test Cases

### 1. Default date range loads on first visit

1. Navigate to `/finances` with no query params.
2. Observe the date inputs in the filter form.
3. **Expected:** `From` is set to 30 days ago (YYYY-MM-DD), `To` is today's date. URL has no `from`/`to` params yet.

---

### 2. Date range filter updates URL and data

1. On `/finances`, change the `From` date to 6 months ago (e.g. `2025-09-01`) and `To` to today.
2. Click **Apply**.
3. **Expected:** URL updates to `/finances?from=2025-09-01&to=<today>`. Page re-renders with data for that period. The P&L Summary card header reads "P&L Summary — 2025-09-01 to <today>".

---

### 3. P&L Summary card shows correct totals

_Precondition: at least one cost row and one revenue row in the selected date range attributed to the same site._

1. Note the amounts: cost row (e.g. €50.00 domain), revenue row (e.g. €80.00 Amazon earnings for that site).
2. Navigate to `/finances` with a date range that includes both rows.
3. **Expected:**
   - Total Revenue shows the sum of all revenue rows in range (e.g. €80.00).
   - Total Costs shows the sum of all cost rows in range (e.g. €50.00).
   - Net Profit shows Revenue − Costs (e.g. €30.00) in **green**.
4. If costs > revenue: Net Profit is displayed in **red**.

---

### 4. Per-Site Breakdown table shows correct per-site data

1. With the same data as test 3, scroll to the "Per-Site Breakdown" section.
2. **Expected:**
   - The site appears as a row with correct Revenue, Costs, Net Profit, and ROI columns.
   - ROI = (Net Profit / Costs) × 100 = (30 / 50) × 100 = 60.0% — displayed in green.
   - Table is sorted by Net Profit descending (most profitable site first).

---

### 5. Per-Site table ROI edge cases

- **No costs, has revenue:** ROI shows "N/A" (gray), Net Profit = Revenue (green).
- **Has costs, no revenue:** ROI shows a negative % (red), Net Profit is negative (red).
- **Both zero:** Net Profit cell shows "—" (em dash), ROI shows "N/A".

---

### 6. Empty state when no data in selected period

1. Set `From` and `To` to a date range with no costs or revenue rows (e.g. a date in the distant past: 2020-01-01 to 2020-01-31).
2. **Expected:**
   - P&L Summary card: all three KPIs show €0.00. Net Profit is €0.00 (green or neutral).
   - Per-Site Breakdown table: "No cost or revenue data for the selected period." empty state row.
   - Export CSV button is **not visible** (hidden when no site data).

---

### 7. Export P&L CSV downloads correct file

_Precondition: at least one site row in the Per-Site Breakdown (sitePnL.length > 0)._

1. Navigate to `/finances` with a date range containing revenue/cost data.
2. Scroll to the Per-Site Breakdown table footer and click **Export P&L CSV**.
3. **Expected:**
   - Browser save dialog appears (or file downloads automatically depending on browser settings).
   - Filename is `pnl-{from}-{to}.csv` (e.g. `pnl-2025-09-01-2026-03-13.csv`).
   - Open the file in a spreadsheet (Excel, Numbers, LibreOffice Calc).
   - First row is the header: `Site,Revenue (EUR),Costs (EUR),Net Profit (EUR),ROI %`.
   - One data row per site matching what the Per-Site Breakdown table shows.
   - Numbers match the table values exactly.

---

### 8. Mixed-currency warning

_Precondition: add a manual revenue row with currency `USD` (or any non-EUR currency) in the date range._

1. Navigate to `/finances` with a date range including the USD row.
2. **Expected:**
   - An amber notice appears below the three KPI cards: "Revenue or costs include non-EUR entries — amounts shown in their original currency, not converted. Totals may be inaccurate."
   - The notice does NOT appear when all rows are EUR.

---

### 9. Domain expiry alerts card appears for expiring domains

_Precondition: a `domains` row exists in Supabase with `expires_at` set to within the next 60 days (e.g. `UPDATE domains SET expires_at = NOW() + INTERVAL '15 days' WHERE domain = 'example.com'`)._

1. Navigate to `/finances`.
2. **Expected:**
   - An amber-bordered "⚠ Domain Renewals (1)" card appears between the Per-Site table and the Add Cost form.
   - The card lists: domain name, associated site name, days remaining.
   - Days ≤14 shown in red; days 15–30 in amber; days 31–60 in yellow.

---

### 10. Domain expiry card absent when no domains expire soon

_Precondition: no domains with `expires_at` within 60 days._

1. Navigate to `/finances`.
2. **Expected:** No "Domain Renewals" card appears. The page goes directly from Per-Site Breakdown to the Add Cost form.

---

### 11. Filter is bookmarkable

1. Apply a custom date range (e.g. `2026-01-01` to `2026-03-13`).
2. Copy the URL (`/finances?from=2026-01-01&to=2026-03-13`).
3. Open the URL in a new tab or incognito window.
4. **Expected:** Page renders with the same date range — the filter form pre-fills the same dates and the P&L data matches.

---

## Edge Cases

### Invalid / reversed date params in URL

1. Navigate to `/finances?from=2026-03-13&to=2026-01-01` (from > to).
2. **Expected:** Page renders with the default range (last 30 days / today) — the URL params are silently clamped, not shown as an error.

### URL with non-date params

1. Navigate to `/finances?from=not-a-date&to=also-wrong`.
2. **Expected:** Page renders with the default 30-day range — invalid date strings are rejected, defaults applied.

### Site in revenue but not in `sites` table

1. If a revenue row has a `site_id` that no longer maps to a `sites` row (deleted site), the per-site table shows "Unknown" as the site name.
2. **Expected:** Row still appears with "Unknown" label — no crash or missing row.

---

## Failure Signals

- **Error boundary page at `/finances`:** Supabase connection issue or missing table. The error message includes the table name and PG error detail. Restoring Supabase connectivity and reloading recovers without pm2 restart.
- **P&L Summary totals are zero when data exists:** Date range doesn't cover the existing rows — check the URL params and adjust the filter.
- **Export button missing with data in table:** `sitePnL.length === 0` despite visible rows — inspect the `computePnL` output (add a `console.log(pnlResult)` in `page.tsx` temporarily and check pm2 logs).
- **Domain alert missing for a known-expiring domain:** `expires_at` column is NULL in DB — check with `SELECT domain, expires_at FROM domains`.

---

## Requirements Proved By This UAT

- R012 (Finances: cost tracking + P&L) — UAT proves: P&L dashboard aggregates revenue vs costs correctly per site and portfolio-wide; domain expiry alerts surface at-risk domains; CSV export produces a correctly formatted downloadable file with matching numbers.

---

## Not Proven By This UAT

- R012 automated API sync (R020) — deferred to Phase 2. CSV import (S01) is the only revenue input method in Phase 1.
- That `expires_at` is correctly populated by the domain registration flow (M004) — that requires a real Spaceship domain registration.
- End-to-end: Amazon CSV import → revenue rows → P&L totals match Associates dashboard — requires real Associates account with CSV export and matching `affiliate_tag` in the site record.

---

## Notes for Tester

- The P&L totals are straightforward to manually verify: sum the cost and revenue rows visible in the Cost History / Revenue History tables below the P&L cards and compare to the KPI values. If they don't match, the likely cause is the date range filtering out some rows.
- The CSV export uses `toFixed(2)` for numbers — spreadsheet formatting may show extra decimal places depending on locale settings; this is display-only and doesn't affect the values.
- ROI calculation: `(profit / costs) * 100`. A site with €0 costs always shows "N/A" (no divide-by-zero). This is intentional — a site with free hosting and some revenue technically has infinite ROI, which "N/A" communicates more usefully than "∞%".
- Domain expiry alerts only appear for domains with a non-null `expires_at` in the DB. If no Spaceship-registered domains exist yet, seed one manually via SQL to test the alert card.
