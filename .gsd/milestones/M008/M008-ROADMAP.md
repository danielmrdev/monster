# M008: Finances + Amazon Revenue

**Vision:** Complete the Finances panel into a full P&L system — Amazon Associates CSV import with subtag-to-site attribution, manual revenue entry, and a P&L dashboard showing revenue vs costs with per-site ROI and domain expiry alerts.

## Success Criteria

- User can upload an Amazon Associates CSV (ES or US format) and see revenue rows attributed to correct sites, with unmatched tracking IDs surfaced (not silently dropped)
- User can add manual revenue entries (sponsorships, other affiliates) with site attribution
- P&L dashboard shows total revenue vs total costs, net profit, and per-site breakdown for any date range
- Domain expiry alerts show any domains expiring within 60 days
- User can export P&L data as CSV

## Key Risks / Unknowns

- **Amazon CSV format variance** — ES Associates accounts export semicolon-delimited CSV with Spanish column headers (`Fecha`, `Clics`, `Código de seguimiento`). US accounts use comma-delimited with English headers. `papaparse` auto-detects delimiter; the real risk is header name normalization. Retired in S01 by building the parser with a dual-language header map and verifying against a fixture CSV.
- **`revenue_amazon` UNIQUE(site_id, date, market) with NOT NULL site_id** — unattributed rows (tracking ID not matching any site's `affiliate_tag`) cannot be inserted. Decision: reject from DB, return in import response. Retired in S01 by design.

## Proof Strategy

- CSV format variance → retired in S01 T01: parser built with EN+ES header map + `delimiter: ''` auto-detect, verified against both ES-format and EN-format fixture CSVs in the test suite
- Unattributed row handling → retired in S01 T01: server action returns `{ inserted, updated, unattributed: TrackingId[] }` and UI displays them as warnings

## Verification Classes

- Contract verification: `pnpm -r typecheck` + `pnpm --filter @monster/admin build` exit 0 after each slice
- Integration verification: import a fixture CSV → verify `revenue_amazon` rows appear in Supabase with correct `site_id`; P&L numbers match manual sum from same data
- Operational verification: pm2 reload `monster-admin` clean after each slice
- UAT / human verification: upload a real Amazon Associates ES CSV export → revenue attributed to correct site; P&L CSV export opens correctly in spreadsheet

## Milestone Definition of Done

- CSV import correctly parses ES and EN Amazon CSV formats and maps tracking IDs to sites via `affiliate_tag`
- Unattributed tracking IDs are surfaced in the import result, not silently discarded
- Manual revenue entry stores rows in `revenue_manual` with optional site attribution
- P&L dashboard computes correct net profit per site from `costs` + `revenue_amazon` + `revenue_manual` for a user-selected date range
- Domain expiry alerts surface domains with `expires_at` within 60 days
- CSV export of P&L data produces a correct downloadable file
- `pnpm -r typecheck` exit 0, `pnpm --filter @monster/admin build` exit 0
- pm2 reload monster-admin clean

## Requirement Coverage

- Covers: **R012** (Finances: cost tracking + P&L) — S01 (revenue tracking) + S02 (P&L dashboard)
- Partially covers: **R002** (extensible architecture) — supporting: the revenue model is designed to handle multi-currency cleanly, consistent with ES-first constraint
- Leaves for later: R020 (Amazon API auto-sync, deferred Phase 2), R021 (AdSense, deferred Phase 2)
- Orphan risks: none — all active requirements are either covered, previously validated, or explicitly deferred

## Slices

- [x] **S01: Amazon CSV Import + Manual Revenue Entry** `risk:high` `depends:[]`
  > After this: user can upload an Amazon Associates CSV (ES or EN format), see imported revenue rows attributed to correct sites, see unmatched tracking IDs listed as warnings, and add manual revenue entries — all visible in the Finances page revenue section.

- [ ] **S02: P&L Dashboard + Domain Expiry Alerts + CSV Export** `risk:low` `depends:[S01]`
  > After this: user can view a full P&L dashboard with date-range filter showing revenue vs costs, net profit per site, ROI %, and domain expiry warnings; can export P&L as CSV download.

## Boundary Map

### S01 → S02

Produces:
- `revenue_amazon` rows in Supabase with `site_id`, `date`, `clicks`, `items_ordered`, `earnings`, `currency`, `market` — the data S02 aggregates for P&L
- `revenue_manual` rows with `site_id`, `amount`, `currency`, `date`, `source`, `notes`
- `importAmazonCSV` server action returning `{ inserted, updated, unattributed }` — import result shape S02 may surface in history
- `addManualRevenue` server action following `addCost` pattern
- `parseAmazonCSV(text, market)` pure parser function — reusable by S02 if ever needed for display
- Revenue section in Finances page with import form + manual entry form + revenue rows table

Consumes:
- `costs` table (existing, M002)
- `sites.affiliate_tag` for subtag → site matching (existing schema)
- `papaparse` npm package (new dep, added in S01)
- Existing `NativeSelect`, `FieldError`, `CostForm` patterns from `finances/`
