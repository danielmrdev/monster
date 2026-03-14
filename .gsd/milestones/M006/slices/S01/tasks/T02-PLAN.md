---
estimated_steps: 7
estimated_files: 3
---

# T02: ProductRefreshJob — DataForSEO fetch + DB writes + worker wiring

**Slice:** S01 — Worker Fix + Refresh Job Scaffold + Cron Scheduler
**Milestone:** M006

## Description

Implements the `ProductRefreshJob` BullMQ job class. The job's responsibility in S01 is the `fetch_products` phase only: it fetches current product data from DataForSEO using the site's niche/market, upserts `tsa_products.last_checked_at = now()` for each ASIN found, and writes `sites.last_refreshed_at` + `sites.next_refresh_at`. Diff engine and alert creation are S02.

The scheduler model: `registerScheduler(sites)` is called on worker startup with all `live` sites. It upserts one BullMQ job scheduler per site with a cron expression derived from `refresh_interval_hours`. Default is 48 hours → cron `0 0 */2 * *`. The scheduler uses a stable jobId `product-refresh-scheduler-<siteId>` so restarts don't create duplicates (D082 pattern from analytics scheduler).

Key constraints:
- `lockDuration: 300000` (5 min) on the BullMQ Worker — DataForSEO calls can take 30-60s including polling (D059 pattern)
- DataForSEO credential read from Supabase `settings` table (D050) — not from `.env`
- Log only the email prefix of the DataForSEO credential, never the full `email:password` string
- Phase tracking: log `[ProductRefreshJob] site <id> phase=fetch_products started` and `complete`
- Queue name: `product-refresh` (matches the Worker name in BullMQ)

## Steps

1. Create `packages/agents/src/jobs/product-refresh.ts`. Define `ProductRefreshPayload { siteId: string }` interface.

2. Implement the BullMQ `handler` function:
   - Fetch site record from Supabase: `id, niche, market, language, refresh_interval_hours`
   - If site not found, log and return (non-fatal — site may have been deleted)
   - Instantiate `DataForSEOClient` and call `searchProducts(niche, market)` — use the existing client as-is (it reads credentials from Supabase `settings` table internally)
   - Log `[ProductRefreshJob] site <id> phase=fetch_products started`
   - On success, log `[ProductRefreshJob] site <id> fetched <N> products`
   - For each product returned: upsert `tsa_products` row matching `(site_id, asin)` — update `last_checked_at = now()`. Use `onConflict: 'site_id,asin'` with `ignoreDuplicates: false` and only update `last_checked_at` (do NOT overwrite `title`, `price`, `images`, etc. in S01 — that's S02 diff logic)
   - Write `sites.last_refreshed_at = now()` and `sites.next_refresh_at = now() + refresh_interval_hours * interval '1 hour'` via Supabase update
   - Log `[ProductRefreshJob] site <id> phase=fetch_products complete, last_refreshed_at updated`

3. Implement `ProductRefreshJob` class:
   - `register()` method: creates BullMQ Worker on queue `product-refresh` with `handler`, `connection: createRedisConnection()`, `lockDuration: 300000`
   - `registerScheduler(sites: Array<{ id: string; refresh_interval_hours: number | null }>)` method: for each site, derive cron from `refresh_interval_hours` (default 48 → `0 0 */2 * *`; 24 → `0 0 * * *`; other values → `0 0 */<hours> * *`); upsert scheduler with `createProductRefreshQueue()` + close (D087 pattern — fresh queue, close in finally)

4. Wire into `packages/agents/src/worker.ts`:
   - Import `ProductRefreshJob`
   - Fetch live sites from Supabase at startup: `supabase.from('sites').select('id, refresh_interval_hours').eq('status', 'live')`
   - Instantiate `ProductRefreshJob`, call `await productRefreshJob.registerScheduler(liveSites ?? [])`
   - Call `productRefreshJob.register()`
   - Add to graceful shutdown handlers
   - Log `[worker] ProductRefreshJob scheduler registered (<N> sites)`

5. Build `packages/agents` and verify typecheck passes.

6. Apply the DB migration to the running Supabase instance: `pnpm --filter @monster/db supabase db push` or apply via Supabase dashboard if CLI not configured.

7. Restart `monster-worker` and verify pm2 logs show scheduler registration.

## Must-Haves

- [ ] `packages/agents/src/jobs/product-refresh.ts` exists with `ProductRefreshJob` class
- [ ] `handler` fetches DataForSEO products, updates `tsa_products.last_checked_at`, writes `sites.last_refreshed_at` + `sites.next_refresh_at`
- [ ] `registerScheduler` upserts one BullMQ scheduler per site with stable jobId
- [ ] Worker wired: `ProductRefreshJob` registered, scheduler registration logged at startup
- [ ] `lockDuration: 300000` set on Worker
- [ ] DataForSEO credential never logged (email prefix only if needed)
- [ ] `pnpm --filter @monster/agents build` exits 0
- [ ] `pnpm --filter @monster/agents typecheck` exits 0
- [ ] `pm2 logs monster-worker --nostream --lines 30` shows `[worker] ProductRefreshJob scheduler registered`

## Verification

- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/agents typecheck` exits 0
- `pm2 restart monster-worker && pm2 logs monster-worker --nostream --lines 30` — contains `[worker] ProductRefreshJob scheduler registered`
- `pm2 describe monster-worker` — status `online`, 0 restarts

## Observability Impact

- Signals added: `[ProductRefreshJob] site <id> phase=fetch_products started/complete`, `[ProductRefreshJob] site <id> fetched <N> products`, `[ProductRefreshJob] site <id> last_refreshed_at updated`, `[worker] ProductRefreshJob scheduler registered (<N> sites)`
- How a future agent inspects this: `pm2 logs monster-worker --filter ProductRefreshJob`; query `SELECT last_refreshed_at, next_refresh_at FROM sites WHERE id = '<id>'`
- Failure state exposed: DataForSEO client throws → job fails → BullMQ marks failed → pm2 logs show error; Supabase write fails → logged with error message; site not found → logged and returned non-fatally

## Inputs

- T01 outputs: `productRefreshQueue()` / `createProductRefreshQueue()` in `queue.ts`; DB migration with `last_refreshed_at`, `refresh_interval_hours`, `next_refresh_at`
- `packages/agents/src/jobs/analytics-aggregation.ts` — scheduler pattern to follow (D087)
- `packages/agents/src/clients/dataforseo.ts` — `DataForSEOClient` and `searchProducts()` method signature
- `packages/agents/src/worker.ts` — existing structure to extend
- D050 — DataForSEO credentials from Supabase settings, not env
- D091 — ProductRefreshJob decouples from Astro build; no `process.chdir` needed in S01

## Expected Output

- `packages/agents/src/jobs/product-refresh.ts` — new file with full implementation
- `packages/agents/src/worker.ts` — extended with ProductRefreshJob wiring
- `monster-worker` pm2 process: online, scheduler registration line visible in logs
- Supabase `sites` table: `last_refreshed_at` populated after a manual test enqueue
