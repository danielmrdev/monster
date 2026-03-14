# BuilderMonster

## What This Is

Single admin panel to manage the full lifecycle of a website portfolio: AI-assisted generation, deployment, SEO optimization, and continuous maintenance. The AI is the core engine — generates content, researches niches, scores SEO, recommends improvements, and keeps sites updated. Business model: self-operated portfolio (not SaaS). Evolution of the validated `tsa-monster` project (Laravel + FilamentPHP + Astro.js, TSA sites in production).

## Core Value

A working end-to-end pipeline: idea → niche research → site generated → deployed → ranking → earning. Everything else supports this loop.

## Current State

M001/S01 complete: monorepo scaffold with pnpm workspaces, all package directories created, worktree script ready.
M001/S02 complete: full Phase 1 schema applied to Supabase Cloud (21 tables, 7 migrations), TypeScript types generated (1218 lines) and committed to `packages/db/src/types/supabase.ts`. All 4 Supabase env vars in `.env`.
M001/S03 complete: `packages/db` exports typed Supabase client factories (createBrowserClient, createServiceClient) with Database generic + full type re-exports; `packages/shared` exports domain types and constants (AMAZON_MARKETS, SUPPORTED_LANGUAGES, SITE_STATUS_FLOW, REBUILD_TRIGGERS); both packages build cleanly to ESM + .d.ts; `apps/admin` resolves both via workspace:* with tsc --noEmit exit 0.
M001/S04 complete: Next.js 15 admin panel (`apps/admin`) builds cleanly and runs on port 3004. Supabase Auth wired end-to-end — middleware protects all 7 routes (getAll/setAll cookie interface, getUser()), login/logout server actions work, protected (dashboard) layout with dark sidebar nav renders all 7 sections (stubs). `pnpm build` and `tsc --noEmit` both exit 0.
M001/S05 complete: pm2 runs monster-admin on port 3004 (online, 0 restarts, HTTP 200). `ecosystem.config.js` uses correct script path (`node_modules/next/dist/bin/next`). `scripts/deploy.sh` handles full cycle: pull → install --frozen-lockfile → build → pm2 reload || start → pm2 save. `logs/` dir tracked with `.gitkeep`. Process list saved to `~/.pm2/dump.pm2`. `M001-SUMMARY.md` documents worktree, deploy, and pm2 protocols. **M001 Foundation milestone complete.** One manual step remaining: `pm2 startup systemd` (sudo required, documented).
M002/S01 complete: Sites CRUD fully operational — create/view/edit round-trips to Supabase via service role client. `SiteCustomizationSchema` in `packages/shared` (M003-ready). Server action pattern established (useActionState + 'use client' wrapper, return errors vs throw). Nav active state via NavItem client component. All 13 routes build cleanly. `tsc --noEmit` exits 0. Browser-based visual UAT pending (Playwright not executable on host).
M002/S02 complete: Dashboard KPIs live — four real Supabase count queries (total sites, live, draft, open alerts) fire in parallel via Promise.all, rendered as KPI cards. Replaces "Coming soon" stub. `tsc --noEmit` exits 0, build clean, pm2 reload clean, 307 on /dashboard confirms route healthy.
M002/S03 complete: Settings page fully operational — server component reads API keys from Supabase (masked last-4 display), saveSettings server action upserts with onConflict:'key' and { value: rawKey } JSON wrapper, client form uses useActionState with success/error banners. No raw key value in HTML source. Constants-in-sibling pattern established for 'use server' files (D034). `tsc --noEmit` exits 0, build clean, pm2 reload → 307 on /settings.
M002/S04 complete: Finances shell fully operational — addCost server action (Zod validation + Supabase insert + revalidatePath), CostForm client component (useActionState, native selects, success banner, per-field errors), /finances/page.tsx (parallel fetch of costs/categories/sites, cost list table with empty state, revenue placeholder card). All slice verification checks pass. **M002 Admin Panel MVP milestone complete.** M002-SUMMARY.md written.
M003/S01 complete: Astro 6 + Tailwind v4 generator in `apps/generator` with three templates (Classic, Modern, Minimal) across all page types (homepage, category, product, 4 legal). Data injection via `src/data/<slug>/site.json`. BullMQ worker in `packages/agents` reads site from Supabase, writes fixture site.json, calls Astro `build()` programmatically, tracks progress in `ai_jobs`. Admin panel "Generate Site" button + 5-second polling JobStatus component. Full click-to-dist flow verified: 11 pages built, affiliate links correct, no hotlinked images. `tsc --noEmit` and `pnpm -r build` both exit 0.
M003/S02 complete: Real DataForSEO Merchant API pipeline replacing fixture assembler. `DataForSEOClient` (task_post → poll → task_get, exponential backoff, credentials from Supabase settings). Sharp WebP image pipeline (`downloadAndConvertImage`, `processImages` with p-limit 5). `GenerateSiteJob` three-phase pipeline: fetch_products → process_images → build with `ai_jobs.payload` progress tracking. `tsa_categories`, `tsa_products`, `category_products` upserts with idempotent onConflict semantics. `SiteData` assembled from DB rows post-upsert. No Amazon CDN URLs in built HTML (enforced structurally). Known: Amazon CDN blocks Node.js User-Agent — images degrade gracefully to `[]`. `tsc --noEmit` and build both exit 0. Live end-to-end pending DataForSEO credentials in admin Settings.
M003/S03 complete: `ContentGenerator` class in `packages/agents` using `@anthropic-ai/sdk` + Zod v4 structured output. `CategoryContentSchema` and `ProductContentSchema` generate SEO texts, product descriptions, pros/cons, user opinion summaries, meta descriptions — all in the site's configured language. Idempotent (skips if `focus_keyword` non-null in DB), throttle-aware (1.5s sleep + maxRetries: 5). `generate_content` phase wired into `GenerateSiteJob` between `process_images` and `build`; `ai_jobs.payload` updated per item. `lockDuration: 300000` on BullMQ Worker. `SiteData` interfaces extended with `focus_keyword`/`meta_description`/`user_opinions_summary`; `BaseLayout.astro` emits `<meta name="description">` when populated. All three template layouts forward `metaDescription`. `tsc --noEmit`, `pnpm --filter @monster/agents build`, and `astro check` all exit 0. Key deviation: `zodOutputFormat` lives at `@anthropic-ai/sdk/helpers/zod` (D060). Category meta_description reuses `tsa_categories.description` column (D057); product meta_description in-memory only (D058).
M003/S04 complete: `@monster/seo-scorer` package with `scorePage(html, focusKeyword, pageType): SeoScore` — 8 weighted categories (content_quality 30%, meta_elements 20%, structure 15%, links 12%, media 8%, schema 8%, technical 5%, social 2%), legal page keyword exemption, Flesch null-safety, grade A–F. 8 unit tests all pass. Unique constraint migration `seo_scores_site_page_unique(site_id, page_path)` enables idempotent upserts. `score_pages` phase wired into `GenerateSiteJob` after Astro build (non-fatal per-page errors, batch upsert, ai_jobs.payload progress). SEO Scores card added to admin panel site detail page (server-side query, 12-column table, grade badges, empty state). All builds and typechecks pass. **M003 TSA Site Generator milestone code-complete.** Operational end-to-end validation (real job → seo_scores rows → ≥80% pages score ≥70) is the remaining milestone gate.

## Architecture / Key Patterns

- **Monorepo:** pnpm workspaces (`apps/admin`, `apps/generator`, `packages/*`)
- **Worktrees:** development happens in git worktrees (`/home/daniel/monster-work/gsd/M001/S01`). `/home/daniel/monster/` stays on `main` = production at all times.
- **Admin runtime:** pm2 on VPS1, added to existing ecosystem (`nous` ecosystem config as reference pattern)
- **DB:** Supabase Cloud. Schema: shared `sites` table + type-specific tables (`tsa_categories`, `tsa_products`). Migrations in `packages/db/supabase/migrations/`. Types generated via `supabase gen types`.
- **Site types:** extensible from day 1. Phase 1: TSA only. Future: AdSense blogs, multi-affiliate, lead gen.
- **Site delivery:** Astro.js static sites → rsync to VPS2 → Caddy serves → Cloudflare proxies (CDN + SSL + DDoS + CF-IPCountry)
- **AI agents:** Claude Agent SDK (Monster Chat, NicheResearcher) + Claude API via BullMQ (ContentGenerator). Plan Pro, throttle-aware, upgrade to Max when throughput demands it.
- **Analytics:** vanilla JS tracking script (~2KB) → POST direct to Supabase. Country from `CF-IPCountry` header (Cloudflare). Language from `navigator.language`.
- **Queue:** BullMQ + Upstash Redis
- **Rebuild strategy:** price/availability/image changes → immediate rebuild. Rating changes → deferred to next scheduled cycle.
- **Amazon revenue:** subtags per site + manual CSV import in Phase 1. Auto-sync API in Phase 2.
- **Focus keyword:** explicit field in DB (`focus_keyword`), generated by ContentGenerator, passed to SEO Scorer.

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Foundation — Monorepo, worktrees, DB schema, shared packages, admin shell on pm2
- [x] M002: Admin Panel MVP — Dashboard, Sites CRUD, Settings, Finances shell
- [x] M003: TSA Site Generator — Templates, pipeline, ContentGenerator, SEO Scorer (code-complete; operational validation pending)
- [ ] M004: Deployment + Cloudflare — rsync to VPS2, Cloudflare API, DNS/SSL automation, site lifecycle states
- [ ] M005: Analytics — Tracking script, Supabase ingestion, analytics dashboard
- [ ] M006: Product Refresh — Cron pipeline, diff strategy, conditional rebuild, product alerts
- [ ] M007: Monster Chat + Research Lab — Monster agent (streaming), NicheResearcher agent (autonomous)
- [ ] M008: Finances + Amazon Revenue — Cost tracking, Amazon CSV import, P&L dashboard
