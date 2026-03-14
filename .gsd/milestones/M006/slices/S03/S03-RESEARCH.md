# S03: Dashboard Alert Surface + Alert Resolution UI — Research

**Date:** 2026-03-13

## Summary

S03 is entirely UI work on top of data that S01+S02 already produce. The `product_alerts` table is populated, `sites.last_refreshed_at` is written, and the dashboard `page.tsx` already queries `product_alerts` open count. There is no new backend to write — only three UI additions:

1. **Dashboard KPI card** — already functional. `dashboard/page.tsx` queries `product_alerts WHERE status='open'` and renders a count card labeled "Open Alerts". It works today as soon as alerts exist in the DB. No changes needed unless the card needs visual distinction (color, icon) to signal criticality — a minor styling enhancement.

2. **Site detail alert surface** — the `RefreshCard` currently only shows timestamp + Refresh Now. S03 must extend the "Product Refresh" section of `sites/[id]/page.tsx` to show: per-site open alert count (queried server-side), a product availability summary (available/limited counts from `tsa_products`), and link or inline list of open alerts for this site.

3. **Alert list with resolve actions** — a new `/alerts` page (or inline within site detail) that lists open `product_alerts` rows with acknowledge/resolve buttons. Each button is a server action that updates `status` + `resolved_at` on the row.

The codebase has clear patterns for all three. The only non-obvious architectural question is **where to put the alert list** — standalone `/alerts` page vs embedded in site detail. Evidence leans toward both: a global `/alerts` page linked from the dashboard (cross-site view) and a per-site alert section in site detail. That's two additions but both are straightforward server components + a single shared server action.

The risk level for this slice is genuinely low. No new queues, no new migrations (the `status` column already supports `open|acknowledged|resolved`), no new packages. The only wrinkle is the `'use server'` + `'use client'` boundary for alert action buttons — the resolve action must live in a separate `actions.ts` file (D034 pattern) and the buttons must be in a client component leaf.

## Recommendation

Build in two tasks:

**T01** — Alert resolution server action + `AlertList` client component. Create `apps/admin/src/app/(dashboard)/alerts/actions.ts` with `acknowledgeAlert(id)` and `resolveAlert(id)` server actions. Create `AlertList.tsx` client component with inline acknowledge/resolve buttons using `useTransition` + `router.refresh()` (same pattern as `RefreshCard`). Add `apps/admin/src/app/(dashboard)/alerts/page.tsx` as a server component that queries all open alerts across all sites (joined with `sites.name` and `tsa_products.asin` for context), renders the `AlertList` client component, and adds the nav entry to `nav-sidebar.tsx`.

**T02** — Site detail alert summary card. Extend `sites/[id]/page.tsx` to fetch per-site alert count + availability summary in the parallel `Promise.all`. Add a new "Alerts" subsection to the Product Refresh card (or a separate card) showing: open alert count, alert rows for this site (type, severity, created_at), inline acknowledge/resolve buttons. Can reuse `AlertList` or inline a simpler site-scoped version.

This ordering puts the global view first (T01) because it validates the server actions and client patterns before the site-scoped view reuses them.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Client component with async server action | `RefreshCard.tsx` pattern — `useTransition` + `startTransition(async () => { await action(); router.refresh() })` | Established pattern. No state manager needed. |
| `'use server'` file with resolve actions | `finances/actions.ts` / `sites/[id]/actions.ts` patterns | Constants go in sibling `constants.ts` (D034). Server actions file exports only async functions. |
| Alert count on dashboard | `dashboard/page.tsx` already queries `product_alerts WHERE status='open'` | Works today. At most a visual styling enhancement (color, icon). |
| Badge styling for severity | `Badge` component in `@/components/ui/badge` (cva variants: `default`, `secondary`, `destructive`, `outline`) | `destructive` maps to red (critical), `secondary` maps to muted (warning). |
| Table layout for alert list | `Table`, `TableBody`, `TableCell`, etc. from `@/components/ui/table` | Already used in `finances/page.tsx` and `sites/[id]/page.tsx` (SEO scores). Consistent. |
| Status update with optimistic feedback | `useTransition` + inline `useState` for pending state, `router.refresh()` after | Same pattern as `RefreshCard` and `AggregationTrigger`. No need for `useOptimistic` in this case. |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — Already queries `product_alerts WHERE status='open'`. The "Open Alerts" KPI card renders the count. No changes needed for the count to work — S03 should verify this works with real data and optionally add visual criticality signaling.
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` — `useTransition` + `router.refresh()` pattern for async server actions from a client component leaf. Alert action buttons should follow this exactly.
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — Pattern for `'use server'` file with multiple exported async functions. Add `acknowledgeAlert(alertId)` and `resolveAlert(alertId)` to a new `alerts/actions.ts` file.
- `apps/admin/src/app/(dashboard)/analytics/AggregationTrigger.tsx` — Simplest example of `'use client'` leaf with `useTransition` + status state. Alert action buttons are the same shape.
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — Server component querying Supabase + rendering a `Table`. Alert list page follows this pattern.
- `apps/admin/src/components/nav-sidebar.tsx` — Nav items array. Add `{ href: '/alerts', label: 'Alerts' }`. The `NavItem` client component handles active state via `usePathname` (D029).
- `apps/admin/src/components/ui/badge.tsx` — `Badge` with `variant: 'destructive'` for critical severity, `variant: 'secondary'` for warning. Already used in SEO scores table.
- `packages/db/src/types/supabase.ts` — `product_alerts.Row` includes: `id`, `site_id`, `product_id | null`, `alert_type`, `severity`, `status`, `details`, `created_at`, `resolved_at`. All fields available without any new migration.

## Constraints

- **No new DB migrations needed.** `product_alerts` has `status` (`open|acknowledged|resolved`), `severity` (`warning|critical`), `resolved_at` (nullable). The `status` enum already covers the full lifecycle from M001 schema + M006/S02 severity migration.
- **Server action file rule (D034).** `alerts/actions.ts` must be `'use server'` with only async function exports. Any shared constants (e.g. `ALERT_STATUSES`) go in a sibling `constants.ts` file without a directive.
- **`revalidatePath` vs `router.refresh()`.** Server actions that update alert status should call `revalidatePath('/alerts')` and `revalidatePath('/dashboard')` (so the open count KPI updates). The client component also calls `router.refresh()` for the local RSC rerender. Both are needed for consistency across tabs/views.
- **Joining `sites.name` and `tsa_products.asin`** — Supabase PostgREST supports foreign key joins in the `select` string: `product_alerts.select('*, sites(name), tsa_products(asin, title)')`. This works because FK relationships exist on both columns. Use this rather than separate queries — cleaner and fewer round-trips.
- **`product_id` is nullable** in `product_alerts` (category_empty and site_degraded alerts have no specific product). The alert list must handle `null` product_id gracefully — show "—" or "N/A" for ASIN/title in those rows.
- **Dashboard card needs no change for count.** The count query is live and correct. The only optional enhancement is making the "Open Alerts" card visually distinct when `openAlerts > 0` — e.g. amber/red border or icon. Not required for the slice success criteria.
- **Nav sidebar currently has 7 items.** Adding "Alerts" as item 8 fits the sidebar. No layout changes needed.
- **`resolved_at` must be set** when transitioning to `resolved` — the server action should `update({ status: 'resolved', resolved_at: new Date().toISOString() })`. For `acknowledged`, only `status` changes (no timestamp column for that transition).

## Common Pitfalls

- **Forgetting `revalidatePath('/dashboard')` in resolveAlert/acknowledgeAlert.** The dashboard's open alert count won't update until the page is reloaded. `revalidatePath` in the server action + `router.refresh()` in the client are both required for a seamless UX.
- **Empty alert list state.** When no open alerts exist, the table must show a graceful empty state (e.g. "No open alerts — all clear.") rather than an empty table or error. Same pattern as finances cost list.
- **Mixing `'use client'` into server component page files.** The `page.tsx` files are async server components. Action buttons must be in a separate `AlertList.tsx` client component leaf (D089 pattern). Putting `useState` or `useTransition` directly in `page.tsx` causes a Next.js build error.
- **Supabase `.in()` with empty array.** If no alerts exist for a site, the `.in('id', [])` query returns all rows. Guard with `if (alertIds.length === 0) return []` before calling `.in()`. (This is the same guard discovered in S02/T03.)
- **Using native `<select>` for filter dropdowns in server-rendered forms.** If S03 adds a status filter (open/acknowledged/resolved), use native `<select>` not shadcn Select component — shadcn Select doesn't serialize in `<form method="GET">` (D086 pattern).
- **`alert_type` display.** Raw values are `'unavailable'`, `'category_empty'`, `'site_degraded'`. Display-friendly labels (`'Product Unavailable'`, `'Category Empty'`, `'Site Degraded'`) must be derived in the rendering layer — not stored in DB.

## Open Risks

- **Stale open count on dashboard after resolve.** If a user resolves an alert in the Alerts page and immediately visits Dashboard, the count might be stale (Next.js RSC cache). `revalidatePath('/dashboard')` in the server action mitigates this, but the timing depends on ISR revalidation behavior in the pm2-served Next.js build. Acceptable for Phase 1 — the count will be accurate on next full page load.
- **Alert list growth.** If a site runs many refresh cycles with persistent issues, the resolved alerts accumulate in `product_alerts`. For Phase 1 with 1-5 sites this is negligible. The alert list page should default to filtering `status='open'` with an optional toggle to show resolved — keeps the default view clean.
- **No per-alert-type visual icon.** The slice scope doesn't require icons. Severity badges (warning/critical) are sufficient differentiation. Adding icons would require either inline SVGs or a new icon dependency — out of scope.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js App Router | none needed — established patterns in codebase | n/a |
| shadcn/ui | none needed — components already installed | n/a |
| Supabase | none needed — client pattern established | n/a |

No new skills needed. All patterns are established in the existing codebase.

## Sources

- `product_alerts` schema: `packages/db/supabase/migrations/20260313000007_alerts.sql` + `20260314000004_alerts_severity.sql` — status enum, severity enum, resolved_at nullable
- `supabase.ts` types: `packages/db/src/types/supabase.ts` lines 980-1070 — confirms `product_id: string | null` (nullable), all fields available
- Existing dashboard query: `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — open alert count already wired
- `'use client'` boundary pattern: D089 (AggregationTrigger extraction) — applies directly to AlertList component
- D034 — `'use server'` files export only async functions; constants in sibling file
- D017 — alert status lifecycle: `open → acknowledged → resolved`
- S02 forward intelligence: `product_alerts` rows have `severity`, `alert_type`, `details JSONB`, `status='open'` — S03 reads these directly, no schema changes needed
