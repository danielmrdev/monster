# M005: Analytics — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M004 is complete

## Why This Milestone

Live sites (M004) need traffic measurement. M005 delivers the full analytics loop: tracking script embedded in generated sites, events flowing to Supabase, daily aggregation cron, and analytics dashboard in the admin panel. After M005, the user can see which pages and sites are getting traffic and where affiliate clicks are happening.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Open a live site and see events flowing in Supabase (pageviews, affiliate clicks)
- View analytics dashboard in admin panel: visits, pageviews, affiliate clicks by site
- Filter by date range (today, 7d, 30d)
- See country distribution (from CF-IPCountry) and language breakdown
- See top pages per site

### Entry point / environment
- Entry point: generated sites (client-side script) + admin panel analytics page
- Environment: public sites → Supabase Cloud (direct POST with anon key + RLS)
- Live dependencies: Supabase Cloud, Cloudflare (CF-IPCountry header)

## Completion Class

- Contract complete means: tracking script bundles correctly, Supabase table schema matches event shape
- Integration complete means: real events from a live site appear in Supabase within 10s
- Operational complete means: daily aggregation cron runs, `analytics_daily` table populates

## Final Integrated Acceptance

- Visit a live site 5 times → 5 pageview events in `analytics_events` table
- Click an affiliate link → `click_affiliate` event recorded
- Next day: `analytics_daily` table has aggregated row for the site
- Admin panel Analytics page shows correct counts matching Supabase data

## Risks and Unknowns

- **Supabase RLS for anon INSERT** — tracking script uses anon key. RLS policy must allow INSERT but not SELECT on `analytics_events`. Need to validate the policy is watertight (no data leakage).
- **Script size budget** — must stay under 2KB minified. No external dependencies.
- **sendBeacon reliability** — batch + sendBeacon on page unload is the pattern. Test across mobile browsers.
- **CF-IPCountry availability** — only present when Cloudflare is proxying. Sites not yet proxied (dns_pending state) won't have this header. Graceful fallback to `null` country.

## Existing Codebase / Prior Art

- M001 DB schema: `analytics_events`, `analytics_daily` tables
- M004: Cloudflare proxy active on live sites (CF-IPCountry available)
- `packages/analytics`: package scaffold from M001
- `docs/PRD.md`: Analytics system section, tracking script spec, GDPR requirements

## Relevant Requirements

- R009 — Analytics: lightweight GDPR-friendly tracking

## Scope

### In Scope
- `packages/analytics/src/tracker.ts`: vanilla JS tracking script (~2KB, no deps)
- Build pipeline: esbuild/rollup bundles tracker to `packages/analytics/dist/tracker.min.js`
- Supabase RLS policies: INSERT-only for anon key on `analytics_events`
- Astro template integration: inject tracker script in `<head>` via site config
- BullMQ cron job: daily aggregation of `analytics_events` → `analytics_daily`
- Admin panel Analytics page: global + per-site views, date range filter, top pages

### Out of Scope
- Advanced analytics (funnels, cohorts, heatmaps)
- Real-time analytics dashboard
- Country-level geolocation beyond CF-IPCountry

## Technical Constraints

- Tracker script: vanilla JS only, no frameworks, no cookies, <2KB minified
- visitor_hash = hash(date + IP + user-agent) — computed server-side in Supabase Edge Function or approximated client-side with available signals
- Batch events every 5s or sendBeacon on unload
- Supabase anon key safe to expose in public sites (RLS enforces INSERT-only)
- GDPR: no personal data stored, no cross-day tracking, 90-day raw event retention

## Integration Points

- Supabase Cloud: anon key INSERT to `analytics_events`, service role for aggregation cron
- Generated sites (Astro): tracker injected as inline script or external file reference
- BullMQ: daily aggregation job scheduled via Vercel Cron or BullMQ scheduler
