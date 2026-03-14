# S02: Analytics Dashboard — UAT

**Milestone:** M005
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (live-runtime + human-experience)
- Why this mode is sufficient: The dashboard renders real Supabase data; mechanical checks (build, typecheck) passed during development. The remaining proof is that counts in the UI match rows in the Supabase table editor, and that the filter controls work end-to-end in a real browser session.

## Preconditions

1. Admin panel is running: `pm2 list` shows `monster-admin` as `online` on port 3004
2. You are logged in to the admin panel at `http://<tailscale-ip>:3004/analytics` (or `http://localhost:3004/analytics` on VPS1)
3. Supabase project is accessible: open Table Editor → `analytics_events` in a browser tab
4. At least some `analytics_events` rows exist (from S01 tracker; if table is empty, expected behavior is 0-counts not errors)
5. `analytics_daily` table is empty (S03 has not run yet — this is the expected state at S02 UAT time)

## Smoke Test

Navigate to `http://localhost:3004/analytics` (after login). Page must render within 3 seconds with:
- A heading "Analytics"
- Three KPI cards (Total Pageviews, Unique Visitors, Affiliate Clicks) showing numeric values (may be 0)
- Site selector and date range selector visible in the filter bar
- No JavaScript errors in browser DevTools console

---

## Test Cases

### 1. Default page load — 7-day view, all sites

1. Navigate to `/analytics` with no query params
2. Observe the filter bar
3. **Expected:** Site selector shows "All Sites" selected; Date Range shows "Last 7 days" selected
4. **Expected:** KPI cards show numeric counts (0 or higher); no error page; no blank white screen

### 2. KPI counts match Supabase ground truth

1. Open Supabase Table Editor → `analytics_events`
2. Note the number of rows with `event_type = 'pageview'` created in the last 7 days
3. Note the number of rows with `event_type = 'click_affiliate'` created in the last 7 days
4. Return to `/analytics` in the admin panel (default 7d view)
5. **Expected:** "Total Pageviews" card value matches the Supabase pageview row count (±1 for timing edge cases)
6. **Expected:** "Affiliate Clicks" card value matches the Supabase click_affiliate row count

### 3. Date range filter — switch to Today

1. On `/analytics` page, locate the "Date Range" selector
2. Select "Today" (either via dropdown or Apply button)
3. **Expected:** URL updates to `?range=today`
4. **Expected:** Page re-renders with KPI counts scoped to today's events only
5. **Expected:** "Site" selector still shows "All Sites" (both params preserved across filter change)

### 4. Date range filter — switch to Last 30 days

1. On `/analytics` page, select "Last 30 days" from the Date Range selector
2. **Expected:** URL updates to `?range=30d`
3. **Expected:** KPI counts are ≥ the 7-day values (30d window includes more events)

### 5. Site filter — filter to a specific site

1. On `/analytics` page, open the "Site" dropdown
2. Select one specific site (if any exist)
3. **Expected:** URL updates to `?site=<uuid>&range=<current-range>` (both params preserved)
4. **Expected:** Per-site metrics table shows only that site's row
5. **Expected:** KPI cards show only that site's totals
6. Verify: open Supabase Table Editor → `analytics_events` → filter by `site_id = <that uuid>` — counts should match

### 6. Per-site metrics table

1. On `/analytics` default view (7d, all sites)
2. Locate the "Per-Site Metrics" table
3. If events exist:
   - **Expected:** Each row shows: Site Name, Pageviews (number), Unique Visitors (number), Affiliate Clicks (number), Top Page (path string or —)
   - **Expected:** "Unique Visitors" column header shows "(approx)" qualifier
4. If no events:
   - **Expected:** Single row spanning all columns: "No events in this period."

### 7. Top Pages table

1. On `/analytics` default view
2. Locate the "Top Pages" table
3. If pageview events exist:
   - **Expected:** Rows show page paths (e.g. `/`, `/category/freidoras`) and pageview counts, ordered descending
   - **Expected:** At most 10 rows shown
4. If no pageview events:
   - **Expected:** "No page data in this period." message

### 8. Daily Aggregates empty state (S03 not yet run)

1. Navigate to `/analytics` (any filter)
2. Scroll to "Daily Aggregates" card
3. **Expected:** "Aggregated data will appear after the daily cron runs." — exact text
4. **Expected:** No error, no blank card, no spinner

### 9. Country Breakdown Phase 1 placeholder

1. Navigate to `/analytics`
2. Scroll to "Country Breakdown" card
3. **Expected:** "No country data in Phase 1. Country tracking will be available in a future update (R024)."
4. **Expected:** No error, no empty card

### 10. Filter state preserved across both selects

1. Select a specific site from the Site dropdown (auto-submits)
2. Then change the Date Range selector to "Today"
3. **Expected:** URL contains both `?site=<uuid>&range=today`
4. **Expected:** Data reflects BOTH filters applied simultaneously

### 11. URL bookmarkability

1. Navigate to `/analytics?site=<uuid>&range=30d` by typing it directly in the address bar
2. **Expected:** Page loads with Site selector pre-selected to that site, Date Range pre-selected to "Last 30 days"
3. **Expected:** Data correctly filtered to that site + 30d range

---

## Edge Cases

### Empty analytics_events table (no events yet)

1. If `analytics_events` table is empty (or filtered site has no events in range):
2. Navigate to `/analytics`
3. **Expected:** All KPI cards show "0"
4. **Expected:** Per-site metrics table shows "No events in this period."
5. **Expected:** Top Pages table shows "No page data in this period."
6. **Expected:** No JavaScript error, no Next.js error page

### Invalid range query param

1. Navigate to `/analytics?range=invalid`
2. **Expected:** Page loads with "Last 7 days" as the effective range (normalization fallback)
3. **Expected:** No error

### Invalid site UUID in query param

1. Navigate to `/analytics?site=not-a-uuid`
2. **Expected:** Supabase query either returns 0 rows or errors cleanly
3. **Expected:** Next.js error boundary renders (not a blank page) if Supabase rejects the malformed UUID
4. **Expected:** No silent failure

---

## Failure Signals

- **Blank white page** — Next.js error boundary not catching; check `pm2 logs monster-admin | tail -50`
- **"Failed to fetch analytics_events: ..."** in pm2 logs — Supabase connection or auth issue; check `SUPABASE_SERVICE_ROLE_KEY` env var
- **KPI cards show 0 but Supabase has rows** — check date range (UTC vs local time boundary), check `site_id` filter matches the rows' `site_id`
- **Filter changes don't update data** — check that both selects are inside the same `<form method="GET">` and that `onChange` auto-submit fires
- **"Apply" button needed but onChange works** — expected; onChange is the primary path, Apply is fallback for keyboard users
- **Daily Aggregates section shows error instead of empty state** — check `analytics_daily` table exists and is accessible via service role key
- **URL doesn't include both params after filtering** — both selects must be inside the same `<form>` element; check DOM with DevTools

---

## Requirements Proved By This UAT

- R009 (Analytics: lightweight GDPR-friendly tracking) — partially proved: admin panel `/analytics` page renders real Supabase data, filterable by site and date range, with correct counts matching Supabase table editor. Combined with S01 (tracker posts events), the end-to-end visibility loop is closed at the UI level.

## Not Proven By This UAT

- Live end-to-end: visit a live public site in a browser → see the row appear in Supabase within 10 seconds → confirm count increments in admin panel — requires a live deployed site with tracker (R009 full milestone proof)
- `analytics_daily` populated state — S03 must run first; only the empty state is proven by this UAT
- Country data — always null in Phase 1 (D081); placeholder is correct behavior, not a gap in this UAT
- Aggregation correctness beyond "counts match Supabase": time-zone edge cases at midnight, multi-day deduplication accuracy for unique visitors (D080) — these are Phase 1 approximations documented in code

## Notes for Tester

- Unique Visitors count is approximate (D080) — daily hash without IP. The "(approximate)" label in the UI is intentional. Don't expect it to match a session-based analytics tool.
- If you see 0 everywhere and Supabase has rows: check that the rows have `created_at` within the last 7 days (UTC). Rows from S01 development may have old timestamps.
- The "Apply" button is a keyboard/no-JS fallback. In a normal browser, changing either select auto-submits the form — you won't need to click Apply.
- Daily Aggregates empty state is the correct state right now (S03 not implemented). If it shows something other than the expected message, that's a regression.
- Country Breakdown placeholder is intentional Phase 1 behavior. If it shows actual data, something unexpected has changed.
