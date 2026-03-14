# M005: Analytics

**Vision:** Every live site captures pageview and affiliate-click events in real time. The admin panel shows traffic by site, top pages, date ranges, and country. A nightly cron aggregates raw events into daily summaries. The portfolio is no longer blind.

## Success Criteria

- Visit a live site 5 times → 5 `pageview` rows appear in `analytics_events` within 10 seconds of each visit
- Click an affiliate link → `click_affiliate` row appears in `analytics_events`
- Admin panel Analytics page shows correct visit and click counts matching Supabase data, filterable by site and date range
- `analytics_daily` has an aggregated row for each site+date after the cron runs
- Tracker script is <2KB minified and loads on every generated page with no console errors

## Key Risks / Unknowns

- **esbuild pipeline + Astro injection** — tracker must be built, then injected at Astro template level with site_id/credentials baked in at build time; the build artifact consumption path (commit dist vs workspace ordering) is the one structural question that must be resolved in practice, not just in theory
- **sendBeacon POST body** — `navigator.sendBeacon` with a raw JSON string fails on some browsers; Blob wrapping with `application/json` content-type is required for PostgREST to accept the request; must be verified against a real Supabase endpoint
- **crypto.subtle HTTPS requirement** — visitor_hash uses SubtleCrypto SHA-256, which is only available in secure contexts; sites not yet behind Cloudflare (dns_pending) will fail hash computation silently unless a fallback is coded
- **Supabase CORS** — tracker POSTs from browser origins to Supabase Cloud; if the project has restrictive CORS config the INSERT will fail silently via sendBeacon

## Proof Strategy

- esbuild pipeline → retire in S01 by building `tracker.min.js`, verifying byte count ≤2048, and running a generated Astro site that includes it as an inline script in built HTML
- sendBeacon POST body → retire in S01 UAT by visiting a live site and confirming rows appear in `analytics_events` Supabase table (Blob approach confirmed working)
- crypto.subtle fallback → retire in S01 by coding and testing the fallback path for non-HTTPS contexts
- Supabase CORS → retire in S01 UAT by confirming INSERT reaches Supabase from a live domain (no CORS error in browser DevTools)

## Verification Classes

- Contract verification: `pnpm --filter @monster/analytics build` exits 0, tracker.min.js ≤2048 bytes; `pnpm --filter @monster/agents build` exits 0 (aggregation job included); `pnpm --filter @monster/admin build` exits 0 (analytics page); `astro check` exits 0
- Integration verification: visit a live (or localhost HTTPS) site → row appears in `analytics_events`; run aggregation job manually → row appears in `analytics_daily`
- Operational verification: BullMQ repeat job registered on worker startup with stable jobId (no duplicate registration on restart)
- UAT / human verification: visit live site 5× in browser, open Supabase table editor, confirm 5 pageview rows; click affiliate link, confirm click_affiliate row; trigger aggregation job, confirm analytics_daily row; open admin panel /analytics, confirm counts match Supabase

## Milestone Definition of Done

This milestone is complete only when all are true:

- All three slices marked `[x]` in this roadmap
- `tracker.min.js` built, ≤2KB, injected into every generated Astro page (verified in built HTML)
- Events POST to Supabase from a browser on a live site (verified by human UAT)
- Admin panel /analytics page renders real data from Supabase (not "Coming soon")
- `analytics_daily` table has at least one aggregated row from the cron job
- `pnpm -r build` exits 0
- No raw service role key anywhere in the tracker or generated HTML

## Requirement Coverage

- Covers: R009 (Analytics: lightweight GDPR-friendly tracking) — primary owner S01/S02/S03
- Partially covers: none
- Leaves for later: R024 (Analytics country via Supabase Edge Function, deferred by architecture decision)
- Orphan risks: none

## Slices

- [x] **S01: Tracker Script + Astro Injection** `risk:high` `depends:[]`
  > After this: every generated Astro site contains a <2KB inline tracker script that POSTs pageview and affiliate-click events to Supabase using sendBeacon on unload and batched fetch every 5s; confirmed by visiting a generated site and seeing rows appear in analytics_events in Supabase dashboard
- [x] **S02: Analytics Dashboard** `risk:medium` `depends:[S01]`
  > After this: the admin panel /analytics page shows real data — visits, pageviews, affiliate clicks per site, filterable by date range (today/7d/30d), with top pages per site and country breakdown; data sourced from analytics_events and analytics_daily via service role client
- [ ] **S03: Daily Aggregation Cron** `risk:low` `depends:[S01]`
  > After this: a BullMQ repeat job (cron `0 2 * * *`) aggregates yesterday's analytics_events into analytics_daily rows on every worker startup; manually triggerable and verified by inspecting analytics_daily table for correct counts

<!--
  Format rules (parsers depend on this exact structure):
  - Checkbox line: - [ ] **S01: Title** `risk:high|medium|low` `depends:[S01,S02]`
  - Demo line:     >  After this: one sentence showing what's demoable
-->

## Boundary Map

### S01 → S02

Produces:
- `analytics_events` rows with schema: `site_id uuid, event_type text, page_path text, referrer text, visitor_hash text, country text|null, language text, created_at timestamptz`
- Tracker script (`packages/analytics/dist/tracker.min.js`) as built artifact
- `SiteInfo` interface extended with `id`, `supabase_url`, `supabase_anon_key` fields
- `packages/analytics/package.json` with working `build` script producing <2KB output
- `BaseLayout.astro` with inline tracker script using `{site.id}`, `{site.supabase_url}`, `{site.supabase_anon_key}` template expressions

Consumes:
- nothing (first slice) — `analytics_events` table and RLS policies already exist from M001 migration

### S01 → S03

Produces:
- `analytics_events` rows (same as S01 → S02 above) — S03 aggregation job consumes these

Consumes:
- nothing (first slice)

### S02 ← S01

Consumes (from S01):
- `analytics_events` table populated with real rows
- `analytics_daily` table (schema from M001 migration; S03 populates it; S02 reads it)
- Service role client pattern (already established in M002/M003)

### S03 ← S01

Consumes (from S01):
- `analytics_events` table with `site_id`, `created_at`, `event_type`, `visitor_hash`, `page_path`, `country` columns

Produces (for S02):
- `analytics_daily` rows with: `site_id uuid, date date, pageviews int, unique_visitors int, affiliate_clicks int, top_pages jsonb, top_countries jsonb, top_referrers jsonb`
- BullMQ queue `analytics-aggregation` registered in `packages/agents/src/queue.ts`
- `AnalyticsAggregationJob` registered in `packages/agents/src/worker.ts`
