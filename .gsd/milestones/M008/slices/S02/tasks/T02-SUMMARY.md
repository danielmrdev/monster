---
id: T02
parent: S02
milestone: M008
provides:
  - P&L summary card (portfolio revenue/costs/profit, mixed-currency notice)
  - Per-site P&L breakdown table with ROI column (green/red/N/A)
  - Domain expiry alerts card (amber styled, hidden when no expiring domains)
  - PnLExportButton client component (CSV download, no server roundtrip)
  - pnl-export-button.tsx new file
key_files:
  - apps/admin/src/app/(dashboard)/finances/page.tsx
  - apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx
key_decisions:
  - CSV export is client-side Blob download — no new API route needed; data already serialized to client via RSC props
  - domains.site_id is non-nullable — no null-guard needed (unlike revenue_manual)
  - Export button shown only when sitePnL.length > 0 — avoids empty CSV download with header only
  - Domain alert card hidden entirely when expiringDomains.length === 0 — card presence is the diagnostic signal
patterns_established:
  - PnLExportButton receives sitePnL[] + dateRange as plain serializable props — no server action needed
  - expiringDomains computed in-memory: .not('expires_at', 'is', null) in Supabase, then filter <= 60 days in JS
  - Color coding via inline className conditionals (profitColor, roiColor, daysRemainingColor helpers)
observability_surfaces:
  - P&L summary card visible at /finances — totals, colors, and mixed-currency notice are passive correctness signals
  - Domain expiry card presence/absence indicates whether any domains expire within 60 days (no DB query needed to verify)
  - CSV filename pnl-{from}-{to}.csv encodes the active date range — confirms which period was exported
  - Supabase domains query error throws Failed to fetch domains: <PG message> — caught by Next.js error boundary
duration: ~40m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: P&L dashboard UI + domain expiry alerts + CSV export

**Added P&L summary card, per-site table, domain expiry alerts, and CSV export button to the Finances page — the full user-visible output of M008.**

## What Happened

Built two files:

**`pnl-export-button.tsx`** — new `'use client'` component. Receives `sitePnL[]` and `dateRange` as plain props (already serialized by RSC). On click: constructs CSV string with header `Site,Revenue (EUR),Costs (EUR),Net Profit (EUR),ROI %`, handles comma/quote escaping in site names, creates a `Blob`, triggers download via programmatic `<a>` click, revokes the object URL. Filename: `pnl-{from}-{to}.csv`.

**`page.tsx`** updated with:
1. `domains` added to `Promise.all` — `select('id, domain, expires_at, site_id').not('expires_at', 'is', null)`. In-memory filter for `daysRemaining <= 60`, sorted by `daysRemaining` ascending.
2. **P&L Summary card** — three metric columns (Revenue, Costs, Net Profit). Profit is green if ≥ 0, red if < 0. Mixed-currency amber notice below metrics when `pnlResult.mixedCurrencies`.
3. **Per-Site Breakdown table** — five columns: Site, Revenue, Costs, Net Profit, ROI. ROI is `N/A` (gray) when costs=0, green if >0, red if <0. Net profit shows `—` only when both revenue and costs are 0. Export button in footer of this card, only rendered when `sitePnL.length > 0`.
4. **Domain Renewals card** — amber border/header, conditionally rendered (hidden if no expiring domains). Days-remaining color: red ≤14, amber ≤30, yellow ≤60.
5. Section order: `[FinancesFilters] [P&L Summary] [Per-Site + Export] [Domain Renewals] [Add Cost Form] [Cost History] [Revenue Forms] [Revenue History]`.

## Verification

```
pnpm --filter @monster/admin build → exit 0, /finances is 5.51 kB (up from smaller, confirms new components compiled)
pm2 reload monster-admin           → success
curl http://localhost:3004/finances → 307 (auth redirect, expected)
```

Node inline checks:
- `sitePnL` with `roi=null` → displays "N/A" ✓
- `sitePnL` with `roi=60.0` → displays "60.0%" ✓
- `profit=-20` → red, `profit=30` → green ✓
- `revenue=0, costs=0` → profit displays "—" ✓
- Domain 10d → included, 45d → included, 90d → excluded ✓
- CSV escaping: `"My Site, LLC"` → `"My Site, LLC"` (quoted); `She said "hi"` → `"She said ""hi"""` ✓
- Filename: `pnl-2026-02-11-2026-03-13.csv` ✓

## Diagnostics

- P&L card at `/finances` shows totals with green/red profit — a glanceable data correctness signal.
- Mixed-currency notice: amber banner renders when `mixedCurrencies === true` — visible without DevTools.
- Domain expiry card hidden ↔ no `expires_at` within 60 days. If it shows, urgency is color-coded by days remaining.
- CSV filename encodes active date range — confirms which period was exported.
- Supabase `domains` fetch failure: throws `Failed to fetch domains: <PG message>` → caught by Next.js error boundary; visible in browser error page without server log access.

## Deviations

- Export button hidden when `sitePnL.length === 0` (plan didn't specify; avoids downloading a header-only CSV with no data rows — a pragmatic UX choice).

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/page.tsx` — added domains fetch, P&L summary card, per-site table, domain alerts card; section reorder
- `apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx` — new client component for CSV download
- `.gsd/milestones/M008/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
