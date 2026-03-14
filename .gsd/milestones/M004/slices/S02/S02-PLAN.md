# S02: Cloudflare Automation + Deploy Pipeline

**Goal:** Clicking "Deploy" in the admin panel rsyncs the site to VPS2, creates a Cloudflare zone + A record, transitions `sites.status` through `deploying → dns_pending → ssl_pending → live`, and tracks the deployment in `deployments` and `ai_jobs`.

**Demo:** A site with a real domain gets deployed end-to-end: rsync transfers the Astro build to VPS2, Caddy gets its virtualhost, Cloudflare zone is created with an A record, and the admin panel shows the progression from `deploying` → `dns_pending` as the deploy job completes. Once NS propagates, `SslPollerJob` transitions `ssl_pending → live`. Settings now includes `cloudflare_api_token` and `vps2_ip`.

## Must-Haves

- `packages/domains` builds cleanly (`tsup` exits 0, `tsc --noEmit` exits 0)
- `CloudflareClient.ensureZone(domain)` idempotently creates/retrieves a Cloudflare zone; returns `{ zoneId, nameservers }`
- `CloudflareClient.ensureARecord(zoneId, vps2Ip, domain)` idempotently upserts an A record (proxied: true)
- `CloudflareClient.pollSslStatus(zoneId)` returns `'active' | 'pending'`
- DB migration `20260314000002_cf_nameservers.sql` adds `cf_nameservers text[]` to `domains` table; Supabase types regenerated
- `GenerateSiteJob` deploy phase runs after `score_pages`: rsync → Caddy → CF zone → A record → `sites.status` transitions (`generating → deploying → dns_pending`) → upsert `domains` row → insert/update `deployments` row → enqueue `SslPollerJob`
- `DeploySiteJob` handles standalone redeploys (without regeneration); registers in `worker.ts`
- `SslPollerJob` polls CF SSL status; transitions `dns_pending → ssl_pending → live`; re-enqueues itself with 60s delay; gives up after 30 retries (sets `status = 'error'`)
- Admin "Deploy" button enqueues `DeploySiteJob`; disabled with tooltip if `site.domain` is null
- `DeployStatus` client component polls `ai_jobs` for `job_type = 'deploy_site'`; displays current deployment state
- Deployment card on site detail shows `sites.status` + latest `deployments` row + CF nameservers (from `domains.cf_nameservers`)
- Settings UI adds `cloudflare_api_token` (password) + `vps2_ip` (text) keys
- `pnpm --filter @monster/domains build` exits 0
- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/admin build` exits 0

## Proof Level

- This slice proves: integration (live Cloudflare API + VPS2 SSH reachable) + operational (state machine persisted in Supabase, visible in admin panel)
- Real runtime required: yes (live CF API for zone/A record; live VPS2 for rsync + Caddy)
- Human/UAT required: yes (curl check for CF-RAY header once NS propagates; admin panel visual verification)

## Verification

```bash
# Contract verification — all must exit 0
pnpm --filter @monster/domains build
pnpm --filter @monster/domains typecheck
pnpm --filter @monster/agents build
pnpm --filter @monster/admin build

# Export check — CloudflareClient present
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.CloudflareClient))"
# Expected: function

# Worker registration check — all 3 queues registered
grep -E "GenerateSiteJob|DeploySiteJob|SslPollerJob" packages/agents/src/worker.ts

# Queue exports check
grep -E "deployQueue|sslPollerQueue" packages/agents/src/queue.ts

# Settings keys check
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/\(dashboard\)/settings/constants.ts

# DB migration present
ls packages/db/supabase/migrations/20260314000002_cf_nameservers.sql

# CF nameservers column in generated types
grep "cf_nameservers" packages/db/src/types/supabase.ts
```

Integration verification (human-run, requires live credentials):
- Enqueue a deploy job from admin panel → watch `sites.status` progress through `deploying → dns_pending`
- Verify `deployments` row inserted with `status = 'running'` → `succeeded`
- Verify `domains` row upserted with `cf_zone_id` and `cf_nameservers` populated
- After NS propagation: `curl -I https://<domain>` shows `CF-RAY` header

# Failure-path diagnostics check
```bash
# Inspect deploy failure state — verify error surfaces correctly in ai_jobs + deployments
# (run after a deliberately misconfigured deploy to confirm error is persisted, not swallowed)
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('ai_jobs').select('id,status,error,payload').eq('job_type','deploy_site').order('created_at',{ascending:false}).limit(1);
console.log(JSON.stringify(data, null, 2));
"
# Expected: last deploy_site job shows status='failed', error field non-null, payload.phase shows step where failure occurred

# SslPollerJob retry exhaust check — after 30 retries sites.status should be 'error'
node -e "
const { createServiceClient } = await import('@monster/db');
const db = createServiceClient();
const { data } = await db.from('sites').select('id,status').eq('status','error').limit(5);
console.log(JSON.stringify(data, null, 2));
"
# Expected: sites with exhausted SSL polling appear here with status='error'
```

## Observability / Diagnostics

- Runtime signals: `[DeploySiteJob]`, `[SslPollerJob]` prefixed console.log/error lines; `ai_jobs.payload.phase` tracks `deploying` progress; `deployments.status` tracks deploy attempt; `sites.status` tracks pipeline state
- Inspection surfaces:
  - `ai_jobs` table — `job_type = 'deploy_site'`, `payload.phase` shows rsync/caddy/cloudflare steps
  - `deployments` table — status + error + duration_ms
  - `domains` table — `cf_zone_id`, `cf_nameservers`, `dns_status`
  - `sites` table — `status` column
  - Admin panel site detail — Deployment card shows all of the above
- Failure visibility: deploy job `error` field in `ai_jobs`; `deployments.error` for infra failures; `SslPollerJob` sets `sites.status = 'error'` after 30 failed retries with timestamp
- Redaction: `cloudflare_api_token` never logged; read from Supabase settings at call time (D028 pattern)

## Integration Closure

- Upstream surfaces consumed: `RsyncService`, `CaddyService` from `@monster/deployment`; `vps2_host`/`vps2_user`/`vps2_sites_root` settings; `SITE_STATUS_FLOW` from `@monster/shared`; `generateQueue()` pattern from `packages/agents/src/queue.ts`; `enqueueSiteGeneration` + `JobStatus` pattern from admin
- New wiring introduced: `DeploySiteJob` on queue `'deploy'`; `SslPollerJob` on queue `'ssl-poller'`; deploy phase in `GenerateSiteJob`; `deployQueue()` + `sslPollerQueue()` exported from agents; `enqueueSiteDeploy()` + `getLatestDeployStatus()` server actions; `DeployStatus` client component
- What remains before milestone is truly usable end-to-end: S03 (Spaceship domain registration + NS update) completes R011; `curl -I https://<domain>` showing CF-RAY requires NS propagation (human wait, not code)

## Tasks

- [x] **T01: Set up `packages/domains` + `CloudflareClient`** `est:45m`
  - Why: `packages/domains` is a bare stub with no src, no build, no exports. `CloudflareClient` is the core primitive that S02 is built on — ensureZone, ensureARecord, pollSslStatus all live here. DB migration needed for `cf_nameservers` column.
  - Files: `packages/domains/src/cloudflare.ts`, `packages/domains/src/index.ts`, `packages/domains/tsup.config.ts`, `packages/domains/package.json`, `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql`, `packages/db/src/types/supabase.ts`
  - Do: Install `cloudflare` npm package + devDeps (`tsup`, `typescript`, `@types/node`) into `@monster/domains`. Also add `@monster/db` as workspace dep (for reading settings). Create `tsup.config.ts` mirroring `@monster/deployment` — ESM, dts:true, `external: ['cloudflare']`. Update `package.json` with `type: "module"`, proper `exports`, `scripts`. Implement `CloudflareClient` in `src/cloudflare.ts`: reads `cloudflare_api_token` from Supabase settings at call time (D028 pattern); `ensureZone(domain)` — list then create (D066); `ensureARecord(zoneId, vps2Ip, domain)` — list A records on `.result`, delete+recreate if content differs; `pollSslStatus(zoneId)` — `ssl.verification.get()`, return `'active'` if any has `certificate_status === 'active'`, else `'pending'` (empty array → `'pending'`). Write migration adding `cf_nameservers text[] DEFAULT '{}'` to domains. Run `pnpm --filter @monster/db generate-types` to update `supabase.ts`.
  - Verify: `pnpm --filter @monster/domains build` exits 0; `pnpm --filter @monster/domains typecheck` exits 0; `node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.CloudflareClient))"` prints `function`; `grep cf_nameservers packages/db/src/types/supabase.ts` shows the column
  - Done when: `packages/domains` builds with DTS, exports `CloudflareClient`, and `cf_nameservers` column is in generated Supabase types

- [x] **T02: Wire deploy phase into `GenerateSiteJob` + add `DeploySiteJob` + `SslPollerJob`** `est:1h`
  - Why: The deploy orchestration is the heart of S02. Three jobs + two new queues + deploy phase in the existing job all need to be implemented and wired together before the admin UI can surface anything useful.
  - Files: `packages/agents/src/jobs/generate-site.ts`, `packages/agents/src/jobs/deploy-site.ts`, `packages/agents/src/jobs/ssl-poller.ts`, `packages/agents/src/queue.ts`, `packages/agents/src/worker.ts`, `packages/agents/package.json`, `packages/agents/tsup.config.ts`
  - Do: Add `@monster/deployment` and `@monster/domains` as workspace deps to `packages/agents/package.json`. Verify `node-ssh` stays in agents tsup external list (already there via `packages/deployment` external). Add `createDeployQueue()` + `deployQueue()` singleton + `createSslPollerQueue()` + `sslPollerQueue()` to `queue.ts` following `createGenerateQueue()` pattern. Extend `GenerateSiteJob` with a `deploy` phase after the `finally` block that restores cwd — the phase must run after `process.chdir(prevCwd)` is guaranteed (D049). Phase steps: (1) upsert `deployments` row `{status:'running', created_at:now()}`; update `ai_jobs` `{phase:'deploy',done:0,total:3}`; (2) read `vps2_host`,`vps2_user`,`vps2_sites_root`,`vps2_ip`,`cloudflare_api_token` from settings; validate `site.domain` is non-null (throw if null); transition `sites.status`: `generating→deploying` via `SITE_STATUS_FLOW`; (3) `RsyncService.deploy()`; update `ai_jobs` done:1; transition `deploying→deploying` (same — just log); (4) `CaddyService.writeVirtualhost()`; update `ai_jobs` done:2; (5) `CloudflareClient.ensureZone(domain)` → upsert `domains` row with `cf_zone_id`+`cf_nameservers`; `CloudflareClient.ensureARecord()`; update `ai_jobs` done:3; transition `deploying→dns_pending`; (6) update `deployments` row `{status:'succeeded',deployed_at:now(),duration_ms}`; (7) enqueue `SslPollerJob` on `'ssl-poller'` queue with `{delay:60000}`; on deploy phase error: update `deployments.status='failed'`+`error`, transition `→error`. Implement `DeploySiteJob` — standalone job on queue `'deploy'`: same deploy steps as above but reads site fresh from DB; no generation phases before it. Implement `SslPollerJob` on queue `'ssl-poller'`: reads `siteId` + `attempt` from payload; fetches `domains` row to get `cf_zone_id`; calls `pollSslStatus()`; if `'active'`: transition `dns_pending→ssl_pending→live` (two transitions), update `domains.dns_status='active'`; if not active + attempt < 30: re-enqueue self with `{delay:60000, attempt:attempt+1}`; if attempt >= 30: set `sites.status='error'`. Register `DeploySiteJob` and `SslPollerJob` in `worker.ts` before the signal handlers.
  - Verify: `pnpm --filter @monster/agents build` exits 0; `grep -E "DeploySiteJob|SslPollerJob" packages/agents/src/worker.ts` shows both registered; `grep -E "deployQueue|sslPollerQueue" packages/agents/src/queue.ts` shows both exports; `grep -E "deploy.*phase|dns_pending|ssl_pending" packages/agents/src/jobs/generate-site.ts` confirms deploy phase wiring
  - Done when: All three jobs build cleanly; deploy phase wired in `GenerateSiteJob`; `worker.ts` registers all three; queue factories exported

- [x] **T03: Admin "Deploy" button + deployment status card + Settings UI** `est:45m`
  - Why: The pipeline is only useful if the admin panel can trigger it and display its state. This task closes the user-facing loop by wiring the "Deploy" button, the DeployStatus polling component, and the new settings keys.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(dashboard)/settings/constants.ts`, `apps/admin/src/app/(dashboard)/settings/actions.ts`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
  - Do: Add `deployQueue` export to `packages/agents/src/index.ts` (alongside `generateQueue`). In `actions.ts`: add `enqueueSiteDeploy(siteId)` — mirrors `enqueueSiteGeneration` but `job_type: 'deploy_site'`, enqueues to `deployQueue()`; add `getLatestDeployStatus(siteId)` — same pattern as `getLatestJobStatus` but filters `job_type = 'deploy_site'`; add `getDeploymentCard(siteId)` — fetches `sites.status`, latest `deployments` row, and `domains` row (with `cf_nameservers`) for the card. Create `DeployStatus.tsx` — clone of `JobStatus.tsx` but uses `getLatestDeployStatus`; shows phase progress from `payload.phase` when running. In `page.tsx`: fetch `domains` row for the site; add "Deploy" button next to "Generate Site" — disabled with `title="Set a domain first"` if `site.domain` is null; add `<DeployStatus siteId={site.id} />` below the deploy button; add "Deployment" card showing `sites.status` badge + latest `deployments` row (status, deployed_at, duration_ms, error) + CF nameservers list (from `domains.cf_nameservers`). Settings 3-file touch: add `cloudflare_api_token` and `vps2_ip` to `SETTINGS_KEYS` constant; extend `SaveSettingsSchema` and `SaveSettingsErrors`; add "Cloudflare" card in `settings-form.tsx` with `cloudflare_api_token` (password input) and `vps2_ip` (text input).
  - Verify: `pnpm --filter @monster/admin build` exits 0; `grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/(dashboard)/settings/constants.ts`; `grep "deploy_site" apps/admin/src/app/(dashboard)/sites/\[id\]/actions.ts`; `grep "DeployStatus" apps/admin/src/app/(dashboard)/sites/\[id\]/page.tsx`
  - Done when: Admin build exits 0; Deploy button exists in site detail (disabled when domain=null); DeployStatus component polls correctly; Cloudflare settings card renders with 2 new keys

## Files Likely Touched

- `packages/domains/src/cloudflare.ts` (new)
- `packages/domains/src/index.ts` (new)
- `packages/domains/tsup.config.ts` (new)
- `packages/domains/package.json`
- `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql` (new)
- `packages/db/src/types/supabase.ts`
- `packages/agents/src/jobs/generate-site.ts`
- `packages/agents/src/jobs/deploy-site.ts` (new)
- `packages/agents/src/jobs/ssl-poller.ts` (new)
- `packages/agents/src/queue.ts`
- `packages/agents/src/worker.ts`
- `packages/agents/src/index.ts`
- `packages/agents/package.json` (add @monster/deployment + @monster/domains deps)
- `packages/agents/tsup.config.ts` (add node-ssh + cloudflare to external)
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/constants.ts`
- `apps/admin/src/app/(dashboard)/settings/actions.ts`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
