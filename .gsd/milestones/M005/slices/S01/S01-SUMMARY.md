---
id: S01
parent: M005
milestone: M005
provides:
  - packages/analytics/dist/tracker.min.js — committed minified IIFE tracker, 1343 bytes, 3 placeholders preserved
  - packages/analytics/src/tracker.ts — browser tracker source with SubtleCrypto visitor hashing and fetch+keepalive POST
  - packages/analytics/package.json — esbuild + typescript devDeps, build/typecheck scripts
  - apps/generator/src/lib/data.ts — SiteInfo extended with id, supabase_url, supabase_anon_key
  - apps/generator/src/layouts/BaseLayout.astro — inline tracker injection via readFileSync + placeholder substitution
  - apps/generator/src/layouts/classic/Layout.astro — analytics props threaded to BaseLayout
  - apps/generator/src/layouts/modern/Layout.astro — analytics props threaded to BaseLayout
  - apps/generator/src/layouts/minimal/Layout.astro — analytics props threaded to BaseLayout
  - apps/generator/src/pages/products/[slug].astro — data-affiliate attribute on all three template affiliate links
  - packages/agents/src/jobs/generate-site.ts — id, supabase_url, supabase_anon_key written to site.json
requires:
  - slice: none
    provides: analytics_events table + RLS INSERT-only policy (M001 migration 003)
affects:
  - S02
  - S03
key_files:
  - packages/analytics/src/tracker.ts
  - packages/analytics/dist/tracker.min.js
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/lib/data.ts
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/src/pages/products/[slug].astro
key_decisions:
  - D084: fetch+keepalive as primary transport — sendBeacon cannot set custom headers required by PostgREST (apikey, Authorization)
  - D085: literal placeholder strings in source, string-replaced at Astro build time — no runtime config mechanism needed
  - D080: visitor_hash via SHA-256(date + userAgent), Math.random hex fallback for non-secure contexts
  - D081: country always null in Phase 1 — CF-IPCountry not available in browser→Supabase direct POST path
patterns_established:
  - Analytics props flow: site.json → SiteInfo (data.ts) → template Layout (classic/modern/minimal) → BaseLayout (readFileSync + replace) → inline <script is:inline set:html>
  - Analytics package .gitignore negates root dist/ rule to commit tracker artifact
  - BaseLayout receives explicit scalar analytics props (siteId, supabaseUrl, supabaseAnonKey) not full SiteInfo — keeps BaseLayout decoupled from generator data model
  - data-affiliate={product.asin} on affiliate links enables click_affiliate tracking without extra JS lookup
  - Missing tracker artifact or env vars: warn-only, non-fatal — site still builds, tracker omitted
observability_surfaces:
  - Build-time: "[BaseLayout] Could not load tracker.min.js" if artifact missing
  - Job-time: "[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_URL is not set" when env var absent
  - Diagnostic: grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js | wc -l → must be 3
  - Diagnostic: stat -c%s packages/analytics/dist/tracker.min.js → must be ≤2048
  - Diagnostic (post-build): grep "__SUPABASE_URL__" dist/index.html → must be empty (placeholders substituted)
  - Diagnostic: grep "service_role" dist/index.html → must be empty (no secret leakage)
  - Runtime: browser DevTools Network tab → filter analytics_events → POST with 200/201 on pageview/affiliate click
drill_down_paths:
  - .gsd/milestones/M005/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M005/slices/S01/tasks/T02-SUMMARY.md
duration: ~55min (T01: ~30min, T02: ~25min)
verification_result: passed
completed_at: 2026-03-13
---

# S01: Tracker Script + Astro Injection

**Built and injected a 1343-byte IIFE analytics tracker into every generated Astro page: esbuild pipeline produces <2KB committed artifact with SubtleCrypto visitor hashing and fetch+keepalive POST transport; placeholder substitution bakes site credentials into static HTML at Astro build time.**

## What Happened

**T01 — Tracker script:** Added esbuild + typescript to `packages/analytics`. Wrote `src/tracker.ts` targeting browser globals (no imports): visitor hash via `crypto.subtle.digest('SHA-256', date+userAgent)` with `Math.random` 16-char hex fallback for non-HTTPS contexts; event queue flushed via `fetch(url, { keepalive: true, headers: { apikey, Authorization, 'Content-Type': 'application/json' } })` on `visibilitychange`/`pagehide` and a 5s interval; `pageview` enqueued on init; click listener on `[data-affiliate]` links. The internal `Event` interface was renamed to `AnalyticsEvent` to avoid collision with the DOM built-in. tsconfig uses ES2018 target (required for `Promise.finally()`) while esbuild still targets es2017 output. Added `.gitignore` that negates the root `dist/` exclusion to allow the committed artifact. Built output: 1343 bytes, all 3 placeholders (`__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`, `__SITE_ID__`) preserved by esbuild.

The key architectural decision (D084): switched from `navigator.sendBeacon` to `fetch+keepalive`. PostgREST requires `apikey` and `Authorization` headers for INSERT — sendBeacon cannot set custom headers. fetch+keepalive provides identical fire-and-forget-on-unload semantics.

**T02 — Astro injection:** Extended `SiteInfo` in `data.ts` with `id`, `supabase_url`, `supabase_anon_key`. Updated `GenerateSiteJob` to populate these from `siteId` (job param) and `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars (warn-only fallback to empty string when absent). `BaseLayout.astro` reads `tracker.min.js` via `readFileSync` at Astro build time, substitutes placeholders via chained `.replace()`, and injects as `<script is:inline set:html={trackerScript} />`. The three template layouts (classic, modern, minimal) already receive `site: SiteInfo` and thread the new scalar props to BaseLayout — no page-level callers needed changes. All three affiliate `<a>` tags in `products/[slug].astro` received `data-affiliate={product.asin}`.

## Verification

```
pnpm --filter @monster/analytics build       → exit 0, dist/tracker.min.js 1.3kb ✓
stat -c%s packages/analytics/dist/tracker.min.js → 1343 bytes (≤2048 ✓)
grep -o "__SUPABASE_URL__\|...\|__SITE_ID__" dist/tracker.min.js | wc -l → 3 ✓
grep -i "service_role" dist/tracker.min.js   → CLEAN (no secret leakage ✓)
pnpm --filter @monster/agents build          → ESM Build success (index.js 476KB, worker.js 2.72MB) ✓
cd apps/generator && npx astro check         → Result (10 files): 0 errors, 0 warnings, 0 hints ✓
grep -r "data-affiliate" apps/generator/src/pages/products/ → 3 matches (one per template) ✓
```

## Requirements Advanced

- R009 (Analytics: lightweight GDPR-friendly tracking) — tracker built and injected; build-time proof complete; live runtime proof deferred to UAT

## Requirements Validated

- none — R009 advances to validated only after live runtime proof (human UAT: visit live site, confirm rows in analytics_events)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **fetch+keepalive instead of sendBeacon** — plan specified sendBeacon as primary transport. Switched because PostgREST requires custom request headers (`apikey`, `Authorization`) that sendBeacon cannot set. fetch+keepalive provides identical unload-safe semantics. Decision logged as D084.
- **tsconfig target ES2018 not ES2017** — plan specified ES2017 for tsc. ES2018 was required for `Promise.finally()` DOM types. esbuild output still targets es2017 (transpiles down). No impact on built artifact compatibility.
- **Explicit scalar props in BaseLayout instead of full SiteInfo** — plan suggested passing `site: SiteInfo`; chose `siteId`, `supabaseUrl`, `supabaseAnonKey` as explicit scalars to keep BaseLayout decoupled from generator data model. Logged as key decision.
- **Page-level callers needed no changes** — plan listed `index.astro`, `categories/[slug].astro`, `[legal].astro` as needing updates. Template layouts already receive `site: SiteInfo` and forward the new scalars, so no page-level edits were needed.
- **`grep -c` placeholder check** — plan verification says `grep -c` outputs `3`; all minified code is on one line so `grep -c` outputs `1`. Corrected to `grep -o | wc -l` which correctly counts 3 occurrences.

## Known Limitations

- **Live runtime not verified** — the tracker sends real requests only when a generated site is loaded in a browser with real Supabase credentials substituted. Build-time verification confirms the injection pipeline; runtime correctness (CORS, RLS, POST body acceptance) is confirmed in UAT.
- **country always null** — Phase 1 design decision (D081). CF-IPCountry is not available in browser→Supabase direct POST path. R024 deferred.
- **visitor_hash is a lower bound** — SHA-256(date+userAgent) without IP means unique_visitor counts are device-approximate, not exact. Documented in D080.
- **sendBeacon removed entirely** — if fetch+keepalive is unavailable in some edge browser, events are lost silently. No sendBeacon fallback. Acceptable for Phase 1 target browsers (modern evergreen).

## Follow-ups

- UAT: visit a live (or local HTTPS) generated site, open Supabase table editor, confirm `pageview` rows appear in `analytics_events` within 10s
- UAT: click an affiliate link, confirm `click_affiliate` row appears
- UAT: confirm no CORS errors in browser DevTools when POSTing to Supabase from the site domain
- S02: Analytics Dashboard — reads from `analytics_events` populated by this slice
- S03: Daily Aggregation Cron — aggregates rows produced by this slice

## Files Created/Modified

- `packages/analytics/src/tracker.ts` — browser tracker source (new)
- `packages/analytics/dist/tracker.min.js` — committed minified IIFE artifact (new, 1343 bytes)
- `packages/analytics/package.json` — esbuild + typescript devDeps, build + typecheck scripts
- `packages/analytics/tsconfig.json` — ES2018 target, DOM lib, ESNext module
- `packages/analytics/.gitignore` — negates root dist/ rule to allow committed tracker artifact
- `apps/generator/src/lib/data.ts` — SiteInfo extended with id, supabase_url, supabase_anon_key
- `apps/generator/src/layouts/BaseLayout.astro` — tracker readFileSync + placeholder substitution + inline <script is:inline set:html>
- `apps/generator/src/layouts/classic/Layout.astro` — forwards siteId, supabaseUrl, supabaseAnonKey to BaseLayout
- `apps/generator/src/layouts/modern/Layout.astro` — same
- `apps/generator/src/layouts/minimal/Layout.astro` — same
- `apps/generator/src/pages/products/[slug].astro` — data-affiliate={product.asin} on all 3 template affiliate links
- `packages/agents/src/jobs/generate-site.ts` — id, supabase_url, supabase_anon_key added to siteData.site assembly

## Forward Intelligence

### What the next slice should know
- `analytics_events` rows will arrive with `country: null` always — the Analytics Dashboard (S02) must handle null gracefully in country breakdowns (filter null, show "Unknown", or omit)
- The `visitor_hash` column contains SHA-256 hex strings (~64 chars) or 16-char `Math.random` hex fallback — both are strings, but the fallback breaks deduplication (different every page load); expect inflated unique visitor counts on non-HTTPS local testing
- `event_type` values in the wild: `"pageview"` and `"click_affiliate"` only (Phase 1); the aggregation job in S03 must handle both
- The tracker fires on every Astro page load — including legal pages — so `analytics_events` will contain `page_path` values like `/aviso-legal`, `/privacidad` etc. Dashboard may want to filter or segment these

### What's fragile
- **Placeholder substitution in BaseLayout** — uses three chained `.replace()` calls on the raw minified JS string. If esbuild ever constant-folds a placeholder (e.g. treats `"__SUPABASE_URL__"` as dead code), the placeholder will be missing and the tracker will POST to a literal placeholder URL, silently failing. The diagnostic command `grep -o "__SUPABASE_URL__\|..." dist/tracker.min.js | wc -l` should be run after any tracker rebuild to confirm count remains 3.
- **readFileSync path** — BaseLayout resolves `../../packages/analytics/dist/tracker.min.js` relative to the Astro source root. If the monorepo layout changes or the generator is moved, this breaks at Astro build time (non-fatal warn, tracker omitted from pages).
- **fetch keepalive budget** — browsers limit keepalive request body to 64KB. At 50 events (generous queue) × ~200 bytes/event = ~10KB, well within budget. Not a concern for Phase 1 volumes.

### Authoritative diagnostics
- **Placeholder count:** `grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js | wc -l` → must be 3. Zero means esbuild tree-shook a variable.
- **Post-build injection check:** `grep "supabase_url\|__SUPABASE_URL__" apps/generator/.generated-sites/<slug>/dist/index.html` — `supabase_url` (the real URL) should appear; `__SUPABASE_URL__` (the placeholder) should NOT appear.
- **Secret leakage:** `grep "service_role" apps/generator/.generated-sites/<slug>/dist/index.html` → must be empty.
- **Runtime:** browser DevTools Network tab, filter by `analytics_events` endpoint — POST requests with 200/201 status confirm tracker working; 400/401/403 reveals auth/CORS/RLS issue.

### What assumptions changed
- **sendBeacon was the plan** — the plan assumed sendBeacon would work. PostgREST's auth header requirement made it impossible without a proxy. fetch+keepalive is strictly better for this use case.
- **Page-level callers were assumed to need edits** — they didn't, because template layouts already thread SiteInfo through. The wiring was already there.
