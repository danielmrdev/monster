---
estimated_steps: 3
estimated_files: 2
---

# T02: Per-site alert summary in site detail

**Slice:** S03 — Dashboard Alert Surface + Alert Resolution UI
**Milestone:** M006

## Description

Extend the site detail page to show the open alerts for that specific site — count, alert rows (type, severity, product ASIN, created), and inline acknowledge/resolve buttons. Reuses the server actions from T01 verbatim; creates a `SiteAlerts` client component that mirrors the `AlertList` pattern but scoped to a single site.

This closes the slice: after this task, every alert surface described in the slice goal is functional.

## Steps

1. Create `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx` (`'use client'`). Props: `alerts: SiteAlertRow[]` (locally-defined interface for the PostgREST join: `id`, `alert_type`, `severity`, `created_at`, `product_id | null`, and `tsa_products: { asin: string; title: string } | null`). Import `acknowledgeAlert` and `resolveAlert` from `@/app/(dashboard)/alerts/actions`. Render: a heading `<p>` showing count (e.g. "2 open alerts" or "No open alerts — all clear."). When alerts exist, render a compact Table with columns: Type, Severity, Product (ASIN or "—"), Created, Actions. Same `useTransition` + `router.refresh()` pattern as `AlertList`. Same display-label mapping and Badge variants. When `alerts.length === 0`, render only the "No open alerts — all clear." message (no table).

2. Add per-site alerts query to the `Promise.all` in `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`:
   ```ts
   supabase
     .from('product_alerts')
     .select('*, tsa_products(asin, title)')
     .eq('site_id', id)
     .eq('status', 'open')
     .order('created_at', { ascending: false })
   ```
   Add alongside the existing `seoScoresResult` and `deployCard` fetches.

3. In `sites/[id]/page.tsx`: import `SiteAlerts`; add a new "Product Alerts" card section (separate card from the existing Product Refresh card) after the Product Refresh section. Pass `siteAlertsResult.data ?? []` as the `alerts` prop. Throw on `siteAlertsResult.error`.

## Must-Haves

- [ ] `SiteAlerts` is `'use client'` with `useTransition` + `router.refresh()` pattern
- [ ] Imports `acknowledgeAlert` / `resolveAlert` from `@/app/(dashboard)/alerts/actions` — no new server actions created
- [ ] `product_id` nullable handled — "—" when `tsa_products` is null
- [ ] Empty state: "No open alerts — all clear." message (no empty table)
- [ ] Query uses `.eq('site_id', id)` + `.eq('status', 'open')` — scoped correctly
- [ ] `siteAlertsResult.error` throws (not silently returns empty)
- [ ] Per-site alerts added to `Promise.all` (not a sequential await)

## Verification

```bash
# Build exits 0
cd /home/daniel/monster && pnpm --filter @monster/admin build
# → exit 0

# Typecheck clean
cd apps/admin && npx tsc --noEmit
# → exit 0

# SiteAlerts component exists and is a client component
head -3 apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteAlerts.tsx
# → 'use client'

# SiteAlerts reuses T01 actions (no new server actions file)
grep "from.*alerts/actions" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteAlerts.tsx
# → import { acknowledgeAlert, resolveAlert } from '@/app/(dashboard)/alerts/actions'

# Site detail page imports SiteAlerts
grep "SiteAlerts" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
# → import SiteAlerts ... + <SiteAlerts ...>
```

## Observability Impact

**What changes at runtime:**
- `/sites/<id>` now renders a "Product Alerts" card alongside the existing Product Refresh card. A future agent inspecting this page can confirm the section is present by grepping for `SiteAlerts` in the page source or checking the browser for the "Product Alerts" heading.
- When a per-site alert is acknowledged or resolved via `SiteAlerts`, `router.refresh()` re-renders the server component — the acted-on row disappears. If the row persists after clicking, the server action returned `{ ok: false }` (check browser console for `[SiteAlerts]` error log) or `router.refresh()` did not trigger.
- DB query failure on site detail load: `page.tsx` throws `siteAlertsResult.error` — Next.js error boundary catches and renders the error page. Check `pm2 logs monster-admin` for the thrown Supabase error message.
- **Empty state signal:** "No open alerts — all clear." rendered in the Product Alerts card = zero open alerts for that site in DB. If alerts exist but card shows empty, verify `.eq('site_id', id)` and `.eq('status', 'open')` are both applied in the page query.
- **Inspect per-site alerts directly:**
  ```sql
  SELECT id, alert_type, severity, status, resolved_at FROM product_alerts WHERE site_id = '<siteId>' ORDER BY created_at DESC;
  ```

## Inputs

- `apps/admin/src/app/(dashboard)/alerts/actions.ts` — T01 output: `acknowledgeAlert` + `resolveAlert` to import
- `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` — T01 output: pattern reference for `SiteAlerts`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — existing `Promise.all` to extend and render location
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — existing client component pattern in same directory

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx` — new: per-site scoped client alert component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — modified: parallel alert query + SiteAlerts rendered in new "Product Alerts" card
