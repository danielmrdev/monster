---
id: S01-ASSESSMENT
slice: S01
milestone: M008
assessed_at: 2026-03-13
verdict: no_changes_needed
---

# S01 Roadmap Assessment — M008

## Verdict

Roadmap is unchanged. S02 proceeds as planned.

## Risk Retirement

Both S01 risks retired cleanly:
- **CSV format variance** — retired. Dual-language header map + papaparse auto-delimiter handles both EN and ES formats. Verified against fixture CSVs in Node.js spot-check.
- **Unattributed row handling** — retired by design. `ImportResult.unattributed[]` surfaced in browser UI as yellow warning block; unattributed rows not inserted (site_id NOT NULL constraint preserved).

One deviation from plan: `Artículos enviados` / `Shipped Items` column added to header map (normalized as `items_shipped`, not stored). Not a risk — it prevents false "Unrecognized CSV format" errors on real Amazon ES exports. Pattern documented in D127.

## Success Criteria Coverage

- User can upload an Amazon Associates CSV and see revenue rows attributed to correct sites, with unmatched tracking IDs surfaced → ✅ S01 delivered
- User can add manual revenue entries with site attribution → ✅ S01 delivered
- P&L dashboard shows total revenue vs total costs, net profit, and per-site breakdown for any date range → **S02**
- Domain expiry alerts show domains expiring within 60 days → **S02**
- User can export P&L data as CSV → **S02**

All remaining criteria have exactly one owning slice (S02). Coverage is complete.

## Boundary Contracts

S01 boundary map output is accurate:
- `revenue_amazon` rows exist with `site_id`, `date`, `market`, `clicks`, `items_ordered`, `earnings`, `currency`. `tracking_id` NOT stored — only used for attribution at import time. S02 aggregates these for P&L.
- `revenue_manual` rows exist with `site_id` (nullable), `source`, `amount`, `currency`, `date`, `notes`.
- `addManualRevenue` server action follows `addCost` pattern exactly.
- `siteNameById` Map pattern established in `page.tsx` — S02 should reuse it.

One notable implementation detail for S02: `revenue_amazon.updated` is always 0 (Supabase upsert does not distinguish new vs existing rows — D128). This has no impact on P&L computation correctness.

## Requirements

R012 (Finances: cost tracking + P&L) — status unchanged (active). S01 completes the revenue data layer. S02 delivers the P&L dashboard, which is required for R012 validation. No requirement ownership or status changes needed in REQUIREMENTS.md.

## S02 Outlook

S02 risk was already marked `low` and remains so. The data layer is complete:
- `costs` table: existing (M002)
- `revenue_amazon`: populated by S01 CSV import
- `revenue_manual`: populated by S01 manual entry form
- `domains.expires_at`: existing schema field (M004)

`computePnL()` pure in-memory reduction (D124), client-side Blob CSV export (D125), and in-memory domain expiry filter (D126) are all straightforward implementations with no new unknowns.
