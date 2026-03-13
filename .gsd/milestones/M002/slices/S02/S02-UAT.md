# S02: Dashboard KPIs — UAT

**Milestone:** M002
**Written:** 2026-03-13

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: The slice is a single server-rendered page with real Supabase reads. Verification requires a live browser session with an authenticated user to confirm real counts render — static analysis and build checks confirm the code is correct but not the data display.

## Preconditions

1. `pm2 status` shows `monster-admin` as `online`
2. At least one site has been created via `/sites/new` (so total count > 0)
3. The tester has valid admin credentials (Supabase auth user exists)
4. Browser is not caching a stale session

## Smoke Test

Navigate to `http://<tailscale-ip>:3004/dashboard` after logging in. Four KPI cards visible with numeric counts — no "Coming soon" text, no blank cards, no 500 error.

## Test Cases

### 1. Dashboard loads with real counts

1. Log in at `http://<tailscale-ip>:3004/login`
2. Navigate to `/dashboard`
3. **Expected:** Four KPI cards render: "Total Sites", "Live Sites", "Draft Sites", "Open Alerts". Each shows a number (not null, not "–", not "Coming soon"). Total Sites count matches the number of site records visible in `/sites`.

### 2. Count values are consistent with Sites data

1. Go to `/sites` and count the total number of site rows in the table
2. Note how many have status `live` and how many have status `draft`
3. Navigate to `/dashboard`
4. **Expected:** "Total Sites" matches the row count from step 1. "Live Sites" and "Draft Sites" match the counts from step 2. Values sum correctly (live + draft may be < total if any sites are in other statuses like `generating` or `deploying`).

### 3. Open Alerts card renders when product_alerts table is empty

1. Navigate to `/dashboard` (no product alerts exist in Phase 1)
2. **Expected:** "Open Alerts" card shows `0` — not an error, not blank, not a UI crash.

### 4. No server-side errors in pm2 logs

1. Reload the dashboard page in the browser
2. Run: `pm2 logs monster-admin --lines 30 --nostream`
3. **Expected:** No lines containing `Failed to fetch dashboard KPIs`. The reload log shows `✓ Ready` with no stack traces.

### 5. Auth guard still fires on dashboard route

1. Open an incognito/private browser window
2. Navigate directly to `http://<tailscale-ip>:3004/dashboard`
3. **Expected:** Redirected to `/login` (307). Dashboard content is not visible without authentication.

## Edge Cases

### Fresh database with zero sites

1. On a fresh Supabase environment with no site records created
2. Navigate to `/dashboard` while logged in
3. **Expected:** All four KPI cards display `0`. No errors, no null renders, no UI crashes.

### Supabase unreachable (simulated)

1. Check `pm2 logs monster-admin` immediately after a period where DB was briefly unreachable
2. **Expected:** Any DB error surfaces as `Failed to fetch dashboard KPIs (<query name>): <error message>` in pm2 logs, NOT a silent 0. Browser shows Next.js error page (500), not a 307 redirect.

### Multiple sites with mixed statuses

1. Ensure at least one site with status `live` and one with status `draft` exist
2. Navigate to `/dashboard`
3. **Expected:** "Live Sites" and "Draft Sites" counts reflect actual status distribution. Neither shows 0 when sites in that status exist.

## Failure Signals

- "Coming soon" text still visible → stub was not replaced (deployment issue or wrong branch)
- Any card shows `null` or blank instead of a number → count coercion (`?? 0`) not applied
- `HTTP/1.1 500` from `curl -sI http://localhost:3004/dashboard` → server component threw, check pm2 logs
- `Failed to fetch dashboard KPIs` in pm2 logs → Supabase credential or network issue
- Dashboard shows 0 for all counts when sites clearly exist → service role client not used (anon client with RLS blocking reads)

## Requirements Proved By This UAT

- R008 (partial) — Dashboard displays a real open alerts count from `product_alerts`. Display surface confirmed; alert creation pipeline (M006) will populate it.

## Not Proven By This UAT

- R008 (full) — Alert creation, severity classification, and acknowledgement flow are M006 scope
- Revenue, traffic, and cost KPI cards — deferred to M005 and M008
- Dashboard real-time updates — not in scope for Phase 1; static server-rendered counts on page load

## Notes for Tester

- The "Open Alerts" card will show `0` in Phase 1 until M006 ships — this is correct behavior, not a bug.
- If you see an `EvalError` about "code generation from strings disallowed" in pm2 error logs, this is a pre-existing middleware issue from a dev build (D026) — unrelated to the dashboard KPIs and does not affect dashboard function.
- Counts are fetched fresh on every page load (server component, no caching). Refreshing the page after creating a new site should immediately reflect the updated count.
