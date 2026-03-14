# S03: Dashboard Alert Surface + Alert Resolution UI

**Goal:** Surface `product_alerts` data in the admin panel — global alerts page with acknowledge/resolve actions, per-site alert summary in site detail, and visual distinction on the dashboard KPI card when alerts are open.
**Demo:** Operator navigates to `/alerts`, sees open alerts across all sites with type/severity badges, clicks "Acknowledge" or "Resolve" — the row disappears from the open view. Dashboard "Open Alerts" card shows a red/amber visual when count > 0. Site detail "Product Refresh" card shows open alert count for that site with inline alert rows.

## Must-Haves

- `/alerts` page lists all open `product_alerts` joined with `sites.name` and `tsa_products.asin`/`tsa_products.title` (null-safe — `product_id` may be null for `category_empty`/`site_degraded` alert types)
- Acknowledge and Resolve server actions update `product_alerts.status` (and `resolved_at` for resolve) + call `revalidatePath('/alerts')` + `revalidatePath('/dashboard')`
- Client component leaf (`AlertList`) uses `useTransition` + `router.refresh()` — same pattern as `RefreshCard`
- "Alerts" nav item added to `nav-sidebar.tsx` between Finances and Settings
- Dashboard "Open Alerts" KPI card visually distinct when `openAlerts > 0` (amber border or color change)
- Site detail Product Refresh card shows per-site open alert count + alert rows (type, severity, created_at, inline acknowledge/resolve buttons)
- Empty state when no open alerts: "No open alerts — all clear." in both global and per-site views
- Alert list defaults to `status='open'` filter — resolved/acknowledged alerts not shown by default

## Observability / Diagnostics

- **Alert action success:** Server action returns `{ ok: true }`. Client calls `router.refresh()` — the acknowledged/resolved row disappears from the open view. No row removal = action failed silently.
- **Alert action failure:** Server action returns `{ ok: false, error: string }`. Client should log or surface the error (toast or inline). Browser console shows the returned error for diagnosis.
- **DB error on page load:** `alerts/page.tsx` throws on `supabase.error` — Next.js error boundary catches and shows error page. Check `pm2 logs monster-admin` for the thrown message.
- **Inspect alert state directly:**
  ```sql
  SELECT id, alert_type, severity, status, resolved_at FROM product_alerts ORDER BY created_at DESC LIMIT 20;
  ```
- **Empty state signal:** `/alerts` rendering "No open alerts — all clear." confirms the query returned zero rows (not a render bug). If alerts exist but page shows empty, check the `.eq('status', 'open')` filter.
- **Redaction:** `details` JSONB may contain product metadata — never log raw details in server actions.

## Verification

```bash
# Build exits 0
cd /home/daniel/monster && pnpm --filter @monster/admin build
# → exit 0

# Typecheck clean
cd apps/admin && npx tsc --noEmit
# → exit 0

# Nav sidebar has Alerts entry
grep -n "alerts" apps/admin/src/components/nav-sidebar.tsx
# → { href: '/alerts', label: 'Alerts' }

# Alerts page exists
ls apps/admin/src/app/\(dashboard\)/alerts/
# → actions.ts  AlertList.tsx  page.tsx

# Server actions export only async functions
grep "^export" apps/admin/src/app/\(dashboard\)/alerts/actions.ts
# → export async function acknowledgeAlert
# → export async function resolveAlert

# Failure-path check: server actions return structured errors (not thrown exceptions)
# Verify try/catch in actions.ts wraps the DB call and returns { ok: false, error } on failure
grep "ok: false" apps/admin/src/app/\(dashboard\)/alerts/actions.ts
# → return { ok: false, error: ... }

# Failure-path check: SiteAlerts DB query failure throws (not silently empty)
# Verify siteAlertsResult.error is checked and thrown in sites/[id]/page.tsx
grep "siteAlertsResult.error" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
# → if (siteAlertsResult.error) throw siteAlertsResult.error

# Diagnostic: inspect raw alert state for a specific site
# psql: SELECT id, alert_type, severity, status, resolved_at FROM product_alerts WHERE site_id = '<siteId>' ORDER BY created_at DESC;
# If SiteAlerts renders empty but alerts exist in DB: check .eq('status', 'open') filter applied in page.tsx query
```

Browser verification (manual, after `pm2 reload monster-admin`):
- Navigate to `/alerts` → page loads, empty state or alert rows visible
- Navigate to `/dashboard` → "Open Alerts" card shows correct count; card has visual distinction when count > 0
- Navigate to `/sites/<id>` → Product Refresh section shows open alert count for that site

## Tasks

- [x] **T01: Global alerts page + resolve server actions** `est:45m`
  - Why: Delivers the primary user-facing alert surface — the global cross-site view that lets an operator acknowledge/resolve alerts without touching the DB directly.
  - Files: `apps/admin/src/app/(dashboard)/alerts/actions.ts`, `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx`, `apps/admin/src/app/(dashboard)/alerts/page.tsx`, `apps/admin/src/components/nav-sidebar.tsx`, `apps/admin/src/app/(dashboard)/dashboard/page.tsx`
  - Do:
    1. Create `alerts/actions.ts` (`'use server'`): `acknowledgeAlert(alertId: string)` updates `status='acknowledged'`; `resolveAlert(alertId: string)` updates `status='resolved', resolved_at=new Date().toISOString()`; both call `revalidatePath('/alerts')` + `revalidatePath('/dashboard')`. Return `{ ok: boolean; error?: string }`.
    2. Create `alerts/AlertList.tsx` (`'use client'`): accepts `alerts` prop (typed from `product_alerts` join shape). Renders a `Table` with columns: Site, Type, Severity, Product (ASIN or "—"), Created, Actions. "Acknowledge" and "Resolve" buttons each wrapped in `useTransition` + `router.refresh()` after action resolves. Disable buttons while pending. Display-friendly labels for `alert_type` (`'unavailable' → 'Product Unavailable'`, `'category_empty' → 'Category Empty'`, `'site_degraded' → 'Site Degraded'`). Use `Badge variant='destructive'` for `critical`, `Badge variant='secondary'` for `warning`. Empty state: "No open alerts — all clear."
    3. Create `alerts/page.tsx` (async server component): query `product_alerts WHERE status='open' ORDER BY created_at DESC` with PostgREST join `select('*, sites(name), tsa_products(asin, title)')`. Pass data to `AlertList`. Page title: "Alerts".
    4. Add `{ href: '/alerts', label: 'Alerts' }` to `navItems` in `nav-sidebar.tsx` between Finances and Settings.
    5. In `dashboard/page.tsx`: add conditional styling to the "Open Alerts" KPI card when `openAlerts > 0` — amber border (`border-amber-400`) and amber text for the value (`text-amber-600`). Keep existing card structure; just add a conditional `className`.
  - Verify: `pnpm --filter @monster/admin build` exits 0; `npx tsc --noEmit` exits 0; grep confirms nav entry; file structure matches.
  - Done when: Build and typecheck pass; `/alerts` page file structure is complete; server actions export only async functions; nav has "Alerts" entry; dashboard card has conditional amber styling.

- [x] **T02: Per-site alert summary in site detail** `est:30m`
  - Why: Closes the slice by giving the per-site view — an operator inspecting a specific site can see its open alerts and act without navigating away to the global alerts page.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx`
  - Do:
    1. Add per-site alerts query to the `Promise.all` in `sites/[id]/page.tsx`: `supabase.from('product_alerts').select('*, tsa_products(asin, title)').eq('site_id', id).eq('status', 'open').order('created_at', { ascending: false })`. Add to the parallel fetch alongside `seoScoresResult` and `deployCard`.
    2. Create `sites/[id]/SiteAlerts.tsx` (`'use client'`): accepts `alerts` prop. Same `useTransition` + `router.refresh()` pattern as `AlertList`. Render: open alert count heading (`${alerts.length} open alert${alerts.length === 1 ? '' : 's'}`), then either "All clear — no open alerts." or a compact table with Type, Severity, Product (ASIN or "—"), Created, Actions (Acknowledge + Resolve buttons calling the same `alerts/actions.ts` server actions). Import `acknowledgeAlert`/`resolveAlert` from `@/app/(dashboard)/alerts/actions`.
    3. In `sites/[id]/page.tsx`: import `SiteAlerts`; add a new "Alerts" subsection below the `RefreshCard` block in the "Product Refresh" card (or as a separate card — use a separate card for visual clarity). Pass `siteAlerts.data ?? []` to `SiteAlerts`.
  - Verify: `pnpm --filter @monster/admin build` exits 0; `npx tsc --noEmit` exits 0; site detail page renders without error in browser.
  - Done when: Build and typecheck pass; `SiteAlerts.tsx` exists; site detail page imports and renders it; the same `acknowledgeAlert`/`resolveAlert` actions from T01 are reused (no duplication).

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/alerts/actions.ts` — new
- `apps/admin/src/app/(dashboard)/alerts/AlertList.tsx` — new
- `apps/admin/src/app/(dashboard)/alerts/page.tsx` — new
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteAlerts.tsx` — new
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — add parallel query + SiteAlerts import
- `apps/admin/src/components/nav-sidebar.tsx` — add Alerts nav item
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — conditional amber styling on Open Alerts card
