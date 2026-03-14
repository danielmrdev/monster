---
id: S01
parent: M003
milestone: M003
provides:
  - apps/generator — real Astro 6 + Tailwind v4 project with 3 templates (Classic, Modern, Minimal) and all page types
  - src/data/<slug>/site.json data injection contract consumed by getStaticPaths()
  - Three visually distinct layouts with CSS custom property theming via define:vars
  - All page types: homepage, category ([slug]), product ([slug]), 4 legal pages ([legal])
  - GenerateSiteJob BullMQ worker in packages/agents — reads site from Supabase, writes fixture site.json, calls Astro build()
  - generateQueue() singleton for admin panel → Upstash Redis → worker
  - Admin panel "Generate Site" button + ai_jobs status polling (JobStatus component, 5s refresh)
  - ai_jobs observability: pending → running → completed|failed with timestamps and error capture
  - packages/agents built and type-checked (tsup + hand-written dist/index.d.ts)
requires: []
affects:
  - slice: S02
    provides: Astro build pipeline, site.json injection contract, GenerateSiteJob worker scaffold
key_files:
  - apps/generator/astro.config.ts
  - apps/generator/src/lib/data.ts
  - apps/generator/src/data/fixture/site.json
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/layouts/classic/Layout.astro
  - apps/generator/src/layouts/modern/Layout.astro
  - apps/generator/src/layouts/minimal/Layout.astro
  - apps/generator/src/pages/index.astro
  - apps/generator/src/pages/categories/[slug].astro
  - apps/generator/src/pages/products/[slug].astro
  - apps/generator/src/pages/[legal].astro
  - packages/agents/src/queue.ts
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/src/worker.ts
  - packages/agents/src/index.ts
  - packages/agents/dist/index.d.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - D041: SITE_SLUG env var drives astro outDir — worker sets process.env.SITE_SLUG before calling build()
  - D042: packages/agents worker runs as standalone process, not embedded in Next.js
  - D043: Astro 6 + @tailwindcss/vite (plan said Astro 5 + @astrojs/tailwind — legacy integration is v3 only)
  - D044: index.astro reads SITE_SLUG in frontmatter, not getStaticPaths (getStaticPaths invalid for non-dynamic routes)
  - D045: loadSiteData() uses process.cwd() not import.meta.url (prerender chunks run from dist, not src)
  - D046: LEGAL_PAGES defined inside getStaticPaths() — module-scope consts split into non-prerender chunks by Vite
  - D047: tsup DTS disabled; hand-written dist/index.d.ts — dual ioredis versions (agents@5.10 vs bullmq pinned@5.9.3) break rollup-plugin-dts
  - D048: GenerateSiteJob not exported from packages/agents index — transitive astro import breaks Next.js webpack bundle
  - D049: process.chdir(GENERATOR_ROOT) before astro build(); restored in finally — loadSiteData uses process.cwd()
patterns_established:
  - Tailwind v4 in Astro uses @tailwindcss/vite as vite.plugins[], not an integration
  - astro.config.ts reads SITE_SLUG at module load time — worker must set process.env.SITE_SLUG before build()
  - BaseLayout.astro define:vars passes CSS custom properties inline on <body> via style attribute
  - Non-dynamic pages (index.astro) load site data in frontmatter scope — not getStaticPaths()
  - Dynamic pages use getStaticPaths() with data read via process.cwd()-anchored readFileSync
  - Template dispatch: all page files switch on site.template_slug ("modern" | "minimal" | default Classic)
  - Constants used in getStaticPaths() must be defined inside it (not at module scope) — Vite prerender chunk bundling
  - BullMQ Queue singleton in admin via generateQueue(); worker creates its own Redis connection
  - Worker standalone: node dist/worker.js with dotenv/config at top; not inside Next.js process
observability_surfaces:
  - ai_jobs table: status (pending|running|completed|failed), started_at, completed_at, error, bull_job_id
  - Worker stdout: [GenerateSiteJob] prefixed logs per phase (Starting, Wrote site.json, Running Astro build, complete, failed)
  - apps/generator/.generated-sites/<slug>/dist/ — exists on success, absent on build failure
  - Admin panel JobStatus component: polls getLatestJobStatus() every 5s while pending|running
  - Diagnostic: SELECT status, error, started_at, completed_at FROM ai_jobs WHERE site_id='<id>' ORDER BY created_at DESC LIMIT 1
drill_down_paths:
  - .gsd/milestones/M003/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M003/slices/S01/tasks/T03-SUMMARY.md
duration: ~4h (T01: ~20m, T02: ~40m, T03: ~3h)
verification_result: passed
completed_at: 2026-03-14
---

# S01: Astro Templates + Build Pipeline

**Astro 6 builds a real 11-page site from fixture data across three templates; BullMQ worker triggers the build from the admin panel and tracks progress in ai_jobs — full click-to-dist flow verified end-to-end.**

## What Happened

Three tasks built the generator pipeline from the ground up.

**T01** scaffolded `apps/generator` as a real Astro 6 project with Tailwind v4. The key implementation insight: `@astrojs/tailwind` (plan-referenced integration) is Tailwind v3 only — the correct approach for v4 is `@tailwindcss/vite` as a Vite plugin. `astro.config.ts` reads `SITE_SLUG` at module load time and sets `outDir` to `.generated-sites/${slug}/dist`, giving each site its own isolated dist directory. `BaseLayout.astro` uses `define:vars` to pass `--primary`, `--accent`, and `--font` CSS custom properties inline on `<body>`. First build produced valid HTML in under 2 seconds.

**T02** built the full template system and all page types. The `site.json` fixture defines the data contract: `{ site, categories, products }`. `loadSiteData()` reads it via `readFileSync(join(process.cwd(), 'src', 'data', slug, 'site.json'))` — `import.meta.url` was ruled out because prerender chunks run from `dist/.prerender/`, not `src/`. Three distinct template layouts were implemented:
- **Classic:** white nav with `border-b shadow-sm`, `max-w-6xl` content, simple footer
- **Modern:** sticky colored header (`background-color: var(--color-primary)`), `max-w-7xl` wide content, hero slot, two-tone footer
- **Minimal:** `max-w-4xl` centered column, hairline `border-gray-100` dividers, uppercase tracking-wide labels, no color

Two Vite bundler surprises during implementation: (1) `getStaticPaths()` is invalid for non-dynamic pages — `index.astro` reads data in frontmatter scope instead; (2) `LEGAL_PAGES` const at module scope got split into a non-prerender chunk by Vite — moved inside `getStaticPaths()`. Full fixture build produced 11 routes with correct affiliate URLs and no hotlinked images.

**T03** wired the BullMQ job worker and admin trigger. Three non-trivial issues were resolved: (1) Dual ioredis versions (agents@5.10 vs bullmq's pinned@5.9.3) broke tsup DTS generation — fixed by disabling DTS and writing a hand-crafted `dist/index.d.ts`, plus a pnpm override for ioredis@5.9.3. (2) `GenerateSiteJob` exported from `index.ts` caused Next.js webpack to pull in `astro` (which uses `data:` scheme imports webpack can't resolve) — fixed by only exporting `generateQueue()` from the index. (3) `process.cwd()` in the worker is the monorepo root, not `apps/generator` — fixed by `process.chdir(GENERATOR_ROOT)` before calling `build()` with restore in `finally`. End-to-end flow verified: button click → Upstash Redis → worker → 11-page Astro build → `ai_jobs.status = completed`.

## Verification

```bash
# Astro type check — 0 errors, 0 warnings, 0 hints
cd apps/generator && npx astro check
# → Result (10 files): 0 errors, 0 warnings, 0 hints

# Generator build — 11 pages
SITE_SLUG=fixture pnpm --filter @monster/generator build
# → [build] 11 page(s) built in 2.35s — Complete!

# All critical routes present
ls apps/generator/.generated-sites/fixture/dist/{index.html,categories/freidoras-de-aire/index.html}
ls apps/generator/.generated-sites/fixture/dist/{products/philips-hd9252-90/index.html,privacidad/index.html}
# → all 4 files exist

# Affiliate link structure
grep -q "?tag=test-fixture-20" .../products/philips-hd9252-90/index.html && echo "affiliate OK"
# → affiliate OK

# No hotlinked Amazon images
grep -rq "ssl-images-amazon.com" .../dist/ || echo "images OK"
# → images OK

# packages/agents build
pnpm --filter @monster/agents build
# → 2 ESM builds succeed; dist/index.js 1.06 KB; dist/worker.js 476.64 KB

# packages/agents type check
cd packages/agents && npx tsc --noEmit; echo $?
# → exit 0

# admin build
pnpm --filter @monster/admin build
# → /sites/[id] route included; exit 0

# End-to-end manual run (verified in T03)
# node packages/agents/dist/worker.js → [worker] GenerateSiteJob listening
# enqueue job → ai_jobs transitions pending → running → completed
# .generated-sites/<slug>/dist/index.html → exists
```

## Requirements Advanced

- R015 — Three TSA Astro templates (Classic, Modern, Minimal) shipped with all page types and CSS custom property theming
- R001 — Astro build pipeline proven; generator can produce a full site from Supabase site data + fixture products
- R002 — Generator is type-aware via `site.type` field; TSA is first implementation; architecture extensible

## Requirements Validated

- none — R015 proof requires live browser render (UAT); R001 requires real product data (S02+)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Astro 6 instead of Astro 5:** Plan said "Astro 5" but 6.0.4 was current stable at execution time. No functional difference for this use case.
- **`@tailwindcss/vite` instead of `@astrojs/tailwind`:** Plan listed `@astrojs/tailwind` which is Tailwind v3 only. Correct Tailwind v4 integration for any Vite-based project is `@tailwindcss/vite` in `vite.plugins[]`.
- **`index.astro` uses frontmatter data load instead of `getStaticPaths()`:** Astro 6 does not inject `getStaticPaths()` props for non-dynamic routes. Frontmatter scope is the correct SSG pattern.
- **`loadSiteData()` uses `readFileSync` + `process.cwd()`:** Plan specified static JSON import. Dynamic slug-based paths require runtime reads; `process.cwd()` avoids prerender chunk path resolution failures.
- **tsup DTS disabled, hand-written `dist/index.d.ts`:** Dual ioredis versions broke rollup-plugin-dts. Not a plan deviation in intent — only the implementation mechanism changed.
- **`ai_jobs` INSERT+lookup instead of upsert:** Schema has no unique constraint on `bull_job_id`. Plan assumed upsert would work.

## Known Limitations

- Product images in S01 render as broken `<img>` tags (fixture `images[]` is empty) — expected; S02 downloads real images
- Worker start command (`node dist/worker.js`) is manual; pm2 ecosystem entry deferred to S04
- Only ES-language legal page slugs hardcoded (`privacidad`, `aviso-legal`, `cookies`, `contacto`); i18n slug expansion is S02+ scope
- Worker concurrency is 1 (D036); concurrent builds of different sites would race on `process.cwd()` — single-tenant, not a concern for Phase 1
- Job 1 (first failed test run during T03) left a `failed` row in `ai_jobs` — not a problem, just visible in Supabase dashboard

## Follow-ups

- S02: Replace fixture product assembler in `GenerateSiteJob` with real DataForSEO fetch + image download pipeline
- S02: Write real `tsa_categories` and `tsa_products` to Supabase from DataForSEO output
- S04: Add pm2 ecosystem entry for the worker process
- Future: Validate `process.chdir` + concurrent builds if Phase 2 ever runs multiple site generations in parallel (see D049 caveat)

## Files Created/Modified

- `apps/generator/package.json` — Astro 6, @tailwindcss/vite, tailwindcss@4, sharp, @monster/shared dep, @astrojs/check devDep
- `apps/generator/astro.config.ts` — static output, SITE_SLUG-driven outDir, Tailwind v4 via vite plugin
- `apps/generator/src/layouts/BaseLayout.astro` — define:vars CSS custom properties (primary, accent, font), lang prop
- `apps/generator/src/layouts/classic/Layout.astro` — Classic layout: white nav, border-b shadow, max-w-6xl, simple footer
- `apps/generator/src/layouts/modern/Layout.astro` — Modern layout: sticky colored header, max-w-7xl, hero slot, two-tone footer
- `apps/generator/src/layouts/minimal/Layout.astro` — Minimal layout: max-w-4xl, hairline borders, uppercase labels, no color
- `apps/generator/src/pages/index.astro` — Homepage: template dispatch, hero, category grid, featured products, affiliate disclosure
- `apps/generator/src/pages/categories/[slug].astro` — Category page: product grid, SEO text, getStaticPaths()
- `apps/generator/src/pages/products/[slug].astro` — Product page: affiliate link, pros/cons, description, getStaticPaths()
- `apps/generator/src/pages/[legal].astro` — 4 legal pages (ES slugs): privacidad, aviso-legal, cookies, contacto
- `apps/generator/src/lib/data.ts` — SiteData interface, loadSiteData(), buildAffiliateUrl(), getAmazonDomain()
- `apps/generator/src/data/fixture/site.json` — ES-market freidoras de aire fixture (2 categories, 4 products)
- `packages/agents/package.json` — bullmq, ioredis@5.9.3, dotenv, astro devDep, tsup build scripts
- `packages/agents/tsup.config.ts` — two-entry tsup (index + worker), DTS disabled, astro external
- `packages/agents/tsconfig.json` — NodeNext module resolution, rootDir=src
- `packages/agents/src/queue.ts` — createRedisOptions(), createRedisConnection(), generateQueue() singleton
- `packages/agents/src/jobs/generate-site.ts` — GenerateSiteJob: fixture assembler, process.chdir, Astro build(), ai_jobs tracking
- `packages/agents/src/worker.ts` — standalone entrypoint with SIGTERM/SIGINT graceful shutdown
- `packages/agents/src/index.ts` — exports generateQueue only (GenerateSiteJob excluded to keep admin bundle clean)
- `packages/agents/dist/index.d.ts` — hand-written type declarations for admin imports
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — enqueueSiteGeneration() + getLatestJobStatus() server actions
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — client component, 5s polling, status badge + timestamps
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Generate Site button + JobStatus integration
- `package.json` (root) — pnpm override ioredis@5.9.3
- `.env` — UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN

## Forward Intelligence

### What the next slice should know
- The data injection contract (`src/data/<slug>/site.json`) is the seam between GenerateSiteJob and Astro. S02 replaces the fixture assembler inside `GenerateSiteJob.process()` with real DataForSEO data — the `writeDataJson()` call and file structure are unchanged.
- `process.env.SITE_SLUG` must be set before calling `build()`, and `process.chdir(GENERATOR_ROOT)` must happen before `build()` too. Both are already in `GenerateSiteJob.process()`. S02 just replaces what gets written into the file.
- S02 adds `images[]` (local WebP paths) to products in `site.json`. Product page template (`products/[slug].astro`) already handles an empty `images[]` gracefully — it shows a placeholder. Once images arrive, they render automatically.
- `@monster/shared` is already a dep of `apps/generator`. `AMAZON_MARKETS` and `Language` types are available — `buildAffiliateUrl()` in `src/lib/data.ts` already uses them.

### What's fragile
- `process.chdir(GENERATOR_ROOT)` — if two GenerateSiteJob instances ever run concurrently in the same Node process, they race on the global cwd. Worker concurrency is hardcoded to 1 (one job at a time). Don't increase it without fixing this.
- Hand-written `dist/index.d.ts` — any new exports from `packages/agents` that the admin consumes must be manually added to this file. tsup DTS is disabled. The file is minimal and checked in.
- `UPSTASH_REDIS_URL` must use the `rediss://` scheme (TLS) — `redis://` or the REST URL format will fail at connection time with a cryptic error.
- `ai_jobs` has no unique constraint on `bull_job_id` — the INSERT+lookup pattern works but means multiple rows per site are normal. `getLatestJobStatus()` queries `ORDER BY created_at DESC LIMIT 1`.

### Authoritative diagnostics
- `ai_jobs` table in Supabase — source of truth for job status; `error` column shows first failure message
- Worker stdout `[GenerateSiteJob]` prefix — traces every phase; if stuck at "Running Astro build" for >30s, astro is likely hanging
- `ls apps/generator/.generated-sites/` — shows all slugs ever built; missing slug = build never completed for that site
- `apps/generator/.generated-sites/<slug>/dist/_astro/` — populated only after successful build; empty or absent means build failed mid-way

### What assumptions changed
- "Astro 5 + `@astrojs/tailwind`" — actually Astro 6 + `@tailwindcss/vite`; the plan was written against older versions
- "getStaticPaths() injects props into all pages" — only true for dynamic routes; index.astro is a static route
- "tsup generates DTS automatically" — fails when two ioredis versions appear in the type graph; hand-write it instead
- "upsert on ai_jobs by bull_job_id" — no unique constraint exists; INSERT is the correct operation
