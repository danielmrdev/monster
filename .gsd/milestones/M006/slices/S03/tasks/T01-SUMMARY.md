---
id: T01
parent: S03
milestone: M006
provides:
  - Global /alerts page with acknowledge/resolve server actions
  - AlertList client component with useTransition + router.refresh() pattern
  - Alerts nav entry between Finances and Settings
  - Dashboard Open Alerts card conditional amber styling
key_files:
  - apps/admin/src/app/(dashboard)/alerts/actions.ts
  - apps/admin/src/app/(dashboard)/alerts/AlertList.tsx
  - apps/admin/src/app/(dashboard)/alerts/page.tsx
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
key_decisions:
  - AlertRowActions extracted as a sub-component to give each row its own useTransition state — prevents all rows disabling simultaneously when one action fires
  - dashboard/page.tsx kpi map extended with isAlerts/hasAlerts flags rather than splitting the map — keeps the existing structure intact
patterns_established:
  - 'use server' actions return { ok: boolean; error?: string } — never throw to the client
  - Client mutation pattern: startTransition(async () => { await action(id); router.refresh() })
  - alert_type → display label via a ALERT_TYPE_LABELS lookup map (extensible for new types)
observability_surfaces:
  - acknowledgeAlert/resolveAlert return { ok: false, error } on DB failure; AlertRowActions logs via console.error
  - Confirm mutation: SELECT status, resolved_at FROM product_alerts WHERE id = '<alertId>'
  - Empty state "No open alerts — all clear." confirms zero open rows (not render failure)
  - pm2 logs monster-admin shows thrown error from page.tsx on DB fetch failure
duration: 20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Global alerts page + resolve server actions

**Shipped the `/alerts` page, acknowledge/resolve server actions, Alerts nav entry, and amber dashboard card styling for open alerts.**

## What Happened

Created three new files in `(dashboard)/alerts/`:

1. **`actions.ts`** — `'use server'` module with `acknowledgeAlert` (status→'acknowledged') and `resolveAlert` (status→'resolved', resolved_at→ISO). Both wrapped in try/catch returning `{ ok: boolean; error? }`. Both call `revalidatePath('/alerts')` + `revalidatePath('/dashboard')`.

2. **`AlertList.tsx`** — Client component rendering a shadcn Table with Site / Type / Severity / Product / Created / Actions columns. `alert_type` mapped via `ALERT_TYPE_LABELS` dict. `severity='critical'` → `Badge variant='destructive'`; `severity='warning'` → `Badge variant='secondary'`. `tsa_products` null → "—". `AlertRowActions` sub-component isolates `useTransition` per row so pending state is row-scoped. Empty state renders a single full-width cell.

3. **`page.tsx`** — Async server component querying `product_alerts WHERE status='open'` with PostgREST join `sites(name), tsa_products(asin, title)`. Throws on error. Wraps AlertList in a Card.

Modified `nav-sidebar.tsx` to add `{ href: '/alerts', label: 'Alerts' }` between Finances and Settings.

Modified `dashboard/page.tsx` to apply `border-amber-400` to the Card and `text-amber-600` to the value when `openAlerts > 0`, using `isAlerts`/`hasAlerts` flags in the existing map.

## Verification

```
pnpm --filter @monster/admin build  → exit 0, /alerts appears as dynamic route ƒ
npx tsc --noEmit                    → exit 0, no type errors
grep "alerts" nav-sidebar.tsx       → { href: '/alerts', label: 'Alerts' }
grep "^export" actions.ts           → only acknowledgeAlert and resolveAlert
grep "^export const|type|interface" → no output (clean actions file)
ls alerts/                          → actions.ts  AlertList.tsx  page.tsx
grep "ok: false" actions.ts         → 4 matches (both functions, both error branches)
```

## Diagnostics

- Action failures surface as `console.error('[AlertList] acknowledgeAlert/resolveAlert failed:', error)` in the browser console.
- DB confirmation: `SELECT status, resolved_at FROM product_alerts WHERE id = '<alertId>'`
- Empty state "No open alerts — all clear." = zero open rows returned, not a render issue
- DB fetch failure on page load: `pm2 logs monster-admin` shows thrown error message

## Deviations

- Extracted `AlertRowActions` as a named sub-component (not in plan). This scopes `useTransition` per row so disabling is row-local, not global. Zero functional deviation from the plan spec.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/alerts/actions.ts` — new: acknowledge + resolve server actions
- `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` — new: client component with per-row action buttons
- `apps/admin/src/app/(dashboard)/alerts/page.tsx` — new: server component querying open alerts
- `apps/admin/src/components/nav-sidebar.tsx` — modified: Alerts nav item added between Finances and Settings
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — modified: Open Alerts KPI card has amber border+text when count > 0
- `.gsd/milestones/M006/slices/S03/S03-PLAN.md` — modified: added Observability / Diagnostics section + failure-path verification
- `.gsd/milestones/M006/slices/S03/tasks/T01-PLAN.md` — modified: added Observability Impact section
