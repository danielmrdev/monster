---
estimated_steps: 8
estimated_files: 7
---

# T02: Wire deploy phase into `GenerateSiteJob` + add `DeploySiteJob` + `SslPollerJob`

**Slice:** S02 — Cloudflare Automation + Deploy Pipeline
**Milestone:** M004

## Description

The core orchestration task. Three job classes need to exist and cooperate:

1. **`GenerateSiteJob` deploy phase** — appended after `score_pages` (after the `finally` block restores `process.cwd()`). Runs rsync → Caddy → CF zone + A record → state transitions → SSL poller enqueue. Tracks progress in `ai_jobs` and persists audit trail in `deployments`.
2. **`DeploySiteJob`** — standalone job on queue `'deploy'` for re-deploys without full regeneration. Fetches site fresh and runs the same deploy steps.
3. **`SslPollerJob`** — delayed job on queue `'ssl-poller'`. Polls `CloudflareClient.pollSslStatus()`; transitions `dns_pending → ssl_pending → live`; re-enqueues itself up to 30 times (60s delay each).

Two new queue factories go into `queue.ts`. All three jobs register in `worker.ts`. `@monster/deployment` and `@monster/domains` are added as workspace deps to `@monster/agents`.

Key constraint: deploy phase runs **after** the `finally` block that restores `process.cwd()` (D049). The `process.chdir(prevCwd)` is in a `finally` block — the deploy phase must be placed after the try/finally, not inside the try block, so `process.cwd()` is guaranteed to be the monorepo root when `RsyncService` resolves its path.

## Steps

1. **Add workspace dependencies to `packages/agents/package.json`:** Add `@monster/deployment: "workspace:*"` and `@monster/domains: "workspace:*"` to `dependencies`. Run `pnpm install` to update lockfile. Also add `node-ssh` and `cloudflare` to the `external` list in `packages/agents/tsup.config.ts` (both tsup entries). Because `@monster/deployment` and `@monster/domains` are bundled into the agents bundle via `noExternal: [/@monster\/.*/]`, their native/large transitive deps (`node-ssh` for deployment, `cloudflare` for domains) must be externalized at the agents level to avoid bundling conflicts or bloat.

2. **Add queue factories to `packages/agents/src/queue.ts`:** Add `createDeployQueue()` + `deployQueue()` singleton and `createSslPollerQueue()` + `sslPollerQueue()` singleton, following the exact `createGenerateQueue()` / `generateQueue()` pattern. Queue names: `'deploy'` and `'ssl-poller'`. Export all four new functions.

3. **Implement `packages/agents/src/jobs/deploy-site.ts`:** Define `DeploySitePayload: { siteId: string }`. `DeploySiteJob.register()` creates a Worker on queue `'deploy'` with `lockDuration: 300000`. The worker body: fetch site from Supabase; validate `site.domain` is non-null (throw if null); run the full deploy sequence (steps identical to the deploy phase in GenerateSiteJob — extract a shared helper function `runDeployPhase(siteId, site, jobBullId, supabase)` to avoid duplication if practical, otherwise inline). Insert `ai_jobs` row `{job_type:'deploy_site', status:'running'}`. On failure: `ai_jobs.status='failed'`. On completion: `ai_jobs.status='completed'`.

4. **Implement `packages/agents/src/jobs/ssl-poller.ts`:** Define `SslPollerPayload: { siteId: string; cfZoneId: string; attempt: number }`. `SslPollerJob.register()` creates a Worker on queue `'ssl-poller'` with default lockDuration (short-lived job). Worker body: call `CloudflareClient.pollSslStatus(cfZoneId)`; if `'active'`: fetch current `sites.status`; if `dns_pending`, transition to `ssl_pending` then to `live` (two `SITE_STATUS_FLOW`-guarded updates); update `domains.dns_status = 'active'`; log success and return. If not active: if `attempt >= 30`: log timeout, set `sites.status = 'error'`, return; otherwise enqueue new job on `sslPollerQueue()` with `{ delay: 60000 }` and `{ siteId, cfZoneId, attempt: attempt + 1 }`. All console.log prefixed `[SslPollerJob]`.

5. **Extend `GenerateSiteJob` deploy phase in `generate-site.ts`:** After the `try/finally` block (i.e., after `process.chdir(prevCwd)` is guaranteed restored), before the final `ai_jobs` 'completed' update, add the deploy phase. Steps in order:
   - Check `site.domain` — if null, log warning and skip deploy phase entirely (don't fail the generate job; just skip with a note)
   - Insert `deployments` row: `{ site_id: siteId, status: 'running', created_at: now() }` → capture the row id
   - Update `ai_jobs` payload: `{ phase: 'deploy', done: 0, total: 3 }`
   - Read settings from Supabase: `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`, `cloudflare_api_token` (throw if any missing)
   - Guard transition `generating → deploying` via `SITE_STATUS_FLOW` → `supabase.from('sites').update({ status: 'deploying' })`
   - `RsyncService.deploy(slug, vps2Host, vps2User, vps2SitesRoot)` → update `ai_jobs` done:1
   - `CaddyService.writeVirtualhost(site.domain, slug, vps2Host, vps2User)` → update `ai_jobs` done:2
   - `CloudflareClient.ensureZone(site.domain)` → get `{ zoneId, nameservers }` → upsert `domains` row `{ site_id, domain, cf_zone_id: zoneId, cf_nameservers: nameservers, registrar: 'cloudflare', dns_status: 'pending' }` with `onConflict: 'domain'` (the `domain` column has a UNIQUE constraint in the schema)
   - `CloudflareClient.ensureARecord(zoneId, vps2Ip, site.domain)` → update `ai_jobs` done:3
   - Guard transition `deploying → dns_pending` → update `sites.status = 'dns_pending'`
   - Update `deployments` row: `{ status: 'succeeded', deployed_at: now(), duration_ms }`
   - Enqueue `SslPollerJob` on `sslPollerQueue()`: `{ siteId, cfZoneId: zoneId, attempt: 0 }` with `{ delay: 60000 }`
   - On any error in deploy phase: catch, update `deployments.status = 'failed'` + `error`, transition `sites.status = 'error'`, rethrow (so `ai_jobs` 'failed' handler fires)

6. **Register new jobs in `packages/agents/src/worker.ts`:** Import `DeploySiteJob` and `SslPollerJob`. Register both: `new DeploySiteJob().register()` and `new SslPollerJob().register()`. Add corresponding `worker.on('failed', ...)` handlers. Add graceful shutdown hooks for both new workers alongside the existing SIGTERM/SIGINT handlers.

7. **Export `deployQueue` from `packages/agents/src/index.ts`:** Add `export { deployQueue } from './queue.js'` alongside `generateQueue`. The admin panel's `enqueueSiteDeploy` action needs this import. Do not export `DeploySiteJob` itself (D048 pattern — keep job class internal to worker).

8. **Rebuild and verify:** `pnpm --filter @monster/agents build` exits 0. Check `dist/worker.js` size is reasonable (agents bundle now includes `@monster/deployment` and `@monster/domains`).

## Must-Haves

- [ ] `pnpm --filter @monster/agents build` exits 0 (with `node-ssh` and `cloudflare` added to tsup `external` list)
- [ ] `packages/agents/src/worker.ts` registers `GenerateSiteJob`, `DeploySiteJob`, `SslPollerJob`
- [ ] `packages/agents/src/queue.ts` exports `deployQueue` and `sslPollerQueue`
- [ ] `packages/agents/src/index.ts` exports `deployQueue` (for admin server action)
- [ ] Deploy phase in `GenerateSiteJob` runs **after** the `finally` block (cwd restored)
- [ ] `site.domain === null` skips deploy phase without failing the generate job
- [ ] `sites.status` transitions: `generating → deploying → dns_pending` on success; `→ error` on failure
- [ ] `deployments` row lifecycle: `running → succeeded` (or `failed`) with `deployed_at` + `duration_ms`
- [ ] `domains` row upserted with `cf_zone_id` + `cf_nameservers` after zone creation
- [ ] `SslPollerJob` gives up after 30 attempts (sets `sites.status = 'error'`); re-enqueues with 60s delay otherwise
- [ ] All console.log prefixed `[DeploySiteJob]` / `[SslPollerJob]` / `[GenerateSiteJob]` as appropriate

## Verification

```bash
# Build check
pnpm --filter @monster/agents build

# Structural checks
grep -E "DeploySiteJob|SslPollerJob" packages/agents/src/worker.ts
grep -E "deployQueue|sslPollerQueue" packages/agents/src/queue.ts
grep "deployQueue" packages/agents/src/index.ts
grep -E "deploy.*phase|dns_pending|SslPollerJob" packages/agents/src/jobs/generate-site.ts

# Deploy phase placement — must be after the Astro build try/finally
# Verify by reading generate-site.ts: deploy section should come after the closing brace of the finally block
grep -n "prevCwd\|deploy\|dns_pending" packages/agents/src/jobs/generate-site.ts

# Domains package in agents deps
grep "@monster/deployment\|@monster/domains" packages/agents/package.json

# node-ssh + cloudflare externalized in agents tsup config
grep -E "node-ssh|cloudflare" packages/agents/tsup.config.ts
```

## Observability Impact

- Signals added:
  - `[GenerateSiteJob] deploy phase: ...` for each step (rsync, caddy, CF zone, A record)
  - `[DeploySiteJob]` for standalone deploys
  - `[SslPollerJob] attempt N: status=pending|active` for each poll cycle
  - `deployments` table: per-deploy row with status, duration_ms, error
  - `sites.status` DB column: transitions are the canonical state machine signal
- How a future agent inspects this:
  - `ai_jobs` table filtered by `job_type IN ('generate_site','deploy_site')` + `payload.phase`
  - `deployments` table ordered by `created_at` — last row shows current deploy status
  - `sites.status` — authoritative pipeline state
  - `domains.cf_zone_id` + `cf_nameservers` — proves CF zone was created
- Failure state exposed: `deployments.error` text + `sites.status = 'error'` + `ai_jobs.error`; `SslPollerJob` logs attempt count on each retry

## Inputs

- `packages/agents/src/jobs/generate-site.ts` — primary extension point; deploy phase appended after existing score_pages phase and `process.chdir(prevCwd)` restoration
- `packages/agents/src/queue.ts` — add `createDeployQueue()`/`deployQueue()` and `createSslPollerQueue()`/`sslPollerQueue()` following existing pattern
- `packages/agents/src/worker.ts` — register new jobs before signal handlers
- `packages/deployment/src/index.ts` — `RsyncService`, `CaddyService` available after T01 dep added
- `packages/domains/dist/index.js` — `CloudflareClient` available after T01
- `packages/shared/src/constants/index.ts` — `SITE_STATUS_FLOW` for transition guards
- D049: deploy phase must run after `process.chdir(prevCwd)` in generate-site.ts
- D067: SslPollerJob as delayed re-enqueue, not blocking; D068: deploy phase inside GenerateSiteJob

## Expected Output

- `packages/agents/src/jobs/deploy-site.ts` — `DeploySiteJob` class (new)
- `packages/agents/src/jobs/ssl-poller.ts` — `SslPollerJob` class (new)
- `packages/agents/src/jobs/generate-site.ts` — extended with deploy phase
- `packages/agents/src/queue.ts` — `deployQueue()` + `sslPollerQueue()` added
- `packages/agents/src/worker.ts` — all three jobs registered
- `packages/agents/src/index.ts` — `deployQueue` exported
- `packages/agents/package.json` — `@monster/deployment` + `@monster/domains` added
- `packages/agents/tsup.config.ts` — `node-ssh` + `cloudflare` added to external list
