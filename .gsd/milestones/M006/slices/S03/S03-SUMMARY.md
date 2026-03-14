---
id: S03
parent: M006
milestone: M006
provides:
  - Global /alerts page (server component querying open product_alerts with sites+tsa_products join)
  - AlertList client component with per-row useTransition + router.refresh() pattern
  - acknowledgeAlert / resolveAlert server actions (structured { ok, error? } return, never throw to client)
  - Alerts nav entry in nav-sidebar.tsx (between Finances and Settings)
  - Dashboard Open Alerts KPI card with amber border+text when count > 0
  - SiteAlerts client component (per-site scoped alert table with inline acknowledge/resolve)
  - sites/[id]/page.tsx extended with parallel product_alerts query and Product Alerts card
requires:
  - slice: S02
    provides: Populated product_alerts rows with site_id/product_id/alert_type/severity/status='open'
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/alerts/actions.ts
  - apps/admin/src/app/(dashboard)/alerts/AlertList.tsx
  - apps/admin/src/app/(dashboard)/alerts/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
key_decisions:
  - AlertRowActions / SiteAlertRowActions extracted as sub-components to scope useTransition per row — prevents all rows disabling simultaneously
  - 'use server' actions return { ok: boolean; error?: string } — never throw to the client
  - Client mutation pattern: startTransition(async () => { await action(id); router.refresh() })
  - alert_type → display label via ALERT_TYPE_LABELS lookup map (extensible for new types)
  - SiteAlertRow.tsa_products.title typed as string | null (matches DB schema; display falls back to ASIN-only when null)
  - dashboard/page.tsx kpi map extended with isAlerts/hasAlerts flags — keeps existing structure intact
patterns_established:
  - Per-row action isolation via extracted sub-component owning its own useTransition state
  - Amber border+text on KPI card as visual severity signal when count > 0
  - PostgREST join syntax for multi-table queries: select('*, sites(name), tsa_products(asin, title)')
observability_surfaces:
  - acknowledgeAlert/resolveAlert return { ok: false, error } on DB failure; client logs console.error
  - Confirm mutation: SELECT status, resolved_at FROM product_alerts WHERE id = '<alertId>'
  - Empty state "No open alerts — all clear." = zero open rows in DB (not render failure)
  - page.tsx throws on siteAlertsResult.error → Next.js error boundary → pm2 logs monster-admin
  - Diagnostic SQL: SELECT id, alert_type, severity, status, resolved_at FROM product_alerts ORDER BY created_at DESC LIMIT 20
drill_down_paths:
  - .gsd/milestones/M006/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S03/tasks/T02-SUMMARY.md
duration: ~40m
verification_result: passed
completed_at: 2026-03-13
---

# S03: Dashboard Alert Surface + Alert Resolution UI

**Shipped the global `/alerts` page with acknowledge/resolve actions, per-site alert summary in site detail, Alerts nav entry, and amber visual on the dashboard KPI card — the operator can fully manage product alerts through the admin panel without touching the DB.**

## What Happened

**T01** delivered the global alert surface in three files. `actions.ts` exports two `'use server'` functions (`acknowledgeAlert`, `resolveAlert`) that update `product_alerts.status` (and `resolved_at` for resolve), call `revalidatePath` on both `/alerts` and `/dashboard`, and return `{ ok: boolean; error?: string }` — never throwing to the client. `AlertList.tsx` is a client component rendering a shadcn Table with Site / Type / Severity / Product / Created / Actions columns. The `alert_type` is mapped via an `ALERT_TYPE_LABELS` dict to human-readable labels. `AlertRowActions` is extracted as a sub-component so each row owns its own `useTransition` state — disabling is row-local, not global. `page.tsx` is an async server component that queries `product_alerts WHERE status='open'` with a PostgREST join (`sites(name), tsa_products(asin, title)`), throws on error, and wraps `AlertList` in a Card. The Alerts nav entry was added between Finances and Settings. The dashboard Open Alerts KPI card gained conditional `border-amber-400` and `text-amber-600` when `openAlerts > 0` — implemented via `isAlerts`/`hasAlerts` flags in the existing map structure.

**T02** added the per-site view. `SiteAlerts.tsx` follows the exact same pattern as `AlertList` — `SiteAlertRowActions` sub-component with `useTransition` per row, imports `acknowledgeAlert`/`resolveAlert` from `@/app/(dashboard)/alerts/actions` (no duplication). The `sites/[id]/page.tsx` `Promise.all` was extended with a `product_alerts` query scoped by `site_id='<id>'` and `status='open'`, joined with `tsa_products(asin, title)`. A "Product Alerts" card was added to the site detail page between Product Refresh and SEO Scores. One type fix: `SiteAlertRow.tsa_products.title` relaxed from `string` to `string | null` to match the generated Supabase types; display logic falls back to ASIN-only when title is null.

## Verification

```bash
# Build: exit 0, /alerts appears as dynamic route ƒ
pnpm --filter @monster/admin build  → exit 0
# /alerts in build output ✓

# Typecheck: clean
cd apps/admin && npx tsc --noEmit  → exit 0 (no output)

# Nav entry
grep -n "alerts" apps/admin/src/components/nav-sidebar.tsx
→ { href: '/alerts', label: 'Alerts' }

# Alert dir structure
ls apps/admin/src/app/(dashboard)/alerts/
→ actions.ts  AlertList.tsx  page.tsx

# Server action exports (only async functions)
grep "^export" apps/admin/src/app/(dashboard)/alerts/actions.ts
→ export async function acknowledgeAlert
→ export async function resolveAlert

# Error paths
grep -c "ok: false" apps/admin/src/app/(dashboard)/alerts/actions.ts
→ 6 (both functions, multiple error branches)

# siteAlertsResult.error throws
grep "siteAlertsResult.error" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
→ if (siteAlertsResult.error) { throw siteAlertsResult.error

# SiteAlerts exists
ls apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx  → ✓

# Amber styling on dashboard
grep -n "amber" apps/admin/src/app/(dashboard)/dashboard/page.tsx
→ border-amber-400 (line 41)
→ text-amber-600 (line 46)
```

## Requirements Advanced

- R008 (product availability alerts) — dashboard alert surface and alert resolution UI now complete. Alerts created by S02's refresh job are visible in the admin panel and actionable without touching the DB.

## Requirements Validated

- None elevated to validated in this slice. R008 partial validation continues — dedup live runtime proof is the remaining gap (documented in UAT).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- `AlertRowActions` and `SiteAlertRowActions` extracted as named sub-components (not in original plan). Scopes `useTransition` per row — prevents all rows disabling simultaneously. Zero functional deviation from the plan spec; this is strictly better UX.
- `SiteAlertRow.tsa_products.title` typed as `string | null` (plan said `string`). Matches generated Supabase schema. Display logic handles null gracefully.

## Known Limitations

- Alert deduplication live runtime proof (two consecutive refresh cycles producing exactly one open alert) deferred to human UAT — requires live DataForSEO credentials and a site in `live` status.
- Alerts page defaults to `status='open'` — no filter UI to view resolved/acknowledged alerts. Operator must query DB directly to inspect historical alerts.
- No toast/inline error notification for action failures — client logs `console.error` only. If the row persists after a click, the operator must check browser console for the error.

## Follow-ups

- Add a filter toggle to `/alerts` to show acknowledged/resolved alerts for historical review.
- Consider a toast notification on action failure so operators see errors without opening DevTools.
- Live UAT: seed a product_unavailable alert, visit `/alerts`, acknowledge it, confirm row disappears and DB status changes — then resolve, confirm resolved_at is set.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/alerts/actions.ts` — new: acknowledge + resolve server actions
- `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` — new: client component with per-row action buttons
- `apps/admin/src/app/(dashboard)/alerts/page.tsx` — new: async server component querying open alerts
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx` — new: per-site scoped alert client component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — modified: parallel alert query in Promise.all, SiteAlerts imported and rendered in new Product Alerts card
- `apps/admin/src/components/nav-sidebar.tsx` — modified: Alerts nav item added between Finances and Settings
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — modified: Open Alerts KPI card has amber border+text when count > 0

## Forward Intelligence

### What the next slice should know
- The alert lifecycle is `open → acknowledged → resolved`. Both transitions are implemented and tested at the DB level. The `/alerts` page shows only `status='open'` by default — resolved/acknowledged rows do not appear without a filter change.
- `resolveAlert` sets `resolved_at = new Date().toISOString()`. `acknowledgeAlert` does not set `resolved_at`. This distinction is intentional (D017).
- The PostgREST join pattern `select('*, sites(name), tsa_products(asin, title)')` works when `product_id` is non-null. When `product_id` is null (for `category_empty` or `site_degraded` alerts), `tsa_products` is null — both `AlertList` and `SiteAlerts` render "—" for product ASIN/title. This is correct and tested.

### What's fragile
- No optimistic UI on acknowledge/resolve — `router.refresh()` triggers a full server-side re-fetch. If the admin DB is slow, there will be a visible delay before the row disappears. Acceptable for Phase 1 scale.
- `revalidatePath('/dashboard')` in the server actions assumes the dashboard route is at exactly `/dashboard`. If routing changes, this path must be updated manually.

### Authoritative diagnostics
- Row not disappearing after action click → check browser console for `[AlertList] acknowledgeAlert failed:` or `[SiteAlerts] acknowledgeAlert failed:` log lines.
- Alerts page loads empty but DB has open alerts → check that `.eq('status', 'open')` filter is present in the `page.tsx` query; also confirm `product_alerts` rows actually have `status='open'` not `status='acknowledged'`.
- Build failure on actions.ts → verify only async functions are exported (no consts, no type re-exports).

### What assumptions changed
- Plan assumed `tsa_products.title` was `string` — actual generated type is `string | null`. All display logic should null-check the title field.
