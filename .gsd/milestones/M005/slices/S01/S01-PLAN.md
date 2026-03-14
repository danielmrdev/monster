# S01: Tracker Script + Astro Injection

**Goal:** Build a <2KB vanilla JS tracker script that POSTs `pageview` and `click_affiliate` events to Supabase via `sendBeacon`, then inject it as an inline script into every generated Astro page with site credentials baked in at build time.
**Demo:** Run `pnpm --filter @monster/analytics build`; inspect `dist/tracker.min.js` — ≤2048 bytes. Run a generator build with a real site slug; inspect built HTML — inline `<script>` containing the tracker with the correct `supabase_url` and `site_id` substituted in.

## Must-Haves

- `packages/analytics/dist/tracker.min.js` built by esbuild, ≤2048 bytes, committed to repo
- Tracker fires `pageview` event on page load, sends via `sendBeacon` with Blob wrapper on `visibilitychange`/`pagehide`
- Tracker fires `click_affiliate` event when any `<a data-affiliate>` link is clicked
- `visitor_hash` computed via `crypto.subtle.digest('SHA-256', date+userAgent)`; fallback to `Math.random()` hex string in non-HTTPS contexts where SubtleCrypto is unavailable
- `country` always `null` (Phase 1 — D081)
- `language` from `navigator.language`
- `SiteInfo` in `apps/generator/src/lib/data.ts` extended with `id`, `supabase_url`, `supabase_anon_key`
- `GenerateSiteJob` writes `id`, `supabase_url`, `supabase_anon_key` to `site.json`
- `BaseLayout.astro` reads `tracker.min.js` from disk at build time and injects as inline `<script>` with credentials substituted
- Product page `<a>` affiliate links have `data-affiliate` attribute so tracker intercepts them
- `pnpm --filter @monster/analytics build` exits 0
- No raw service role key anywhere in tracker or generated HTML — anon key only

## Proof Level

- This slice proves: integration (tracker bytes built, credentials injected, HTML verifiable)
- Real runtime required: no (build-time verification sufficient; UAT deferred to slice demo)
- Human/UAT required: no (byte count + built HTML grep suffices for plan verification)

## Verification

- `pnpm --filter @monster/analytics build` exits 0
- `wc -c packages/analytics/dist/tracker.min.js` ≤ 2048
- Generator build for a test slug produces HTML with inline tracker: `grep -q "supabase_url" apps/generator/.generated-sites/<slug>/dist/index.html`
- Built HTML has no `service_role` or `SUPABASE_SERVICE_ROLE_KEY` substring
- `grep -r "data-affiliate" apps/generator/src/pages/products/` confirms attribute is present
- **Failure-path diagnostic:** If byte count exceeds 2048, run `esbuild src/tracker.ts --bundle --format=iife --platform=browser --target=es2017 --outfile=/dev/stdout 2>&1 | wc -c` (unminified) to identify bloat source; diff against minified to locate verbose patterns. If placeholders are missing from output, run `grep -c "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js` — output must be `3`; zero means esbuild tree-shook the variables (fix: read them from a `window` property instead of bare variables).

## Observability / Diagnostics

- Runtime signals: tracker logs `[tracker] pageview sent`, `[tracker] affiliate click queued` to `console.debug` (stripped in minified build only if using closure minification; otherwise kept as debug-level)
- Inspection surfaces: browser DevTools Network tab — verify POST to Supabase `analytics_events` endpoint; Supabase table editor — confirm row appears
- Failure visibility: sendBeacon failures are silent by design (fire-and-forget); tracker catches SubtleCrypto unavailability and uses fallback hash — no uncaught exceptions
- Redaction constraints: anon key in HTML is intentional (INSERT-only RLS); service role key must never appear

## Integration Closure

- Upstream surfaces consumed: `analytics_events` table (M001 migration 003, RLS INSERT-only for anon); `sites.id` UUID written to `site.json` via `GenerateSiteJob`; `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars (already in `.env`)
- New wiring introduced: `SiteInfo.id/supabase_url/supabase_anon_key` → `site.json` → `BaseLayout.astro` inline script substitution
- What remains before milestone is usable end-to-end: S02 (Analytics Dashboard), S03 (Daily Aggregation Cron)

## Tasks

- [x] **T01: Build tracker script with esbuild** `est:1h`
  - Why: Produces the committed `dist/tracker.min.js` artifact. This is the highest-risk item (byte budget, esbuild config, Web Crypto API, Blob sendBeacon) — must be nailed before wiring injection.
  - Files: `packages/analytics/src/tracker.ts`, `packages/analytics/package.json`, `packages/analytics/dist/tracker.min.js`
  - Do: Add esbuild as devDependency to `@monster/analytics`. Write tracker in TypeScript targeting browser globals (no imports). Implement: visitor hash via SubtleCrypto with Math.random fallback; event queue flushed via sendBeacon Blob on visibilitychange/pagehide; pageview fired on load; click listener for `[data-affiliate]` links. Configure esbuild: `bundle:true, minify:true, format:'iife', platform:'browser', target:['es2017']`. Build script produces `dist/tracker.min.js`. Verify byte count ≤2048.
  - Verify: `pnpm --filter @monster/analytics build` exits 0; `wc -c packages/analytics/dist/tracker.min.js` ≤ 2048
  - Done when: `dist/tracker.min.js` exists, ≤2048 bytes, committed to repo

- [x] **T02: Extend SiteInfo and inject tracker into Astro** `est:1h`
  - Why: Closes the injection loop — credentials in `site.json` flow through to inline `<script>` in built HTML, making the tracker functional for every generated site.
  - Files: `apps/generator/src/lib/data.ts`, `packages/agents/src/jobs/generate-site.ts`, `apps/generator/src/layouts/BaseLayout.astro`, `apps/generator/src/pages/products/[slug].astro`
  - Do: Add `id`, `supabase_url`, `supabase_anon_key` to `SiteInfo` interface in `data.ts`. Update `GenerateSiteJob` to include `site.id` (the UUID from DB), `process.env.NEXT_PUBLIC_SUPABASE_URL`, and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY` in the `site` object written to `site.json`. In `BaseLayout.astro`: read `tracker.min.js` from `packages/analytics/dist/` using `readFileSync` at build time, perform string substitution to replace `__SUPABASE_URL__`, `__SUPABASE_ANON_KEY__`, `__SITE_ID__` placeholders with `site.supabase_url`, `site.supabase_anon_key`, `site.id`. Inject as `<script set:html={trackerScript}>`. Add `data-affiliate` attribute to all `<a href={affiliateUrl}>` tags in `products/[slug].astro` (all 3 template variants).
  - Verify: Build a generator fixture (or inspect source) to confirm `BaseLayout.astro` compiles; `grep -r "data-affiliate" apps/generator/src/pages/products/` shows matches; `pnpm --filter @monster/agents build` exits 0 (GenerateSiteJob still compiles with new fields)
  - Done when: `SiteInfo` has the three new fields; `GenerateSiteJob` writes them; `BaseLayout.astro` injects tracker inline; affiliate links have `data-affiliate`; all builds pass

## Files Likely Touched

- `packages/analytics/src/tracker.ts` (new)
- `packages/analytics/package.json`
- `packages/analytics/dist/tracker.min.js` (generated + committed)
- `apps/generator/src/lib/data.ts`
- `apps/generator/src/layouts/BaseLayout.astro`
- `apps/generator/src/pages/products/[slug].astro`
- `packages/agents/src/jobs/generate-site.ts`
