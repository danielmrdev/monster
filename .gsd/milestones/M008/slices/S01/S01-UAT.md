# S01: Amazon CSV Import + Manual Revenue Entry — UAT

**Milestone:** M008
**Written:** 2026-03-13

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The slice ships server actions that write to Supabase and a UI that reads from it. Only a live browser test confirms the full round-trip: file upload → parse → upsert → page refresh → Revenue History table. Typecheck + build pass (artifact-driven) are already confirmed; these test cases cover the remaining runtime and human-experience gaps.

## Preconditions

1. `pm2 reload monster-admin` completed without errors
2. At least one site exists in Supabase with a non-null `affiliate_tag` (format: `<mainTag>-<siteslug>-20`, e.g. `myshop-freidoras-20`)
3. User is authenticated in the admin panel (navigate to `/login` if redirected)
4. Two fixture CSV files prepared (see content below):
   - `es-fixture.csv` — semicolon-delimited, Spanish headers, decimal comma
   - `en-fixture.csv` — comma-delimited, English headers, decimal dot

**ES fixture (`es-fixture.csv`) content — replace `myshop-freidoras-20` with actual affiliate_tag:**
```
Fecha;Clics;Artículos pedidos;Artículos enviados;Ingresos por envíos;Código de seguimiento
2026-01-15;3;1;1;12,50;myshop-freidoras-20
2026-01-16;5;2;2;28,90;myshop-freidoras-20
2026-01-17;1;0;0;0,00;unknown-tag-999
```

**EN fixture (`en-fixture.csv`) content:**
```
Date,Clicks,Ordered Items,Shipped Items,Shipped Revenue,Tracking ID
2026-01-18,4,1,1,15.75,myshop-freidoras-20
2026-01-19,2,0,0,0.00,myshop-freidoras-20
```

**Garbage fixture (`garbage.txt`) content:**
```
This is not a CSV file at all.
Random text here.
```

## Smoke Test

Navigate to `/finances` — the Revenue section should be visible with two cards: "Import Amazon Associates CSV" and "Add Manual Revenue Entry". No "Coming soon" placeholder.

## Test Cases

### 1. ES format CSV import — attributed rows

1. Navigate to `/finances`.
2. In the "Import Amazon Associates CSV" card, verify the market selector defaults to `ES — Spain`.
3. Select the `es-fixture.csv` file.
4. Click **Import CSV**.
5. Wait for the form to respond (button shows "Importing…" briefly).
6. **Expected:** Green banner appears: `2 imported, 0 updated` (the third row with `unknown-tag-999` is unattributed).
7. **Expected:** Yellow warning block appears below the green banner: "Unmatched tracking IDs — update `affiliate_tag` on the corresponding site:" with `unknown-tag-999` as a `<code>` element.
8. In Supabase SQL editor, verify: `SELECT site_id, date, market, earnings, currency FROM revenue_amazon ORDER BY created_at DESC LIMIT 5;` — two rows with `date='2026-01-15'` and `date='2026-01-16'`, `earnings=12.5` and `28.9`, `market='ES'`, `currency='EUR'`, `site_id` matching the correct site.

### 2. EN format CSV import — attributed rows

1. Navigate to `/finances`.
2. In the "Import Amazon Associates CSV" card, select market `ES — Spain` (or appropriate market).
3. Select the `en-fixture.csv` file.
4. Click **Import CSV**.
5. **Expected:** Green banner: `2 imported, 0 updated`.
6. **Expected:** No yellow warning block (all rows attributed).
7. In Supabase: verify two more rows with `date='2026-01-18'` and `date='2026-01-19'`, `earnings=15.75` and `0.0`.

### 3. Re-import is idempotent (upsert, not duplicate insert)

1. Without changing the file, click **Import CSV** again with `en-fixture.csv`.
2. **Expected:** Green banner again: `2 imported, 0 updated`.
3. In Supabase: `SELECT COUNT(*) FROM revenue_amazon WHERE date='2026-01-18';` → still 1 (not 2).

### 4. Unrecognized CSV format shows error with header list

1. In the "Import Amazon Associates CSV" card, select the `garbage.txt` file.
2. Click **Import CSV**.
3. **Expected:** Red error banner appears with text containing `"Unrecognized CSV format. Headers found:"` and the text of the garbage file's first line.
4. **Expected:** No rows inserted: `SELECT COUNT(*) FROM revenue_amazon WHERE created_at > now() - interval '1 minute';` → 0.

### 5. Manual revenue entry — site-attributed

1. In the "Add Manual Revenue Entry" card, select a site from the site dropdown.
2. Enter `Source`: `Sponsorship`.
3. Enter `Amount`: `150.00`.
4. Select `Currency`: `EUR — Euro`.
5. Enter `Date`: `2026-01-20`.
6. Leave `Notes` blank.
7. Click **Add Revenue Entry**.
8. **Expected:** Green banner: `Revenue entry added.`
9. In Supabase: `SELECT * FROM revenue_manual ORDER BY created_at DESC LIMIT 1;` — row with `amount=150`, `currency='EUR'`, `source='Sponsorship'`, `site_id` matching the selected site.

### 6. Manual revenue entry — portfolio-wide (no site)

1. In the "Add Manual Revenue Entry" card, leave site selector as `Portfolio-wide`.
2. Enter `Amount`: `25.00`, `Currency`: `USD`, `Date`: `2026-01-21`.
3. Click **Add Revenue Entry**.
4. **Expected:** Green success banner.
5. In Supabase: latest `revenue_manual` row has `site_id = NULL`, `currency='USD'`, `amount=25`.

### 7. Manual revenue entry — validation errors

1. In the "Add Manual Revenue Entry" card, leave `Amount` and `Date` blank.
2. Click **Add Revenue Entry**.
3. **Expected:** Inline field errors appear below the `Amount` and `Date` fields (e.g. "Required" or similar Zod message). No success banner. No row inserted.

### 8. Revenue History table shows imported rows

1. After completing Test Cases 1–3, scroll down to the "Revenue History" table on `/finances`.
2. **Expected:** Table shows rows from both `revenue_amazon` sources: date, source (`Amazon (ES)`), site name, amount formatted as currency, notes showing click/ordered counts.
3. Rows are sorted by date descending (most recent first).
4. **Expected:** Manual entries from Test Cases 5–6 appear in the same table with `Source = "Sponsorship"` and `Source = "Manual"` respectively.

### 9. Revenue History table — empty state

1. On a fresh environment with no revenue data, navigate to `/finances`.
2. **Expected:** Revenue History table shows an empty state message (e.g. "No revenue recorded yet.") rather than an error or blank space.

## Edge Cases

### BOM-prefixed ES CSV

1. Create a file with UTF-8 BOM (`\uFEFF`) prepended to the ES fixture content.
2. Import it.
3. **Expected:** Same green success banner as Test Case 1 — BOM is stripped before parsing; no "Unrecognized CSV format" error.

### Amount with currency symbol (€ 12,34)

1. Create an ES fixture CSV where the `Ingresos por envíos` value is `€ 12,34`.
2. Import it.
3. **Expected:** `earnings` stored as `12.34` in Supabase (not 0, not NaN).

### Tracking ID not in any site's affiliate_tag

1. Create a CSV where all rows have a tracking ID (`unknown-xyz-20`) that does not match any site's `affiliate_tag`.
2. Import it.
3. **Expected:** Green banner shows `0 imported, 0 updated`. Yellow warning block lists `unknown-xyz-20`. No rows inserted in `revenue_amazon`.

### No file selected — submit button behavior

1. In the "Import Amazon Associates CSV" card, do not select a file.
2. Click **Import CSV**.
3. **Expected:** Browser native validation prevents submission (file input has `required`). Alternatively, if JS-submitted: red error banner with `"No file selected"`.

### Market selector — non-ES import

1. Select market `US — United States` in the CSV import form.
2. Import the EN fixture CSV.
3. **Expected:** Rows inserted with `market='US'` in `revenue_amazon`. Confirm: `SELECT market FROM revenue_amazon WHERE date='2026-01-18';` → `'US'`.

## Failure Signals

- Red error banner with "Unrecognized CSV format. Headers found: ..." → CSV parsing failed; check the file format
- No banner after submit and button re-enables → server action threw unexpectedly; check `pm2 logs monster-admin --err --lines 20`
- Revenue History table shows error instead of rows → `revenue_amazon` or `revenue_manual` fetch failed; check Supabase service role key in Settings
- `revenue_amazon` row count unexpectedly growing on re-import → `onConflict` unique constraint may be missing; verify `\d revenue_amazon` in Supabase SQL
- Manual entry form fields show no error but no success banner → server-side Zod error not surfaced; confirm `AddManualRevenueErrors` type is correct in actions.ts

## Requirements Proved By This UAT

- R012 (Finances: cost tracking + P&L) — partially: S01 proves revenue data collection (CSV import + manual entry) works end-to-end. Full R012 proof requires S02 (P&L dashboard + CSV export).

## Not Proven By This UAT

- P&L dashboard computation (S02)
- Domain expiry alerts (S02)
- CSV export of P&L data (S02)
- Real Amazon Associates ES account export upload (requires live account with subtag revenue data)
- Behavior with CSV files > 500 rows (not tested at scale)

## Notes for Tester

- The `affiliate_tag` on a site must match the tracking ID in the CSV exactly (exact string match). Format for TSA sites: `<mainTag>-<siteslug>-20`. Check the site's detail page → Edit to confirm the value.
- The `updated` count will always show 0, even on re-import — this is a known limitation (Supabase upsert doesn't return separate inserted/updated counts without a pre-query). The upsert IS idempotent; row count won't grow.
- Currency symbol parsing (`€`, `$`, `£`) is handled by `parseEarnings` — the symbol is stripped before parsing. If an unusual currency symbol causes `0.00` earnings, it's a `parseEarnings` edge case worth reporting.
- Browser UAT was not performed on VPS1 during development (missing Chromium system libs). Human UAT is the primary verification for the UI forms.
