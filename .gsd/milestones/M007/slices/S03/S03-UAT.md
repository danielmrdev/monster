# S03: Research Report UI + Domain Suggestions + Create Site CTA — UAT

**Milestone:** M007
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (artifact-driven for build/typecheck/structure; live-runtime for browser flow)
- Why this mode is sufficient: The primary deliverables (ResearchReportViewer, SiteForm pre-fill) are UI components that require both a passing build and visual/interactive verification in a browser. Build/typecheck gates confirm structural correctness; browser tests confirm the user-facing loop works end-to-end.

## Preconditions

- Admin panel running at `http://localhost:3004` (`pm2 status monster-admin` → online)
- A completed research session exists in Supabase with `status = 'completed'` and a valid `report` JSONB field conforming to `ResearchReportSchema`
  - If no completed session exists: either run a real NicheResearcher job (requires DataForSEO credentials) or manually INSERT a test row via SQL (see "Seeding a test session" below)
- User authenticated in the admin panel (Research Lab is behind auth)
- Spaceship credentials optionally configured in Settings (domain availability badges show "Available/Taken" only if configured; "Unknown" is acceptable if not configured)

### Seeding a test session (if no completed session exists)

```sql
INSERT INTO research_sessions (
  id, niche_idea, market, status, report, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'freidoras de aire',
  'ES',
  'completed',
  '{
    "niche_idea": "freidoras de aire",
    "market": "ES",
    "viability_score": 72,
    "summary": "High search volume niche with strong Amazon product availability.",
    "recommendation": "Proceed — strong fundamentals, moderate competition.",
    "keywords": [
      {"keyword": "freidora de aire", "search_volume": 90500, "cpc": 0.45, "competition": 0.62},
      {"keyword": "mejor freidora de aire", "search_volume": 22200, "cpc": 0.38, "competition": 0.51}
    ],
    "competitors": [
      {"domain": "tuhogar.es", "title": "Freidoras de Aire - Tu Hogar", "url": "https://tuhogar.es/freidoras"},
      {"domain": "cocina365.com", "title": "Mejores Freidoras 2024", "url": "https://cocina365.com/freidoras"}
    ],
    "amazon_products": [
      {"asin": "B09FV4R8F6", "title": "Philips HD9252/90 Airfryer", "price": 69.99, "rating": 4.4, "reviews": 12500, "is_prime": true, "url": "https://amazon.es/dp/B09FV4R8F6"},
      {"asin": "B085G4QBMF", "title": "Cosori CP158-AF", "price": 89.99, "rating": 4.5, "reviews": 8300, "is_prime": true, "url": "https://amazon.es/dp/B085G4QBMF"}
    ],
    "domain_suggestions": ["freidoradeaire.es", "mejorfreidora.es", "freidoraair.com"],
    "generated_at": "2026-03-13T18:00:00Z"
  }',
  now(),
  now()
);
```

## Smoke Test

```bash
# Both routes respond (auth redirect = correct behavior for unauthenticated access)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/research   # → 307
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/sites/new  # → 307

# Build exits 0 (no regressions)
pnpm --filter @monster/admin build  # → exit 0

# Typecheck exits 0 across all packages
pnpm -r typecheck  # → Done (no errors)
```

---

## Test Cases

### 1. Completed session renders full report (not polling UI)

**Precondition:** A completed research session exists (seeded above or from real job).

1. Log into the admin panel.
2. Navigate to `/research`.
3. In the session history list, locate the completed session (should show "Completed" status badge).
4. Click on the session.
5. **Expected:** The page renders the full report layout — NOT the progress/polling UI (`ResearchSessionStatus`). You should see:
   - A header with the niche idea ("freidoras de aire") and market badge ("ES")
   - A viability score card (score "72") with a green badge (≥70)
   - A "Summary" section with the summary paragraph
   - A "Recommendation" callout block
   - A "Keywords" table with at least 2 rows showing keyword, search volume, CPC, and competition %
   - A "Competitors" ordered list with at least 2 entries
   - An "Amazon Products" grid with at least 2 products (ASIN visible or product title)
   - A "Domain Suggestions" section with the 3 domains listed
   - A "Create site from this research" button/link

### 2. Viability score color coding

1. In the report from Test 1, inspect the viability score badge.
2. **Expected (score = 72):** Badge is green (≥70 threshold). If using the seeded session, this is "72" in a green-styled badge.
3. Manually test other thresholds (update the test session's `viability_score` to 55, reload page):
   - score 55 → yellow/secondary badge
   - score 30 → red/destructive badge

### 3. Domain suggestions with availability badges

1. Open the completed session report from Test 1.
2. Scroll to the "Domain Suggestions" section.
3. **Expected with Spaceship credentials configured:** Each domain shows either:
   - Green "Available" badge (with optional price string if returned by Spaceship)
   - Gray "Taken" badge
4. **Expected without Spaceship credentials:** Each domain shows a yellow "Unknown" badge.
5. Verify no page crash occurs regardless of Spaceship credential state.
6. **Diagnostic:** If all badges are "Unknown", check Next.js server stdout for `[SpaceshipClient] spaceship_api_key not configured`.

### 4. "Create site from this research" CTA navigates with pre-filled params

1. From the completed session report, click the "Create site from this research" button/link.
2. **Expected:** Browser navigates to `/sites/new?niche=freidoras%20de%20aire&market=ES` (URL-encoded niche, raw market code).
3. On the `/sites/new` page:
   - The niche textarea shows `freidoras de aire` (pre-filled, URL-decoded)
   - The market select shows the option for `ES` (Spain / Amazon.es) pre-selected
4. Verify both fields are editable (user can change them before submitting).

### 5. Parse-failure fallback renders gracefully

1. In Supabase, find the test session and set `report` to an invalid JSON object that doesn't match the schema:
   ```sql
   UPDATE research_sessions SET report = '{"invalid_field": true}' WHERE niche_idea = 'freidoras de aire';
   ```
2. Reload the research session page.
3. **Expected:** The page does NOT crash. Instead it renders:
   - An error message mentioning "report could not be parsed" or similar
   - A `<details>` block (collapsed by default) containing the raw JSON and `ZodError.issues`
   - No sensitive data (no API keys, no credentials) in the error output
4. Restore the valid report after testing:
   ```sql
   -- Re-seed with the valid report from Preconditions section above
   ```

### 6. Running/pending session still shows polling UI (not report viewer)

1. In Supabase, find a session with `status = 'running'` or `status = 'pending'` (submit a new research request if needed).
2. Navigate to that session.
3. **Expected:** The page renders the `ResearchSessionStatus` polling component (progress bar, phase descriptions) — NOT the `ResearchReportViewer`.
4. The `ResearchReportViewer` must NOT render for non-completed sessions.

### 7. /sites/new with no searchParams renders normally

1. Navigate to `/sites/new` (no query params).
2. **Expected:** The page renders the site creation form with:
   - Niche textarea is empty (no default value)
   - Market select shows the default (first option or empty)
3. Form is functional — no regression from the `defaultValues` prop addition.

### 8. /sites/new with partial searchParams

1. Navigate to `/sites/new?niche=camping+gear` (niche only, no market).
2. **Expected:**
   - Niche textarea shows "camping gear"
   - Market select shows default (no pre-selection) — `defaultValues?.market` is `undefined`, fallback is `''`
3. Navigate to `/sites/new?market=US` (market only, no niche).
4. **Expected:**
   - Niche textarea is empty
   - Market select shows United States (US) pre-selected

---

## Edge Cases

### Spaceship API failure mid-check

1. Configure an invalid Spaceship API key in Settings (or temporarily block network to Spaceship).
2. Load a completed session with domain suggestions.
3. **Expected:** All domain badges show "Unknown" — no page crash, no error thrown to the user.
4. The `Promise.allSettled()` pattern absorbs individual failures per domain.

### Research session with empty domain_suggestions array

1. Manually update the test session:
   ```sql
   UPDATE research_sessions SET report = jsonb_set(report, '{domain_suggestions}', '[]') WHERE niche_idea = 'freidoras de aire';
   ```
2. Reload the session page.
3. **Expected:** The "Domain Suggestions" section either shows an empty state message or simply has no entries listed. Page renders without error.

### Research session with no keywords

1. Manually update the test session:
   ```sql
   UPDATE research_sessions SET report = jsonb_set(report, '{keywords}', '[]') WHERE niche_idea = 'freidoras de aire';
   ```
2. Reload the session page.
3. **Expected:** The keywords table either shows an empty state or a "no keywords" message. Page renders without error.

### Niche idea with special characters in CTA URL

1. Seed a research session where `niche_idea = "café & pasteles"`.
2. Open the completed report.
3. **Expected:** The CTA href encodes correctly: `/sites/new?niche=caf%C3%A9%20%26%20pasteles&market=...`
4. Clicking the CTA opens `/sites/new` with niche textarea showing `café & pasteles` (decoded correctly by Next.js).

---

## Failure Signals

- **Page crashes on completed session** → `renderCompletedSession()` is throwing unexpectedly. Check Next.js server stderr. Most likely cause: `getResearchSessionStatus()` failed to fetch the session.
- **Report renders but shows "parse error" with valid data** → Schema mismatch between `ResearchReportSchema` and what NicheResearcher stored. Expand the `<details>` block to see `ZodError.issues`.
- **Domain badges all "Unknown" with valid credentials** → Check Next.js server stdout for `[SpaceshipClient]` log lines. The `checkAvailability()` call is likely returning an error that `Promise.allSettled()` is catching.
- **CTA navigates to `/sites/new` but niche/market not pre-filled** → Check that `page.tsx` is `async` and `searchParams` is being awaited (`grep -n "async\|searchParams" apps/admin/src/app/(dashboard)/sites/new/page.tsx`).
- **`pnpm -r typecheck` fails** → TypeScript error introduced in S03 files. Run `pnpm --filter @monster/admin typecheck` to isolate.
- **Polling UI shows for completed sessions** → The `status === 'completed'` branch is not being entered. Check that `activeSession?.status` is actually `'completed'` in the DB (`SELECT status FROM research_sessions WHERE id = '...'`).

---

## Requirements Proved By This UAT

- R003 (Autonomous niche research) — partial proof: The Research Lab UI correctly renders completed reports with all 10 schema fields, domain suggestions with availability badges, and the "Create site" CTA that pre-fills the site creation form. This proves the full user-facing Research Lab loop is functional. Final proof of real DataForSEO data in the report (live job with DFS credentials) is deferred to human UAT.

---

## Not Proven By This UAT

- Real DataForSEO keyword data in the report (seeded test uses static data, not live DFS API call). Human UAT with DataForSEO credentials configured in Settings is required to fully validate R003.
- Domain availability accuracy (Spaceship API results) — only testable with valid Spaceship credentials configured.
- End-to-end flow from niche submission → background job → completed report → rendered UI (requires live DataForSEO + Anthropic credentials + running monster-worker).
- Research session history list rendering (multiple sessions, sorting, clickable links) — not specifically tested in this slice, but implicitly covered by the existing Research Lab UI from S02.

---

## Notes for Tester

- The parse-failure test (Test Case 5) intentionally breaks the session's report data. Always restore the valid report after testing the fallback.
- The `<details>` block in parse-failure mode is safe to expand in production — it contains only the raw `report` JSON and schema error messages, never API keys or credentials.
- When testing domain availability badges, "Unknown" is the expected result if Spaceship credentials are not configured — this is correct behavior, not a bug.
- The CTA link opens `/sites/new` in the same tab. After clicking, use the browser back button to return to the research report.
- URL-encoded niche values: Next.js automatically decodes `%20` to spaces and `+` to `+` (not space) in `searchParams`. If the CTA uses `encodeURIComponent()`, `%20` is used for spaces (correct). Verify the textarea shows the decoded value.
