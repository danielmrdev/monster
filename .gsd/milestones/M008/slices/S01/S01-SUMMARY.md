---
id: S01
parent: M008
milestone: M008
provides:
  - parseAmazonCSV pure function (EN + ES header normalization, BOM strip, delimiter auto-detect)
  - importAmazonCSV server action (FormData file upload → parse → site attribution → upsert → ImportResult)
  - addManualRevenue server action (Zod validation → revenue_manual insert, addCost pattern)
  - RevenueSection client component (CsvImportCard + ManualRevenueCard)
  - Revenue History table in finances/page.tsx (merged amazon + manual rows, sorted by date desc)
  - ImportResult, ImportAmazonState, AddManualRevenueState, AddManualRevenueErrors types
requires: []
affects:
  - S02
key_files:
  - apps/admin/src/app/(dashboard)/finances/lib.ts
  - apps/admin/src/app/(dashboard)/finances/actions.ts
  - apps/admin/src/app/(dashboard)/finances/revenue-section.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
  - apps/admin/package.json
key_decisions:
  - tracking_id used only for attribution lookup (exact match against sites.affiliate_tag); not stored in revenue_amazon
  - ES decimal comma ("12,50") and currency-prefixed ("€ 12,34") earnings handled by parseEarnings with last-separator heuristic
  - Supabase upsert does not distinguish inserted vs updated rows without a pre-query; both reported as inserted=N, updated=0
  - onConflict 'site_id,date,market' makes CSV re-import idempotent
  - Artículos enviados / Shipped Items mapped as items_shipped (normalized but not stored) to avoid throwing on real Amazon ES exports
  - NativeSelect and FieldError helpers inlined into revenue-section.tsx (not extracted), consistent with cost-form.tsx
  - Revenue rows merged and sorted in RSC by date string localeCompare — no client-side sort
  - siteNameById Map built once in page.tsx and reused for both cost and revenue tables
patterns_established:
  - parseAmazonCSV throws with header listing on unrecognized format — enables future-agent diagnosis
  - server actions follow prevState + formData signature; return structured state (success/error) not throw for user-facing errors
  - useActionState<StateType, FormData>(action, null) works with file upload forms without special handling
  - CSS class for styled file input: file:border-0 file:bg-transparent file:text-sm file:font-medium
observability_surfaces:
  - importAmazonCSV returns ImportResult with inserted/updated counts and unattributed[] list — displayed in UI immediately after submit
  - Parse errors include raw CSV header list in message: "Unrecognized CSV format. Headers found: <list>" — visible in red banner + PM2 logs
  - Unattributed tracking IDs displayed as yellow warning block with <code> per ID — actionable from browser
  - Supabase upsert errors thrown as Error("Failed to upsert revenue: <message>") — captured in PM2 stderr
  - Revenue History table shows merged amazon + manual rows — inspectable without DB access
  - DB: SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;
  - DB: SELECT * FROM revenue_manual ORDER BY created_at DESC LIMIT 10;
  - PM2: pm2 logs monster-admin --err --lines 20 for upsert failures
drill_down_paths:
  - .gsd/milestones/M008/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M008/slices/S01/tasks/T02-SUMMARY.md
duration: 70m
verification_result: passed
completed_at: 2026-03-13
---

# S01: Amazon CSV Import + Manual Revenue Entry

**Replaced the "Revenue coming soon" placeholder with a fully operational revenue section: Amazon Associates CSV import (EN + ES, subtag attribution), manual revenue entry form, and a merged Revenue History table — all backed by server actions and Supabase.**

## What Happened

**T01 — CSV parser + server actions (45m):**
Installed `papaparse` + `@types/papaparse`. Created `lib.ts` in `finances/` with `AMAZON_HEADER_MAP` covering both English and Spanish Amazon Associates CSV column names (10 entries) and a `parseEarnings` helper handling ES decimal comma, currency-prefixed values, and EN thousand-separated values via a last-separator heuristic.

`parseAmazonCSV` strips BOM, uses papaparse auto-delimiter detection (handles both `,` and `;`), normalizes headers via the map, skips rows missing `tracking_id` or `date`, and throws with a full header listing if no rows parse successfully. One deviation from the plan: `Artículos enviados` / `Shipped Items` columns added to the header map as `items_shipped` (normalized but not stored in DB) — required to avoid throwing on real Amazon ES exports which include this column.

In `actions.ts`: `importAmazonCSV` reads the file from FormData as ArrayBuffer → UTF-8 text → `parseAmazonCSV`, fetches all sites with non-null `affiliate_tag`, builds a `Map<affiliateTag, siteId>` for O(1) lookup, partitions rows into attributed/unattributed, upserts attributed rows with `onConflict: 'site_id,date,market'` (idempotent re-import), and returns a structured `ImportResult`. `addManualRevenue` follows the existing `addCost` pattern exactly (Zod validation, Supabase insert, `revalidatePath`).

The Supabase upsert returns all affected rows without distinguishing new vs existing — `updated` is always 0 in the current implementation; the UI shows the combined count. This is documented in a code comment and the T01 summary; it's acceptable for Phase 1.

**T02 — Revenue UI (25m):**
Created `revenue-section.tsx` as a `'use client'` component with two sub-components: `CsvImportCard` (wired to `importAmazonCSV`) and `ManualRevenueCard` (wired to `addManualRevenue`). Both use `useActionState<StateType, FormData>(action, null)` — file upload works with this signature without special handling. `NativeSelect` and `FieldError` helpers inlined (consistent with `cost-form.tsx`).

CSV import card: market selector defaulting to ES, styled file input, green success banner with insert/update counts, yellow unattributed-ID warning block with each ID as `<code>`, red error banner on failure.

Manual entry card: site selector (Portfolio-wide default), source text, amount/currency/date grid, notes textarea, per-field `FieldError`, green success banner.

Updated `page.tsx`: parallel `Promise.all` fetch adds `revenue_amazon` (with site join) and `revenue_manual` (with site join) alongside the existing costs fetch. Added `siteNameById` Map (replaces per-row `.find()` in the cost table too — minor O(n) improvement). Removed placeholder card, added `<RevenueSection sites={sites} />`, added Revenue History table showing both sources merged and sorted by date descending (RSC-side sort via `localeCompare`).

Amazon rows display as `Source = "Amazon (ES)"` etc. with `Notes = "{N} clicks, {M} ordered"`. Manual rows display `Source = row.source || 'Manual'`. Amounts formatted via `toLocaleString`.

## Verification

- `pnpm -r typecheck` — exit 0, all packages clean
- `pnpm --filter @monster/admin build` — exit 0; `/finances` route at 4.25 kB (up from 3.29 kB)
- `pm2 reload monster-admin` — process reloaded without error
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/finances` → 307 (route live, redirecting to login as expected)
- `parseAmazonCSV` spot-checked inline with Node.js: ES fixture (semicolon-delimited, decimal comma) → correct; EN fixture (comma-delimited, dot decimal) → correct; BOM-prefixed → BOM stripped; unrecognized format → throws with header list; empty `tracking_id` row → skipped; `€ 12,34` → 12.34

## Requirements Advanced

- R012 (Finances: cost tracking + P&L) — S01 delivers revenue tracking half: Amazon CSV import + manual revenue entry, both with Supabase persistence. Combined with existing cost tracking (M002/S04), the data layer for P&L is now complete. S02 delivers the P&L dashboard.

## Requirements Validated

- None validated by this slice alone (R012 validation requires S02 P&L dashboard).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- `Artículos enviados` / `Shipped Items` added to `AMAZON_HEADER_MAP` as `items_shipped` — not in task plan, but required to avoid throwing on real Amazon ES exports. Not stored in DB.
- `updated` always returned as 0 — Supabase upsert doesn't distinguish new vs existing rows without a pre-query. Documented. T02 UI shows combined count.
- `siteNameById` Map refactored to replace per-row `.find()` in the existing cost table too — minor improvement, not in task plan.

## Known Limitations

- `updated` count is always 0 in `ImportResult.updated` — re-importing the same CSV shows only `inserted` count. Not a correctness issue (upsert is idempotent), but the UX distinction between "new rows" and "already-imported rows" is lost. Phase 1 acceptable.
- No pagination on Revenue History table — capped at 100 rows per source. Sufficient for Phase 1.
- Browser-based UAT (visual form verification) not performed on VPS1 due to missing Playwright/Chromium system libs — build pass + route HTTP check is the verification substitute.

## Follow-ups

- S02 depends on `revenue_amazon` + `revenue_manual` rows being present. After human UAT confirms the CSV import works with a real Amazon Associates export, S02 can proceed.
- The `updated` count limitation could be addressed in S02 or a future cleanup by adding a pre-query count before the upsert.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — new: `AMAZON_HEADER_MAP`, `parseEarnings`, `parseAmazonCSV`, `ParsedRow`, `ImportResult`
- `apps/admin/src/app/(dashboard)/finances/actions.ts` — extended: `importAmazonCSV`, `addManualRevenue`, `ImportAmazonState`, `AddManualRevenueState`, `AddManualRevenueErrors`
- `apps/admin/src/app/(dashboard)/finances/revenue-section.tsx` — new: `RevenueSection` (CsvImportCard + ManualRevenueCard) client component
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — extended: revenue_amazon + revenue_manual fetches, `RevenueSection`, Revenue History table, `siteNameById` Map, placeholder removed
- `apps/admin/package.json` — added `papaparse` (dep) + `@types/papaparse` (devDep)

## Forward Intelligence

### What the next slice should know
- `revenue_amazon` rows have columns: `site_id`, `date`, `market`, `clicks`, `items_ordered`, `earnings`, `currency`. The `tracking_id` is NOT stored — only used for attribution at import time.
- `revenue_manual` rows have: `site_id` (nullable), `source` (nullable), `amount`, `currency`, `date`, `notes` (nullable).
- P&L computation (S02) should join `revenue_amazon + revenue_manual` against `costs` — all three tables are now populated.
- `siteNameById` Map pattern is established in `page.tsx` — S02 P&L page should use the same pattern.
- The `computePnL()` function documented in D124 is pure in-memory reduction — no materialized view needed.

### What's fragile
- `parseAmazonCSV` throws if zero rows parse successfully (including zero-row CSV or all rows skipped due to missing `tracking_id`/`date`). Real Amazon CSVs always have rows — this is correct behavior, but test with actual export before declaring it production-ready.
- The `onConflict: 'site_id,date,market'` unique constraint must exist in the DB schema. If it was ever dropped, upsert would create duplicates silently. Verify with `\d revenue_amazon` if re-import produces unexpected row counts.

### Authoritative diagnostics
- Import success/failure: `importAmazonCSV` returns structured state → red or green banner in browser immediately — no log access needed.
- Unattributed IDs: yellow warning block in browser — check `sites.affiliate_tag` for the expected tracking ID format (`<mainTag>-<siteslug>-20`).
- DB inspection: `SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;`
- Upsert errors: `pm2 logs monster-admin --err --lines 20`

### What assumptions changed
- T01 plan assumed `Artículos pedidos` and `Ingresos por envíos` were the only ES-specific columns. Actual Amazon ES exports also include `Artículos enviados` — added to header map to prevent false "Unrecognized CSV format" errors.
- T01 plan assumed upsert would return separate inserted/updated counts. Supabase upsert returns all affected rows without differentiation — `updated` is always 0.
