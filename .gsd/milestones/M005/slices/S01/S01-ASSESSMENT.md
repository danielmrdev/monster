---
id: S01-ASSESSMENT
slice: S01
milestone: M005
assessed_at: 2026-03-13
verdict: no_changes
---

# Roadmap Assessment after M005/S01

## Verdict: Roadmap is fine — no changes needed

## Success Criterion Coverage

- Visit live site 5× → 5 `pageview` rows in `analytics_events` within 10s → S02 (UAT gate: dashboard showing real data proves rows arrived)
- Click affiliate link → `click_affiliate` row in `analytics_events` → S02 (same UAT gate)
- Admin panel Analytics page shows correct counts, filterable by site and date range → **S02** ✓
- `analytics_daily` has aggregated row after cron runs → **S03** ✓
- Tracker <2KB, loads on every generated page, no console errors → ✅ proved in S01 (1343 bytes, astro check 0 errors)

All criteria have at least one remaining owning slice. Coverage check passes.

## Risk Retirement

- **esbuild pipeline + Astro injection** → retired. Built artifact at 1343 bytes, placeholders preserved, BaseLayout injection verified with `astro check`.
- **sendBeacon POST body** → retired differently: switched to `fetch+keepalive` (D084). sendBeacon cannot set PostgREST auth headers. The risk is no longer relevant.
- **crypto.subtle HTTPS requirement** → retired. `Math.random` 16-char hex fallback coded and in place for non-secure contexts.
- **Supabase CORS** → not yet confirmed. Still requires live UAT (browser DevTools Network tab, no CORS error on POST to Supabase). Correctly deferred — S02 UAT will surface any CORS issue when the dashboard is populated.

## Boundary Map Accuracy

S02 consumes:
- `analytics_events` rows — produced by tracker injection (runtime; pending UAT confirms rows arrive)
- `analytics_daily` — produced by S03; S02 reads it
- Service role client pattern — established in M002/M003

One known deviation from the boundary map: `analytics_events.country` is **always `null`** (D081). S02 must handle null in country breakdowns (filter null, show "Unknown", or omit). S01 forward intelligence already flags this explicitly. No structural change to S02 needed — it's a rendering decision.

S03 consumes:
- `analytics_events` with `site_id`, `created_at`, `event_type`, `visitor_hash`, `page_path`, `country` — all present. `country` is always null; aggregation job's `top_countries` logic must treat null as a valid value (group/skip as "Unknown"). No structural change needed.

## Slice Ordering

S02 and S03 have no ordering dependency on each other (both depend only on S01). Current order (S02 before S03) is fine — dashboard work is higher value and medium risk. S03 is low risk and straightforward.

## Requirement Coverage

- R009 (Analytics: lightweight GDPR-friendly tracking): advances from `active` to partially validated. Build-time proof complete. Live runtime proof (rows in `analytics_events`) remains for UAT. No change to REQUIREMENTS.md needed — S01 validation notes already updated in that file.

## What S02 Should Know Going In

- `country` is always `null` — handle gracefully in all country UI (do not error on null, show "Unknown" or omit)
- `visitor_hash` is SHA-256 hex (~64 chars) in HTTPS contexts, 16-char Math.random hex in non-HTTPS — unique_visitor counts are approximate; note this in the UI if surfaced
- `event_type` values: `"pageview"` and `"click_affiliate"` only
- Legal pages fire `pageview` too — `/aviso-legal`, `/privacidad` etc. appear in `page_path`; filtering or segmenting these may be desirable in the top-pages view
