---
id: T02
parent: S02
milestone: M004
provides:
  - runDeployPhase() shared helper (rsync → Caddy → CF zone+A record → state transitions → SslPollerJob enqueue)
  - DeploySiteJob on queue 'deploy' (standalone redeploys)
  - SslPollerJob on queue 'ssl-poller' (delayed re-enqueue, 30-attempt limit, dns_pending → ssl_pending → live)
  - GenerateSiteJob deploy phase wired after score_pages (cwd restored before deploy runs — D049)
  - deployQueue() + sslPollerQueue() queue singletons exported from agents
  - worker.ts registers all three jobs with graceful SIGTERM/SIGINT shutdown
key_files:
  - packages/agents/src/jobs/deploy-site.ts
  - packages/agents/src/jobs/ssl-poller.ts
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/src/queue.ts
  - packages/agents/src/worker.ts
  - packages/agents/src/index.ts
  - packages/agents/package.json
  - packages/agents/tsup.config.ts
key_decisions:
  - runDeployPhase extracted as shared helper to avoid duplication between GenerateSiteJob and DeploySiteJob
  - deploy phase in GenerateSiteJob placed after score_pages (both are outside the Astro build try/finally) — D049 satisfied
  - SslPollerJob re-enqueues with { delay 60000 } up to 30 attempts; gives up with sites.status='error' on attempt 30
  - node-ssh and cloudflare added to tsup external list in both agents bundle entries to avoid bundling conflicts
  - SITE_STATUS_FLOW guard applied before every transition; transitions deploying→dns_pending and dns_pending→ssl_pending→live
patterns_established:
  - runDeployPhase(siteId, site, bullJobId, supabase) — reusable deploy orchestration callable from any job
  - SslPollerJob as delayed re-enqueue pattern (not blocking) — D067
  - deployments row lifecycle: insert running → update succeeded/failed with duration_ms
observability_surfaces:
  - "[DeployPhase] deploy phase: ..." logs per step (rsync, caddy, CF zone, A record, transitions, enqueue)
  - "[DeploySiteJob] ..." prefixed logs for standalone deploy jobs
  - "[SslPollerJob] attempt N/30: ssl_status=..." for every poll cycle
  - deployments table: per-deploy row with status, deployed_at, duration_ms, error
  - sites.status DB column: authoritative pipeline state (deploying → dns_pending → ssl_pending → live → error)
  - domains table: cf_zone_id + cf_nameservers populated after zone creation; dns_status='active' after SSL confirmed
  - ai_jobs.payload.phase: 'deploy' with done/total progress tracking
duration: 45m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Wire deploy phase into `GenerateSiteJob` + add `DeploySiteJob` + `SslPollerJob`

**Three job classes implemented and wired: deploy orchestration shared helper, standalone DeploySiteJob, delayed SslPollerJob, and deploy phase injected into GenerateSiteJob after score_pages.**

## What Happened

Added `@monster/deployment` and `@monster/domains` as workspace deps to `packages/agents`. Added `node-ssh` and `cloudflare` to the tsup `external` list for both bundle entries (index + worker) to avoid bundling conflicts from transitive deps.

Implemented `runDeployPhase()` as a shared helper in `deploy-site.ts` — handles the full deploy sequence: insert deployments row, read settings, SITE_STATUS_FLOW-guarded `generating → deploying` transition, rsync, Caddy virtualhost, CF zone + A record + domains row upsert, `deploying → dns_pending` transition, deployments row `succeeded` update, and SslPollerJob enqueue with 60s delay. On any failure: `deployments.status = 'failed'` + error text, `sites.status = 'error'`, rethrow.

`DeploySiteJob` wraps `runDeployPhase` as a standalone BullMQ worker on queue `'deploy'` with `lockDuration: 300000`. Inserts its own `ai_jobs` row (job_type `'deploy_site'`) before calling the helper.

`SslPollerJob` polls `CloudflareClient.pollSslStatus(cfZoneId)`. On `'active'`: two SITE_STATUS_FLOW-guarded transitions (`dns_pending → ssl_pending → live`), `domains.dns_status = 'active'`. On `'pending'`: re-enqueues itself with `{ delay: 60000, attempt: attempt + 1 }`. After 30 failed attempts: `sites.status = 'error'`.

Deploy phase wired into `GenerateSiteJob` after the score_pages section — both run outside the Astro build `try/finally` block, so `process.cwd()` is guaranteed to be monorepo root when `RsyncService` resolves paths.

`worker.ts` updated to register all three jobs with a shared graceful shutdown that closes all workers in parallel on SIGTERM/SIGINT.

## Verification

```bash
# Build — exits 0, worker.js ~2.8MB
pnpm --filter @monster/agents build

# Worker registration
grep -E "DeploySiteJob|SslPollerJob" packages/agents/src/worker.ts
# → all three imports + registrations present

# Queue exports
grep -E "deployQueue|sslPollerQueue" packages/agents/src/queue.ts
# → both factory + singleton functions present

# index.ts exports deployQueue
grep "deployQueue" packages/agents/src/index.ts
# → present

# Deploy phase placement
grep -n "prevCwd\|deploy\|dns_pending" packages/agents/src/jobs/generate-site.ts
# → prevCwd at line 529, finally restore at 535, deploy phase after score_pages at ~616

# Workspace deps
grep "@monster/deployment\|@monster/domains" packages/agents/package.json
# → both present

# Externalized deps
grep -E "node-ssh|cloudflare" packages/agents/tsup.config.ts
# → both external in both bundle entries
```

All checks passed.

## Diagnostics

Inspect failure state after a misconfigured deploy:
```bash
# Last deploy job error
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('ai_jobs').select('id,status,error,payload').eq('job_type','deploy_site').order('created_at',{ascending:false}).limit(1);
console.log(JSON.stringify(data, null, 2));
"
# Expected: status='failed', error non-null, payload.phase shows step

# Sites stuck in error after SSL timeout
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('sites').select('id,status').eq('status','error').limit(5);
console.log(JSON.stringify(data, null, 2));
"

# Deployment history
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('deployments').select('*').order('created_at',{ascending:false}).limit(3);
console.log(JSON.stringify(data, null, 2));
"
```

Log grep patterns:
- `grep "\[DeployPhase\]"` — per-step deploy progress
- `grep "\[SslPollerJob\] attempt"` — SSL poll cycle visibility

## Deviations

- Deploy phase log prefix is `[DeployPhase]` rather than `[GenerateSiteJob] deploy phase:` — this makes log filtering consistent when the same `runDeployPhase` helper is called from `DeploySiteJob`.

## Known Issues

None. The SslPollerJob `pollSslStatus` error path (CF API unreachable) treats errors as `'pending'` and re-enqueues — this is intentional resilience rather than a bug.

## Files Created/Modified

- `packages/agents/src/jobs/deploy-site.ts` — new: `runDeployPhase()` shared helper + `DeploySiteJob` class
- `packages/agents/src/jobs/ssl-poller.ts` — new: `SslPollerJob` class (delayed re-enqueue pattern)
- `packages/agents/src/jobs/generate-site.ts` — added `runDeployPhase` import + deploy phase after score_pages
- `packages/agents/src/queue.ts` — added `createDeployQueue()`/`deployQueue()` + `createSslPollerQueue()`/`sslPollerQueue()`
- `packages/agents/src/worker.ts` — registers all three jobs with parallel graceful shutdown
- `packages/agents/src/index.ts` — exports `deployQueue` + `createDeployQueue` for admin server actions
- `packages/agents/package.json` — added `@monster/deployment` + `@monster/domains` workspace deps
- `packages/agents/tsup.config.ts` — added `node-ssh` + `cloudflare` to external list (both entries)
