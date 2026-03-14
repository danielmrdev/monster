# S01: Amazon CSV Import + Manual Revenue Entry

**Goal:** Replace the "Revenue coming soon" placeholder with a working revenue section: Amazon Associates CSV import (EN + ES format, subtag → site attribution), manual revenue entry form, and a revenue history table.

**Demo:** Navigate to `/finances`, upload an Amazon Associates CSV fixture (or real export), see imported rows attributed to sites in the revenue table, see any unmatched tracking IDs listed as warnings, and add a manual revenue entry that also appears in the table.

## Must-Haves

- `papaparse` installed in `apps/admin`; CSV parsed server-side in a Next.js server action
- Header normalization handles both English (`Tracking ID`, `Clicks`, `Ordered Items`, `Shipped Revenue`, `Date`) and Spanish (`Código de seguimiento`, `Clics`, `Artículos pedidos`, `Ingresos por envíos`, `Fecha`) column names
- Delimiter auto-detected (`delimiter: ''` papaparse option) — handles both `,` (EN) and `;` (ES)
- BOM stripped from file text before parsing
- Subtag → site lookup by exact string match against `sites.affiliate_tag`
- Attributed rows upserted into `revenue_amazon` via `onConflict: 'site_id,date,market'` (idempotent re-import)
- Unattributed rows (tracking ID not in any `site.affiliate_tag`) returned in action response, never inserted into DB
- Market selected by user at import time (not derived from CSV); defaults to `ES`
- `addManualRevenue` server action following `addCost` pattern — Zod validation + Supabase insert + `revalidatePath`
- Revenue section in `/finances` page replaces placeholder: CSV upload form + manual entry form + revenue history table showing both `revenue_amazon` and `revenue_manual` rows
- Import result shows: `${inserted} rows imported, ${updated} updated` + warning list for unattributed tracking IDs
- `pnpm -r typecheck` exit 0, `pnpm --filter @monster/admin build` exit 0

## Observability / Diagnostics

**Runtime signals added by this slice:**
- `importAmazonCSV` returns a structured `ImportResult` with `{ inserted, updated, unattributed[] }` — inspectable from server action response in UI or logs
- Parse errors include raw CSV headers in the message: `"Unrecognized CSV format. Headers found: <list>"` — enables diagnosis of unknown export formats
- Upsert errors are thrown with Supabase error message attached: `"Failed to upsert revenue: <message>"` — PM2 logs capture these
- Unattributed tracking IDs surface in UI as a warning list — visible without DB access
- `revenue_amazon` rows can be inspected: `SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;`
- `revenue_manual` rows: `SELECT * FROM revenue_manual ORDER BY created_at DESC LIMIT 10;`

**Failure state inspection:**
- Parse failure: server action returns `{ success: false, error: "Unrecognized CSV format. Headers found: ..." }` — displayed as red banner in UI
- File missing: returns `{ success: false, error: "No file selected" }`
- Supabase upsert error: thrown (Next.js will log to PM2 stderr)
- All errors are non-silent — either returned as structured state or thrown

**Redaction:** No secrets in logs. `earnings` values are financial data — not logged, only stored in DB.

## Verification

```bash
# Typecheck + build
pnpm -r typecheck
pnpm --filter @monster/admin build

# Fixture import — run after pm2 reload
# Create a test CSV (see T01 for fixture content) and POST via admin UI
# Verify in Supabase: SELECT * FROM revenue_amazon ORDER BY created_at DESC LIMIT 5;
# Verify unattributed IDs appear in UI warning list (use a tracking ID not in any site.affiliate_tag)

# Failure path check — upload a .txt file with garbage content
# → Server action must return { success: false, error: "Unrecognized CSV format. Headers found: ..." }
# → UI must display red error banner with header names listed
# → No rows inserted in revenue_amazon (verify: SELECT COUNT(*) FROM revenue_amazon WHERE created_at > now() - interval '1 minute')

# pm2 reload
pm2 reload monster-admin
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/finances
# → 307 (redirect to /login or 200 if already authed)
```

## Tasks

- [x] **T01: CSV parser + `importAmazonCSV` server action** `est:1.5h`
  - Why: Core of the slice — the riskiest piece. Parser must handle EN/ES headers, semicolon/comma delimiter, BOM. Action handles file upload, site lookup, upsert, and result reporting.
  - Files: `apps/admin/src/app/(dashboard)/finances/actions.ts`, `apps/admin/src/app/(dashboard)/finances/lib.ts` (new), `apps/admin/package.json`
  - Do:
    1. `pnpm --filter @monster/admin add papaparse` + `pnpm --filter @monster/admin add -D @types/papaparse`
    2. Create `lib.ts` in `finances/` with:
       - `AMAZON_HEADER_MAP: Record<string, string>` — maps both EN and ES column names to internal keys: `{ 'Date': 'date', 'Fecha': 'date', 'Clicks': 'clicks', 'Clics': 'clicks', 'Ordered Items': 'items_ordered', 'Artículos pedidos': 'items_ordered', 'Shipped Revenue': 'earnings', 'Ingresos por envíos': 'earnings', 'Tracking ID': 'tracking_id', 'Código de seguimiento': 'tracking_id' }`
       - `parseAmazonCSV(text: string): ParsedRow[]` — strips BOM, calls `Papa.parse(text, { header: true, delimiter: '', skipEmptyLines: true })`, normalizes headers via map, returns `{ date, clicks, items_ordered, earnings, tracking_id }[]`. Any row missing `tracking_id` or `date` is skipped. Earnings parsed as float (strip currency symbols/spaces). If no rows parse successfully after normalization, throws with message listing unrecognized headers.
       - `type ParsedRow = { date: string; clicks: number; items_ordered: number; earnings: number; tracking_id: string }`
       - `type ImportResult = { inserted: number; updated: number; unattributed: string[] }`
    3. In `actions.ts`, add `importAmazonCSV` server action:
       - Accepts `FormData` with `file: File` and `market: string` fields
       - `file.arrayBuffer()` → `TextDecoder('utf-8').decode()` → `parseAmazonCSV(text)`
       - Fetch all sites with `affiliate_tag` non-null: `supabase.from('sites').select('id, affiliate_tag')`
       - Build `Map<string, string>` from `affiliate_tag → site_id`
       - Split parsed rows into attributed (exact match) and unattributed
       - Upsert attributed rows: `supabase.from('revenue_amazon').upsert([...], { onConflict: 'site_id,date,market', ignoreDuplicates: false })`
       - Return `{ success: true, result: ImportResult }` or `{ success: false, error: string }`
       - `revalidatePath('/finances')` on success
    4. Add `addManualRevenue` server action (same pattern as `addCost`):
       - Schema: `{ site_id?, source?, amount, currency, date, notes? }`
       - Insert into `revenue_manual`; `revalidatePath('/finances')`
    5. Export types: `ImportResult`, `ImportAmazonState`, `AddManualRevenueState`, `AddManualRevenueErrors`
  - Verify: `pnpm -r typecheck` exit 0; manually call `parseAmazonCSV` with a semicolon-delimited ES fixture and a comma-delimited EN fixture (inline test in T01 dev, not a test file) — both return correct rows
  - Done when: typecheck passes, `importAmazonCSV` and `addManualRevenue` are exported from `actions.ts`, `papaparse` is in `apps/admin/package.json`

- [x] **T02: Revenue UI — CSV upload form + manual entry form + revenue history table** `est:1.5h`
  - Why: Makes the import and manual entry accessible through the admin panel. Replaces the placeholder card. Users need to see imported rows to confirm attribution.
  - Files: `apps/admin/src/app/(dashboard)/finances/revenue-forms.tsx` (new), `apps/admin/src/app/(dashboard)/finances/page.tsx`
  - Do:
    1. Create `revenue-forms.tsx` — `'use client'` component with two sections:
       **CSV Import card:**
       - `useActionState` with `importAmazonCSV` action
       - Market selector (NativeSelect, defaults to ES) + file input (`<input type="file" accept=".csv,.txt">`) + submit button
       - On success: show `"${result.inserted} imported, ${result.updated} updated"` green banner
       - If `result.unattributed.length > 0`: yellow warning list "Unmatched tracking IDs — update affiliate_tag on the corresponding site:" + each ID as a `<code>` block
       - On error: red error banner with message
       - Loading state: "Importing…" on button
       **Manual Revenue Entry card:**
       - `useActionState` with `addManualRevenue` action
       - Fields: site (NativeSelect, optional), source (text input), amount (number), currency (NativeSelect EUR/USD/GBP), date (date input), notes (textarea optional)
       - Same FieldError + success banner pattern as CostForm
    2. Update `page.tsx`:
       - Add parallel fetches: `revenue_amazon` (with site join), `revenue_manual` (with site join) — ordered by date desc, limit 100
       - Remove placeholder card; import `RevenueSection` / `RevenueForms` client component
       - Add Revenue History table showing both sources: date, source (Amazon/Manual), site name, amount+currency, tracking ID (for amazon rows)
       - Pass `sites` to `RevenueForms` for the site selector
  - Verify: `pnpm --filter @monster/admin build` exit 0; navigate to `/finances` in browser — Revenue section visible with CSV upload form and manual entry form
  - Done when: build passes, revenue section renders without errors, both forms visible
