---
estimated_steps: 5
estimated_files: 5
---

# T01: Global alerts page + resolve server actions

**Slice:** S03 — Dashboard Alert Surface + Alert Resolution UI
**Milestone:** M006

## Description

Build the global `/alerts` page and the server actions that power it. This is the primary operator surface for alert management — a cross-site view of all open `product_alerts` rows with acknowledge/resolve actions. Also adds the "Alerts" nav entry and visual distinction to the dashboard KPI card.

The `product_alerts` table already has rows (from S02). The dashboard already queries open alert count. This task wires the remaining UI pieces.

## Steps

1. Create `apps/admin/src/app/(dashboard)/alerts/actions.ts` with `'use server'` directive. Export two async functions:
   - `acknowledgeAlert(alertId: string): Promise<{ ok: boolean; error?: string }>` — updates `status='acknowledged'`, calls `revalidatePath('/alerts')` and `revalidatePath('/dashboard')`.
   - `resolveAlert(alertId: string): Promise<{ ok: boolean; error?: string }>` — updates `status='resolved', resolved_at=new Date().toISOString()`, same revalidatePaths. Wrap DB call in try/catch, return `{ ok: false, error: message }` on failure.

2. Create `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` with `'use client'`. Props: `alerts: AlertRow[]` where `AlertRow` is a locally-defined interface matching the PostgREST join shape (includes nested `sites: { name: string } | null` and `tsa_products: { asin: string; title: string } | null`). Render a shadcn `Table` with columns: Site, Type, Severity, Product, Created, Actions. Map `alert_type` to display labels. Use `Badge variant='destructive'` for `severity='critical'`, `Badge variant='secondary'` for `severity='warning'`. Each action button calls the server action inside `startTransition(async () => { await action(alert.id); router.refresh() })`. Both buttons disabled while `isPending`. Empty state (no rows): single `TableRow` with `TableCell colSpan={6}` showing "No open alerts — all clear."

3. Create `apps/admin/src/app/(dashboard)/alerts/page.tsx` as an async server component. Query: `supabase.from('product_alerts').select('*, sites(name), tsa_products(asin, title)').eq('status', 'open').order('created_at', { ascending: false })`. Cast the result to `AlertRow[]`. Render page heading "Alerts" + `<AlertList alerts={data ?? []} />`. Throw on DB error.

4. Add `{ href: '/alerts', label: 'Alerts' }` to the `navItems` array in `apps/admin/src/components/nav-sidebar.tsx`, positioned between Finances and Settings.

5. In `apps/admin/src/app/(dashboard)/dashboard/page.tsx`, add conditional styling to the "Open Alerts" card: when `openAlerts > 0`, apply `border-amber-400` to the `Card` and `text-amber-600` to the value `<p>`. Use a helper or inline ternary — keep the existing map structure, just conditionally override card className and value text color.

## Must-Haves

- [ ] `actions.ts` has `'use server'` directive and exports only async functions (no constants, no types)
- [ ] `resolveAlert` sets `resolved_at` to ISO string; `acknowledgeAlert` only updates `status`
- [ ] Both actions call `revalidatePath('/alerts')` AND `revalidatePath('/dashboard')`
- [ ] `AlertList` is `'use client'` and uses `useTransition` + `router.refresh()` (not raw state management)
- [ ] `alert_type` values mapped to human-readable labels before rendering (not raw DB strings)
- [ ] `product_id` nullable handled — show "—" when `tsa_products` is null
- [ ] Empty state renders correctly (no table body with empty rows)
- [ ] "Alerts" nav item added between Finances and Settings
- [ ] Dashboard card has conditional amber styling when `openAlerts > 0`

## Verification

```bash
# Build exits 0
cd /home/daniel/monster && pnpm --filter @monster/admin build
# → exit 0

# Typecheck clean
cd apps/admin && npx tsc --noEmit
# → exit 0

# Nav entry present
grep "alerts" apps/admin/src/components/nav-sidebar.tsx
# → { href: '/alerts', label: 'Alerts' }

# Actions file exports only async functions
grep "^export" apps/admin/src/app/\(dashboard\)/alerts/actions.ts
# → export async function acknowledgeAlert
# → export async function resolveAlert

# No constants exported from actions.ts
grep "^export const\|^export let\|^export type\|^export interface" apps/admin/src/app/\(dashboard\)/alerts/actions.ts
# → (no output)
```

## Observability Impact

- **Alert action results surfaced:** `acknowledgeAlert` and `resolveAlert` return `{ ok: boolean; error?: string }`. The `AlertList` component handles the response — action failures are visible in the browser console via `console.error` in the component. Success causes `router.refresh()` which re-queries the server and removes the row from view.
- **DB mutation visibility:** After any action, inspect `product_alerts.status` and `product_alerts.resolved_at` directly in Supabase to confirm the write succeeded. `resolveAlert` sets `resolved_at`; `acknowledgeAlert` does not touch `resolved_at`.
- **Server-side error path:** `page.tsx` throws on DB error with a descriptive message visible in `pm2 logs monster-admin`. Actions use try/catch and return structured `{ ok: false, error }` — errors are never silently swallowed.
- **Nav regression surface:** `grep "alerts" apps/admin/src/components/nav-sidebar.tsx` confirms the nav entry survived future edits.
- **Redaction:** `product_alerts.details` JSONB is rendered as-is in the UI only if needed. Server actions must not log the `details` field.

## Inputs

- `apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx` — `useTransition` + `router.refresh()` client pattern to follow exactly
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `'use server'` file pattern
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — server component + Table pattern
- `apps/admin/src/components/nav-sidebar.tsx` — nav items array to extend
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — KPI card map to modify
- S02 forward intelligence: `product_alerts` rows have `severity`, `alert_type`, `status='open'`, `product_id` nullable, `details` JSONB

## Expected Output

- `apps/admin/src/app/(dashboard)/alerts/actions.ts` — new: acknowledge + resolve server actions
- `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` — new: client component with action buttons
- `apps/admin/src/app/(dashboard)/alerts/page.tsx` — new: server component querying open alerts
- `apps/admin/src/components/nav-sidebar.tsx` — modified: Alerts nav item added
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — modified: Open Alerts card has amber styling when count > 0
