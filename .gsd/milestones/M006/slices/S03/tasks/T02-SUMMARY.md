---
id: T02
parent: S03
milestone: M006
provides:
  - SiteAlerts client component (per-site scoped alert table with inline acknowledge/resolve)
  - sites/[id]/page.tsx extended with parallel product_alerts query and Product Alerts card
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - SiteAlertRow.tsa_products.title typed as `string | null` to match DB schema (generated types have title nullable); display logic falls back to ASIN-only when title is null
patterns_established:
  - Per-site scoped alert component follows exact same useTransition + router.refresh() pattern as AlertList; AlertRowActions extracted as sub-component to isolate isPending state per row
observability_surfaces:
  - '[SiteAlerts] acknowledgeAlert/resolveAlert failed: <error>' logged to browser console on action failure'
  - 'siteAlertsResult.error thrown in page.tsx → Next.js error boundary → pm2 logs monster-admin shows thrown Supabase message'
  - 'Empty state "No open alerts — all clear." = zero open rows for site_id in DB'
  - 'Diagnostic SQL: SELECT id, alert_type, severity, status, resolved_at FROM product_alerts WHERE site_id = ''<siteId>'' ORDER BY created_at DESC'
duration: ~20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Per-site alert summary in site detail

**Shipped `SiteAlerts` client component and Product Alerts card in site detail page — per-site open alert count, inline table with type/severity/product/created columns, and acknowledge/resolve buttons reusing T01 server actions.**

## What Happened

1. Created `SiteAlerts.tsx` as a `'use client'` component following the `AlertList` pattern exactly: `SiteAlertRowActions` sub-component owns `useTransition` state per row, preventing all rows from disabling simultaneously. Imports `acknowledgeAlert`/`resolveAlert` from `@/app/(dashboard)/alerts/actions` — no new server actions.

2. Extended `sites/[id]/page.tsx` `Promise.all` to fetch `product_alerts` with `tsa_products(asin, title)` join, scoped by `site_id` and `status='open'`. Error throws immediately (not silently swallowed).

3. Added "Product Alerts" card section after Product Refresh, before SEO Scores.

One type fix was needed: the generated Supabase types have `tsa_products.title` as `string | null`, while the initial interface had it as `string`. Relaxed the interface to match and added null-safe render logic (falls back to ASIN-only when title is null).

## Verification

```
# Build: exit 0 ✓
pnpm --filter @monster/admin build

# Typecheck: no output (clean) ✓
cd apps/admin && npx tsc --noEmit

# SiteAlerts is 'use client' ✓
head -1 SiteAlerts.tsx → 'use client'

# Imports from alerts/actions ✓
grep "from.*alerts/actions" SiteAlerts.tsx
→ import { acknowledgeAlert, resolveAlert } from '@/app/(dashboard)/alerts/actions'

# page.tsx imports and renders SiteAlerts ✓
grep SiteAlerts page.tsx
→ import { SiteAlerts } from './SiteAlerts'
→ <SiteAlerts alerts={siteAlertsResult.data ?? []} />

# Query in Promise.all, scoped correctly ✓
→ .eq('site_id', id) + .eq('status', 'open') present

# Error throws ✓
→ if (siteAlertsResult.error) throw siteAlertsResult.error
```

All slice-level checks also pass: alerts page structure, nav entry, server action exports, `ok: false` error path, and failure-path DB throw.

## Diagnostics

- **Action failure:** Browser console logs `[SiteAlerts] acknowledgeAlert/resolveAlert failed: <error>`. Row persisting after click = silent failure here.
- **DB load error:** `page.tsx` throws `siteAlertsResult.error` → Next.js error boundary. Check `pm2 logs monster-admin`.
- **Empty state:** "No open alerts — all clear." = zero rows with `status='open'` for this site. If alerts exist but card is empty, check `.eq('status', 'open')` filter in page query.
- **Inspect:** `SELECT id, alert_type, severity, status FROM product_alerts WHERE site_id = '<id>' ORDER BY created_at DESC;`

## Deviations

`SiteAlertRow.tsa_products.title` typed as `string | null` (not `string`) to match generated Supabase types. Display logic: `asin — title` when title present, `asin` only when title null, `—` when no product join.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx` — new: per-site scoped alert client component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — modified: parallel alert query added to Promise.all, SiteAlerts imported and rendered in new Product Alerts card
