# S03: Dashboard Alert Surface + Alert Resolution UI — UAT

**Milestone:** M006
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (artifact-driven verification for build/typecheck/structure; live-runtime for UI navigation and alert actions)
- Why this mode is sufficient: Build and typecheck prove the component wiring and type correctness. Live-runtime tests confirm the UI renders correctly and the server actions mutate DB state as expected. Full end-to-end alert creation (S02 ProductRefreshJob) is a separate UAT concern; S03 UAT can use manually seeded alerts.

## Preconditions

- Admin panel running: `pm2 status` shows `monster-admin` online
- Browser accessible at `http://localhost:3004` (or via Tailscale IP)
- At least one site exists in the `sites` table
- At least one open `product_alert` row exists — seed if needed:
  ```sql
  INSERT INTO product_alerts (site_id, alert_type, severity, status, details, created_at)
  SELECT id, 'product_unavailable', 'critical', 'open', '{"asin":"B0TEST123"}', now()
  FROM sites LIMIT 1;
  ```
- For per-site alert UAT: note the `id` of the site used above (`SELECT id, name FROM sites LIMIT 1;`)

## Smoke Test

Navigate to `/alerts`. Page loads with a table showing at least one row (the seeded alert). No error boundary, no blank page.

## Test Cases

### 1. Alerts nav entry visible and functional

1. Open the admin panel in the browser.
2. Look at the left sidebar nav.
3. **Expected:** "Alerts" appears between "Finances" and "Settings".
4. Click "Alerts".
5. **Expected:** URL becomes `/alerts`. Page title "Alerts" visible. No loading error.

### 2. Open alerts page renders correctly

1. Navigate to `/alerts`.
2. **Expected:** Table with columns: Site, Type, Severity, Product, Created, Actions.
3. **Expected:** The seeded alert shows:
   - Site name (not UUID)
   - Type: "Product Unavailable" (not raw `product_unavailable`)
   - Severity badge: red "destructive" badge for `critical`
   - Product: "—" (no tsa_products join for manually seeded alert without product_id)
   - Created: formatted timestamp
   - Actions: "Acknowledge" and "Resolve" buttons

### 3. Acknowledge action removes row from open view

1. Navigate to `/alerts`. Note the row for the seeded alert.
2. Click "Acknowledge" on the seeded alert row.
3. **Expected:** Button shows loading/disabled state briefly.
4. **Expected:** After action completes, the row disappears from the list (router.refresh() fires, page re-fetches open alerts only).
5. Verify in DB:
   ```sql
   SELECT status, resolved_at FROM product_alerts WHERE alert_type = 'product_unavailable' ORDER BY created_at DESC LIMIT 1;
   ```
6. **Expected:** `status = 'acknowledged'`, `resolved_at` is NULL.

### 4. Resolve action removes row and sets resolved_at

1. Seed another open alert (or re-seed):
   ```sql
   INSERT INTO product_alerts (site_id, alert_type, severity, status, details, created_at)
   SELECT id, 'site_degraded', 'warning', 'open', '{}', now() FROM sites LIMIT 1;
   ```
2. Navigate to `/alerts`. Locate the `site_degraded` alert row.
3. Click "Resolve".
4. **Expected:** Row disappears from the open view.
5. Verify in DB:
   ```sql
   SELECT status, resolved_at FROM product_alerts WHERE alert_type = 'site_degraded' ORDER BY created_at DESC LIMIT 1;
   ```
6. **Expected:** `status = 'resolved'`, `resolved_at` is a non-null ISO timestamp.

### 5. Dashboard Open Alerts card shows live count with amber styling

1. With at least one `status='open'` alert in the DB, navigate to `/dashboard`.
2. **Expected:** "Open Alerts" KPI card shows the correct count (≥1).
3. **Expected:** The card has an amber border and the count value is displayed in amber text.
4. Acknowledge or resolve all open alerts (or set them via SQL: `UPDATE product_alerts SET status='resolved'`).
5. Navigate to `/dashboard` again (or reload).
6. **Expected:** "Open Alerts" shows 0. Card reverts to its default styling (no amber border, no amber text).

### 6. Empty state on /alerts when no open alerts

1. Ensure no `status='open'` alerts exist:
   ```sql
   UPDATE product_alerts SET status = 'resolved', resolved_at = now() WHERE status = 'open';
   ```
2. Navigate to `/alerts`.
3. **Expected:** Table is replaced by the text "No open alerts — all clear." (no empty table, no error).

### 7. Per-site alert summary in site detail

1. Seed a new open alert for a specific site:
   ```sql
   INSERT INTO product_alerts (site_id, alert_type, severity, status, details, created_at)
   SELECT id, 'category_empty', 'warning', 'open', '{"category":"test"}', now()
   FROM sites LIMIT 1 RETURNING id;
   ```
   Note the `site_id` returned.
2. Navigate to `/sites/<site_id>`.
3. **Expected:** A "Product Alerts" card is visible (after the Product Refresh card).
4. **Expected:** Card heading shows "1 open alert".
5. **Expected:** Table row shows Type: "Category Empty", Severity badge: secondary "warning", Product: "—".
6. **Expected:** "Acknowledge" and "Resolve" buttons are present on the row.

### 8. Per-site acknowledge action works inline

1. From the site detail page `/sites/<site_id>` (with the seeded alert from test 7).
2. Click "Acknowledge" on the `category_empty` alert row.
3. **Expected:** Row disappears from the site detail Product Alerts card.
4. **Expected:** Card heading updates to "0 open alerts" or shows the empty state "No open alerts — all clear."
5. Confirm in DB: `SELECT status FROM product_alerts WHERE alert_type = 'category_empty' ORDER BY created_at DESC LIMIT 1;`
6. **Expected:** `status = 'acknowledged'`.

### 9. Alert with product join displays ASIN and title

1. Seed an alert linked to an existing tsa_products row:
   ```sql
   -- Get a product id
   SELECT id, asin, title FROM tsa_products LIMIT 1;
   -- Seed alert with product_id
   INSERT INTO product_alerts (site_id, product_id, alert_type, severity, status, details, created_at)
   VALUES ('<site_id>', '<product_id>', 'product_unavailable', 'critical', '{}', now());
   ```
2. Navigate to `/alerts`.
3. **Expected:** Product column shows the ASIN (and title if present, or just ASIN if title is null).
4. **Expected:** Type shows "Product Unavailable".
5. **Expected:** Severity badge is red/destructive.

## Edge Cases

### Empty product title (null in DB)

1. If a `tsa_products` row has `title = NULL`, the seeded alert in test 9 above should still render.
2. **Expected:** Product column shows ASIN only (no crash, no empty cell).

### Both buttons pending simultaneously — row isolation

1. With two open alerts in the list, click "Acknowledge" on the first row.
2. **Expected:** Only the first row's buttons disable during the pending state. Second row buttons remain enabled.
3. This confirms `AlertRowActions` sub-component scopes `useTransition` per row.

### Alert type display label coverage

1. Seed one alert each for `product_unavailable`, `category_empty`, and `site_degraded`.
2. Navigate to `/alerts`.
3. **Expected:** Type column shows "Product Unavailable", "Category Empty", "Site Degraded" (not raw snake_case values).

## Failure Signals

- **Row not disappearing after Acknowledge/Resolve:** Action failed silently. Open browser DevTools → Console → look for `[AlertList] acknowledgeAlert failed:` or `[SiteAlerts] resolveAlert failed:` error log.
- **Alerts page shows empty but alerts exist in DB:** Check `status = 'open'` filter — confirm DB rows have `status = 'open'` (not `'acknowledged'` or `'resolved'`). Also check the PostgREST query for the correct `.eq('status', 'open')`.
- **Dashboard card count is 0 but alerts exist:** Check that the dashboard query also filters `status = 'open'`. Confirm `revalidatePath('/dashboard')` was called after action.
- **Error boundary on /alerts page load:** `pm2 logs monster-admin` will show the thrown Supabase error from `page.tsx`. Likely a schema mismatch or missing column.
- **Nav "Alerts" entry missing:** `grep "alerts" apps/admin/src/components/nav-sidebar.tsx` — should show `{ href: '/alerts', label: 'Alerts' }`.
- **Amber styling not visible on dashboard:** Confirm `openAlerts > 0` returns true in `dashboard/page.tsx`. Check that the KPI query counts `status = 'open'` alerts from `product_alerts`.
- **Build failure on actions.ts:** The file must export only async functions. Any exported constant or type alias will fail the Next.js `'use server'` build constraint.

## Requirements Proved By This UAT

- R008 (product availability alerts) — alert rows created by S02's refresh pipeline are now visible, filterable by status, and actionable (acknowledge/resolve) through the admin panel UI without touching the DB directly. The dashboard KPI card surfaces the live open alert count with a visual severity signal.

## Not Proven By This UAT

- Alert deduplication live runtime proof (two consecutive `ProductRefreshJob` runs on a site with a persistently unavailable product producing exactly one open alert) — requires live DataForSEO credentials and a site in `live` status. Covered by S02's UAT.
- Alerts created by real product refresh cycles (requires DataForSEO credentials in Settings and at least one site with live status and populated products).
- Country-level alert aggregation or alert trends — not in scope for Phase 1.

## Notes for Tester

- The SQL seed commands above use `LIMIT 1` to pick any site — substitute a real site UUID for more meaningful testing.
- When seeding alerts without `product_id`, the Product column will always show "—". This is correct for `category_empty` and `site_degraded` alert types, which are site-level alerts.
- After each test that modifies alert status, reset the seed data before running the next test to keep the environment predictable.
- The amber visual on the dashboard KPI card uses `border-amber-400` and `text-amber-600` Tailwind classes. If the card appears unstyled, confirm Tailwind v4 is scanning the dashboard page file for class names.
