# S03: Settings — API Key Management — UAT

**Milestone:** M002
**Written:** 2026-03-13

## UAT Type

- UAT mode: human-experience
- Why this mode is sufficient: The core deliverable is a browser-facing settings form with masked display and DB persistence. The security-critical property (no raw key in HTML) and the UX property (masked indicator appears after reload) can only be confirmed by a human in a browser. Automated checks (typecheck, build, 307 route) verified the non-interactive layer; this UAT covers the interactive round-trip.

## Preconditions

- Admin panel running: `pm2 status` shows `monster-admin` online
- Browser access to the admin panel via Tailscale (e.g. `http://<vps1-tailscale-ip>:3004`)
- Logged in to the admin panel (auth session active)
- Supabase dashboard accessible for DB ground-truth checks
- A test string to use as a fake API key, e.g. `sk-ant-test-1234567890abcdef` (do not use a real key)

## Smoke Test

Navigate to `http://<host>:3004/settings`. The page must render with four input fields (Spaceship API Key, DataForSEO API Key, Claude API Key, Amazon Affiliate Tag) and a "Save Settings" button. No error message, no blank page, no 500.

## Test Cases

### 1. Page loads with empty state (no keys saved yet)

1. Navigate to `/settings`
2. Observe the four input fields
3. **Expected:** All four fields are empty (no pre-filled values). No "Currently set" indicator appears below any field. The page title "Settings" is visible in the sidebar nav (active state highlighted).

---

### 2. Save a single API key and verify masked display

1. Navigate to `/settings`
2. Enter `sk-ant-test-1234567890abcdef` into the "Claude API Key" field
3. Leave all other fields empty
4. Click "Save Settings"
5. **Expected:** A success banner appears: "Settings saved successfully" (or equivalent). The page does not navigate away — it stays on `/settings`.
6. Reload the page (`Ctrl+R` or `F5`)
7. **Expected:** Below the "Claude API Key" field, a "Currently set (ends in cdef)" indicator is visible. The input field itself is empty (not pre-filled with the key). No indicator appears under Spaceship, DataForSEO, or Amazon Affiliate Tag fields.

---

### 3. Value masking — no raw key in HTML source

1. After completing Test Case 2 (Claude key saved), use the browser's "View Page Source" (`Ctrl+U`)
2. Search the HTML source for the string `sk-ant-test-1234567890abcdef`
3. **Expected:** The full key string does not appear anywhere in the HTML source. Only the last-4 characters (`cdef`) appear, inside the masked indicator text.

---

### 4. Save multiple keys in one submission

1. Navigate to `/settings`
2. Enter `spaceship-key-xyz789` into "Spaceship API Key"
3. Enter `dataforseo-key-abc123` into "DataForSEO API Key"
4. Leave "Claude API Key" and "Amazon Affiliate Tag" empty
5. Click "Save Settings"
6. **Expected:** Success banner appears. Page stays on `/settings`.
7. Reload the page
8. **Expected:** "Currently set (ends in z789)" under Spaceship API Key. "Currently set (ends in 123)" under DataForSEO API Key. Claude API Key shows its own indicator (set in Test 2). Amazon Affiliate Tag shows no indicator (still unset).

---

### 5. DB ground truth — value stored as JSON object

1. Open Supabase dashboard → Table Editor → `settings` table
2. **Expected:** Rows exist for the keys saved in previous tests. The `value` column for each row shows a JSON object: `{"value": "sk-ant-test-1234567890abcdef"}` (not a raw string). The `key` column matches the key identifier (e.g. `claude_api_key`). The `updated_at` column reflects the save timestamp.

---

### 6. Overwrite an existing key

1. Navigate to `/settings`
2. Enter `sk-ant-new-key-0000` into "Claude API Key" (overwriting the value from Test 2)
3. Leave all other fields empty
4. Click "Save Settings"
5. Reload the page
6. **Expected:** "Currently set (ends in 0000)" now appears under Claude API Key (last-4 updated). Spaceship and DataForSEO indicators remain from Test 4.
7. Verify in Supabase dashboard: the `claude_api_key` row's `value` column now shows `{"value": "sk-ant-new-key-0000"}`. Only one row exists for `claude_api_key` (no duplicate rows — upsert worked correctly).

---

### 7. Amazon Affiliate Tag field

1. Navigate to `/settings`
2. Enter `monster-affiliate-20` into "Amazon Affiliate Tag"
3. Click "Save Settings"
4. Reload the page
5. **Expected:** "Currently set (ends in e-20)" indicator appears below Amazon Affiliate Tag. The field itself is empty.

## Edge Cases

### Empty submission — no-op semantics

1. Navigate to `/settings` (at least one key already saved from prior tests)
2. Leave all four fields completely empty
3. Click "Save Settings"
4. **Expected:** Success banner appears (or page simply reloads without error). No upsert occurs — check Supabase dashboard and confirm the `updated_at` timestamps on existing rows have NOT changed. The "Currently set" indicators still appear on reload.

---

### Short key value — last-4 masking with short strings

1. Navigate to `/settings`
2. Enter `abc` (3 characters) into the Amazon Affiliate Tag field
3. Click "Save Settings"
4. Reload the page
5. **Expected:** A masked indicator appears. The last-4 display may show the entire string or handle the short-value case gracefully (implementation-dependent). No crash or blank indicator. The full value `abc` does not appear in HTML source.

---

### Simultaneous update preserves untouched keys

1. Confirm Spaceship API Key is set (from Test 4)
2. Navigate to `/settings`
3. Enter a new value only in "DataForSEO API Key" field
4. Click "Save Settings"
5. Reload the page
6. **Expected:** DataForSEO indicator shows updated last-4. Spaceship indicator is unchanged. Claude and Amazon Affiliate Tag indicators unchanged. Supabase `settings` table has the same number of rows as before — no duplicate rows, no deleted rows.

## Failure Signals

- Page shows a Next.js error boundary or blank page → check `pm2 logs monster-admin --lines 20` for "Failed to fetch settings"
- Saving shows no success banner and no error → check browser console for network errors; check pm2 logs for "Failed to upsert setting"
- "Currently set" indicator does not appear after reload even though save succeeded → check Supabase `settings` table: `value` column must be JSON object `{"value":"..."}`, not a raw string; if it's a raw string, the cast in `page.tsx` returns `undefined`
- Full key value visible in page source → the raw value is leaking through `defaultValue` or the server-rendered props; check `page.tsx` — only the suffix (`maskedDisplay[key]`) must be passed to the form, not the raw value
- Duplicate rows in `settings` table → `upsert` `onConflict` is not working; check that `key` column has a unique constraint in the DB schema

## Requirements Proved By This UAT

- R013 (Admin panel on VPS1 via pm2) — settings route resolves and renders after pm2 reload, confirming operational stability

## Not Proven By This UAT

- Full-key security under a sophisticated attack (e.g. React DevTools state inspection, server-side memory dump) — this UAT only checks HTML source
- Concurrent saves from two browser sessions — single-user admin panel makes this a non-issue in Phase 1
- DataForSEO / Spaceship / Claude API validity — the UAT uses fake keys; key format validation is not implemented (intentionally deferred)
- Settings values consumed by actual API clients (agents, generators) — S03 only proves persistence and masked display; consumption is tested in the milestones that use each key

## Notes for Tester

- Use fake/test key strings for all inputs — never paste real API keys during UAT. The DB row will contain the value; use a test environment or clean up after.
- The "Amazon Affiliate Tag" field is in a separate card ("Affiliate Settings") below the "API Keys" card — scroll down if needed.
- If the page redirects to `/login` instead of rendering, the auth session has expired — log in again and retry.
- The masked indicator text shows only the last 4 characters of the stored value. A 4-character key like `test` would show `(ends in test)` — this is expected behavior, not a bug.
- `updated_at` in the Supabase dashboard is in UTC. The admin panel is on VPS1 (check its timezone with `date` if timestamps look off).
