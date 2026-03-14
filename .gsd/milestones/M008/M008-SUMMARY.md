---
id: M008
provides:
  - parseAmazonCSV pure function (EN + ES dual-language header map, BOM strip, delimiter auto-detect, decimal comma handling)
  - importAmazonCSV server action (FormData file upload → parse → affiliate_tag attribution → Supabase upsert → ImportResult with unattributed list)
  - addManualRevenue server action (Zod validation → revenue_manual insert, addCost pattern)
  - RevenueSection client component (CsvImportCard + ManualRevenueCard)
  - Revenue History table (merged amazon + manual rows, sorted by date desc)
  - getDateRange helper (ISO validation, 30-day default, clamp)
  - computePnL pure aggregator (per-site profit/ROI, portfolio totals, mixedCurrencies flag)
  - SitePnL and PnLResult exported types
  - FinancesFilters client component (<form method="GET"> with date inputs, D086 pattern)
  - P&L Summary card (portfolio revenue/costs/profit KPIs, mixed-currency amber notice)
  - Per-Site Breakdown table (sorted by profit desc, ROI color-coded green/red/N/A)
  - Domain Renewals alert card (amber, conditionally rendered, color-coded by urgency)
  - PnLExportButton client component (Blob CSV download, filename encodes date range)
  - Date-range-filtered Supabase queries for costs, revenue_amazon, revenue_manual
key_decisions:
  - D121 — Amazon CSV import is synchronous in server action (no BullMQ job); files are small (<100KB)
  - D122 — Dual-language header normalization map; visible error with header list on unrecognized format
  - D123 — Unattributed rows returned in ImportResult, never inserted (revenue_amazon.site_id is NOT NULL)
  - D124 — computePnL is pure in-memory; no materialized view or revenue_daily aggregation table
  - D125 — CSV export is client-side Blob download; no /api/finances/export route
  - D126 — Domain expiry alerts filtered in-memory from domains.expires_at (60-day threshold)
  - D127 — Artículos enviados / Shipped Items mapped but not stored (real ES exports include this column)
  - D128 — Supabase upsert updated count always 0; no pre-query to distinguish insert vs update
patterns_established:
  - parseAmazonCSV throws with full header listing on unrecognized format — enables future-agent diagnosis
  - server actions follow prevState + formData signature; return structured state not throw for user-facing errors
  - useActionState<StateType, FormData>(action, null) works with file upload forms without special handling
  - getDateRange: ISO regex + Date parse validation; clamp if from > to; fall back to 30-day default
  - computePnL: Map accumulators by site_id; null site_id → portfolio-only bucket; ROI null-safe (no divide-by-zero)
  - PnLExportButton: serializable props from RSC, Blob + createObjectURL + programmatic <a> click
  - Domain expiry: .not('expires_at', 'is', null) in Supabase + in-memory <= 60 day filter
  - Finances section order: Filters → P&L Summary → Per-Site + Export → Domain Renewals → Add Cost → Cost History → Revenue Forms → Revenue History
observability_surfaces:
  - importAmazonCSV returns ImportResult with inserted/updated counts and unattributed[] — displayed in UI immediately after submit
  - Parse errors include raw CSV header list: "Unrecognized CSV format. Headers found: <list>" — visible in red banner + PM2 logs
  - Unattributed tracking IDs displayed as yellow warning block with <code> per ID — actionable from browser
  - Active date range visible in URL (?from=YYYY-MM-DD&to=YYYY-MM-DD) after filter submit — confirms which period is aggregated
  - P&L summary card totals and profit color (green/red) are passive data-correctness signals at /finances
  - Mixed-currency amber notice renders inline when mixedCurrencies === true
  - Domain expiry card presence/absence is the diagnostic signal for expiring domains
  - CSV filename pnl-{from}-{to}.csv encodes the active date range
  - DB: SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;
  - DB: SELECT * FROM revenue_manual ORDER BY created_at DESC LIMIT 10;
  - PM2: pm2 logs monster-admin --err --lines 20 for upsert failures
requirement_outcomes:
  - id: R012
    from_status: active
    to_status: active
    proof: Both slices implemented — CSV import + manual revenue (S01) and P&L dashboard + domain alerts + CSV export (S02) — pass typecheck, build, and pm2 reload. Human UAT with real Amazon Associates CSV and real revenue data is pending to transition R012 to validated.
duration: ~140m (S01: ~70m, S02: ~70m)
verification_result: passed
completed_at: 2026-03-13
---

# M008: Finances + Amazon Revenue

**Upgraded the Finances panel from a cost ledger with a "Coming soon" revenue placeholder to a full P&L system: Amazon Associates CSV import with EN/ES format support and subtag attribution, manual revenue entry, date-filtered P&L dashboard with per-site ROI, domain expiry alerts, and one-click CSV export.**

## What Happened

M008 completed in two slices across roughly 2.5 hours of execution.

**S01 — Amazon CSV Import + Manual Revenue Entry:** Installed `papaparse` and built `parseAmazonCSV` in `lib.ts` — a pure function handling both Amazon Associates CSV formats: ES (semicolon-delimited, Spanish column headers, decimal comma, currency-prefixed amounts) and EN (comma-delimited, English headers, decimal dot). The `AMAZON_HEADER_MAP` covers 10 recognized column names in both languages. One deviation from the original plan: real Amazon ES exports include an `Artículos enviados` / `Shipped Items` column not in the initial header map — added as `items_shipped` (normalized but not stored in DB) to prevent false "Unrecognized CSV format" errors on actual exports.

`importAmazonCSV` server action reads the uploaded file as ArrayBuffer → UTF-8 text → `parseAmazonCSV`, fetches all sites with non-null `affiliate_tag`, builds an O(1) lookup map, partitions rows into attributed/unattributed, upserts attributed rows with `onConflict: 'site_id,date,market'` (idempotent re-import), and returns a structured `ImportResult`. Unattributed rows are surfaced as warnings in the UI — never silently dropped. `addManualRevenue` follows the established `addCost` pattern exactly.

`RevenueSection` client component wires both server actions via `useActionState`. CsvImportCard shows green/yellow/red banners for success/warning/error states. ManualRevenueCard mirrors the cost form UX with per-field Zod errors. `page.tsx` extended with parallel revenue fetches and a merged Revenue History table showing both sources sorted by date descending.

**S02 — P&L Dashboard + Domain Expiry Alerts + CSV Export:** Extended `lib.ts` with `getDateRange()` (ISO validation, 30-day default, clamp if from > to) and `computePnL()` — a pure Map-based reducer that groups all costs and revenue by `site_id`, accumulates null-site manual revenue into portfolio-only buckets, computes `profit = revenue - costs` and `roi = costs > 0 ? profit/costs*100 : null`, and flags `mixedCurrencies` when any row has currency !== 'EUR'.

`FinancesFilters` is a `'use client'` `<form method="GET">` with two date inputs (D086 pattern — same as AnalyticsFilters). `page.tsx` awaits `searchParams` (D120 pattern), computes `dateRange`, and applies `.gte/.lte` date filters to all three Supabase queries. A parallel `domains` fetch adds the domain expiry data without a separate page load.

The full Finances page now renders: date filter → P&L Summary KPI card (three columns, profit green/red) → Per-Site Breakdown table (sorted by profit desc, ROI color-coded, empty state for no-data periods) → Export button (hidden when `sitePnL.length === 0`, downloads `pnl-{from}-{to}.csv` via client-side Blob) → Domain Renewals alert card (amber border, red/amber/yellow row colors by urgency, hidden entirely when no domains expiring) → Add Cost → Cost History → Revenue Forms → Revenue History.

The two slices connect cleanly: `revenue_amazon` and `revenue_manual` rows written by S01 are the exact inputs aggregated by S02's `computePnL`. No schema changes were needed between slices — all tables were defined in M001.

## Cross-Slice Verification

**Success Criteria from M008-ROADMAP.md — verified against slice evidence:**

1. **User can upload an Amazon Associates CSV (ES or US format) and see revenue rows attributed to correct sites, with unmatched tracking IDs surfaced (not silently dropped)**
   - ✅ `parseAmazonCSV` spot-checked inline with Node.js: ES fixture (semicolon, decimal comma) → correct; EN fixture (comma, dot decimal) → correct; BOM-prefixed → BOM stripped; `€ 12,34` → 12.34; unrecognized format → throws with header list; empty tracking_id row → skipped
   - ✅ `importAmazonCSV` returns `{ inserted, updated, unattributed: string[] }` — UI displays unattributed IDs in yellow warning block
   - ✅ `onConflict: 'site_id,date,market'` makes re-import idempotent (no duplicate rows)
   - ⚠️ Human UAT pending: upload a real Amazon Associates ES account CSV with known subtag revenue data

2. **User can add manual revenue entries (sponsorships, other affiliates) with site attribution**
   - ✅ `addManualRevenue` server action with Zod validation, Supabase insert, `revalidatePath` — follows `addCost` pattern
   - ✅ ManualRevenueCard: site selector, source, amount/currency/date, notes, per-field errors, success banner
   - ✅ `revenue_manual.site_id` nullable (portfolio-wide entries supported)
   - ⚠️ Human UAT pending: browser-based form submission with live data

3. **P&L dashboard shows total revenue vs total costs, net profit, and per-site breakdown for any date range**
   - ✅ `computePnL` logic verified inline: 1 cost (€50) + 1 revenue (€80) → profit=30, roi=60%; revenue-only → roi=null; USD row → mixedCurrencies=true
   - ✅ `getDateRange` applies ISO validation and clamp correctly
   - ✅ `FinancesFilters` form serializes date range to URL params; `page.tsx` awaits searchParams and filters all queries
   - ✅ P&L Summary KPI card + Per-Site Breakdown table render in build output (`/finances` = 5.51 kB)
   - ⚠️ Human UAT pending: verify P&L totals match manual sum with real DB data

4. **Domain expiry alerts show any domains expiring within 60 days**
   - ✅ `domains` fetch with `expires_at IS NOT NULL` filter + in-memory ≤60 day filter
   - ✅ Domain Renewals card conditionally rendered (hidden when empty, amber border when present)
   - ✅ Row colors: red ≤14d / amber ≤30d / yellow ≤60d — verified in code review
   - ⚠️ Human UAT pending: real domain with `expires_at` populated by Spaceship registration (M004)

5. **User can export P&L data as CSV**
   - ✅ `PnLExportButton`: Blob CSV download, `pnl-{from}-{to}.csv` filename, hidden when no site data
   - ✅ CSV escaping verified: `"My Site, LLC"` → quoted; `She said "hi"` → double-escaped
   - ⚠️ Human UAT pending: open exported file in spreadsheet and verify numbers match dashboard

**Definition of Done checklist:**
- [x] CSV import correctly parses ES and EN Amazon CSV formats, maps tracking IDs to sites via `affiliate_tag`
- [x] Unattributed tracking IDs surfaced in import result, not silently discarded
- [x] Manual revenue entry stores rows in `revenue_manual` with optional site attribution
- [x] P&L dashboard computes correct net profit per site from `costs` + `revenue_amazon` + `revenue_manual` for user-selected date range
- [x] Domain expiry alerts surface domains with `expires_at` within 60 days
- [x] CSV export of P&L data produces a correct downloadable file
- [x] `pnpm -r typecheck` exit 0 — verified (9/9 packages clean)
- [x] `pnpm --filter @monster/admin build` exit 0 — `/finances` route at 5.51 kB
- [x] pm2 reload monster-admin clean — online, 0 restarts

## Requirement Changes

- R012 (Finances: cost tracking + P&L): active → **remains active** — Both slices implemented and contract-verified. The requirement advances significantly: CSV import, manual revenue, and full P&L aggregation are all in place. R012 will transition to `validated` when human UAT confirms: real Amazon Associates CSV imports correctly, P&L totals match manual sum, and CSV export opens cleanly in a spreadsheet. No additional implementation work is needed for this transition.

## Forward Intelligence

### What the next milestone should know
- `computePnL` is standalone and testable: call it with fixture arrays via `node -e` — no DB needed to verify aggregation logic.
- `revenue_amazon.site_id` is NOT NULL — unattributed rows cannot exist in the DB by design. The `affiliate_tag` exact-match requirement means any site added later whose tag was present in a historical CSV will require re-import to attribute those rows.
- `revenue_daily` table exists in the schema but is NOT populated by this pipeline. It's reserved for Phase 2 API-sync (R020). Any future work that reads `revenue_daily` expecting data will find it empty.
- P&L aggregation is date-filtered at the Supabase query level. At large data volumes (>50K revenue rows), the first optimization is already in place (date pre-filtering). Second optimization would be a materialized P&L view (D124 revisit trigger).
- The `updated` count in `ImportResult` is always 0 (D128). This is a known, documented limitation. If the UX distinction between "new rows" and "already-imported rows" becomes a product requirement, a pre-query count must be added before the upsert.
- `siteNameById` Map pattern is established in `finances/page.tsx` — new tables that need site name resolution should follow this pattern.

### What's fragile
- `domains.expires_at` column — domain expiry alerts only appear if this column is populated. Spaceship domain registration (M004) must write `expires_at`. If all `expires_at` values are null, the alert card never appears — indistinguishable from "no domains expiring soon" without a direct DB check.
- `parseAmazonCSV` throws if zero rows parse successfully (all rows skipped due to missing `tracking_id`/`date`, or empty CSV). This is correct behavior for real Amazon exports which always have rows, but test with an actual ES account export before declaring production-ready.
- `onConflict: 'site_id,date,market'` unique constraint in `revenue_amazon` — if this constraint was ever dropped from the DB schema, upsert would create duplicate rows silently on re-import. Verify with `\d revenue_amazon` if re-import produces unexpected row counts.
- `sitePnL` serialized as RSC props to `PnLExportButton` — at large site counts (>500 sites with revenue) the prop payload could become noticeable. Practical limit is well above Phase 1 scale.

### Authoritative diagnostics
- CSV parse failures: red banner in browser immediately after import — no log access needed. Banner includes the unrecognized header list.
- Unattributed IDs: yellow warning block in browser — check `sites.affiliate_tag` for the expected format (`<mainTag>-<siteslug>-20`).
- Upsert failures: `pm2 logs monster-admin --err --lines 20` — error message includes PG error detail.
- P&L mismatch: change URL to `/finances?from=YYYY-MM-DD&to=YYYY-MM-DD` to narrow the period; compare KPI card totals to raw rows in Cost History + Revenue History tables below.
- DB inspection: `SELECT site_id, date, market, earnings FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;`
- Domain expiry check: `SELECT domain, expires_at FROM domains WHERE expires_at IS NOT NULL ORDER BY expires_at ASC;`

### What assumptions changed
- T01 plan assumed `Artículos pedidos` and `Ingresos por envíos` were the only ES-specific columns. Actual Amazon ES exports also include `Artículos enviados` — added to header map (D127).
- T01 plan assumed upsert would return separate inserted/updated counts. Supabase upsert returns all affected rows without differentiation — `updated` is always 0 (D128).
- Original plan assumed `revenue_amazon.site_id` could be null. It's NOT NULL in the actual schema — confirmed in S01 execution. `computePnL` handles this: no null guard on Amazon rows, only on manual rows.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — new (S01): `AMAZON_HEADER_MAP`, `parseEarnings`, `parseAmazonCSV`, `ParsedRow`, `ImportResult`; extended (S02): `getDateRange`, `computePnL`, `SitePnL`, `PnLResult`
- `apps/admin/src/app/(dashboard)/finances/actions.ts` — extended (S01): `importAmazonCSV`, `addManualRevenue`, `ImportAmazonState`, `AddManualRevenueState`, `AddManualRevenueErrors`
- `apps/admin/src/app/(dashboard)/finances/revenue-section.tsx` — new (S01): `RevenueSection` client component (CsvImportCard + ManualRevenueCard)
- `apps/admin/src/app/(dashboard)/finances/finances-filters.tsx` — new (S02): `FinancesFilters` `'use client'` date range form
- `apps/admin/src/app/(dashboard)/finances/pnl-export-button.tsx` — new (S02): `PnLExportButton` `'use client'` Blob CSV download
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — extended (S01): revenue_amazon + revenue_manual fetches, RevenueSection, Revenue History table, siteNameById Map; rewritten (S02): date-filtered queries, P&L summary card, per-site table, domain alerts, section reorder
- `apps/admin/package.json` — added `papaparse` (dep) + `@types/papaparse` (devDep)
