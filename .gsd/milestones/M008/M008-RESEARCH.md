# M008: Finances + Amazon Revenue — Research

**Date:** 2026-03-13

## Summary

M008 is the finances completion milestone: it takes the M002 cost-entry shell and extends it into a full P&L system. Three main features: (1) enhanced cost tracking (domains auto-populated from the `domains` table, domain expiry alerts), (2) Amazon Associates CSV import that maps tracking IDs → sites via `affiliate_tag`, and (3) a P&L dashboard showing revenue vs costs with per-site ROI. The data model is already fully in place (`costs`, `revenue_amazon`, `revenue_manual`, `domains`). No new BullMQ workers are needed — CSV import is a synchronous Next.js server action (files are small, <100KB). The P&L view is a pure server-component read.

The primary complexity is the CSV import: Amazon Associates reports vary by market (ES may use semicolons as delimiters due to European locale), column headers change by report type (Daily Trends vs Tracking ID Summary vs standard earnings), and the tracking ID (subtag) → site mapping must be robust. The schema gap that matters most: `domains` has no cost column — domain costs are already tracked through the `costs` table (`category_slug='domains'`, `site_id`), not auto-derived from the `domains` table. The context doc's phrase "auto-populated from domains table" means we should cross-reference `domains.expires_at` for renewal alerts and infer annual domain cost from existing `costs` entries for that site.

The recommended slice ordering is: (S01) CSV import + revenue table + subtag mapping + manual revenue entry; (S02) P&L dashboard + domain expiry alerts + CSV export. The import is the riskiest piece (external format uncertainty) and should be proven first. S02 is pure data aggregation against tables S01 populates.

## Recommendation

**Don't add a BullMQ job for CSV import.** Files are small, synchronous processing in a Next.js server action is correct. Use `papaparse` for CSV parsing — it handles comma/semicolon auto-detection via the `delimiter: ''` option (auto-detect mode), which is essential for ES market CSVs that may use semicolons. Server actions already handle `FormData` with `File` objects natively in Next.js 15 — `formData.get('file') as File` → `arrayBuffer()` → `TextDecoder` → `Papa.parse()`. No temp file needed.

**For subtag → site mapping:** Sites store their full affiliate tag in `sites.affiliate_tag`. The Amazon tracking ID column contains the full subtag string (e.g. `mainTag-siteslug-20`). Exact string match against `sites.affiliate_tag` is the correct approach. No parsing/splitting needed. Unmatched rows should be stored with `site_id: null` and surfaced to the user as "unattributed revenue" — don't silently discard them.

**For the P&L dashboard:** Compute entirely in-memory in the server component. Sum all `costs` rows for the period, sum all `revenue_amazon` + `revenue_manual` rows, group by site_id, join with site names. No materialized view needed at this scale. `revenue_daily` table exists for pre-aggregation but isn't populated by CSV import — don't rely on it for Phase 1 P&L calculations, compute directly from source tables.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| CSV parsing (comma/semicolon auto-detect, quoted fields) | `papaparse@5` — `Papa.parse(text, { header: true, delimiter: '', skipEmptyLines: true })` | The `delimiter: ''` auto-detects separator. Handles quoted fields, BOM, UTF-8. Zero config for the common case. Writing a manual CSV splitter breaks on quoted fields with commas. |
| File upload in server action | Next.js 15 native — `formData.get('file') as File` → `file.arrayBuffer()` | Already used for FormData in cost-form.tsx, settings-form.tsx. No new pattern needed. |
| Currency formatting | `Intl.NumberFormat` / `toLocaleString` | Already used in finances/page.tsx cost list. Consistent with existing display. |
| Supabase upsert (idempotent re-import) | `supabase.from('revenue_amazon').upsert(..., { onConflict: 'site_id,date,market' })` | UNIQUE constraint `(site_id, date, market)` already in schema. Re-importing the same CSV is safe. |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/finances/actions.ts` — `addCost` server action: Zod validation + Supabase insert + `revalidatePath('/finances')`. Follow this pattern for `importAmazonCSV` and `addManualRevenue` server actions.
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — `useActionState<State, FormData>` client component with `NativeSelect`, `FieldError`, and success/error banners. Reuse the `NativeSelect` component and banner patterns for the CSV upload form.
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — `Promise.all` parallel fetch pattern for costs/categories/sites. Extend to also fetch `revenue_amazon`, `revenue_manual`, `domains` (for expiry alerts). The P&L section replaces the current "Revenue placeholder" card.
- `apps/admin/src/app/(dashboard)/analytics/lib.ts` — `computeMetrics` pure in-memory reducer over Supabase rows. Follow this pattern for `computePnL(costs, revenueAmazon, revenueManual, sites)` in `finances/lib.ts`.
- `apps/admin/src/app/(dashboard)/alerts/page.tsx` — Pattern for domain expiry alert card (list with status badges, optional acknowledge action).
- `packages/shared/src/constants/index.ts` — `AMAZON_MARKETS` with currency per market. Use for CSV import currency defaults and P&L currency display.

## Schema Findings

### revenue_amazon columns vs Amazon CSV columns

The `revenue_amazon` DB table has: `clicks, items_ordered, earnings, currency, market`. Amazon ES CSV has: `Date, Clicks, Ordered Items, Shipped Items, Shipped Revenue, Tracking ID`. The mapping:
- `Date` → `date`
- `Clicks` → `clicks`
- `Ordered Items` → `items_ordered`
- `Shipped Revenue` → `earnings` (monetary — this is what we care about)
- `Tracking ID` → subtag → `site_id` lookup
- `market` → derived from user selection at import time (not in CSV)
- `Shipped Items` → not stored (no column) — can be dropped

There is NO `items_shipped` column in the DB. The context doc mentions it in the CSV but the schema doesn't have it. This is fine — `items_ordered` captures the key metric.

### Domain costs gap

`domains` table has no `registration_cost` or `annual_cost` column. The context doc says "domain costs automatically populated from the `domains` table" — this should be interpreted as: when a domain is registered via Spaceship (M004 flow), a corresponding `costs` row with `category_slug='domains'` and `site_id` is already inserted manually by the user, OR we auto-insert it when `registerDomain` succeeds. The Spaceship API returns pricing only for premium domains, not standard registrations. Standard .com/.es domain cost is fixed (~€10-12/year) and can be configured as a global setting or entered manually. **No `domains` schema migration needed.**

### revenue_amazon UNIQUE constraint gap

The UNIQUE constraint is `(site_id, date, market)` — but `site_id` is NOT NULL and `market` is nullable. If we store unattributed rows (`site_id = null`), there can be multiple nulls, which breaks the uniqueness constraint in PostgreSQL (NULL != NULL). Two options: (a) never store `site_id = null` — require all rows to be attributed, show unattributed in UI without inserting; (b) add a partial index. Simplest: collect unattributed rows in the import response and show them to the user without inserting. They can manually add the site by editing the affiliate_tag on the site.

### revenue_amazon has no `items_shipped` column

Amazon CSV has "Shipped Items" — just drop it in the parser. DB doesn't need it.

## Constraints

- Next.js server action default body size limit: 1MB. Amazon CSV reports are <100KB — safe with no config change.
- `papaparse` must be added as a dependency to `apps/admin` (not in workspace currently).
- Amazon Associates CSV format: NOT guaranteed to be comma-separated — Spanish locale typically produces semicolons. `papaparse` with `delimiter: ''` handles auto-detection.
- Amazon CSV columns are in the UI language of the Associates account (Spanish for `.es`). Column headers may be in Spanish: `Fecha`, `Clics`, `Artículos pedidos`, `Artículos enviados`, `Ingresos por envíos`, `Código de seguimiento`. The parser must handle BOTH English and Spanish header names.
- The subtag format `<main-tag>-<siteslug>-20` means `affiliate_tag` is the full value stored in `sites.affiliate_tag`. No parsing needed — direct string match. But the `-20` suffix is only for .es market; other markets may not have this suffix. Direct match is correct.
- CSV import is synchronous in the server action — no progress tracking needed for small files.
- `revenue_amazon` UNIQUE constraint: `(site_id, date, market)`. With nullable `site_id`, PostgreSQL treats each NULL as distinct, so multiple NULL-site rows for the same date+market won't violate the constraint — but this creates orphaned rows. Better: reject unattributed rows from DB insert, return them in the server action response.

## Common Pitfalls

- **Spanish column headers** — Amazon ES associates account exports CSV with Spanish header names (`Fecha`, `Clics`, etc.), not English. The parser must normalize header names to internal keys using a lookup map that covers both languages. Don't hardcode English-only header names.
- **Semicolon delimiter in ES CSVs** — European locale Amazon reports use `;` as separator, not `,`. `Papa.parse(text, { delimiter: '' })` auto-detects, but test with both. Alternative: try comma first, if all rows parse to 1 column, try semicolon.
- **BOM in CSV files** — Some Amazon CSV downloads include a UTF-8 BOM (`\uFEFF`). `papaparse` handles this with `skipEmptyLines: true` and will include BOM in the first column header if not stripped. Add `.trimStart()` on the file text before parsing.
- **Date format** — Amazon ES dates are `YYYY-MM-DD` (ISO). US dates may be `MM/DD/YYYY`. The parser needs to normalize to ISO `YYYY-MM-DD` for DB storage. ES format is standard ISO — no transformation needed.
- **Revenue column** — Amazon CSV has both "Ordered Items" and "Shipped Items" amounts. Map `Shipped Revenue` (not `Ordered Revenue`) to `earnings` — Shipped Revenue is the actual commission-eligible amount. The revenue_amazon schema has only `earnings`, which should be Shipped Revenue.
- **Duplicate import** — Same CSV imported twice. The `upsert` with `onConflict: 'site_id,date,market'` handles this for attributed rows. Return a diff (inserted vs updated count) in the server action response.
- **P&L currency mixing** — Costs may be in EUR, revenue in USD (if US sites added later). Phase 1 is ES-only (EUR), so direct summation is safe. Add a warning in the UI if mixed currencies are detected. Don't do currency conversion in Phase 1 — show per-currency totals.
- **`revenue_daily` not populated** — The `revenue_daily` table exists for pre-aggregation but Phase 1 P&L reads directly from `revenue_amazon` + `revenue_manual`. Don't add complexity by trying to maintain `revenue_daily` from CSV import — it's designed for future API-sync use.
- **Domain expiry dates** — `domains.expires_at` is a `timestamptz` stored as ISO string in Supabase types. The "60 days" threshold is calendar days from `new Date()`. Use `dayjs` or pure JS date math — don't add date libraries unless already present.

## Open Risks

- **Amazon ES CSV header language** — Cannot verify Spanish header names without a real Amazon.es Associates account. The parser must be resilient to both `Tracking ID` and `Código de seguimiento` (or whatever Amazon.es calls it in Spanish). Build a column name normalizer with both English and Spanish mappings, and a fallback that tries column-index-based parsing if header names don't match.
- **Amazon CSV format changes** — Amazon has changed their CSV format multiple times. The parser should log unrecognized headers and fail gracefully rather than silently producing zeros. Show the user which rows were imported and which were skipped.
- **`revenue_amazon` UNIQUE(site_id, date, market) with nullable site_id** — If we ever allow storing unattributed rows, this breaks. Decision: never insert rows with `site_id = null`. Show unattributed tracking IDs in import results.
- **P&L currency conversion** — Phase 1 is ES-only (EUR) so this won't surface yet, but the P&L dashboard should be designed to handle multi-currency cleanly when US/UK markets are added.

## Candidate Requirements (Advisory)

- **RC-M008-01 (advisory):** Auto-insert a `costs` row (`category_slug='domains'`, `site_id`) when a domain is registered via Spaceship. This closes the "domain costs auto-populated" loop without a `domains` schema migration. Candidate for M004 backfill or M008/S01.
- **RC-M008-02 (advisory):** Add `items_shipped` column to `revenue_amazon` to store the "Shipped Items" CSV column. Low priority — `items_ordered` is the operational metric. Only add if user asks for shipped conversion rate analysis.
- **RC-M008-03 (advisory):** Populate `revenue_daily` from CSV import to enable historical trend charts. Not blocking for Phase 1 P&L — adds complexity. Defer until chart/trend UI is needed.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js 15 (file upload) | none needed — native FormData | built-in |
| papaparse | none — well-documented, simple API | none found |

## Sources

- Amazon Associates CSV format: comma-separated or tab-separated, `Tracking ID` column is the subtag, confirmed via amzwatcher.com description of tracking ID fields (clicks, ordered items, shipped items, returned items, conversion rate, revenue, total earnings)
- European CSV delimiter issue: ES locale uses semicolons instead of commas in CSVs (stackoverflow.com/questions/10140999)
- `papaparse` auto-detect delimiter: `delimiter: ''` activates auto-detection (npmjs.com/package/papaparse)
- Next.js 15 server action file upload: `formData.get('file') as File` → `file.arrayBuffer()` (pronextjs.dev/next-js-file-uploads-server-side-solutions)
- Amazon Associates reports available as CSV (.txt), Excel (.xlsx), and XML — CSV is the correct format to target (affiliate-program.amazon.com help page)
- `revenue_amazon` schema: `(site_id, date, market)` UNIQUE constraint, `clicks + items_ordered + earnings` fields (packages/db/supabase/migrations/20260313000006_finances.sql)
- Existing cost-entry patterns: `addCost` server action, `CostForm` client component, `NativeSelect` helper (apps/admin/src/app/(dashboard)/finances/)
