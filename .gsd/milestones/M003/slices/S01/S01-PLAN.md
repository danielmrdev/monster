# S01: Astro Templates + Build Pipeline

**Goal:** Prove the Astro programmatic build API end-to-end with three real templates (Classic, Modern, Minimal) across all page types, triggered from the admin panel via a BullMQ job with fixture data.

**Demo:** User clicks "Generate Site" on a site detail page in the admin panel → BullMQ job runs → `apps/generator` builds a real `dist/` → opening the built `index.html` in a browser shows a styled homepage with category grid and product cards; navigating to a category or product page renders correct layout; legal pages are present; affiliate links contain `?tag=`.

## Must-Haves

- `apps/generator` is a real Astro 5 project with Tailwind v4, installable via `pnpm install`
- Three template variants (Classic, Modern, Minimal) each rendering homepage, category, product, and 4 legal page types
- CSS custom property theming (`primaryColor`, `accentColor`, `fontFamily`) wired via `define:vars` in the layout
- Data injection contract: `apps/generator/src/data/<slug>/site.json` with shape `{ site, categories, products }` read by `getStaticPaths()`
- `GenerateSiteJob` BullMQ worker in `packages/agents/`: reads site from Supabase, writes fixture data to `src/data/`, calls Astro `build()`, tracks progress in `ai_jobs`
- Admin panel site detail page has a "Generate Site" button that dispatches the job; job status (`pending`, `running`, `completed`, `failed`) visible via polling of `ai_jobs`
- BullMQ queue backed by Upstash Redis; env var `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN` consumed from `.env`
- Built `dist/` contains no `amazon.com` or `ssl-images-amazon.com` URLs (all images are local or Unsplash placeholders in S01)
- `tsc --noEmit` passes for `packages/agents` after T03

## Proof Level

- This slice proves: real Astro build produces a browsable `dist/` from all three templates with fixture data
- Real runtime required: yes — Astro `build()` must produce actual HTML/CSS; BullMQ job must run and write `ai_jobs`
- Human/UAT required: yes — browse the built site in a real browser to confirm rendering, routing, and affiliate link structure

## Verification

- `cd apps/generator && npx astro check` exits 0 (type-check Astro components)
- `pnpm --filter @monster/generator build` exits 0 for each of the three templates (run sequentially via a fixture script)
- Open `file:///home/daniel/monster-work/gsd/M003/S01/apps/generator/.generated-sites/<slug>/dist/index.html` in browser — homepage renders with styled layout, category grid, and product cards
- Navigate to `/categories/<slug>/` — renders category page with product grid and SEO text placeholder
- Navigate to `/products/<slug>/` — renders product page with image placeholder and affiliate link containing `?tag=`
- Navigate to `/privacidad/` (or language equivalent) — legal page renders
- Trigger "Generate Site" from admin panel site detail → poll `ai_jobs` in Supabase → status transitions to `completed`

## Observability / Diagnostics

- Runtime signals: `ai_jobs.status` transitions (`pending → running → completed | failed`), `ai_jobs.error` set on failure, `ai_jobs.payload` stores `{ phase, slug }` for in-flight state
- Inspection surfaces: Supabase dashboard → `ai_jobs` table; pm2 logs `pm2 logs monster-admin`; worker logs to stdout with `[GenerateSiteJob]` prefix
- Failure visibility: unhandled build errors caught in job worker try/catch, written to `ai_jobs.error` with stack summary; `ai_jobs.started_at` + `completed_at` timestamps available
- Redaction constraints: no secrets in `ai_jobs` payload

## Integration Closure

- Upstream surfaces consumed: `packages/shared` (`SiteCustomization`, `AMAZON_MARKETS`, `Language`, `SiteTemplate`), `packages/db` (`createServiceClient`, `Database` types), Supabase `sites` table
- New wiring introduced: `apps/generator` (Astro project) ↔ `packages/agents` (BullMQ worker calls `build()` in generator project root) ↔ `apps/admin` (server action → BullMQ enqueue → `ai_jobs` poll)
- What remains: S02 replaces fixture products with real DataForSEO data + downloads real images

## Tasks

- [x] **T01: Scaffold `apps/generator` as a real Astro 5 + Tailwind v4 project** `est:1h`
  - Why: All template work depends on a working Astro project with the correct dep tree installed and `build()` exercised even once.
  - Files: `apps/generator/package.json`, `apps/generator/astro.config.ts`, `apps/generator/src/layouts/BaseLayout.astro`, `apps/generator/src/pages/index.astro`, `apps/generator/tsconfig.json`
  - Do: Install Astro 5, `@astrojs/tailwind`, `tailwindcss` v4, `sharp` in `apps/generator`. Configure `astro.config.ts` with `output: 'static'`, `outDir` pointing to `.generated-sites/<slug>/dist` (slug injected via env var `SITE_SLUG`). Write a minimal `BaseLayout.astro` with `define:vars` wiring CSS custom properties from `Astro.props.customization`. Write a stub `index.astro` page that imports the layout. Run `pnpm --filter @monster/generator build` with `SITE_SLUG=test` to confirm `dist/` is produced.
  - Verify: `pnpm --filter @monster/generator build` (with `SITE_SLUG=test`) exits 0 and `apps/generator/.generated-sites/test/dist/index.html` exists.
  - Done when: Astro build completes without error and produces HTML output.

- [x] **T02: Build all three template variants across all page types** `est:3h`
  - Why: This is the core R015 deliverable — three visually distinct templates covering every page type the generator must produce.
  - Files: `apps/generator/src/data/fixture/site.json`, `apps/generator/src/layouts/BaseLayout.astro`, `apps/generator/src/layouts/classic/Layout.astro`, `apps/generator/src/layouts/modern/Layout.astro`, `apps/generator/src/layouts/minimal/Layout.astro`, `apps/generator/src/pages/index.astro`, `apps/generator/src/pages/categories/[slug].astro`, `apps/generator/src/pages/products/[slug].astro`, `apps/generator/src/pages/[legal].astro`, `apps/generator/src/lib/data.ts`
  - Do:
    1. Define `site.json` fixture data contract: `{ site: { name, domain, market, language, currency, affiliate_tag, template_slug, customization }, categories: [{ id, name, slug, seo_text, category_image, keywords }], products: [{ id, asin, title, slug, current_price, images, rating, is_prime, detailed_description, pros_cons }] }`. Write `src/data/fixture/site.json` with representative ES-market fixture (2 categories, 4 products each).
    2. Write `src/lib/data.ts` — `loadSiteData(slug: string)` reads `src/data/<slug>/site.json` and returns typed data. Used in `getStaticPaths()`.
    3. Write `src/pages/index.astro` — dispatches to correct template layout based on `site.template_slug`. Renders hero section (Unsplash placeholder), category grid (2-3 cols), featured products strip.
    4. Write `src/pages/categories/[slug].astro` — `getStaticPaths()` returns one entry per category; renders category header, SEO text, product grid.
    5. Write `src/pages/products/[slug].astro` — `getStaticPaths()` returns one entry per product; renders product image (first in `images[]`, or Unsplash placeholder if empty), title, price, affiliate link (`https://www.amazon.{market_domain}/dp/{asin}?tag={affiliate_tag}`), pros/cons, description.
    6. Write `src/pages/[legal].astro` — `getStaticPaths()` returns entries for `privacidad`, `aviso-legal`, `cookies`, `contacto` (slug varies with language; for now hardcode ES slugs, note in code where i18n will extend this); renders static legal boilerplate paragraphs.
    7. Implement three template layouts (Classic: sidebar-style nav; Modern: wide hero + card grid; Minimal: clean typography, tight spacing) — each applies `define:vars` for `--primary`, `--accent`, `--font` CSS custom properties from `site.customization`.
    8. Verify affiliate link structure: product pages must render `href` containing `?tag=` from the fixture `affiliate_tag`.
  - Verify: `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0; `dist/` contains `index.html`, `categories/freidoras/index.html`, `products/philips-hd9252/index.html`, `privacidad/index.html`; `grep "?tag=" dist/products/philips-hd9252/index.html` returns a match; `npx astro check` (in generator dir) exits 0.
  - Done when: All four page types render for each of the three templates; affiliate link structure is correct; Astro type-check passes.

- [x] **T03: Wire BullMQ job worker + admin "Generate Site" trigger** `est:2h`
  - Why: The slice demo requires end-to-end flow from admin button click → job → built site. Also closes the `ai_jobs` observability contract.
  - Files: `packages/agents/src/jobs/generate-site.ts`, `packages/agents/src/queue.ts`, `packages/agents/src/index.ts`, `packages/agents/package.json`, `packages/agents/tsconfig.json`, `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`, `.env`
  - Do:
    1. Add `bullmq` and `ioredis` deps to `packages/agents/package.json`. Add `@monster/db`, `@monster/shared` as workspace deps. Configure `tsup` build (`src/index.ts` → `dist/`).
    2. Write `src/queue.ts` — creates a BullMQ `Queue` named `generate` backed by Upstash Redis (use `ioredis` with `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN`). Export `generateQueue`.
    3. Write `src/jobs/generate-site.ts` — `GenerateSiteJob` `Worker` on queue `generate`. Steps: (a) read site row from Supabase via `createServiceClient()`; (b) upsert `ai_jobs` row with `status: 'running'`, `started_at: now()`; (c) assemble fixture categories + products (S01 only — real DataForSEO fetch is S02); (d) write `apps/generator/src/data/<slug>/site.json`; (e) call Astro `build()` programmatically from `apps/generator/astro.config.ts` root (use `build({ root: generatorRoot })`); (f) update `ai_jobs` to `status: 'completed'`, `completed_at: now()`; wrap in try/catch → on error write `status: 'failed'`, `error: err.message`.
    4. Add `UPSTASH_REDIS_URL` and `UPSTASH_REDIS_TOKEN` to `.env` via `secure_env_collect`.
    5. In admin site detail page (`apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`): add "Generate Site" button that calls a server action `enqueueSiteGeneration(siteId)`. Server action imports `generateQueue` from `@monster/agents` and calls `generateQueue.add('generate-site', { siteId })`, then inserts an `ai_jobs` row with `status: 'pending'`.
    6. Below the button, add a "Job Status" section that fetches the latest `ai_jobs` row for the site (ordered by `created_at desc`) and displays status badge + timestamps. Add a 5-second `router.refresh()` auto-poll via a small client component when status is `pending` or `running`.
    7. Start the worker separately (not inline in Next.js process) — add a `worker.ts` entrypoint in `packages/agents` that instantiates `GenerateSiteJob`. Document the `node dist/worker.js` start command in a comment; the pm2 ecosystem entry is S04 scope.
  - Verify: `pnpm --filter @monster/agents build` exits 0; `tsc --noEmit` exits 0 in `packages/agents`; run worker (`node packages/agents/dist/worker.js`), click "Generate Site" in admin panel for a real site row, observe `ai_jobs` transitions in Supabase, confirm `apps/generator/.generated-sites/<slug>/dist/index.html` exists after job completes.
  - Done when: Full click-to-build flow works; `ai_jobs` shows `completed`; built `dist/` is browsable; `tsc --noEmit` passes.

## Files Likely Touched

- `apps/generator/package.json`
- `apps/generator/astro.config.ts`
- `apps/generator/src/layouts/BaseLayout.astro`
- `apps/generator/src/layouts/classic/Layout.astro`
- `apps/generator/src/layouts/modern/Layout.astro`
- `apps/generator/src/layouts/minimal/Layout.astro`
- `apps/generator/src/pages/index.astro`
- `apps/generator/src/pages/categories/[slug].astro`
- `apps/generator/src/pages/products/[slug].astro`
- `apps/generator/src/pages/[legal].astro`
- `apps/generator/src/lib/data.ts`
- `apps/generator/src/data/fixture/site.json`
- `packages/agents/package.json`
- `packages/agents/tsconfig.json`
- `packages/agents/src/queue.ts`
- `packages/agents/src/jobs/generate-site.ts`
- `packages/agents/src/index.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`
- `.env`
