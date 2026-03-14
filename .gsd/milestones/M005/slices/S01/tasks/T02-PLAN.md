---
estimated_steps: 5
estimated_files: 4
---

# T02: Extend SiteInfo and inject tracker into Astro

**Slice:** S01 — Tracker Script + Astro Injection
**Milestone:** M005

## Description

Wire the committed `tracker.min.js` artifact into every generated Astro page by: (1) extending `SiteInfo`/`SiteData` with `id`, `supabase_url`, `supabase_anon_key`; (2) updating `GenerateSiteJob` to include these fields in `site.json` (reading the Supabase credentials from env vars, and the site UUID from the DB row); (3) updating `BaseLayout.astro` to read `tracker.min.js` from disk at Astro build time and inject it inline with placeholders substituted; (4) adding `data-affiliate` attributes to all affiliate link `<a>` tags in the product page templates.

## Steps

1. In `apps/generator/src/lib/data.ts`, add three fields to `SiteInfo`:
   ```ts
   id: string;
   supabase_url: string;
   supabase_anon_key: string;
   ```
   These are populated from `site.json` at Astro build time — no logic change needed in `loadSiteData()`.

2. In `packages/agents/src/jobs/generate-site.ts`, update the `siteData.site` object assembly block (around line 463-480) to add:
   ```ts
   id: siteId,
   supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
   supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
   ```
   These are read from env vars at job runtime — the worker already loads `.env` via `dotenv/config`. If either env var is missing, log a warning but do not throw (the site can still build; the tracker will silently fail to POST, which is acceptable — the site is still functional).

3. In `apps/generator/src/layouts/BaseLayout.astro`:
   - Update the Props interface to accept `site: SiteInfo` (it currently accepts individual customization fields; check if refactor is needed or if `site` is already passed). If only `customization` is currently passed, add `site` to Props and thread it from the calling pages — OR pass `supabaseUrl`, `supabaseAnonKey`, `siteId` as explicit props to avoid a large refactor.
   - In the frontmatter, use `readFileSync` to load the tracker: `readFileSync(join(process.cwd(), 'packages/analytics/dist/tracker.min.js'), 'utf-8')`. Note: `process.cwd()` during Astro build is the generator project root (`apps/generator/`), so the path to `packages/analytics/dist/tracker.min.js` is `../../packages/analytics/dist/tracker.min.js` relative to `apps/generator/`. Use `join(process.cwd(), '..', '..', 'packages', 'analytics', 'dist', 'tracker.min.js')`.
   - Substitute placeholders: `trackerScript.replace('__SUPABASE_URL__', supabaseUrl).replace('__SUPABASE_ANON_KEY__', supabaseAnonKey).replace('__SITE_ID__', siteId)`.
   - Inject: `<script set:html={trackerScript} />` at the end of `<body>`.

4. In `apps/generator/src/pages/products/[slug].astro`, add `data-affiliate` to all three template variants' affiliate `<a>` tags (classic, modern, minimal). The attribute value can be the ASIN for future use: `data-affiliate={product.asin}`.

5. Propagate `supabaseUrl`, `supabaseAnonKey`, `siteId` props from the calling pages to `BaseLayout.astro`. The pages that use `BaseLayout` directly are: none currently — templates (`classic/Layout.astro`, `modern/Layout.astro`, `minimal/Layout.astro`) wrap `BaseLayout`. Update those three layout wrappers to accept and forward the analytics props, and update the page-level callers (`index.astro`, `categories/[slug].astro`, `products/[slug].astro`, `[legal].astro`) to pass `site.id`, `site.supabase_url`, `site.supabase_anon_key`.

## Must-Haves

- [ ] `SiteInfo` has `id`, `supabase_url`, `supabase_anon_key` fields
- [ ] `GenerateSiteJob` writes all three fields to `site.json` (reads URL+key from env vars)
- [ ] `BaseLayout.astro` reads `tracker.min.js` from disk and injects inline with substituted placeholders
- [ ] All three template layout wrappers (classic, modern, minimal) pass analytics props through to BaseLayout
- [ ] All pages pass `site.id`, `site.supabase_url`, `site.supabase_anon_key` to their layout
- [ ] All affiliate `<a>` tags in `products/[slug].astro` have `data-affiliate` attribute
- [ ] `pnpm --filter @monster/agents build` exits 0
- [ ] `pnpm --filter apps/generator astro check` exits 0 (or `npx astro check` in the generator dir)
- [ ] No service role key in any generated HTML

## Verification

- `pnpm --filter @monster/agents build` exits 0
- `cd apps/generator && npx astro check` exits 0
- `grep -r "data-affiliate" apps/generator/src/pages/products/` shows matches
- Inspect `SiteInfo` type in `data.ts` — three new fields present
- Inspect `generate-site.ts` assembly block — `id`, `supabase_url`, `supabase_anon_key` present
- Inspect `BaseLayout.astro` frontmatter — `readFileSync` tracker load and placeholder substitution present

## Inputs

- `packages/analytics/dist/tracker.min.js` — from T01 (must exist and be committed)
- `apps/generator/src/lib/data.ts` — current `SiteInfo` interface to extend
- `packages/agents/src/jobs/generate-site.ts` — `siteData.site` assembly block to update (around line 463)
- `apps/generator/src/layouts/BaseLayout.astro` — to add inline tracker injection
- `apps/generator/src/pages/products/[slug].astro` — affiliate links to annotate
- `apps/generator/src/layouts/classic/Layout.astro`, `modern/Layout.astro`, `minimal/Layout.astro` — to thread analytics props through

## Observability Impact

**Build-time signals:**
- `[BaseLayout] Could not load tracker.min.js: <message>` — console.warn if the tracker artifact is missing at Astro build time. Site still builds; tracker is simply omitted.
- `[GenerateSiteJob] NEXT_PUBLIC_SUPABASE_URL is not set` / `NEXT_PUBLIC_SUPABASE_ANON_KEY is not set` — console.warn written to the job worker log when env vars are absent. These are non-fatal; the tracker embeds empty strings and POSTs will fail silently in the browser.

**Runtime inspection surfaces:**
- `grep "__SUPABASE_URL__\|__SUPABASE_ANON_KEY__\|__SITE_ID__" dist/index.html` — if any placeholder is still present in built HTML, substitution failed during Astro build.
- `grep "service_role\|SERVICE_ROLE" dist/index.html` — must return nothing; confirms the service role key was never written to site.json or injected.
- Browser DevTools → Network tab → filter `analytics_events` — POST requests from the tracker visible here once a real site is loaded.
- `data-affiliate` attribute on affiliate links is the click-event hook used by the tracker; absence means `click_affiliate` events will not be captured.

**Failure-state persistence:** none added here — the job already persists `last_error` + `phase` to the `site_generation_jobs` table on throw. Missing env vars are intentionally non-throwing (warn only).

## Expected Output

- `apps/generator/src/lib/data.ts` — `SiteInfo` with 3 new fields
- `packages/agents/src/jobs/generate-site.ts` — `siteData.site` block updated
- `apps/generator/src/layouts/BaseLayout.astro` — inline tracker injection
- `apps/generator/src/layouts/classic/Layout.astro`, `modern/Layout.astro`, `minimal/Layout.astro` — analytics props threaded
- `apps/generator/src/pages/products/[slug].astro` — `data-affiliate` on affiliate links
- `apps/generator/src/pages/index.astro`, `categories/[slug].astro`, `[legal].astro` — analytics props passed to layout
