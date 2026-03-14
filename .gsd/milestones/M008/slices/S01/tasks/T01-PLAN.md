---
estimated_steps: 8
estimated_files: 3
---

# T01: CSV parser + `importAmazonCSV` server action

**Slice:** S01 — Amazon CSV Import + Manual Revenue Entry
**Milestone:** M008

## Description

Install `papaparse`, build the `parseAmazonCSV` pure function with EN+ES header normalization and delimiter auto-detection, then wire it into a `importAmazonCSV` Next.js server action that fetches all sites by `affiliate_tag`, splits rows into attributed/unattributed, upserts into `revenue_amazon`, and returns a structured `ImportResult`. Also add `addManualRevenue` action following the existing `addCost` pattern.

## Steps

1. Install papaparse: `pnpm --filter @monster/admin add papaparse` + `pnpm --filter @monster/admin add -D @types/papaparse`
2. Create `apps/admin/src/app/(dashboard)/finances/lib.ts`:
   - Define `AMAZON_HEADER_MAP` with both EN and ES column name mappings to internal keys (`date`, `clicks`, `items_ordered`, `earnings`, `tracking_id`)
   - Define `ParsedRow` type: `{ date: string; clicks: number; items_ordered: number; earnings: number; tracking_id: string }`
   - Define `ImportResult` type: `{ inserted: number; updated: number; unattributed: string[] }`
   - Implement `parseAmazonCSV(text: string): ParsedRow[]`:
     - Strip BOM: `text.trimStart()`
     - `Papa.parse(text, { header: true, delimiter: '', skipEmptyLines: true })`
     - Normalize each row's keys via `AMAZON_HEADER_MAP` (build a normalized row from matched keys only)
     - Skip rows where `tracking_id` or `date` is empty/missing
     - Parse `clicks` and `items_ordered` as `parseInt` (default 0 on NaN), `earnings` as `parseFloat` (strip non-numeric chars except `.` first — handle `€ 12,34` → `12.34` for ES locale: replace `,` with `.` and strip non-digit/non-dot chars)
     - If zero rows parsed after normalization: throw `Error('Unrecognized CSV format. Headers found: ' + rawHeaders.join(', '))`
     - Return `ParsedRow[]`
   - Export: `parseAmazonCSV`, `ParsedRow`, `ImportResult`
3. In `actions.ts`, add `importAmazonCSV(prevState, formData: FormData)` server action:
   - Extract `file = formData.get('file') as File | null` and `market = (formData.get('market') as string) || 'ES'`
   - Validate: if `!file || file.size === 0` return `{ success: false, error: 'No file selected' }`
   - `const text = new TextDecoder('utf-8').decode(await file.arrayBuffer())`
   - `let rows: ParsedRow[]; try { rows = parseAmazonCSV(text) } catch(e) { return { success: false, error: e.message } }`
   - Fetch sites: `supabase.from('sites').select('id, affiliate_tag').not('affiliate_tag', 'is', null)`
   - Build `Map<string, string>` of `affiliate_tag → site.id`
   - Partition rows: `attributed` (has match) and `unattributed` (no match — collect unique `tracking_id` values)
   - Upsert attributed: map each to `{ site_id, date, clicks, items_ordered, earnings, currency: 'EUR', market }`, call `supabase.from('revenue_amazon').upsert(rows, { onConflict: 'site_id,date,market' })`; count inserted vs updated from returned data (use `select` option or count length of result)
   - `revalidatePath('/finances')`
   - Return `{ success: true, result: { inserted, updated, unattributed } }`
4. Add `addManualRevenue(prevState, formData: FormData)` server action:
   - Schema: `z.object({ site_id: z.string().optional(), source: z.string().optional(), amount: z.coerce.number().positive(), currency: z.string().default('EUR'), date: z.string().min(1), notes: z.string().optional() })`
   - Insert into `revenue_manual`
   - `revalidatePath('/finances')`
5. Export types: `ImportAmazonState`, `AddManualRevenueState`, `AddManualRevenueErrors` from `actions.ts`

## Must-Haves

- [ ] `papaparse` and `@types/papaparse` in `apps/admin/package.json`
- [ ] `parseAmazonCSV` handles both EN (comma, English headers) and ES (semicolon, Spanish headers) formats
- [ ] BOM stripped before parsing
- [ ] Unrecognized CSV throws with header names listed
- [ ] Unattributed tracking IDs returned in result, never inserted
- [ ] `onConflict: 'site_id,date,market'` upsert (idempotent re-import)
- [ ] `addManualRevenue` exports from `actions.ts`
- [ ] `pnpm -r typecheck` exit 0

## Verification

- `pnpm -r typecheck` — exit 0
- `pnpm --filter @monster/admin build` — exit 0 (parser + actions compile cleanly)
- Manual spot-check: create a small ES-format fixture (`Fecha;Clics;Artículos pedidos;Artículos enviados;Ingresos por envíos;Código de seguimiento\n2026-01-15;3;1;1;12,50;mainTag-siteslug-20`) and confirm `parseAmazonCSV` returns expected `{ date: '2026-01-15', clicks: 3, items_ordered: 1, earnings: 12.5, tracking_id: 'mainTag-siteslug-20' }`

## Observability Impact

**What changes:**
- `parseAmazonCSV` throws with header listing on unrecognized format — future agents can read the error message to know exactly what headers were found
- `importAmazonCSV` server action returns structured `ImportResult` with counts and unattributed IDs — inspectable from UI response state or PM2 logs
- Upsert failures propagate as thrown errors with Supabase message attached — captured in PM2 stderr

**How to inspect:**
- After a CSV import, check `revenue_amazon`: `SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 5;`
- Unattributed tracking IDs are in the action return value `result.unattributed[]` — displayed in UI and logged on the server side if needed
- Parse errors: run `parseAmazonCSV` with the raw text and read the thrown message — lists all unrecognized headers

**Failure visibility:**
- `{ success: false, error: "No file selected" }` — empty form submit
- `{ success: false, error: "Unrecognized CSV format. Headers found: <list>" }` — bad CSV
- Upsert error thrown → PM2 captures in stderr → `pm2 logs monster-admin --err --lines 20`

## Inputs

- `apps/admin/src/app/(dashboard)/finances/actions.ts` — existing `addCost` pattern to follow
- `packages/db/src/types/supabase.ts` — `revenue_amazon` and `revenue_manual` Insert types
- `sites.affiliate_tag` field — direct match target for subtag lookup

## Expected Output

- `apps/admin/src/app/(dashboard)/finances/lib.ts` — `parseAmazonCSV`, `ImportResult`, `ParsedRow`
- `apps/admin/src/app/(dashboard)/finances/actions.ts` — `importAmazonCSV`, `addManualRevenue` added; new types exported
- `apps/admin/package.json` — `papaparse` + `@types/papaparse` in deps
