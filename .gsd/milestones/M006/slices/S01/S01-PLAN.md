# S01: Worker Fix + Refresh Job Scaffold + Cron Scheduler

**Goal:** `monster-worker` starts without ERR_MODULE_NOT_FOUND, `ProductRefreshJob` runs on BullMQ on a configurable schedule (default 48h per site), fetches DataForSEO product data for a live site, writes `last_refreshed_at` to DB, and the admin panel site detail shows "Last refreshed: X hours ago" with a working "Refresh Now" button.

**Demo:** Trigger "Refresh Now" from the site detail page → pm2 logs show `[ProductRefreshJob] site <id> fetch_products complete` → site detail refreshes showing "Last refreshed: X minutes ago". `pm2 logs monster-worker` shows `[worker] ProductRefreshJob scheduler registered`.

## Must-Haves

- `node-ssh` added to `packages/agents` dependencies — `monster-worker` boots cleanly, no ERR_MODULE_NOT_FOUND
- DB migration adds `sites.last_refreshed_at`, `sites.refresh_interval_hours`, `sites.next_refresh_at`
- `productRefreshQueue()` singleton + `createProductRefreshQueue()` factory in `packages/agents/src/queue.ts`
- `ProductRefreshJob` class: BullMQ worker on `product-refresh` queue, calls DataForSEOClient, writes `tsa_products.last_checked_at`, writes `sites.last_refreshed_at` and `sites.next_refresh_at`
- Product refresh scheduler registered on worker startup with stable jobId `product-refresh-scheduler-<siteId>` per site (or a global scheduler enqueuing per-site jobs) — logged to console
- `enqueueProductRefresh(siteId)` server action in `apps/admin`
- "Product Refresh" card in site detail page: "Last refreshed: X hours ago" (or "Never") + "Refresh Now" button
- `pnpm --filter @monster/agents build` exits 0; `tsc --noEmit` exits 0 across affected packages

## Proof Level

- This slice proves: integration (real DataForSEO call, real DB writes, pm2 worker online)
- Real runtime required: yes (pm2 worker must boot; DataForSEO fetch logged)
- Human/UAT required: yes (click "Refresh Now" in admin panel, verify pm2 logs, verify timestamp shown)

## Verification

- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/agents typecheck` exits 0
- `pnpm --filter apps/admin typecheck` exits 0
- `pm2 start ecosystem.config.js` → `pm2 logs monster-worker --nostream --lines 20` contains `[worker] ProductRefreshJob scheduler registered` and no ERR_MODULE_NOT_FOUND
- `pm2 describe monster-worker` shows status `online`, 0 restarts
- Manual: navigate to a site detail page, click "Refresh Now", see job enqueued, pm2 logs show `[ProductRefreshJob]` lines, `sites.last_refreshed_at` updated in DB

## Observability / Diagnostics

- Runtime signals: `[ProductRefreshJob] site <id> phase=fetch_products started/complete`, `[ProductRefreshJob] site <id> fetched <N> products`, `[ProductRefreshJob] site <id> last_refreshed_at updated`, `[worker] ProductRefreshJob scheduler registered`
- Inspection surfaces: `pm2 logs monster-worker`, Supabase `sites` table `last_refreshed_at` column, BullMQ `product-refresh` queue in Redis
- Failure state exposed: job `status='failed'` with error message in pm2 logs; DataForSEO auth failure logged with email prefix (never full credential)
- Redaction constraints: DataForSEO `email:password` credential must never appear in logs — log only the email portion or a redacted marker

## Integration Closure

- Upstream surfaces consumed: `DataForSEOClient.searchProducts()` (existing), `createServiceClient()` from `@monster/db`, `generateQueue()` (existing pattern to follow)
- New wiring introduced: `productRefreshQueue()` exported from `packages/agents/src/index.ts`; `ProductRefreshJob` registered in `worker.ts` alongside existing jobs; `enqueueProductRefresh` server action wired into site detail page
- What remains before the milestone is truly usable end-to-end: S02 (diff engine + conditional rebuild + alert creation), S03 (dashboard alert surface + alert resolution UI)

## Tasks

- [x] **T01: node-ssh fix + DB migration + queue infrastructure** `est:45m`
  - Why: Unblocking risk — worker won't start until `node-ssh` is resolvable; DB columns and queue factory are required foundations for T02
  - Files: `packages/agents/package.json`, `packages/agents/src/queue.ts`, `packages/db/supabase/migrations/20260314000003_refresh.sql`
  - Do: Add `"node-ssh": "^13.2.1"` to `packages/agents` dependencies; add `createProductRefreshQueue()` + `productRefreshQueue()` singleton to `queue.ts`; export both from `index.ts`; write migration adding `last_refreshed_at timestamptz`, `refresh_interval_hours int4 default 48`, `next_refresh_at timestamptz` to `sites`; run `pnpm install` to update lockfile; build to confirm no ERR_MODULE_NOT_FOUND
  - Verify: `pnpm --filter @monster/agents build` exits 0; `pm2 restart monster-worker && pm2 describe monster-worker` shows online with 0 restarts
  - Done when: worker process starts cleanly; `productRefreshQueue` importable from `@monster/agents`

- [x] **T02: ProductRefreshJob — DataForSEO fetch + DB writes + worker wiring** `est:1.5h`
  - Why: Core job logic — fetches DataForSEO product data for a site using the existing `DataForSEOClient.searchProducts()`, writes `tsa_products.last_checked_at`, writes `sites.last_refreshed_at` + `sites.next_refresh_at`, and registers a per-site-global scheduler on worker startup
  - Files: `packages/agents/src/jobs/product-refresh.ts` (new), `packages/agents/src/worker.ts`, `packages/agents/src/queue.ts` (already updated in T01)
  - Do: Implement `ProductRefreshJob` class following `AnalyticsAggregationJob` pattern — `register()` returns a BullMQ Worker on `product-refresh` queue; job handler fetches site record, reads niche + market + language, calls `DataForSEOClient.searchProducts(niche, market)`, upserts `tsa_products.last_checked_at = now()` for each ASIN found, writes `sites.last_refreshed_at = now()` and `sites.next_refresh_at = now() + interval hours`; add `registerScheduler(sites: Site[])` that upserts one BullMQ scheduler per live site (jobId `product-refresh-<siteId>`, cron derived from `refresh_interval_hours` — default `0 */48 * * *` but per-site configurable via `refresh_interval_hours`); wire into `worker.ts`: fetch live sites from DB, call `productRefreshJob.registerScheduler(liveSites)`, call `productRefreshJob.register()`; log `[worker] ProductRefreshJob scheduler registered (<N> sites)`; add `lockDuration: 300000` to Worker options
  - Verify: `pnpm --filter @monster/agents build` exits 0; `pnpm --filter @monster/agents typecheck` exits 0; `pm2 restart monster-worker && pm2 logs monster-worker --nostream --lines 30` shows scheduler registration line; manually enqueue a job via BullMQ and confirm pm2 logs show fetch phase logs
  - Done when: worker logs scheduler registration on startup; job runs end-to-end writing `last_refreshed_at` to DB

- [x] **T03: enqueueProductRefresh server action + admin panel refresh card** `est:1h`
  - Why: Makes the slice demoable — operator can trigger a refresh from the UI and see the timestamp update without touching the DB directly
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` (new)
  - Do: Add `enqueueProductRefresh(siteId: string)` to `actions.ts` — adds a job to `productRefreshQueue()` with `{ siteId }` payload (no `ai_jobs` row for now — simple fire-and-forget with returned BullMQ jobId); create `RefreshCard.tsx` as a `'use client'` component (D089 pattern) with a "Refresh Now" button that calls the server action via `useTransition`, shows spinner during pending, shows success message with jobId on completion; display `sites.last_refreshed_at` formatted as "Last refreshed: X minutes/hours ago" (or "Never refreshed" if null); import and render `RefreshCard` in `page.tsx` — pass `lastRefreshedAt={site.last_refreshed_at}` and `siteId={site.id}`; export `productRefreshQueue` from `packages/agents/src/index.ts` so the admin can import it
  - Verify: `pnpm --filter apps/admin typecheck` exits 0; admin panel site detail page renders the refresh card without error; clicking "Refresh Now" enqueues a job visible in pm2 logs; `sites.last_refreshed_at` is populated in DB after job completes
  - Done when: "Refresh Now" button works end-to-end from the browser; refresh timestamp visible in site detail card

## Files Likely Touched

- `packages/agents/package.json`
- `packages/agents/src/queue.ts`
- `packages/agents/src/index.ts`
- `packages/agents/src/jobs/product-refresh.ts` (new)
- `packages/agents/src/worker.ts`
- `packages/db/supabase/migrations/20260314000003_refresh.sql` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/RefreshCard.tsx` (new)
