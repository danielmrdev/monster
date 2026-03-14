# S02: NicheResearcher — Background Agent + DataForSEO Research — UAT

**Milestone:** M007
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (live-runtime + human-experience)
- Why this mode is sufficient: The core proof is operational — job must enqueue, run in background, survive browser disconnect, and produce a structured report with real DataForSEO data. Static verification (build, typecheck) is already done. Human observation of polling UI and report plausibility is required to close R003.

## Preconditions

1. `pm2 status` shows `monster-admin` and `monster-worker` both online (status: `online`, restarts: low)
2. DataForSEO credentials configured in admin Settings (`/settings`) — `dataforseo_api_key` field set with `email:password` format
3. (Optional but recommended) Spaceship credentials configured in Settings for live domain availability checks
4. Browser can reach `http://localhost:3004` (or via Tailscale)
5. Supabase accessible — `research_sessions` table has `progress jsonb` column (verified in T01)

## Smoke Test

Navigate to `/research`. The page renders without 500 error, shows a niche idea text input, a market selector defaulting to ES, and a Submit button. No spinner or error state on first load.

```bash
# Quick health check before browser UAT:
pm2 logs monster-worker --lines 5 --nostream | grep 'NicheResearcherJob'
# Expected: [worker] NicheResearcherJob listening on queue "niche-research"
```

---

## Test Cases

### 1. Research session created on form submit

**Goal:** Confirm the server action creates a DB row and redirects to the session view.

1. Open `/research` in browser
2. Type `freidoras de aire` into the niche idea field
3. Confirm market selector shows `ES` (default)
4. Click **Submit Research**
5. **Expected:** Page redirects to `/research?session=<uuid>` — the URL gains a `session` query param
6. **Expected:** The session appears in the sessions list on the right with status badge `pending` or `running`
7. **Expected:** The `ResearchSessionStatus` component is visible, showing "Researching..." or similar in-progress state

```sql
-- Confirm DB row created:
SELECT id, niche_idea, market, status, created_at
FROM research_sessions ORDER BY created_at DESC LIMIT 1;
-- Expected: niche_idea='freidoras de aire', market='ES', status='pending' or 'running'
```

### 2. Live progress polling while job runs

**Goal:** Confirm the 5-second polling loop fires and the UI updates without page refresh.

1. After submitting the niche (TC1), stay on `/research?session=<id>`
2. Watch the `ResearchSessionStatus` component for 30–60 seconds
3. **Expected:** Status badge updates from `pending` → `running` (may happen quickly)
4. **Expected:** Progress log entries appear one at a time, each showing a turn number + phase summary (e.g., "Turn 1 — Analyzing niche: freidoras de aire")
5. **Expected:** No full page refresh occurs — updates happen in-place via polling

```sql
-- Confirm progress is being written to DB mid-run:
SELECT jsonb_array_length(progress), status
FROM research_sessions ORDER BY created_at DESC LIMIT 1;
-- Expected: length increases over time while status='running'
```

### 3. Job completes with structured report

**Goal:** Confirm the session reaches `completed` status and `report` jsonb is populated with all 10 required fields.

1. Continue watching the session from TC2 until status badge flips to `completed` (typically 1–5 minutes depending on DFS response times)
2. **Expected:** Status badge shows `completed` (green)
3. **Expected:** Progress log shows all turns completed
4. **Expected:** Raw report JSON is visible in the `<details>` block below the progress log
5. Click the `<details>` disclosure to expand it
6. **Expected:** JSON contains all 10 keys: `niche_idea`, `market`, `viability_score`, `summary`, `keywords`, `competitors`, `amazon_products`, `domain_suggestions`, `recommendation`, `generated_at`
7. **Expected:** `viability_score` is an integer between 0 and 100

```sql
-- Confirm report shape in DB:
SELECT
  status,
  jsonb_typeof(report) AS report_type,
  report->'viability_score' AS score,
  jsonb_array_length(report->'keywords') AS keyword_count,
  jsonb_array_length(report->'competitors') AS competitor_count
FROM research_sessions ORDER BY created_at DESC LIMIT 1;
-- Expected: status='completed', report_type='object', score is integer, arrays may be empty if DFS not configured
```

### 4. Real DataForSEO keyword data in report (requires DFS credentials)

**Goal:** Confirm the report contains real `search_volume` data from the DataForSEO Labs API.

*Precondition: DataForSEO `dataforseo_api_key` configured in Settings.*

1. Submit a new niche idea (e.g., `freidoras de aire`) and wait for completion (TC1–3)
2. Expand the raw report JSON
3. **Expected:** `keywords[]` array is non-empty (≥ 1 item)
4. **Expected:** Each keyword object has `search_volume` as a non-null integer (real DFS data, not 0 or null)
5. **Expected:** `competitors[]` array is non-empty with real domain names from SERP

```sql
-- Verify live DFS data in DB:
SELECT report->'keywords'->0->'search_volume' AS first_keyword_volume
FROM research_sessions WHERE status='completed' ORDER BY created_at DESC LIMIT 1;
-- Expected: non-null integer (e.g., 18100) — proves real DFS Labs API call succeeded

-- Worker log confirms DFS API call:
-- pm2 logs monster-worker | grep '[dataforseo] keywordIdeas'
-- Expected: [dataforseo] keywordIdeas keyword="freidoras de aire" market=ES items=N (N > 0)
```

### 5. Browser disconnect resilience

**Goal:** Confirm job continues running and survives browser tab close.

1. Submit a new niche idea from Research Lab
2. Wait ~10 seconds until status shows `running` and at least 1 progress entry is visible
3. **Close the browser tab** (or close the entire browser)
4. Wait 90 seconds
5. Reopen the browser and navigate to `/research`
6. **Expected:** The session from step 1 appears in the sessions list
7. **Expected:** Status is either `running` (still in progress) or `completed` (finished while browser was closed)
8. **Expected:** If `completed`, the session has `progress` entries from turns that ran after the tab was closed (i.e., `progress` array length > what was visible before closing)
9. **Expected:** Status is NOT `pending` (job did not stall on browser disconnect)

```sql
-- Confirm job progressed after browser close:
SELECT
  id,
  status,
  jsonb_array_length(progress) AS turn_count,
  created_at
FROM research_sessions ORDER BY created_at DESC LIMIT 3;
-- Expected: turn_count reflects turns that ran after browser was closed
```

### 6. Session history list

**Goal:** Confirm the sessions list shows past sessions and links to their status views.

1. Navigate to `/research` (no session query param)
2. **Expected:** Sessions list (right column or below form) shows up to 10 most recent research sessions
3. **Expected:** Each session shows: niche idea text, market code, status badge, created timestamp
4. **Expected:** Each session is clickable / links to `/research?session=<id>`
5. Click an older completed session
6. **Expected:** URL updates to `/research?session=<id>`, `ResearchSessionStatus` shows the session's progress log and raw report JSON (no polling for terminal sessions)

### 7. Validation: niche idea too short

**Goal:** Confirm the form rejects inputs shorter than 3 characters.

1. Navigate to `/research`
2. Type `ab` in the niche idea field (2 characters)
3. Click **Submit Research**
4. **Expected:** No redirect occurs; inline error message appears below the submit button (e.g., "Niche idea must be at least 3 characters")
5. **Expected:** No `research_sessions` row is created in DB

```sql
-- Confirm no orphaned row:
SELECT id FROM research_sessions
WHERE niche_idea = 'ab' ORDER BY created_at DESC LIMIT 1;
-- Expected: 0 rows
```

---

## Edge Cases

### Enqueue failure recovery (BullMQ/Redis down)

*Simulated test — requires temporarily breaking the Redis connection or using wrong Upstash credentials.*

1. Configure an invalid `UPSTASH_REDIS_URL` temporarily
2. Submit a niche idea
3. **Expected:** Server action returns an error state (no redirect)
4. **Expected:** The `research_sessions` row is created with `status='failed'` and `progress=[{turn:0, phase:'failed', summary:'Enqueue error: ...'}]`
5. **Expected:** No orphaned `pending` rows accumulate

```sql
-- Check for immediate failure mark:
SELECT id, status, progress->0 AS first_progress_entry
FROM research_sessions WHERE status='failed' ORDER BY created_at DESC LIMIT 1;
-- Expected: phase='failed', summary contains error message
```

### Agent parse failure (malformed final response)

*Unlikely in normal operation but important edge case.*

1. After a completed session, check if `report.error === 'parse_failed'`
2. **Expected behavior if parse fails**: Session is still `status='completed'` (not `failed`)
3. **Expected**: `report` contains `{ raw: "<original agent output>", error: "parse_failed" }` instead of structured fields
4. **Expected**: UI shows the `<details>` block with the raw text (not a crash or blank state)

```sql
SELECT id, report->>'error' AS parse_error
FROM research_sessions
WHERE status = 'completed' AND report->>'error' = 'parse_failed'
ORDER BY created_at DESC LIMIT 5;
-- Expected: ideally 0 rows (agent reliably produces valid JSON); if > 0, system handled gracefully
```

### Credentials not configured (graceful degradation)

*Test with DataForSEO and/or Spaceship credentials NOT set.*

1. Ensure `dataforseo_api_key` is not configured in Settings
2. Submit a niche idea
3. **Expected**: Job runs to completion (status=`completed`)
4. **Expected**: `keywords[]`, `competitors[]`, `amazon_products[]` are empty arrays (not crash)
5. **Expected**: `viability_score` and other non-DFS fields are still populated by the agent
6. pm2 logs show: `[niche-mcp] tool=keywordIdeas error: DataForSEO credentials not configured`

---

## Failure Signals

- Session stuck in `status='pending'` for > 2 minutes → worker not processing; check `pm2 status monster-worker` and Redis connection
- Session stuck in `status='running'` for > 15 minutes → job may have stalled; check `pm2 logs monster-worker | grep niche-researcher` for last turn logged; check BullMQ stalled job TTL (lockDuration 600s)
- `status='failed'` immediately after submit → enqueue error; check `progress->0` for error message; verify Redis credentials
- `report` is null after `status='completed'` → parse failure not caught; check worker logs for uncaught exception
- `keywords` array empty on completed job with DFS credentials configured → DFS API call failed; check `pm2 logs monster-worker | grep dataforseo` for error; verify credentials format is `email:password`
- Research page renders a 500 error → admin build issue or missing env vars; check `pm2 logs monster-admin --lines 20`

## Requirements Proved By This UAT

- R003 (Autonomous niche research) — TC1–5 together prove: niche idea → background agent → per-turn progress → structured report → survives browser disconnect. TC4 (real DFS data) is the final validation proof for R003.

## Not Proven By This UAT

- R003 validation is not complete until TC4 passes with DFS credentials configured and real `search_volume` data visible in DB.
- Domain availability live badges (S03 deliverable) — `checkDomainAvailability` MCP tool runs during research, but live Spaceship badge UI is implemented in S03.
- "Create site" CTA (S03 deliverable) — not present in S02 report viewer.
- Report rendered as formatted UI (S03) — S02 shows raw JSON in `<details>` only.

## Notes for Tester

- **Credential format for DataForSEO**: The `dataforseo_api_key` field in Settings expects `email:password` format (HTTP Basic Auth). This is NOT an API key string — it's your DataForSEO account email and password separated by a colon.
- **Job duration**: With DFS credentials configured and a real niche, expect 1–5 minutes for completion (15 turns, each involving DFS API calls). Without credentials, the job completes in 20–40 seconds (agent gets error responses, writes a valid but empty report).
- **Viability score plausibility**: The score is generated by Claude based on available keyword + competitor data. With empty arrays (no DFS credentials), scores tend to cluster around 30–50 (limited data). With real DFS data, expect 40–85 for a genuine niche — scores above 85 or below 20 are suspicious.
- **Browser disconnect test**: The most important operational proof. The job's `lockDuration: 600000ms` ensures BullMQ holds the lock for up to 10 minutes regardless of browser state. The session status in the DB is the source of truth — the UI is just a polling viewer.
- **pm2 log colors**: Worker logs use ANSI colors. `pm2 logs monster-worker --nostream` strips them; `pm2 logs monster-worker` (live) shows green for info, red for warnings/errors.
