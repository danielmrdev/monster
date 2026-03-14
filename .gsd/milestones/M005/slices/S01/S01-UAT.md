# S01: Tracker Script + Astro Injection — UAT

**Milestone:** M005
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: Build-time checks (byte count, placeholder count, astro check, data-affiliate grep) are fully automated and already passed in slice verification. Runtime checks require a browser loading a generated site with real Supabase credentials — these are the live-runtime UAT cases below. The slice plan explicitly defers human UAT to slice demo.

## Preconditions

1. `pnpm --filter @monster/analytics build` has run and `packages/analytics/dist/tracker.min.js` exists (1343 bytes)
2. `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set in the admin panel `.env` (or `.env.local`)
3. A test site has been generated via `GenerateSiteJob` (so `site.json` includes `supabase_url` and `supabase_anon_key`)
4. The generated site's built HTML is available at `apps/generator/.generated-sites/<slug>/dist/`
5. Access to the Supabase dashboard table editor for the project (to inspect `analytics_events` rows)
6. A browser (Chrome recommended — DevTools Network tab for inspecting POST requests)

## Smoke Test

Open `packages/analytics/dist/tracker.min.js` and confirm it is minified (not human-readable) and starts with `(()=>{` or `(function`. Run:

```bash
stat -c%s packages/analytics/dist/tracker.min.js   # → 1343
grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js | wc -l  # → 3
```

Both must pass. If either fails, the tracker artifact is corrupt — rebuild before proceeding.

## Test Cases

### 1. Tracker artifact byte budget

**Purpose:** Confirm tracker meets the <2KB requirement.

1. Run: `stat -c%s packages/analytics/dist/tracker.min.js`
2. **Expected:** Output is `1343` (or any value ≤ 2048)

### 2. Placeholder preservation in minified artifact

**Purpose:** Confirm esbuild did not tree-shake the placeholder strings.

1. Run: `grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js | wc -l`
2. **Expected:** Output is `3`

If output is `0` or `1` or `2`: esbuild eliminated one or more placeholders. Fix: wrap the constant in a function reference or expose via `window` property to prevent dead-code elimination.

### 3. No service role key in tracker artifact

**Purpose:** Confirm no secrets leak into the committed artifact.

1. Run: `grep -i "service_role\|SERVICE_ROLE" packages/analytics/dist/tracker.min.js && echo FOUND || echo CLEAN`
2. **Expected:** Output is `CLEAN`

### 4. Tracker injected into built HTML

**Purpose:** Confirm the Astro build pipeline reads tracker.min.js and substitutes placeholders.

1. Generate a site: trigger `GenerateSiteJob` for a test slug via the admin panel (or directly via the BullMQ job queue) — ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
2. Locate the built HTML: `apps/generator/.generated-sites/<slug>/dist/index.html`
3. Run: `grep -c "supabase_url\|supabase.co" apps/generator/.generated-sites/<slug>/dist/index.html`
4. **Expected:** Count ≥ 1 (the real Supabase URL is present in the HTML, substituted from `__SUPABASE_URL__`)
5. Run: `grep "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" apps/generator/.generated-sites/<slug>/dist/index.html`
6. **Expected:** No output (placeholders fully substituted — none remain in built HTML)

### 5. No service role key in built HTML

**Purpose:** Confirm the anon key was used, not the service role key.

1. Run: `grep -i "service_role" apps/generator/.generated-sites/<slug>/dist/index.html && echo FOUND || echo CLEAN`
2. **Expected:** Output is `CLEAN`

### 6. data-affiliate attribute on product page affiliate links

**Purpose:** Confirm tracker will intercept affiliate clicks.

1. Run: `grep -r "data-affiliate" apps/generator/src/pages/products/`
2. **Expected:** 3 matches (one per template variant: classic, modern, minimal)
3. Open a generated product page: `apps/generator/.generated-sites/<slug>/dist/products/<product-slug>/index.html`
4. Search for `data-affiliate` in the built HTML.
5. **Expected:** Attribute present on the affiliate `<a>` tag with a non-empty ASIN value

### 7. Analytics builds pass

**Purpose:** Confirm all build steps exit cleanly.

1. Run: `pnpm --filter @monster/analytics build` → **Expected:** exit 0, `dist/tracker.min.js 1.3kb`
2. Run: `pnpm --filter @monster/agents build` → **Expected:** ESM Build success (no errors)
3. Run: `cd apps/generator && npx astro check` → **Expected:** `Result (10 files): 0 errors, 0 warnings, 0 hints`

### 8. (Live runtime) Pageview event reaches Supabase

**Purpose:** Confirm the tracker actually POSTs and Supabase accepts the row.

1. Deploy or serve the generated site locally over HTTPS (or use a site already deployed to VPS2).
2. Open the site in Chrome. Open DevTools → Network tab.
3. Filter by `analytics_events` (or the Supabase project URL).
4. Load the page.
5. **Expected — Network tab:** A POST request to `<supabase_url>/rest/v1/analytics_events` with status `201 Created` within 5 seconds of page load (or on tab close/background).
6. Open Supabase dashboard → Table Editor → `analytics_events`.
7. **Expected — Supabase table:** A new row with `event_type = 'pageview'`, `page_path` matching the page you visited, `site_id` matching the site's UUID, `language` matching your browser language, `country = null`, `visitor_hash` a 64-char hex string (SHA-256) or 16-char hex fallback.

### 9. (Live runtime) Affiliate click event reaches Supabase

**Purpose:** Confirm `click_affiliate` events are captured.

1. On the same generated site (test case 8 preconditions), navigate to a product page.
2. Open DevTools → Network tab, filter `analytics_events`.
3. Click an affiliate link (any `<a data-affiliate>` element — opens Amazon in new tab).
4. **Expected — Network tab:** A POST to `analytics_events` endpoint appears (may fire slightly after click due to 5s interval or on visibilitychange).
5. Open Supabase → `analytics_events`.
6. **Expected — Supabase table:** A new row with `event_type = 'click_affiliate'`, `page_path` matching the product page.

### 10. (Live runtime) No CORS errors

**Purpose:** Confirm Supabase CORS config accepts requests from the site origin.

1. While running test case 8 or 9, inspect the browser console.
2. **Expected:** No CORS errors (`Access-Control-Allow-Origin` issues would appear as red console errors).
3. **Expected:** No uncaught exceptions from the tracker script.

### 11. (Live runtime) Visitor hash fallback for non-HTTPS

**Purpose:** Confirm tracker does not throw in non-HTTPS contexts.

1. Serve the generated site over plain HTTP locally (e.g. `npx serve` without HTTPS).
2. Load the page.
3. Open DevTools → Console.
4. **Expected:** No uncaught exceptions. The tracker falls back to `Math.random()` for `visitor_hash`.
5. Open DevTools → Network. If tracker sends a POST (depends on browser), the `visitor_hash` in the request body will be a 16-char random hex string (not a 64-char SHA-256 hash).
6. **Expected:** No errors logged to console.

## Edge Cases

### Tracker artifact missing at Astro build time

1. Temporarily rename `packages/analytics/dist/tracker.min.js` to `tracker.min.js.bak`.
2. Run `pnpm --filter @monster/generator build` (or `astro build` for a fixture site).
3. **Expected:** Astro build completes (non-fatal) with a warning: `[BaseLayout] Could not load tracker.min.js`.
4. Inspect built HTML — no inline `<script>` tracker present.
5. Restore the artifact: `mv tracker.min.js.bak tracker.min.js`.

### Missing Supabase env vars in GenerateSiteJob

1. Unset `NEXT_PUBLIC_SUPABASE_URL` in the agents worker environment.
2. Trigger a `GenerateSiteJob`.
3. **Expected:** Worker log shows: `[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_URL is not set` — job does NOT throw, site.json is written with empty string for `supabase_url`.
4. The generated site's HTML will contain an empty placeholder for the Supabase URL — tracker will fail to POST (silently, expected behaviour for missing config).

### Multiple pageviews on same device / same day

1. Load the same generated site page 5 times in the same browser within one day.
2. Open Supabase → `analytics_events`.
3. **Expected:** 5 `pageview` rows with identical `visitor_hash` values (same date + userAgent = same SHA-256 hash). `analytics_daily`'s `unique_visitors` (once S03 runs) will count this as 1 unique visitor.

## Failure Signals

- **Placeholder count ≠ 3:** esbuild tree-shook a placeholder — tracker will POST to literal `__SUPABASE_URL__` string, failing silently
- **Built HTML contains `__SUPABASE_URL__`:** Placeholder substitution failed — check BaseLayout.astro `readFileSync` path and `.replace()` calls
- **Built HTML contains `service_role`:** Secret leakage — check GenerateSiteJob env var usage; ensure SUPABASE_SERVICE_ROLE_KEY is never written to site.json
- **Network tab shows 401 on analytics_events POST:** Anon key incorrect or RLS policy missing — check NEXT_PUBLIC_SUPABASE_ANON_KEY value and migration 003 RLS INSERT policy
- **Network tab shows 400 on analytics_events POST:** Request body format rejected by PostgREST — confirm Content-Type is `application/json` and body matches table schema
- **CORS error in console:** Supabase project CORS config does not allow the site origin — add the domain to allowed origins in Supabase dashboard → Settings → API → CORS
- **Console exception from tracker:** Likely a DOM API issue — check browser DevTools for the error message; `crypto.subtle` unavailability should be silently caught with fallback

## Requirements Proved By This UAT

- R009 (Analytics: lightweight GDPR-friendly tracking) — UAT test cases 8 and 9 prove live event delivery; test cases 1-3 prove the <2KB GDPR-safe (no cookies, no PII) tracker constraint

## Not Proven By This UAT

- **R009 country tracking** — country is null in Phase 1 (D081); country analytics deferred to R024 (Supabase Edge Function)
- **S02 Analytics Dashboard** — this UAT only confirms rows reach Supabase; the admin panel UI that displays them is S02's responsibility
- **S03 Daily Aggregation** — `analytics_daily` rows are S03's responsibility; this UAT only proves raw events arrive in `analytics_events`
- **High-volume POST batching** — the 5s flush interval and queue design are not load-tested; Phase 1 volumes (single-digit daily visitors per site) are well within safe range

## Notes for Tester

- Test cases 1–7 are artifact-driven and already verified as part of slice completion — they are included here for regression purposes and can be re-run quickly with the shell commands provided.
- Test cases 8–11 require a live generated site with real Supabase credentials. If no site is deployed yet, serve locally over HTTPS using a tool like `mkcert` + `npx serve --ssl-cert ... --ssl-key ...`.
- The tracker uses `fetch+keepalive` (D084) — flushing happens on `visibilitychange hidden` (tab close/background) or the 5s interval. If you load a page and immediately check Supabase without waiting, the row may not be there yet. Wait 5s or switch to another tab to trigger visibilitychange.
- `visitor_hash` in Supabase will appear as a 64-char hex string (SHA-256) on HTTPS sites. On HTTP local testing, it will be a 16-char random hex string (Math.random fallback) — both are valid and expected.
- The anon key appearing in the generated HTML is intentional and correct — RLS policy allows INSERT-only for the anon role. The service role key must never appear (test case 5 confirms this).
