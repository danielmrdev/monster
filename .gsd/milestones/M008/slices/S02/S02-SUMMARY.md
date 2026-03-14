---
id: S02
parent: M008
milestone: M008
provides:
  - getDateRange helper (ISO validation, 30-day default, clamp)
  - computePnL pure aggregator (per-site profit/ROI, portfolio totals, mixedCurrencies flag)
  - SitePnL and PnLResult exported types
  - FinancesFilters client component (<form method="GET"> with date inputs)
  - P&L summary card (portfolio revenue/costs/profit KPIs, mixed-currency amber notice)
  - Per-site P&L breakdown table (sorted by profit desc, ROI color-coded)
  - Domain expiry alerts card (amber styled, hidden when no domains expire within 60 days)
  - PnLExportButton client component (Blob CSV download, filename encodes date range)
  - Date-range-filtered Supabase queries for costs, revenue_amazon, revenue_manual
requires:
  - slice: S01
    provides: revenue_amazon and revenue_manual rows in Supabase; sites.affiliate_tag for attribution
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/finances/lib.ts
  - apps/admin/src/app/(dashboard)/finances/finances-filters.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
  - apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx
key_decisions:
  - D124 — computePnL is pure in-memory; no materialized view or revenue_daily aggregation table
  - D125 — CSV export is client-side Blob download; no /api/finances/export route
  - D126 — domain expiry alerts filtered in-memory from domains.expires_at (60-day threshold)
  - Export button hidden when sitePnL.length === 0 (avoids header-only CSV download)
  - Revenue.limit(100) removed — date filter bounds result size naturally (deviation from S01 state)
patterns_established:
  - getDateRange: ISO regex + Date parse validation; clamp if from > to; fall back to defaults
  - computePnL: Map accumulators by site_id; null site_id → portfolio-only bucket; ROI null-safe
  - PnLExportButton: serializable props from RSC, Blob + createObjectURL + programmatic <a> click
  - Domain expiry: .not('expires_at', 'is', null) in Supabase + in-memory <= 60 day filter
  - Finances section order: Filters → P&L Summary → Per-Site + Export → Domain Renewals → Add Cost → Cost History → Revenue Forms → Revenue History
observability_surfaces:
  - Active date range visible in URL (?from=YYYY-MM-DD&to=YYYY-MM-DD) after filter submit
  - P&L summary card at /finances: totals and profit color (green/red) are passive data-correctness signals
  - Mixed-currency notice: amber banner renders inline when mixedCurrencies === true
  - Domain expiry card presence/absence is the diagnostic signal for expiring domains
  - CSV filename pnl-{from}-{to}.csv encodes the active date range
  - Supabase errors throw "Failed to fetch <table>: <PG message>" — caught by Next.js error boundary
drill_down_paths:
  - .gsd/milestones/M008/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S02/tasks/T02-SUMMARY.md
duration: ~70m (T01: ~30m, T02: ~40m)
verification_result: passed
completed_at: 2026-03-13
---

# S02: P&L Dashboard + Domain Expiry Alerts + CSV Export

**Finances page upgraded from a cost ledger to a full P&L system: date-filtered aggregation, portfolio KPI cards, per-site breakdown with ROI, domain expiry alerts, and one-click CSV export — all computed in-memory from existing Supabase tables.**

## What Happened

**T01** extended `lib.ts` with three additions: `getDateRange()` (ISO validation, 30-day default, clamp if from > to), plus `SitePnL`/`PnLResult` types, plus `computePnL()` — a pure Map-based reducer that groups costs and revenue by `site_id`, accumulates null-site rows into portfolio-only buckets, computes `profit = revenue - costs` and `roi = costs > 0 ? profit/costs*100 : null`, and sets `mixedCurrencies` when any row has currency !== 'EUR'. Created `FinancesFilters` — a `'use client'` `<form method="GET">` with two date inputs matching the AnalyticsFilters pattern (D086). Updated `page.tsx` to await `searchParams` (D120 pattern), compute `dateRange`, and apply `.gte/.lte` date filters to all three Supabase queries (costs, revenue_amazon, revenue_manual).

**T02** added parallel `domains` fetch (select `id, domain, expires_at, site_id` where `expires_at IS NOT NULL`) and computed the expiring-domains list in-memory (≤60 days, sorted by days ascending). Built the full Finances page UI:
- **P&L Summary card**: three KPI columns (Revenue, Costs, Net Profit), profit green if ≥0 / red if <0, amber mixed-currency notice when relevant
- **Per-Site Breakdown table**: five columns (Site, Revenue, Costs, Net Profit, ROI), sorted by profit descending, ROI color-coded green/red/N/A, empty-state row when no data in period
- **Export button** (`PnLExportButton`) in the table footer — only rendered when sitePnL.length > 0 — produces `pnl-{from}-{to}.csv` via client-side Blob download, no server route needed
- **Domain Renewals card** — amber border/header, conditionally rendered (hidden entirely when no domains expiring), rows color-coded red ≤14d / amber ≤30d / yellow ≤60d
- Section order enforced: Filters → P&L Summary → Per-Site + Export → Domain Renewals → Add Cost → Cost History → Revenue Forms → Revenue History

## Verification

```
pnpm -r typecheck                           → exit 0 (all 9 packages pass)
pnpm --filter @monster/admin build          → exit 0, /finances = 5.51 kB
pm2 reload monster-admin                    → ✓ (0 restarts)
curl http://localhost:3004/finances         → 307 (auth redirect, expected)
```

Manual logic verification:
- `computePnL` with 1 cost (€50) + 1 revenue (€80) → profit=30, roi=60 ✓
- Revenue-only site → roi=null (no divide-by-zero) ✓
- USD row → mixedCurrencies=true ✓
- All-EUR → mixedCurrencies=false ✓
- sitePnL roi=null → "N/A" rendered ✓; roi=60 → "60.0%" ✓
- profit=-20 → red; profit=30 → green ✓
- revenue=0, costs=0 → profit displays "—" ✓
- Domain daysRemaining=10 → included (≤60); 90 → excluded ✓
- CSV escaping: `"My Site, LLC"` → quoted; `She said "hi"` → double-escaped ✓
- Filename: `pnl-2026-02-11-2026-03-13.csv` ✓

## Requirements Advanced

- R012 (Finances: cost tracking + P&L) — S02 completes the P&L side: computePnL aggregates all revenue and cost sources into per-site and portfolio totals with ROI. Combined with S01 (CSV import + manual revenue), R012 is now fully implemented.

## Requirements Validated

- None elevated to validated this slice — R012 requires human UAT with real revenue data (upload an Amazon Associates CSV, verify P&L numbers match manual sum, export CSV, open in spreadsheet).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- **Export button hidden when no data**: plan didn't specify behavior when `sitePnL.length === 0`. Hiding the button avoids downloading a header-only CSV — a pragmatic UX choice not in the plan.
- **Removed `.limit(100)` from revenue queries**: limit was present before S02 date filtering was added. Date filter makes the limit both redundant and potentially misleading for high-volume days. Removed as strictly correct — plan didn't mention this limit.

## Known Limitations

- `revenue_daily` table is not populated by this pipeline — it's designed for future API-sync (R020, deferred). P&L aggregates from raw rows only.
- Mixed-currency totals are displayed but flagged as potentially inaccurate — no FX conversion is implemented (Phase 1 is EUR-only by design).
- `updated` count in CSV import result (from S01) always shows 0 — Supabase upsert doesn't distinguish insert vs update (D128).

## Follow-ups

- None discovered during S02 execution. M008 is now complete (both slices done).

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — added `getDateRange`, `computePnL`, `SitePnL`, `PnLResult`
- `apps/admin/src/app/(dashboard)/finances/finances-filters.tsx` — new `'use client'` date range form
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — full P&L page: date-filtered queries, P&L summary card, per-site table, domain alerts, section reorder
- `apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx` — new `'use client'` CSV download component

## Forward Intelligence

### What the next slice should know
- `computePnL` is importable standalone — no DB needed to test aggregation logic; call it with fixture arrays via `node -e`.
- P&L totals currently include revenue from unattributed `revenue_manual` rows (null `site_id`) in the portfolio total only. If unattributed revenue becomes significant, a "Portfolio-wide" row in the per-site table would make it visible.
- The Finances page is now a dynamic SSR route (no caching). At scale (>50K revenue rows), in-memory aggregation could slow — first optimization would be date-range pre-filtering already in place, second would be a materialized P&L view (D124 revisit trigger).

### What's fragile
- `domains.expires_at` column — domain expiry alerts only appear if this column is populated. Spaceship domain registration (M004) must write this value. If it's null for all domains, the alert card never appears (which is also the "no alerts" state — indistinguishable without checking the DB directly).
- `sitePnL` passed as props to `PnLExportButton` — serialized through RSC boundary. At large site counts (>500 sites with revenue) the prop payload could become noticeable. Practical limit is well above Phase 1 scale.

### Authoritative diagnostics
- `/finances?from=YYYY-MM-DD&to=YYYY-MM-DD` — URL params confirm which period is being aggregated; change them to narrow or widen scope for debugging P&L mismatches.
- pm2 logs `monster-admin` — Supabase query failures surface as "Failed to fetch <table>: <PG message>" in the Next.js error page; same message appears in pm2 stdout.

### What assumptions changed
- Original plan assumed `revenue_amazon.site_id` could be null — it's NOT NULL in the actual schema (confirmed in S01). `computePnL` handles this: no null guard on Amazon rows, only on manual rows.
