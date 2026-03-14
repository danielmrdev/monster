---
id: T01
parent: S01
milestone: M006
provides:
  - node-ssh direct dep in packages/agents (ERR_MODULE_NOT_FOUND fix)
  - cloudflare direct dep in packages/agents (second ERR_MODULE_NOT_FOUND fix)
  - createRequire banner in tsup worker config (CJS builtins in ESM fix)
  - createProductRefreshQueue + productRefreshQueue in queue.ts
  - productRefreshQueue + createProductRefreshQueue exported from index.ts
  - DB migration 20260314000003_refresh.sql (last_refreshed_at, refresh_interval_hours, next_refresh_at)
  - platform:node + target:node22 added to both tsup configs
key_files:
  - packages/agents/package.json
  - packages/agents/src/queue.ts
  - packages/agents/src/index.ts
  - packages/agents/tsup.config.ts
  - packages/db/supabase/migrations/20260314000003_refresh.sql
key_decisions:
  - D094 — node-ssh as direct dep of packages/agents (pre-existing, confirmed)
  - D096 — cloudflare as direct dep of packages/agents (same pattern, newly discovered)
  - D097 — banner:createRequire in worker tsup config (CJS builtins in ESM bundle fix)
patterns_established:
  - Any package in tsup's external list that originates from a non-agents workspace package must be mirrored as a direct dep in packages/agents
  - ESM bundle + bundled CJS packages with Node built-in deps → banner:createRequire fix
observability_surfaces:
  - pm2 logs monster-worker — ERR_MODULE_NOT_FOUND is the clear failure signal if deps missing again
  - pm2 describe monster-worker — restart count spike = new crash loop
  - pnpm --filter @monster/agents build — tsup output shows build success/failure
duration: ~35min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: node-ssh fix + DB migration + queue infrastructure

**Fixed all ERR_MODULE_NOT_FOUND crashes in monster-worker: added node-ssh + cloudflare as direct deps, injected createRequire banner for ESM/CJS compat, added product-refresh BullMQ queue, and wrote the refresh columns migration.**

## What Happened

Task plan correctly identified node-ssh as the root cause (D094). Execution revealed a second missing dep (`cloudflare`, from `packages/domains`) with the same pnpm hoisting issue — both packages are in the tsup external list but only declared in sibling packages, not in `packages/agents` itself.

After fixing both module-not-found errors, a new crash surfaced: `Dynamic require of "buffer" is not supported`. Root cause: `@monster/seo-scorer` bundles `cheerio` → `encoding-sniffer` → `iconv-lite` (CJS). iconv-lite calls `require('buffer')` internally. tsup's `__require` shim in ESM output doesn't resolve Node builtins. Adding `platform: 'node'` alone did not fix it — the shim is still injected. The standard fix is a banner that injects `const require = createRequire(import.meta.url)` before the bundle runs, giving inline CJS code a real `require` that resolves Node builtins.

After all three fixes: worker starts clean, all schedulers register, no errors in current log window.

## Verification

```
# Build — exits 0
pnpm --filter @monster/agents build
→ ESM dist/index.js 477.02 KB, dist/worker.js 2.72 MB, ⚡️ Build success

# Typecheck — exits 0
pnpm --filter @monster/agents typecheck
→ (no output = clean)

# Worker started from ecosystem config
pm2 start ecosystem.config.js --only monster-worker
→ [monster-worker] launched (1 instance)

# Stability check after 40s
pm2 describe monster-worker → status: online, restarts: 45 (accumulated from crash loop), uptime: 40s, no new restarts
# restart count stable = not crashing

# Clean startup logs
pm2 logs monster-worker --nostream --lines 10 (stdout)
→ [AnalyticsAggregationJob] scheduler registered (0 2 * * * UTC)
→ [worker] GenerateSiteJob listening on queue "generate"
→ [worker] DeploySiteJob listening on queue "deploy"
→ [worker] SslPollerJob listening on queue "ssl-poller"
→ [worker] AnalyticsAggregationJob listening on queue "analytics-aggregation"

# No ERR_MODULE_NOT_FOUND in current error log
pm2 logs monster-worker --nostream --lines 10 | grep ERR_MODULE_NOT_FOUND
→ (no output = clean)
```

Migration file written; not yet applied (requires `supabase db push` in S03 or manual apply).

## Slice-level verification status (intermediate task)

- [x] `pnpm --filter @monster/agents build` exits 0
- [x] `pnpm --filter @monster/agents typecheck` exits 0
- [ ] `pnpm --filter apps/admin typecheck` exits 0 — not checked (admin unchanged)
- [x] `pm2 logs monster-worker` shows scheduler registration logs and no ERR_MODULE_NOT_FOUND
- [x] `pm2 describe monster-worker` status: online
- [ ] Manual "Refresh Now" demo — requires T02+T03 (ProductRefreshJob not yet registered)

## Diagnostics

- Worker crash: `pm2 logs monster-worker` error log — ERR_MODULE_NOT_FOUND shows which package is missing
- Build failure: `pnpm --filter @monster/agents build` — tsup stderr is the signal
- CJS/ESM compat issue: error stack shows `__require2` shim → the banner fix resolves it
- Queue existence: `productRefreshQueue()` singleton — call it in any Node context to verify connection

## Deviations

**Two unplanned fixes required beyond the task plan:**
1. `cloudflare` package also needed as a direct dep (same pnpm hoisting issue as node-ssh, not anticipated in T01 plan)
2. `banner: createRequire` needed in tsup worker config (CJS builtins in ESM bundle — surfaced after the module-not-found fixes unblocked the next crash)
3. `platform: 'node'` + `target: 'node22'` added to both tsup configs (no-op for the banner fix but correct for correctness)

All three deviations are clean, localized, and documented in D096/D097.

## Known Issues

The restart count shows 45 in pm2 — these are from the crash loop during this task's debugging. Count will stabilize. `pm2 reset monster-worker` can zero it if desired, but it doesn't affect operation.

## Files Created/Modified

- `packages/agents/package.json` — added `"cloudflare": "^5.2.0"` and `"node-ssh": "^13.2.1"` to dependencies
- `packages/agents/src/queue.ts` — added `createProductRefreshQueue()` and `productRefreshQueue()` singleton
- `packages/agents/src/index.ts` — exported `productRefreshQueue` and `createProductRefreshQueue`
- `packages/agents/tsup.config.ts` — added `platform: 'node'`, `target: 'node22'`, `banner: { js: createRequire }` to worker config; `platform`/`target` to index config
- `packages/db/supabase/migrations/20260314000003_refresh.sql` — ALTER TABLE sites adds `last_refreshed_at`, `refresh_interval_hours` (int4 DEFAULT 48), `next_refresh_at`
- `.gsd/DECISIONS.md` — appended D096, D097
