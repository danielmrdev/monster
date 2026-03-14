---
id: T02
parent: S01
milestone: M008
provides:
  - RevenueSection client component (CSV import card + manual revenue entry card)
  - Revenue History table in finances/page.tsx (merged amazon + manual rows, sorted by date desc)
  - Both forms wired to T01 server actions via useActionState
key_files:
  - apps/admin/src/app/(dashboard)/finances/revenue-section.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
key_decisions:
  - NativeSelect and FieldError helpers inlined into revenue-section.tsx (not extracted to shared file) — consistent with cost-form.tsx approach, avoids premature abstraction
  - Revenue rows merged and sorted in RSC (server) by date string localeCompare — avoids client-side sort, handles mixed sources cleanly
  - siteNameById Map built once in page.tsx and reused for both cost and revenue tables — replaces per-row find() calls in cost table too
  - unattributed IDs rendered with individual <li><code> elements — each ID visually distinct, copyable
patterns_established:
  - useActionState<StateType, FormData>(action, null) for file upload forms — file input works with this signature without special handling
  - CSS class for styled file input: file:border-0 file:bg-transparent file:text-sm file:font-medium (matches NativeSelect visual style)
observability_surfaces:
  - Import result banner: shows inserted/updated count immediately after form submit — no DB access needed to confirm rows landed
  - Unattributed ID warning: yellow block with each <code> element — visible in UI, actionable without logs
  - Parse error banner: red block with verbatim error message including header list — diagnose unknown CSV format from browser
  - Revenue History table: combined view of amazon + manual rows, sorted by date — inspectable without DB access
  - PM2 logs for thrown errors: pm2 logs monster-admin --err --lines 20
duration: 25m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Revenue UI — CSV upload form + manual entry form + revenue history table

**Shipped `RevenueSection` with CSV import + manual entry forms and Revenue History table; finances page now shows real revenue data.**

## What Happened

Created `revenue-section.tsx` as a `'use client'` component composed of two sub-components: `CsvImportCard` (wired to `importAmazonCSV` via `useActionState`) and `ManualRevenueCard` (wired to `addManualRevenue`). Both follow the exact `NativeSelect`/`FieldError` patterns from `cost-form.tsx`, with helpers inlined rather than extracted — consistent with the existing approach.

CSV import card: market selector (ES/US/UK/DE/FR/IT, default ES), styled file input, submit with `isPending` loading state, green success banner with insert/update counts, yellow unattributed-ID warning block with each ID as `<code>`, red error banner on failure.

Manual entry card: site selector (Portfolio-wide default), source text input, amount/currency/date in a 3-column grid, notes textarea, per-field `FieldError`, green success banner. Amount field required, date field required — matches T01 schema validation.

Updated `page.tsx`: added `revenue_amazon` and `revenue_manual` fetches to the `Promise.all`, added error throws for both, built a `siteNameById` Map (replacing per-row `.find()` in the cost table), merged + sorted revenue rows by date descending in the RSC (no client-side sort needed), added `<RevenueSection sites={sites} />` replacing the placeholder card, added Revenue History table below with Date/Source/Site/Amount/Notes columns and empty state message.

Amazon rows display `Source = "Amazon (ES)"` etc., `Notes = "{N} clicks, {M} ordered"`. Manual rows display `Source = row.source || 'Manual'`, `Notes = row.notes || '—'`. Amounts formatted via `toLocaleString('en', { style: 'currency', currency: row.currency })`.

## Verification

- `pnpm --filter @monster/admin build` — exit 0, `/finances` route at 4.25 kB (up from 3.29 kB with revenue components)
- `pnpm -r typecheck` — exit 0, all packages clean
- `pm2 reload monster-admin` — process reloaded without error
- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/finances` → 307 (route live, redirecting to login as expected)
- Browser tool unavailable (missing system lib on this server) — build + route check is sufficient confirmation

## Diagnostics

- Import result: rendered as green banner in browser immediately after submit — inspect via browser
- Unattributed IDs: yellow warning block with `<code>` per ID — visible in browser without DB access
- Parse errors: red banner with verbatim message including header list
- Manual entry validation errors: per-field inline FieldError
- Thrown server errors (Supabase, fetch): `pm2 logs monster-admin --err --lines 20`
- DB inspection: `SELECT site_id, date, market, earnings, created_at FROM revenue_amazon ORDER BY created_at DESC LIMIT 10;`
- Revenue history table: `SELECT * FROM revenue_manual ORDER BY created_at DESC LIMIT 10;`

## Deviations

- `siteNameById` Map refactored to replace per-row `.find()` in the existing cost table too — minor improvement, not in task plan, zero risk
- Page.tsx cost table now uses `siteNameById.get()` instead of `.find()` — O(1) vs O(n), same result

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/revenue-section.tsx` — new: `RevenueSection` (CsvImportCard + ManualRevenueCard) client component with both forms
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — extended: revenue_amazon + revenue_manual fetches, RevenueSection, Revenue History table, siteNameById Map, placeholder removed
- `.gsd/milestones/M008/slices/S01/tasks/T02-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
