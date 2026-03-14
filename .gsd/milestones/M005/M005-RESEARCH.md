# M005: Analytics — Research

**Date:** 2026-03-13
**Researched by:** auto-mode

## Summary

M005 is structurally well-prepared: the DB schema (`analytics_events`, `analytics_daily`), RLS policies, indexes, and `packages/analytics` scaffold all exist from M001. The hard work is in three pieces: (1) the tracker script itself — a vanilla JS file that must be built to <2KB and injected into every Astro page, (2) the data flow wiring — `site_id`, Supabase URL, and anon key must be baked into each site's static HTML at build time, and (3) the daily aggregation cron — a new BullMQ job triggered by a pm2-scheduled process or BullMQ's built-in repeat scheduler (Vercel Cron is not viable since admin runs on VPS1 via pm2, not Vercel).

The key architectural surprise is the CF-IPCountry header. The context document implies it flows naturally from Cloudflare to the tracker, but this is incorrect: CF-IPCountry is only injected into browser→VPS2 requests (the site pages), not into browser→Supabase requests (the tracker POST). The tracker runs in the user's browser and POSTs directly to Supabase Cloud — Cloudflare is not in that path. Country detection therefore falls back to `null` for Phase 1, which the M005 context explicitly acknowledges. Language detection via `navigator.language` works fine and requires no workaround.

The visitor_hash faces a similar constraint: the PRD specifies `hash(date + IP + user-agent)` computed server-side, but PostgREST exposes no request metadata to the application. The pragmatic Phase 1 solution is `hash(date + user-agent)` computed client-side using the Web Crypto API (SubtleCrypto SHA-256, available in all modern browsers), without the IP component. This provides reasonable daily deduplication within a device while staying GDPR-safe (no PII stored). A Supabase Edge Function for proper server-side hashing can be added later if accuracy matters.

## Recommendation

Build M005 in three slices, ordered by risk: S01 = tracker + injection (the novel piece, needs build pipeline), S02 = analytics dashboard (server-component query, low risk given existing finance/SEO patterns), S03 = daily aggregation cron (BullMQ repeat job). Prove the data flows end-to-end (browser → Supabase → readable in dashboard) before building the aggregation layer.

The `packages/analytics` package should own the tracker source (`src/tracker.ts`) and its esbuild pipeline. The built `tracker.min.js` can be committed to `packages/analytics/dist/` or built as part of the generator's Astro build. Injecting via `BaseLayout.astro` as an inline `<script>` is the cleanest approach — it eliminates an extra HTTP request and keeps the tracker byte-count directly visible.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Minifying tracker to <2KB | esbuild (already in workspace via tsup) | esbuild is already installed (`packages/agents/node_modules/.bin/esbuild`). Produces consistently tiny output. No new dependency needed. |
| Client-side SHA-256 for visitor_hash | `crypto.subtle.digest('SHA-256', data)` (Web Crypto API) | Built into all modern browsers. Zero bundle cost. Returns ArrayBuffer; convert to hex with TextEncoder. |
| sendBeacon reliability on page unload | `navigator.sendBeacon(url, blob)` with `Content-Type: application/json` | The standard GDPR-friendly, unload-safe event flush pattern. Blob must be `application/json` for PostgREST to accept it with the anon key. |
| Supabase INSERT via REST from browser | `fetch(supabaseUrl + '/rest/v1/analytics_events', { method: 'POST', headers: { apikey, Authorization, Content-Type, Prefer } })` | No client library in the tracker — raw fetch is <0.1KB vs 40KB for supabase-js. Use `Prefer: return=minimal` to avoid response payload. |
| Analytics dashboard server queries | `createServiceClient()` (already in `apps/admin/src/lib/supabase/service.ts`) | Service role bypasses RLS, so reads from `analytics_daily` and `analytics_events` work without additional policies. Pattern established in dashboard, finances, and site detail pages. |
| Daily aggregation SQL | A single Supabase `INSERT ... ON CONFLICT ... DO UPDATE` using `GROUP BY` over `analytics_events` | SQL aggregation at the DB level is more efficient than fetching rows to the worker. Can be expressed as a parameterized query or a Supabase function. |
| BullMQ cron scheduling | BullMQ `repeat: { pattern: '0 2 * * *' }` (built-in) | BullMQ v5 supports cron-syntax repeat jobs natively. No QueueScheduler needed (removed in BullMQ v4+). The worker registers the repeat job once on startup. |

## Existing Code and Patterns

- `packages/db/supabase/migrations/20260313000003_analytics.sql` — Complete schema for `analytics_events` and `analytics_daily`, RLS INSERT-only policy for anon on events, indexes on site_id + created_at. No SELECT policy for anon on either table (correct). Service role bypasses RLS for dashboard reads.
- `packages/analytics/` — Scaffold only: `package.json` + `tsconfig.json`, no `src/` directory. `tsconfig.json` uses `NodeNext` module resolution (appropriate for the build step, but the tracker itself must be vanilla JS targeting ES2019+).
- `packages/analytics/package.json` — Empty `exports: {}` and `scripts: {}`. Needs `build` script (esbuild), dist output path, and exports map for the built artifact.
- `apps/generator/src/layouts/BaseLayout.astro` — The single injection point for the tracker. Already renders `<head>` with meta, title, description, and Tailwind import. All three template layouts delegate to `BaseLayout`. Adding `<script>` here reaches every generated page.
- `apps/generator/src/lib/data.ts` — `SiteInfo` interface lacks `id` (the site UUID needed by the tracker). The `SiteData.site` object needs `id`, `supabase_url`, and `supabase_anon_key` added. Both are available in the worker environment (`process.env.NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- `packages/agents/src/jobs/generate-site.ts` — The `siteData` assembly block (line ~463) builds the `SiteInfo` object written to `site.json`. Add `id: siteId`, `supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL`, and `supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` here.
- `packages/agents/src/worker.ts` — Pattern for registering BullMQ workers. The analytics aggregation cron job should follow the same pattern: `new AnalyticsAggregationJob(); worker.register()`. Add to `worker.ts` graceful shutdown handlers.
- `packages/agents/src/queue.ts` — Pattern for creating named queues (`createGenerateQueue`, `createDeployQueue`). Add `createAnalyticsAggregationQueue()`.
- `packages/agents/tsup.config.ts` — Already externalizes `astro`, `node-ssh`, `cloudflare`. The aggregation job has no new exotic dependencies — should bundle cleanly.
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — Stub: "Coming soon." Replace with server component queries against `analytics_daily` (global + per-site views, date range).
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — Pattern: `Promise.all` of `supabase.from('...').select('*', { count: 'exact', head: true })`. Analytics KPIs (total pageviews, affiliate clicks) could be added here in a follow-up.
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — Pattern for table + server-side data: parallel fetch, error throw, typed rows, Table/TableRow/TableCell components.
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — Pattern for polling client component using `useActionState` + `setInterval`. Could be adapted if real-time event count display is needed in the dashboard.

## Constraints

- **Tracker must be vanilla JS, <2KB minified, no external dependencies.** esbuild with `minify: true` and `bundle: true` targeting `browser` + `es2019` is the build config. No imports — everything inline.
- **Tracker runs in `packages/analytics/` but the built artifact is consumed by `apps/generator/`.** Either: (a) commit `dist/tracker.min.js` and reference it from `BaseLayout.astro` as an inline script, or (b) run the esbuild build as part of the pnpm workspace build and import the result. Option (a) is simpler for Phase 1.
- **`site_id`, `supabase_url`, `supabase_anon_key` must be injected at Astro build time**, not at runtime. Astro SSG bakes values into HTML — use Astro template expressions (`{site.id}`, `{site.supabase_url}`) in `BaseLayout.astro`. These become literal values in the built HTML.
- **The anon key is safe to expose in public HTML** — that's the entire design. RLS enforces INSERT-only. Anyone with the anon key can write events but not read them. This is documented in M005-CONTEXT and is correct by design.
- **`analytics_daily` has RLS enabled but no policies defined for any role.** Service role bypasses this automatically (Supabase behavior). The aggregation job uses `createServiceClient()` which has the service role key — it can INSERT/UPDATE `analytics_daily` without a policy. Do not add an anon SELECT policy to `analytics_daily`.
- **BullMQ repeat jobs require the scheduler to be running.** In BullMQ v5, the worker itself acts as the scheduler when `connection` is provided — no separate `QueueScheduler` process needed. The existing worker process (`node packages/agents/dist/worker.js`) just needs the new repeat job registered.
- **esbuild is available in the workspace** (`packages/agents/node_modules/.bin/esbuild` via tsup dependency). The `packages/analytics` package can reference it via `devDependencies: { esbuild: "*" }` or use `npx esbuild` in the build script.
- **`packages/analytics/tsconfig.json` uses `NodeNext` module resolution** — appropriate for the build step. The tracker source itself should not use Node.js imports; browser-only APIs only.
- **CF-IPCountry is not available to the tracker POST.** Country = `null` in all Phase 1 events. Don't design the tracker to fetch from an IP geolocation service — that violates the <2KB / no-external-dependency constraint.
- **visitor_hash without IP is a cross-device collision risk** — two users on the same day with the same UA are indistinguishable. This is acceptable for Phase 1. The `unique_visitors` count in `analytics_daily` will be a lower bound, not exact. Document this in code comments.
- **The `analytics_events` table has no `idx_analytics_events_visitor_hash` index.** The aggregation query uses `COUNT(DISTINCT visitor_hash)` — this full-scans the table filtered by site_id + date. Acceptable at Phase 1 volumes; add the index when daily event count exceeds ~50k.

## Common Pitfalls

- **`sendBeacon` with a raw JSON string fails on some browsers.** Use `new Blob([JSON.stringify(payload)], { type: 'application/json' })` as the beacon body. PostgREST requires `Content-Type: application/json` in the POST headers. Beacon doesn't support custom headers — use the Blob approach to set content-type.
- **PostgREST batch insert requires an array body.** The tracker batches events every 5s. Even a single event must be wrapped in `[]`. Use `Prefer: return=minimal` to avoid a response body and `Prefer: resolution=ignore-duplicates` is not needed (no unique constraint on events).
- **`crypto.subtle` is only available in HTTPS contexts (and localhost).** All live sites are behind Cloudflare (HTTPS). Sites in `dns_pending` state being tested locally should fall back to a simpler hash or skip the hash entirely.
- **Tracker event deduplication on rapid navigation.** SPA-style navigation doesn't apply (Astro SSG = full page loads), so `pageview` fires once per page load. No debounce needed. But `click_affiliate` can fire multiple times if the user clicks rapidly — add a simple 1s cooldown guard per element.
- **BullMQ repeat job double-registration on worker restart.** BullMQ deduplicates repeat jobs by `jobId` key. Always set a stable `jobId` (e.g. `'analytics-daily-aggregation'`) when adding the repeat job. Without a stable key, each worker restart adds a new repeat entry, causing duplicate runs.
- **Aggregation query `ON CONFLICT DO UPDATE` with jsonb fields (`top_countries`, `top_referrers`) requires careful merge logic.** A simple `SET top_countries = EXCLUDED.top_countries` overwrites previous data if the aggregation runs multiple times for the same day. Use `jsonb_set` or aggregate the entire day's events atomically (delete + reinsert, or a single pass with the full date's events) rather than incremental updates.
- **`analytics_daily` aggregation must handle timezone correctly.** `analytics_events.created_at` is stored as UTC `timestamptz`. The `date` column in `analytics_daily` must be derived consistently (e.g. always UTC date). Document this and use `DATE(created_at AT TIME ZONE 'UTC')` in the aggregation SQL.
- **The tracker's `supabase_url` and `anon_key` are baked into static HTML — they will appear in search engine caches.** This is expected and fine. The anon key is designed for public exposure. Never put the service role key anywhere near the generator.
- **`packages/analytics` build must run before `apps/generator` Astro build.** If the tracker's built artifact is referenced as an inline script in `BaseLayout.astro` (read from disk by the generator build), the pnpm workspace build order must be correct. Either: add `"@monster/analytics": "workspace:*"` to `apps/generator/package.json` (triggers correct build order), or commit the built artifact.

## Open Risks

- **Supabase CORS policy on `analytics_events`.** The tracker POSTs from browser origins (e.g. `https://testcamping.com`) to `https://<project>.supabase.co`. Supabase's REST API allows CORS by default for configured origins. If the Supabase project has allowed-origins configured restrictively, INSERT from live domains will fail silently. Verify CORS is `*` or enumerate site domains.
- **sendBeacon fire-and-forget hides errors.** `navigator.sendBeacon` returns a boolean (queued or not), not a promise. Failed inserts (wrong schema, RLS violation, etc.) are invisible to the tracker. Verify end-to-end with a real browser + Supabase dashboard inspection during S01 UAT.
- **Tracker script injection strategy: inline vs external file.** Inline script in `BaseLayout.astro` is simpler and avoids an extra HTTP request, but if the tracker is >2KB minified, it bloats every page. esbuild minified vanilla JS for this use case is routinely 0.8–1.5KB. Measure after build and decide.
- **BullMQ repeat job timing accuracy.** BullMQ repeat jobs depend on the worker being alive. If the worker crashes between midnight and 2am, the daily aggregation for that day is skipped. A dead-letter queue or catch-up logic (run aggregation for yesterday if today's run is missing) would be needed for production reliability. Acceptable to skip for Phase 1.
- **`analytics_events` table growth without 90-day cleanup.** The M001 migration notes "90-day retention via cron, Phase 2." Without the cleanup cron, the table grows unbounded. The aggregation job in S03 could also include a cleanup step (delete where `created_at < now() - interval '90 days'`) to consolidate both concerns.
- **Supabase anon INSERT policy `WITH CHECK (true)` allows any `site_id`.** A bad actor with the anon key can insert events for any site_id (even one that doesn't belong to them). In a single-owner portfolio, this is not a real threat. If site_ids were exposed via some other channel, an attacker could pollute analytics. Mitigation: `WITH CHECK (site_id IN (SELECT id FROM sites))` — but this requires a SELECT grant on `sites` to the anon role, which is currently not given. Leave as-is for Phase 1.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Supabase Analytics | (none found) | none found |
| esbuild programmatic API | (none found) | none found |
| BullMQ cron/repeat jobs | (none found) | none found |

## Sources

- Existing codebase: `packages/db/supabase/migrations/20260313000003_analytics.sql` — complete schema and RLS policies
- Existing codebase: `apps/generator/src/layouts/BaseLayout.astro` — injection point for tracker script
- Existing codebase: `packages/agents/src/jobs/generate-site.ts` — siteData assembly; site_id/credentials not yet included
- Existing codebase: `packages/agents/src/worker.ts` — BullMQ worker registration pattern to follow for aggregation job
- Architecture decision D011 — CF-IPCountry is free but only in Cloudflare-proxied page requests; not available in browser→Supabase tracker POST
- Architecture decision D015 — `analytics_events` is a regular table (no partitioning), cron cleanup in Phase 2
- PRD `docs/PRD.md` lines 432–470 — analytics architecture, tracking script spec, GDPR requirements, visitor_hash definition
- M005-CONTEXT.md — scope, risks, completion class, final integrated acceptance criteria
