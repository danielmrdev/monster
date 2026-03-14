---
id: T02
parent: S01
milestone: M005
provides:
  - apps/generator/src/lib/data.ts — SiteInfo extended with id, supabase_url, supabase_anon_key
  - apps/generator/src/layouts/BaseLayout.astro — inline tracker injection via readFileSync + placeholder substitution
  - apps/generator/src/layouts/classic/Layout.astro — analytics props threaded to BaseLayout
  - apps/generator/src/layouts/modern/Layout.astro — analytics props threaded to BaseLayout
  - apps/generator/src/layouts/minimal/Layout.astro — analytics props threaded to BaseLayout
  - apps/generator/src/pages/products/[slug].astro — data-affiliate attribute on all three template variants' affiliate links
  - packages/agents/src/jobs/generate-site.ts — id, supabase_url, supabase_anon_key written to site.json
key_files:
  - apps/generator/src/lib/data.ts
  - apps/generator/src/layouts/BaseLayout.astro
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/src/pages/products/[slug].astro
key_decisions:
  - Pass supabaseUrl/supabaseAnonKey/siteId as explicit scalar props to BaseLayout rather than refactoring to accept a full SiteInfo — avoids coupling BaseLayout to the generator's data model; keeps BaseLayout reusable
  - Missing tracker artifact is caught and warned (non-fatal) — site still builds; tracker is omitted. Same for missing env vars in the job — warn-only, never throw
  - Used is:inline directive explicitly on the tracker script tag to silence Astro's set:html hint
patterns_established:
  - Analytics props flow: site.json → SiteInfo (data.ts) → template Layout (classic/modern/minimal) → BaseLayout (readFileSync + replace) → inline <script is:inline set:html>
  - data-affiliate={product.asin} on affiliate links enables click_affiliate event tracking without extra JS lookup
observability_surfaces:
  - Build-time warn: "[BaseLayout] Could not load tracker.min.js" if artifact missing
  - Job-time warn: "[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_URL is not set" / ANON_KEY variant when env vars absent
  - Diagnostic: grep "__SUPABASE_URL__" dist/index.html — must be empty after successful build (placeholder substituted)
  - Diagnostic: grep "service_role" dist/index.html — must be empty (confirms no secret leakage)
  - Runtime: browser DevTools Network tab → filter analytics_events to see POST traffic
duration: ~25min
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Extend SiteInfo and inject tracker into Astro

**Wired the committed tracker artifact into every generated Astro page: SiteInfo extended, generate-site job writes credentials to site.json, BaseLayout reads and injects tracker inline with placeholders substituted, all three template wrappers thread analytics props, affiliate links annotated with data-affiliate.**

## What Happened

Extended `SiteInfo` with three new typed fields (`id`, `supabase_url`, `supabase_anon_key`) and updated the `GenerateSiteJob` site assembly block to populate them — `id` from the `siteId` job parameter, and the Supabase credentials from `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` env vars with warn-only fallback to empty strings when absent.

`BaseLayout.astro` now reads `tracker.min.js` from `../../packages/analytics/dist/tracker.min.js` at Astro build time using `readFileSync`, substitutes the three placeholders via chained `.replace()`, and injects the result as `<script is:inline set:html={trackerScript} />` at the end of `<body>`. The `is:inline` directive was added explicitly to silence Astro's hint about `set:html` implying inline mode — after the fix, `astro check` reports 0 errors, 0 warnings, 0 hints.

The three template layout wrappers (classic, modern, minimal) already receive `site: SiteInfo` as a prop, so threading the analytics fields was a single-line change on each `<BaseLayout>` invocation — no interface changes to the template layouts were needed.

Page-level callers (`index.astro`, `categories/[slug].astro`, `products/[slug].astro`, `[legal].astro`) already pass `site={site}` to their layout, which flows the new fields automatically.

All three affiliate `<a>` tags in `products/[slug].astro` received `data-affiliate={product.asin}`.

## Verification

```
pnpm --filter @monster/agents build
# → ESM ⚡️ Build success (index.js 476KB, worker.js 2.72MB)

cd apps/generator && npx astro check
# → Result (10 files): 0 errors, 0 warnings, 0 hints

grep -r "data-affiliate" apps/generator/src/pages/products/
# → 3 matches (one per template variant)

grep -o "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" packages/analytics/dist/tracker.min.js
# → All 3 placeholders confirmed present in source artifact

grep -n "id: siteId\|supabase_url\|supabase_anon_key" packages/agents/src/jobs/generate-site.ts
# → lines 483-489 in siteData.site assembly block
```

## Diagnostics

- **Tracker missing at build:** `[BaseLayout] Could not load tracker.min.js: <fs error>` in Astro build stdout
- **Env vars missing at job time:** `[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_URL is not set` in worker log
- **Placeholder leak check:** `grep "__SUPABASE_URL__" apps/generator/.generated-sites/<slug>/dist/index.html` — must be empty after build
- **Secret leak check:** `grep "service_role" apps/generator/.generated-sites/<slug>/dist/index.html` — must be empty
- **Runtime traffic:** browser DevTools Network tab → filter for `analytics_events` — POST requests appear on pageview and affiliate click

## Deviations

- **Chose explicit scalar props over full SiteInfo in BaseLayout** — plan suggested "pass `site: SiteInfo` OR pass explicit props"; chose explicit scalars (`siteId`, `supabaseUrl`, `supabaseAnonKey`) to keep BaseLayout decoupled from the generator's data model. Template layouts remain the SiteInfo boundary.
- **Page-level callers needed no changes** — plan listed `index.astro`, `categories/[slug].astro`, `[legal].astro` as needing updates, but since the template layouts already receive `site: SiteInfo` and forward the new scalars to BaseLayout, no page-level changes were necessary.

## Known Issues

None.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — `SiteInfo` extended with `id`, `supabase_url`, `supabase_anon_key`
- `apps/generator/src/layouts/BaseLayout.astro` — tracker readFileSync + placeholder substitution + `<script is:inline set:html>` injection
- `apps/generator/src/layouts/classic/Layout.astro` — forwards `siteId`, `supabaseUrl`, `supabaseAnonKey` to BaseLayout
- `apps/generator/src/layouts/modern/Layout.astro` — same
- `apps/generator/src/layouts/minimal/Layout.astro` — same
- `apps/generator/src/pages/products/[slug].astro` — `data-affiliate={product.asin}` on all 3 template affiliate links
- `packages/agents/src/jobs/generate-site.ts` — `id`, `supabase_url`, `supabase_anon_key` added to `siteData.site` assembly
- `.gsd/milestones/M005/slices/S01/tasks/T02-PLAN.md` — added missing `## Observability Impact` section (pre-flight fix)
