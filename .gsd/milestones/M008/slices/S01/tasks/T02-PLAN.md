---
estimated_steps: 6
estimated_files: 2
---

# T02: Revenue UI — CSV upload form + manual entry form + revenue history table

**Slice:** S01 — Amazon CSV Import + Manual Revenue Entry
**Milestone:** M008

## Description

Create the `RevenueSection` client component with CSV import card and manual revenue entry card. Update `finances/page.tsx` to fetch revenue data from both `revenue_amazon` and `revenue_manual` and render the revenue history table, replacing the existing placeholder card.

## Steps

1. Create `apps/admin/src/app/(dashboard)/finances/revenue-section.tsx` — `'use client'` component:
   - Props: `sites: { id: string; name: string }[]`
   - **CSV Import card** using `useActionState(importAmazonCSV, null)`:
     - Market selector (NativeSelect, options: ES/US/UK/DE/FR/IT, default ES)
     - File input: `<input type="file" name="file" accept=".csv,.txt" required className="..." />`
     - Submit button with `isPending` loading state
     - On `state?.success === true`: green banner "X imported, Y updated" — if `state.result.unattributed.length > 0`, yellow warning block listing unmatched IDs in `<code>` elements with instruction to update `affiliate_tag` on the corresponding site
     - On `state?.success === false`: red error banner with `state.error`
   - **Manual Revenue Entry card** using `useActionState(addManualRevenue, null)`:
     - Site selector (NativeSelect, optional — "Portfolio-wide" option)
     - Source text input (placeholder: "Amazon Affiliates, AdSense, Sponsorship…")
     - Amount (number input), Currency (NativeSelect EUR/USD/GBP), Date (date input)
     - Notes textarea (optional)
     - Same `FieldError` + success banner pattern as `CostForm`
   - Both cards use the existing `NativeSelect` and `FieldError` patterns from `cost-form.tsx` — copy the inline helpers or extract them to a shared `finances/form-helpers.tsx` if cleaner
2. Update `apps/admin/src/app/(dashboard)/finances/page.tsx`:
   - Add to `Promise.all`: fetch `revenue_amazon` (select `id, site_id, date, clicks, items_ordered, earnings, currency, market`, order by `date desc`, limit 100) and `revenue_manual` (select `id, site_id, source, amount, currency, date, notes`, order by `date desc`, limit 100)
   - Throw on errors from new fetches
   - Remove the placeholder "Revenue coming soon" card
   - Add `<RevenueSection sites={sites} />` where the placeholder was
   - Below the form section, render a Revenue History card with a table:
     - Columns: Date, Source, Site, Amount, Notes
     - Merge and sort `revenue_amazon` + `revenue_manual` rows by date descending
     - Amazon rows: Source = "Amazon (ES)" or "Amazon ({market})", Notes = `{clicks} clicks, {items_ordered} ordered`
     - Manual rows: Source = `row.source || 'Manual'`, Notes = `row.notes || '—'`
     - Amount formatted via `toLocaleString` with currency
     - Empty state: "No revenue entries yet. Import an Amazon Associates CSV or add a manual entry."
3. No new files needed beyond `revenue-section.tsx` and the `page.tsx` update (no separate constants file needed — market options can be inlined in the component or imported from `@monster/shared` AMAZON_MARKETS if appropriate)

## Must-Haves

- [ ] CSV import form renders with file input + market selector + submit button
- [ ] Import success banner shows inserted/updated counts
- [ ] Unattributed tracking ID warning renders as yellow block with each ID as `<code>`
- [ ] Manual revenue entry form renders with all fields
- [ ] Revenue history table shows both Amazon and manual rows, sorted by date desc
- [ ] Placeholder card removed from page
- [ ] `pnpm --filter @monster/admin build` exit 0

## Verification

- `pnpm --filter @monster/admin build` exit 0
- `pm2 reload monster-admin` then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/finances` → 307 (redirect confirms route is live)
- Navigate to `/finances` — Revenue section visible with both cards and history table

## Inputs

- `apps/admin/src/app/(dashboard)/finances/actions.ts` (T01) — `importAmazonCSV`, `addManualRevenue`, their state types
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — `NativeSelect`, `FieldError` patterns to follow
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — existing parallel fetch pattern, cost table pattern

## Expected Output

- `apps/admin/src/app/(dashboard)/finances/revenue-section.tsx` — new client component with both forms
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — extended with revenue data fetches + `RevenueSection` + Revenue History table
