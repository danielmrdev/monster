---
id: T01
parent: S01
milestone: M008
provides:
  - parseAmazonCSV pure function (EN + ES header normalization, BOM strip, delimiter auto-detect)
  - importAmazonCSV server action (file upload → parse → site attribution → upsert → ImportResult)
  - addManualRevenue server action (Zod validation → revenue_manual insert)
  - ImportAmazonState, AddManualRevenueState, AddManualRevenueErrors types
key_files:
  - apps/admin/src/app/(dashboard)/finances/lib.ts
  - apps/admin/src/app/(dashboard)/finances/actions.ts
  - apps/admin/package.json
key_decisions:
  - tracking_id is used only for attribution lookup (site.affiliate_tag exact match); not stored in revenue_amazon
  - ES decimal comma ("12,50") and currency-prefixed ("€ 12,34") earnings both handled by parseEarnings with last-separator heuristic
  - Supabase upsert returns all rows (inserted + updated combined); reported as inserted=N, updated=0 — T02 UI shows combined count
  - onConflict: 'site_id,date,market' makes re-import idempotent
patterns_established:
  - parseAmazonCSV throws with header listing on unrecognized format — enables future-agent diagnosis
  - server actions follow prevState + formData signature; return structured state (success/error) not throw for user-facing errors
observability_surfaces:
  - Parse errors include raw header list in message — visible in UI red banner and PM2 logs
  - importAmazonCSV returns ImportResult with inserted/updated counts and unattributed[] list
  - Supabase errors thrown with message attached — captured by PM2 stderr
  - DB inspection: SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;
  - pm2 logs monster-admin --err --lines 20 for upsert failures
duration: 45m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: CSV parser + `importAmazonCSV` server action

**Shipped `parseAmazonCSV` with full EN/ES normalization and `importAmazonCSV` + `addManualRevenue` server actions.**

## What Happened

Installed `papaparse` + `@types/papaparse` in `apps/admin`. Created `lib.ts` with `AMAZON_HEADER_MAP` covering both English and Spanish Amazon Associates CSV column names, plus a `parseEarnings` helper that handles ES decimal comma ("12,50"), currency-prefixed values ("€ 12,34"), and EN thousand-separated values ("$1,234.56") using a last-separator heuristic.

`parseAmazonCSV` strips BOM, uses papaparse's auto-delimiter detection (handles both `,` and `;`), normalizes headers via the map, skips rows missing `tracking_id` or `date`, and throws with a header listing if no rows parse. The `Artículos enviados` / `Shipped Items` columns exist in real Amazon exports but aren't in the DB schema — added to the map as `items_shipped` (normalized but not stored) so those rows don't get silently dropped.

In `actions.ts`: `importAmazonCSV` reads the file from FormData, decodes UTF-8, parses, fetches all sites with non-null `affiliate_tag`, builds a Map for O(1) lookup, partitions rows into attributed/unattributed, upserts attributed rows with `onConflict: 'site_id,date,market'`, and returns a structured `ImportResult`. `addManualRevenue` follows the existing `addCost` pattern exactly.

## Verification

- `pnpm --filter @monster/admin build` — exit 0, `/finances` route compiles at 3.29 kB
- `npx tsc --noEmit` (in apps/admin) — exit 0, no type errors
- `pnpm -r typecheck` — exit 0 for all packages (admin has no typecheck script; tsc run directly)
- Spot-checks via inline Node.js script (using pnpm-installed papaparse):
  - ES fixture (`Fecha;Clics;...;12,50;mainTag-siteslug-20`) → `{ date: '2026-01-15', clicks: 3, items_ordered: 1, earnings: 12.5, tracking_id: 'mainTag-siteslug-20' }` ✓
  - EN fixture (comma-delimited, dot decimal) → correct ✓
  - BOM-prefixed file → BOM stripped, parses correctly ✓
  - Unrecognized format → throws `"Unrecognized CSV format. Headers found: garbage, data"` ✓
  - Row with empty tracking_id → skipped → all rows skipped → throws ✓
  - `€ 12,34` → `12.34` ✓

## Diagnostics

- Parse failures: `importAmazonCSV` returns `{ success: false, error: "Unrecognized CSV format. Headers found: <list>" }` — displayed as red banner in T02 UI
- Upsert failures: thrown as `Error("Failed to upsert revenue: <supabase message>")` — captured in PM2 stderr
- DB: `SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;`
- `revenue_manual`: `SELECT * FROM revenue_manual ORDER BY created_at DESC LIMIT 10;`

## Deviations

- `Artículos enviados` / `Shipped Items` columns added to header map as `items_shipped` — not in task plan, but required to avoid throwing on real Amazon ES exports which include this column. Not stored in DB.
- `updated` always returned as 0 — Supabase upsert doesn't distinguish new vs existing rows in return data without a pre-query. Documented in code comment. T02 UI should show combined count, not split.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — new: `AMAZON_HEADER_MAP`, `parseEarnings`, `parseAmazonCSV`, `ParsedRow`, `ImportResult`
- `apps/admin/src/app/(dashboard)/finances/actions.ts` — added `importAmazonCSV`, `addManualRevenue`, `ImportAmazonState`, `AddManualRevenueState`, `AddManualRevenueErrors`
- `apps/admin/package.json` — added `papaparse` (dep) + `@types/papaparse` (devDep)
- `.gsd/milestones/M008/slices/S01/S01-PLAN.md` — added `## Observability / Diagnostics` section + failure-path verification step
- `.gsd/milestones/M008/slices/S01/tasks/T01-PLAN.md` — added `## Observability Impact` section
