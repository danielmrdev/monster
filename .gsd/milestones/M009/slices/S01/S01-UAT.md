# S01 UAT — UX Fixes + Dashboard Enhancements

**When to run:** After deploying the S01 changes to the admin panel.

---

## Test 1: Generate Site button feedback

1. Open a site detail page (`/sites/<id>`)
2. Click **Generate Site**
3. **Expected:** Button immediately becomes disabled and shows a spinner with "Generating…" text
4. **Expected:** After a few seconds, the Job Status section below updates to show a new job (Pending or Running)
5. **Pass if:** Spinner appears on click; silent submission no longer occurs

---

## Test 2: Preview toolbar slash fix

1. Generate a site so a dist exists
2. Click **Preview** on the site detail page
3. **Expected:** Toolbar shows `preview` with no "/" suffix when at the homepage
4. Navigate to a category or product page in the iframe
5. **Expected:** Toolbar shows `preview / categories/air-fryers` (with the slash separator and path)
6. **Pass if:** No spurious "/" appears when viewing the homepage

---

## Test 3: Chat markdown rendering

1. Navigate to **Monster Chat** (`/monster`)
2. Send a message asking for a bulleted list (e.g. "List the main advantages of building affiliate sites")
3. **Expected:** Response renders with visible markdown formatting — bold text bold, lists as visual bullets, code blocks with monospace font
4. **Pass if:** Formatted response is readable; raw asterisks or hashes do not appear as plain characters

---

## Test 4: Settings cleanup

1. Navigate to **Settings** (`/settings`)
2. **Expected:** No "Claude API Key" field visible
3. **Expected:** No "Affiliate Settings" section visible
4. **Pass if:** Neither removed field appears in the form

---

## Test 5: Dashboard enriched sections

1. Navigate to **Dashboard** (`/dashboard`)
2. **Expected:** P&L widget shows "This Month — P&L" with revenue, costs, profit (or "No financial data this month yet." if no data)
3. **Expected:** Top Sites section shows up to 5 sites with pageview counts (or "No analytics data yet.")
4. **Expected:** Recent Failed Jobs section shows a table of failed jobs (or a green "✓ No failed jobs" message)
5. **Expected:** Open Alerts KPI card has a "View all →" link when alert count > 0
6. **Pass if:** All four new sections render without JavaScript errors in the browser console
