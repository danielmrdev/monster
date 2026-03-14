# S04: Finances Shell — UAT

**Milestone:** M002
**Written:** 2026-03-14

## UAT Type

- UAT mode: live-runtime + human-experience
- Why this mode is sufficient: The slice writes to and reads from Supabase. Form interaction, inline error rendering, and the cost list update require a running browser session against the live app. Curl confirms the route resolves; visual form interaction confirms the data path.

## Preconditions

1. Admin panel running: `pm2 show monster-admin | grep status` → `online`
2. `curl -sI http://localhost:3004/finances | head -1` → `HTTP/1.1 307 Temporary Redirect` (no 500)
3. Browser connected to admin via Tailscale (`http://<vps1-tailscale-ip>:3004`)
4. Logged in to the admin panel (Supabase Auth session active)
5. `cost_categories` table has at least one row (seed data required for category select to render)

## Smoke Test

Navigate to `/finances`. Page loads with a cost entry form at the top, an empty "Cost History" table below, and a "Revenue" placeholder card at the bottom. No JavaScript errors in browser console. No 500 or blank page.

## Test Cases

### 1. Cost form renders with DB-fetched categories and sites

1. Navigate to `/finances`
2. Inspect the "Category" select dropdown
3. **Expected:** dropdown lists cost categories fetched from `cost_categories` table — not hardcoded strings
4. Inspect the "Site" select dropdown
5. **Expected:** first option is "Portfolio-wide" (empty value); remaining options are site names from the `sites` table, sorted alphabetically; if no sites exist, only "Portfolio-wide" is shown

### 2. Successful cost entry — form resets and entry appears in list

1. Navigate to `/finances`
2. Fill the form:
   - Category: select any available category
   - Amount: `49.99`
   - Date: today's date (e.g. `2026-03-14`)
   - Currency: `EUR`
   - Period: `Monthly`
   - Site: `Portfolio-wide` (leave empty)
   - Notes: `Hetzner VPS CX22`
3. Click "Add Cost"
4. **Expected:** success banner appears ("Cost added successfully" or similar green confirmation); form fields reset to defaults
5. Scroll to "Cost History" table
6. **Expected:** new row appears with: Date = today, Category = selected category name, Site = "Portfolio-wide", Amount = `€49.99`, Notes = `Hetzner VPS CX22`

### 3. Cost entry with a specific site assigned

1. Navigate to `/finances` (a site must exist in the DB — create one via `/sites/new` if needed)
2. Fill the form:
   - Category: any
   - Amount: `12.00`
   - Date: `2026-03-01`
   - Currency: `EUR`
   - Period: `Monthly`
   - Site: select a specific site from the dropdown
   - Notes: leave blank
3. Click "Add Cost"
4. **Expected:** success banner shown; entry appears in cost list with the site's name in the Site column (not "Portfolio-wide"); Notes cell is empty/blank

### 4. Validation errors render inline — required fields missing

1. Navigate to `/finances`
2. Leave Category, Amount, and Date blank
3. Click "Add Cost"
4. **Expected:** form does NOT navigate away; inline error messages appear beneath the empty required fields (Category, Amount, Date); no server error; page stays on `/finances`

### 5. Amount validation — non-numeric or zero rejected

1. Navigate to `/finances`
2. Fill Category and Date; set Amount to `0` (or `-5`)
3. Click "Add Cost"
4. **Expected:** inline error on Amount field ("Amount must be a positive number" or similar); form does not submit to DB

### 6. Cost list — multiple entries appear in reverse chronological order

1. Add two cost entries with different dates (e.g. `2026-02-01` and `2026-03-01`)
2. **Expected:** the March entry appears above the February entry (newest first, ordered by `created_at` descending)

### 7. Cost list — empty state

1. Navigate to `/finances` on a fresh environment with no `costs` rows (or verify before adding any)
2. **Expected:** "Cost History" table shows a single row spanning all columns with text "No cost entries yet." — no blank rows, no error

### 8. Revenue placeholder renders correctly

1. Navigate to `/finances`
2. Scroll to the bottom of the page
3. **Expected:** a "Revenue" card is visible with muted/secondary text explaining that revenue tracking is coming soon and mentioning Amazon Associates CSV import — no data table, no broken UI, no JavaScript errors

### 9. Amount currency formatting

1. Add a cost entry with Currency = `USD`, Amount = `1234.50`
2. Verify in the cost list
3. **Expected:** Amount column shows `$1,234.50` (locale-formatted with USD symbol, not raw `1234.5`)

## Edge Cases

### Optional period field — one-time entry

1. Fill the form with all required fields; leave Period as the empty/blank option
2. Click "Add Cost"
3. **Expected:** entry is accepted; in the cost list, the row appears without errors (Period column not shown in current table — this tests that null period doesn't cause a DB constraint error)

### Notes field — long text

1. Enter a 500-character string in the Notes textarea
2. Click "Add Cost"
3. **Expected:** entry is accepted and appears in the cost list; Notes cell shows the text (may be truncated by CSS overflow — that's acceptable)

### Currency — non-EUR (GBP)

1. Select GBP as currency, amount `99.00`
2. Click "Add Cost"
3. **Expected:** cost list shows `£99.00`

## Failure Signals

- Page shows blank or 500 → DB fetch error; check `pm2 logs monster-admin --lines 30` for "Failed to fetch costs/categories/sites: {message}"
- Form submits but no entry in list → DB insert error; check `pm2 logs monster-admin --lines 30` for "Failed to add cost: {message}"
- Category select is empty → `cost_categories` table has no rows; seed it
- Site select missing expected sites → sites not yet created or `createServiceClient()` returning empty (check service role key)
- Success banner never appears → server action returning error state; check browser devtools → Network → POST to `/finances` → response body

## Requirements Proved By This UAT

- R012 (Finances: cost tracking + P&L) — cost entry form writes to `costs` table; cost list reads back from Supabase; data path confirmed end-to-end. *Supporting only — primary proof is M008/S01.*

## Not Proven By This UAT

- Revenue tracking (Amazon Associates CSV import, P&L dashboard) — deferred to M008/S01; placeholder only shown here
- Cost editing or deletion — not in S04 scope; add in M008 if needed
- Cost pagination — not implemented; all rows fetched on each page load; acceptable for Phase 1 scale
- Multi-currency P&L aggregation — not implemented; amounts stored in their native currency with no conversion

## Notes for Tester

- The `cost_categories` table must be seeded before the form is useful. If the category select is empty, check `SELECT * FROM cost_categories;` in the Supabase dashboard.
- Playwright is unavailable on this VPS (missing `libnspr4.so`) — all visual UAT must be done in a real browser via Tailscale.
- The pre-existing `EvalError` in `pm2 logs` stderr is from a dev-build artifact in the middleware bundle (D026). It predates this slice and does not affect functionality — auth still works (307 proves it). Don't flag it as a regression from S04.
- If you see `500` instead of `307` after `pm2 reload`, run `pm2 logs monster-admin --lines 50` immediately — the first error line will identify whether it's a DB connection, env var, or import error.
