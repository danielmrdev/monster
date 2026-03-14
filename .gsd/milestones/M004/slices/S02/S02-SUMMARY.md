---
id: S02
parent: M004
milestone: M004
provides:
  - packages/domains bootstrapped with CloudflareClient (ensureZone, ensureARecord, pollSslStatus)
  - DB migration 20260314000002_cf_nameservers.sql adding cf_nameservers text[] to domains table
  - runDeployPhase() shared helper — rsync → Caddy → CF zone+A record → state transitions → SslPollerJob enqueue
  - DeploySiteJob on queue 'deploy' (standalone redeploys without regeneration)
  - SslPollerJob on queue 'ssl-poller' (delayed re-enqueue, 30-attempt limit, dns_pending → ssl_pending → live)
  - GenerateSiteJob deploy phase wired after score_pages (D049 cwd-restore guaranteed)
  - deployQueue() + sslPollerQueue() queue singletons exported from agents
  - worker.ts registers all three jobs with parallel graceful shutdown
  - enqueueSiteDeploy() + getLatestDeployStatus() + getDeploymentCard() server actions
  - DeployStatus.tsx client component (5s polling, phase progress display)
  - Deploy button in site detail (disabled with tooltip when site.domain is null)
  - Deployment card on site detail (pipeline status badge + latest deployments row + CF nameservers)
  - cloudflare_api_token and vps2_ip settings keys + Cloudflare card in Settings UI
requires:
  - slice: S01
    provides: RsyncService, CaddyService, vps2_host/vps2_user/vps2_sites_root settings
affects:
  - S03
key_files:
  - packages/domains/src/cloudflare.ts
  - packages/domains/src/index.ts
  - packages/domains/tsup.config.ts
  - packages/domains/package.json
  - packages/db/supabase/migrations/20260314000002_cf_nameservers.sql
  - packages/db/src/types/supabase.ts
  - packages/agents/src/jobs/deploy-site.ts
  - packages/agents/src/jobs/ssl-poller.ts
  - packages/agents/src/jobs/generate-site.ts
  - packages/agents/src/queue.ts
  - packages/agents/src/worker.ts
  - packages/agents/src/index.ts
  - packages/agents/package.json
  - packages/agents/tsup.config.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - D074: node-ssh and cloudflare externalized from agents tsup bundle (native addons + size)
  - D075: domains row upserted with onConflict:'domain' (UNIQUE constraint on domain column, not composite)
  - D076: cloudflare SDK v5 dns.records.list() name param is a Name object { exact: domain }, not a string
  - D077: runDeployPhase() extracted as shared helper to avoid duplication between GenerateSiteJob and DeploySiteJob
  - D078: SslPollerJob treats pollSslStatus errors as 'pending' and re-enqueues (intentional resilience)
patterns_established:
  - runDeployPhase(siteId, site, bullJobId?, supabase) — reusable deploy orchestration callable from any job
  - SslPollerJob as delayed re-enqueue pattern with attempt counter (D067)
  - deployments row lifecycle: insert running → update succeeded/failed with duration_ms
  - 3-file settings touch: constants.ts → actions.ts (schema + errors) → settings-form.tsx (UI card) — D034
observability_surfaces:
  - "[DeployPhase] deploy phase: ..." — per-step deploy progress (rsync, caddy, CF zone, A record, transitions)
  - "[DeploySiteJob] ..." — standalone deploy job logs
  - "[SslPollerJob] attempt N/30: ssl_status=..." — every poll cycle visible
  - "[CloudflareClient] ensureZone/ensureARecord/pollSslStatus: ..." — CF API interaction logs
  - ai_jobs.payload.phase — 'deploy' with done/total progress tracking
  - deployments table — per-deploy row with status, deployed_at, duration_ms, error
  - sites.status — authoritative pipeline state (deploying → dns_pending → ssl_pending → live → error)
  - domains table — cf_zone_id + cf_nameservers populated after zone creation; dns_status='active' after SSL confirmed
  - Admin panel Deployment card — SSR snapshot of all of the above
drill_down_paths:
  - .gsd/milestones/M004/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S02/tasks/T03-SUMMARY.md
duration: ~2h 15m
verification_result: passed
completed_at: 2026-03-14
---

# S02: Cloudflare Automation + Deploy Pipeline

**Clicking "Deploy" in the admin panel now triggers a complete infra pipeline: rsync to VPS2, Caddy virtualhost, Cloudflare zone + A record, and tracks the site through `deploying → dns_pending → ssl_pending → live` with all state persisted in Supabase and surfaced in the UI.**

## What Happened

### T01: packages/domains + CloudflareClient

`packages/domains` was a bare stub. Bootstrapped it from scratch: installed `cloudflare` npm package + devDeps (`tsup`, `typescript`, `@types/node`), added `@monster/db` as workspace dep, created `tsup.config.ts` mirroring `@monster/deployment` (ESM, `dts:true`, `external:['cloudflare']`), updated `package.json` to `type:"module"` with correct exports and scripts.

Implemented `CloudflareClient` following the D028 credential pattern: `fetchApiToken()` reads `cloudflare_api_token` from Supabase settings at call time, never cached. Three public methods:
- `ensureZone(domain)` — `zones.list({ name: domain })` for idempotent lookup, `zones.create()` on miss
- `ensureARecord(zoneId, vps2Ip, domain)` — list with `{ exact: domain }` Name object filter, skip if content matches, delete+recreate if stale
- `pollSslStatus(zoneId)` — `ssl.verification.get()`, returns `'active'` if any entry has `certificate_status === 'active'`, `'pending'` otherwise

Key discovery: the Cloudflare SDK v5 `dns.records.list()` `name` param is a `Name` object `{ exact, contains, ... }`, not a bare string (D076). Task plan pseudocode was wrong on this point.

DB migration adds `cf_nameservers text[] DEFAULT '{}'` to `domains` table. Supabase types manually updated (remote DB reachable only via IPv6 — no psql/docker access from dev host). Migration must be applied via Supabase dashboard before the first deploy job writes to `domains.cf_nameservers`.

### T02: Job wiring — GenerateSiteJob + DeploySiteJob + SslPollerJob

Added `@monster/deployment` and `@monster/domains` as workspace deps to `packages/agents`. Added `node-ssh` and `cloudflare` to the tsup external list for both bundle entries (D074 — native addons + bundle size).

`runDeployPhase()` extracted as a shared helper (D077) in `deploy-site.ts` — handles the full sequence: insert `deployments` row, read settings, `generating → deploying` SITE_STATUS_FLOW-guarded transition, rsync, Caddy virtualhost, CF zone + A record, `domains` row upsert (`onConflict:'domain'` — D075), `deploying → dns_pending` transition, `deployments` row update to `succeeded`, and `SslPollerJob` enqueue with 60s delay. On any failure: `deployments.status='failed'` + error text, `sites.status='error'`, rethrow.

`DeploySiteJob` wraps `runDeployPhase` as a standalone BullMQ worker on queue `'deploy'` with `lockDuration:300000`. Creates its own `ai_jobs` row before calling the helper.

`SslPollerJob` polls `pollSslStatus(cfZoneId)`. On `'active'`: two guarded transitions (`dns_pending → ssl_pending → live`), `domains.dns_status='active'`. On `'pending'`: re-enqueues with delay (D067). Errors treated as `'pending'` for resilience (D078). After 30 attempts: `sites.status='error'`.

Deploy phase wired into `GenerateSiteJob` after `score_pages` — outside the Astro `try/finally` block so `process.cwd()` is guaranteed to be monorepo root (D049).

`worker.ts` updated to register all three jobs with parallel graceful shutdown on SIGTERM/SIGINT.

### T03: Admin UI — Deploy button + status card + Settings

Six files touched following the slice plan in order:

- `actions.ts` — `enqueueSiteDeploy()` (mirrors `enqueueSiteGeneration`), `getLatestDeployStatus()` (job_type filter), `getDeploymentCard()` (parallel Promise.all for sites + deployments + domains)
- `DeployStatus.tsx` — clone of `JobStatus.tsx` + phase progress display (`Phase: X (done/total)` when running)
- `page.tsx` — Deploy button (disabled with tooltip when `site.domain` is null), Deployment card (pipeline status badge + latest deployments row + CF nameservers list), `<DeployStatus>` for live polling; refactored SSR fetches to `Promise.all`
- `settings/constants.ts` — `cloudflare_api_token` and `vps2_ip` added to `SETTINGS_KEYS`
- `settings/actions.ts` — both keys added to `SaveSettingsSchema` + `SaveSettingsErrors`
- `settings/settings-form.tsx` — Cloudflare card with password input (`cloudflare_api_token`) and text input (`vps2_ip`)

First admin build attempt failed with a false-positive `SelectQueryError` on `cf_nameservers` from a stale `.next` cache. Cleared with `rm -rf apps/admin/.next`, rebuilt cleanly.

## Verification

```bash
# All three package builds exit 0
pnpm --filter @monster/domains build        # ESM 4.79KB + DTS
pnpm --filter @monster/domains typecheck    # tsc --noEmit exit 0
pnpm --filter @monster/agents build         # worker.js 2.71MB
pnpm --filter @monster/admin build          # all 13 routes, exit 0

# CloudflareClient exports correctly
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.CloudflareClient))"
# → function

# Worker registers all three jobs
grep -E "GenerateSiteJob|DeploySiteJob|SslPollerJob" packages/agents/src/worker.ts
# → all present (imports + registrations + console.log confirmations)

# Queue factories exported
grep -E "deployQueue|sslPollerQueue" packages/agents/src/queue.ts
# → both factory + singleton functions present

# Settings keys present
grep -E "cloudflare_api_token|vps2_ip" apps/admin/src/app/(dashboard)/settings/constants.ts
# → both present

# DB migration present + cf_nameservers in types
ls packages/db/supabase/migrations/20260314000002_cf_nameservers.sql
grep "cf_nameservers" packages/db/src/types/supabase.ts
# → 3 matches (Row, Insert, Update)

# Admin wiring
grep "deploy_site" apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
grep "DeployStatus" apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
```

All checks passed.

## Requirements Advanced

- R006 (Automated deployment to VPS2 via Cloudflare) — deploy pipeline implemented end-to-end: rsync → Caddy → CF zone+A record → state machine persisted in Supabase; Deploy button triggers the full sequence from admin panel. Integration proof (live CF API call + `curl -I` CF-RAY header) requires live credentials + NS propagation — human UAT step.

## Requirements Validated

- None new in this slice (R006 integration proof requires live NS propagation + human curl check — deferred to UAT)

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- **`dns.records.list()` name param**: SDK v5 uses `Name` object `{ exact: domain }`, not bare string. Task plan pseudocode had `name: domain` — wrong. Fixed by using `{ exact: domain }`.
- **Deploy phase log prefix**: `[DeployPhase]` rather than `[GenerateSiteJob] deploy phase:` — consistent when `runDeployPhase` is called from `DeploySiteJob` (same prefix applies to both callers).
- **Stale .next cache**: First admin build false-positive `SelectQueryError` on `cf_nameservers`. Cleared with `rm -rf apps/admin/.next`, not a real type error. Admin build exits 0 cleanly.
- **Promise.all in page.tsx**: SSR fetches refactored from sequential to parallel — minor improvement not in plan but straightforward and correct.

## Known Limitations

- `20260314000002_cf_nameservers.sql` migration has not been applied to the remote Supabase DB (no psql/IPv6 access from dev host). Must be applied via Supabase dashboard or `supabase db push` before the first deploy job writes to `domains.cf_nameservers`. Without this, deploy jobs will error on the `domains` upsert step.
- `curl -I https://<domain>` showing `CF-RAY` header requires: (1) NS propagation (hours, human wait), (2) live Cloudflare API token in Settings, (3) live VPS2 IP in Settings. Full proof is a human UAT step.
- `SslPollerJob` cannot prove itself in a unit test — it depends on CF zone creation and NS propagation. Its logic is verified by code inspection and build; runtime verification requires a live zone.

## Follow-ups

- Apply `20260314000002_cf_nameservers.sql` to remote Supabase via dashboard before first real deploy.
- Enter `cloudflare_api_token` and `vps2_ip` in admin Settings before triggering Deploy.
- After first deploy job: verify `domains` row has `cf_zone_id` + `cf_nameservers` populated.
- After NS propagation: `curl -I https://<domain>` — expect `CF-RAY` header (closes R006 proof).
- S03 starts here: SpaceshipClient needs `cf_nameservers` from the `domains` row to update NS after domain registration.

## Files Created/Modified

- `packages/domains/src/cloudflare.ts` — CloudflareClient class (new)
- `packages/domains/src/index.ts` — barrel export (new)
- `packages/domains/tsup.config.ts` — tsup build config (new)
- `packages/domains/package.json` — type:module, exports, scripts, deps
- `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql` — migration (new)
- `packages/db/src/types/supabase.ts` — cf_nameservers added to domains Row/Insert/Update
- `packages/agents/src/jobs/deploy-site.ts` — runDeployPhase() helper + DeploySiteJob class (new)
- `packages/agents/src/jobs/ssl-poller.ts` — SslPollerJob class (new)
- `packages/agents/src/jobs/generate-site.ts` — deploy phase wired after score_pages
- `packages/agents/src/queue.ts` — deployQueue() + sslPollerQueue() singletons
- `packages/agents/src/worker.ts` — all three jobs registered, parallel graceful shutdown
- `packages/agents/src/index.ts` — deployQueue + createDeployQueue exported
- `packages/agents/package.json` — @monster/deployment + @monster/domains workspace deps
- `packages/agents/tsup.config.ts` — node-ssh + cloudflare in external list (both entries)
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — enqueueSiteDeploy, getLatestDeployStatus, getDeploymentCard
- `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx` — new client polling component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Deploy button, Deployment card, DeployStatus
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — cloudflare_api_token, vps2_ip
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — schema + error type extended
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Cloudflare card

## Forward Intelligence

### What the next slice should know

- **CF nameservers come from `domains.cf_nameservers`** — after `ensureZone()` runs, the `domains` row has the Cloudflare nameservers that Spaceship must be pointed at. S03's `updateNameservers()` call should read from this column, not from a live CF API call.
- **`domains` table UNIQUE constraint is on `domain` alone** — use `onConflict:'domain'` for any upsert, not `onConflict:'site_id,domain'` or `onConflict:'id'`.
- **`SslPollerJob` re-enqueue pattern** — the job reads `siteId` + `attempt` from `job.data`. Any change to the payload shape requires updating both the enqueue call in `runDeployPhase` and the consumption in `SslPollerJob`.
- **`cloudflare_api_token` must have Zone:Edit permissions** — documented in the Settings UI card. Token with Zone:Read only will fail at `zones.create()` with a permissions error, not at `zones.list()`.

### What's fragile

- **Migration not applied to remote DB** — `cf_nameservers` column doesn't exist yet in Supabase Cloud. First deploy job will error at the `domains` upsert. Must be applied before S03 UAT or any live deploy test.
- **`process.cwd()` assumption in RsyncService** — deploy phase works because D049 restores cwd before calling `runDeployPhase`. If another job type calls `runDeployPhase` without restoring cwd first, rsync path resolution breaks silently (uses wrong base dir).
- **Stale `.next` cache** — Next.js can false-positive on type errors when the `.next` cache has stale build artifacts. If admin build fails with a `SelectQueryError` that doesn't match actual types, `rm -rf apps/admin/.next` before rebuilding.

### Authoritative diagnostics

- `ai_jobs` table with `job_type='deploy_site'` — check `status`, `error`, `payload.phase` for last deploy
- `deployments` table — `status`, `duration_ms`, `error` per deploy attempt
- `domains` table — `cf_zone_id`, `cf_nameservers`, `dns_status` after zone creation
- `sites.status` column — authoritative pipeline state; `'error'` with no recent `ai_jobs` row means SSL polling exhausted

### What assumptions changed

- **DNS record list filter** — assumed bare string `name: domain` works in CF SDK v5. Actual: `Name` object required `{ exact: domain }`. TypeScript strict mode caught this at compile time.
- **Admin build cache** — assumed `.next` cache is clean between builds. Stale cache produced false-positive SelectQueryError. Always `rm -rf apps/admin/.next` when troubleshooting type errors in the admin build.
