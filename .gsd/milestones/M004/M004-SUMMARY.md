---
id: M004
provides:
  - packages/deployment package — RsyncService (rsync --delete over SSH) + CaddyService (SSH agent + sudo tee + systemctl reload)
  - packages/domains package — CloudflareClient (ensureZone, ensureARecord, pollSslStatus) + SpaceshipClient (checkAvailability, registerDomain, pollOperation, updateNameservers)
  - DB migration 20260314000002_cf_nameservers.sql — cf_nameservers text[] on domains table
  - runDeployPhase() shared helper — rsync → Caddy → CF zone+A record → state transitions → SslPollerJob enqueue
  - DeploySiteJob (queue 'deploy') — standalone redeploys without regeneration
  - SslPollerJob (queue 'ssl-poller') — delayed re-enqueue, 30-attempt limit, dns_pending → ssl_pending → live
  - GenerateSiteJob deploy phase wired after score_pages
  - Admin panel Deploy button (disabled with tooltip when domain null) + DeployStatus polling component
  - Admin panel Deployment card (pipeline status + latest deployments row + CF nameservers)
  - Admin panel Domain Management card (DomainManagement client component — availability check + R031-gated registration form)
  - Settings keys — cloudflare_api_token, vps2_ip, spaceship_api_secret, spaceship_contact_id (11 total)
  - Amazon CDN User-Agent fix in downloadAndConvertImage()
key_decisions:
  - D063: Caddy config via file-based per-site snippets + systemctl reload, not Caddy JSON API
  - D064: Cloudflare integration via cloudflare npm package v5+, not raw fetch
  - D065: Spaceship API via raw fetch — no npm client exists
  - D066: Cloudflare zone creation is idempotent (check-then-create)
  - D067: SSL poller as separate BullMQ delayed job, not blocking the deploy worker
  - D068: Deploy phase added to GenerateSiteJob after score_pages; DeploySiteJob for standalone redeploys
  - D069: Amazon CDN User-Agent fix lands in S01 as deploy prerequisite
  - D070: RsyncService uses child_process.spawn; CaddyService uses node-ssh
  - D071: CaddyService uses SSH agent (SSH_AUTH_SOCK), no key file
  - D072: VPS2 deployment keys stored as plain text settings, not secrets
  - D073: RsyncService resolves monorepo root via process.cwd()
  - D074: node-ssh and cloudflare externalized from agents tsup bundle
  - D075: domains row upserted with onConflict:'domain' (UNIQUE on domain column)
  - D076: cloudflare SDK v5 dns.records.list() name param is a Name object, not a string
  - D077: runDeployPhase() extracted as shared helper (GenerateSiteJob + DeploySiteJob)
  - D078: SslPollerJob treats pollSslStatus errors as 'pending' and re-enqueues
patterns_established:
  - runDeployPhase(siteId, site, bullJobId?, supabase) — reusable deploy orchestration callable from any job
  - SslPollerJob as delayed re-enqueue pattern with attempt counter (D067)
  - deployments row lifecycle: insert running → update succeeded/failed with duration_ms
  - SpaceshipClient mirrors CloudflareClient exactly: D028 credential reads, [SpaceshipClient] log prefix, descriptive throws with method context
  - Two separate useActionState hooks for check and register — independent state machines
  - Registration form hidden until domain confirmed available — enforces two-step intent before R031 gate
  - 3-file settings touch: constants.ts → actions.ts (schema + errors) → settings-form.tsx (UI card)
observability_surfaces:
  - "[DeployPhase] deploy phase: ..." — per-step deploy progress (rsync, caddy, CF zone, A record, transitions)
  - "[SslPollerJob] attempt N/30: ssl_status=..." — every poll cycle visible
  - "[CloudflareClient] ensureZone/ensureARecord/pollSslStatus: ..." — CF API interaction logs
  - "[SpaceshipClient] checkAvailability/registerDomain/pollOperation/updateNameservers: ..." — Spaceship API logs
  - "[registerDomain] Starting/polling/completed" — server action lifecycle
  - ai_jobs.payload.phase — 'deploy' with done/total progress tracking
  - deployments table — per-deploy row with status, deployed_at, duration_ms, error
  - sites.status — authoritative pipeline state (deploying → dns_pending → ssl_pending → live → error)
  - domains table — cf_zone_id + cf_nameservers + registrar + registered_at + spaceship_id
  - Admin panel Deployment card — SSR snapshot of pipeline state + latest deployments row + CF nameservers
requirement_outcomes:
  - id: R006
    from_status: active
    to_status: active
    proof: Contract complete — RsyncService, CaddyService, CloudflareClient, runDeployPhase(), DeploySiteJob, SslPollerJob all implemented and build cleanly. All four package builds exit 0. Integration proof (live CF API + curl CF-RAY header) requires live credentials + NS propagation — human UAT step. Marked active (not validated) because integration proof is a human UAT step.
  - id: R011
    from_status: active
    to_status: active
    proof: Contract complete — SpaceshipClient with checkAvailability, registerDomain, pollOperation, updateNameservers implemented and build cleanly. DomainManagement UI with R031-gated registration form implemented. Integration proof requires live Spaceship credentials + real domain. Marked active (not validated) because runtime validation requires live credentials not available in build-time verification.
duration: ~3h 45m (S01 ~40m + S02 ~2h15m + S03 ~55m)
verification_result: passed
completed_at: 2026-03-14
---

# M004: Deployment + Cloudflare

**Full deployment pipeline from admin "Deploy" button to Cloudflare-proxied live site: rsync to VPS2, Caddy virtualhost, Cloudflare zone + A record, SSL polling state machine, and domain registration via Spaceship — all wired end-to-end with state persisted in Supabase and surfaced in the admin panel.**

## What Happened

Three slices built a complete deployment stack from scratch.

**S01** established the VPS2 deployment primitives: `packages/deployment` with `RsyncService` (child_process.spawn + rsync `--delete` over SSH) and `CaddyService` (node-ssh with SSH agent + sudo tee + systemctl reload caddy). The Amazon CDN User-Agent fix landed here as a prerequisite for deployed sites to have real product images. Settings UI gained a VPS2 Deployment card with `vps2_host`, `vps2_user`, `vps2_sites_root`. Native crypto binding for `ssh2`/`cpu-features` required `pnpm.onlyBuiltDependencies` in the root package.json.

**S02** built `packages/domains` with `CloudflareClient` (idempotent zone creation, idempotent A record upsert, SSL status polling) and wired the full deploy pipeline. `runDeployPhase()` was extracted as a shared helper to avoid duplication between `GenerateSiteJob` (generate + deploy flow) and `DeploySiteJob` (standalone redeploy). The state machine — `deploying → dns_pending → ssl_pending → live` — is fully guarded by `SITE_STATUS_FLOW` checks at every transition. `SslPollerJob` handles the async SSL wait without blocking the deploy worker: it re-enqueues itself with a 60s delay, up to 30 attempts (~30 minutes window). The admin panel gained a Deploy button (disabled with tooltip when no domain is set), a `DeployStatus` polling component, and a Deployment card showing pipeline state, latest deployment row, and CF nameservers. A DB migration added `cf_nameservers text[]` to the `domains` table.

**S03** completed R011's contract by implementing `SpaceshipClient` with four methods matching the Spaceship REST API (`checkAvailability`, `registerDomain`, `pollOperation`, `updateNameservers`). Two server actions power the flow. The `DomainManagement` client component enforces two-step intent: availability check → registration form only appears after confirmed availability. The R031 gate (explicit form submit with red-border warning) prevents accidental domain purchases. Settings gained `spaceship_api_secret` and `spaceship_contact_id` keys.

A key discovery across S02: the Cloudflare SDK v5 `dns.records.list()` `name` parameter is a `Name` object (`{ exact: domain }`), not a bare string — caught by TypeScript strict mode and fixed inline (D076).

## Cross-Slice Verification

**Success criteria verified against evidence:**

1. **"Deploy" button triggers rsync → Caddy → CF zone+A record, transitioning through `deploying → dns_pending → ssl_pending → live`**
   - Evidence: `runDeployPhase()` implements all transitions with `SITE_STATUS_FLOW` guards. `SslPollerJob` handles `dns_pending → ssl_pending → live`. All four builds exit 0. Code inspection confirms every transition is persisted to `sites.status`. ✅

2. **`curl -I https://<domain>` returns CF-RAY header**
   - Status: Contract verified (Cloudflare zone + A record code implemented and typechecked). Runtime proof requires live credentials + NS propagation — human UAT step. Cannot be auto-verified without live infrastructure. ⚠️ *Pending live UAT*

3. **Redeploying updates the live site without downtime**
   - Evidence: `rsync --delete` handles content changes; Caddy reload is graceful (no restart). `DeploySiteJob` on queue `'deploy'` enables standalone redeploys without regeneration. Code path verified. Runtime proof requires live VPS2. ⚠️ *Pending live UAT*

4. **Domain availability check + approve + register via Spaceship with single click**
   - Evidence: `checkDomainAvailability` + `registerDomain` server actions implemented. `DomainManagement` UI with two-step flow. All builds exit 0. Runtime proof requires live Spaceship credentials. ⚠️ *Pending live UAT*

5. **All state transitions persisted in Supabase, visible in admin panel site detail**
   - Evidence: `sites.status`, `deployments` table, `domains` table all written by `runDeployPhase()` and `SslPollerJob`. Admin panel Deployment card renders all three data sources. `DeployStatus` polls every 5s. ✅

6. **All new settings keys configurable from Settings UI**
   - Evidence: 11 settings keys total in `constants.ts`: `cloudflare_api_token`, `vps2_ip`, `vps2_host`, `vps2_user`, `vps2_sites_root`, `spaceship_api_key`, `spaceship_api_secret`, `spaceship_contact_id`. All present in schema + UI cards. ✅

7. **`pnpm -r build` and `tsc --noEmit` both exit 0**
   - Evidence: All four package builds verified during milestone execution:
     - `pnpm --filter @monster/deployment build` → exit 0 (dist/index.js 5.02 KB)
     - `pnpm --filter @monster/domains build` → exit 0 (dist/index.js 12.05 KB)
     - `pnpm --filter @monster/agents build` → exit 0 (worker.js 2.71 MB)
     - `pnpm --filter @monster/admin build` → exit 0 (13/13 static pages, Compiled successfully) ✅

**Definition of done checklist:**
- [x] All three slices marked `[x]` in M004-ROADMAP.md
- [x] All three slice summaries exist (S01-SUMMARY.md, S02-SUMMARY.md, S03-SUMMARY.md)
- [x] `packages/deployment` RsyncService + CaddyService implemented and build cleanly
- [x] `packages/domains` CloudflareClient + SpaceshipClient implemented and build cleanly
- [x] `GenerateSiteJob` deploy phase wired after `score_pages` with correct state transitions
- [x] `SslPollerJob` implemented with 30-attempt limit, transitions `ssl_pending → live`
- [x] Admin panel Deploy button triggers deploy pipeline
- [x] Site detail shows current status with live state transitions (`DeployStatus`)
- [x] Domain availability check UI + approval flow in admin panel
- [x] All settings keys configurable from Settings UI
- [x] `pnpm -r build` exits 0

## Requirement Changes

- R006: active → active (contract complete, integration proof pending live UAT — CF-RAY header requires NS propagation)
- R011: active → active (contract complete, integration proof pending live Spaceship credentials + real domain)

Both requirements are fully implemented at the contract level. Runtime validation is a human UAT step that requires live infrastructure (VPS2 operational, CF token, Spaceship credentials, real domain). Neither is being closed as `validated` because the evidence standard for validation requires observable runtime behavior, not just build verification.

## Forward Intelligence

### What the next milestone should know
- **M005 (Analytics) starts fresh** — the deploy pipeline is complete at the contract level. No M004 work is prerequisite for M005.
- **cf_nameservers migration must be applied before first live deploy** — `20260314000002_cf_nameservers.sql` adds `cf_nameservers text[]` to `domains`. Must be applied via Supabase dashboard (`supabase db push` or manual SQL) before any real deploy job runs. Without it, `runDeployPhase()` will error at the `domains` upsert step.
- **spaceship_contact_id is a hard prerequisite for domain registration** — Spaceship requires a pre-created contact record. The ID must be obtained from the Spaceship dashboard before attempting registration. Missing or wrong ID returns 422 with no retry. The UI surfaces the error inline.
- **Domain registration requires deployed site (cf_nameservers populated first)** — `registerDomain` server action guards against empty `cf_nameservers`. The domain registration flow only makes sense after a successful deploy has created the CF zone.
- **All four credential types needed for full pipeline**: Cloudflare API token (Zone:Edit), VPS2 host/user/sites_root, Spaceship API key + secret + contact ID.

### What's fragile
- **cf_nameservers migration not applied to remote Supabase** — blocked from applying during development (dev host can only reach Supabase via IPv6, no direct psql). Must be applied manually before first live deploy.
- **SSH_AUTH_SOCK in BullMQ worker environment** — CaddyService requires the SSH agent socket. pm2 must be started with agent forwarding active. If pm2 restarts without the agent, `CaddyService` throws a connection error. Verify with `echo $SSH_AUTH_SOCK` in the pm2 worker context.
- **`process.cwd()` assumption in RsyncService** — deploy phase works because D049 restores cwd after Astro build. Any new code that calls `runDeployPhase()` must ensure cwd is the monorepo root, not `apps/generator`.
- **Stale .next cache** — Next.js can false-positive on type errors when `.next` cache has stale artifacts. If admin build fails with a `SelectQueryError` that doesn't match actual types, `rm -rf apps/admin/.next` before rebuilding.
- **SslPollerJob cannot be unit-tested** — depends on CF zone creation + NS propagation. Verified by code inspection and build; runtime verification requires a live zone.

### Authoritative diagnostics
- **Deploy pipeline state**: `ai_jobs` table `job_type='deploy_site'` — check `status`, `error`, `payload.phase`
- **Per-deploy details**: `deployments` table — `status`, `duration_ms`, `error` per attempt
- **CF zone and NS**: `domains` table — `cf_zone_id`, `cf_nameservers`, `dns_status`
- **Site lifecycle**: `sites.status` — authoritative state; `'error'` with no recent `ai_jobs` row means SSL polling exhausted (30 attempts)
- **Spaceship registration**: `domains` table — `registrar='spaceship'`, `registered_at`, `spaceship_id`
- **SSH/rsync failures**: `[RsyncService]` or `[CaddyService]` prefixed stderr lines in worker logs
- **CF API failures**: `[CloudflareClient]` prefixed logs — every API call logged with method + domain

### What assumptions changed
- **CF SDK v5 dns.records.list() name param** — assumed bare string `name: domain`. Actual: `Name` object `{ exact: domain }` required. TypeScript strict mode caught this at compile time (D076).
- **Admin build cache** — assumed clean between builds. Stale cache produced false-positive SelectQueryError on `cf_nameservers`. `rm -rf apps/admin/.next` is the fix.
- **SpaceshipClient.registerDomain() return type** — plan assumed raw string operationId. Actual return is `{ operationId: string }` — minor fix.
- **apps/admin/package.json** — plan didn't list it as a file to touch in S03. Adding `@monster/domains: workspace:*` was required for SpaceshipClient import to typecheck.

## Files Created/Modified

- `packages/deployment/src/rsync.ts` — RsyncService class
- `packages/deployment/src/caddy.ts` — CaddyService class
- `packages/deployment/src/index.ts` — barrel export
- `packages/deployment/tsup.config.ts` — build config
- `packages/deployment/package.json` — type:module, exports, scripts, dependencies
- `packages/deployment/tsconfig.json` — TypeScript config
- `packages/domains/src/cloudflare.ts` — CloudflareClient class
- `packages/domains/src/spaceship.ts` — SpaceshipClient class
- `packages/domains/src/index.ts` — barrel export
- `packages/domains/tsup.config.ts` — build config
- `packages/domains/package.json` — type:module, exports, scripts, dependencies
- `packages/db/supabase/migrations/20260314000002_cf_nameservers.sql` — cf_nameservers migration
- `packages/db/src/types/supabase.ts` — cf_nameservers added to domains Row/Insert/Update
- `packages/agents/src/jobs/deploy-site.ts` — runDeployPhase() helper + DeploySiteJob
- `packages/agents/src/jobs/ssl-poller.ts` — SslPollerJob
- `packages/agents/src/jobs/generate-site.ts` — deploy phase wired after score_pages
- `packages/agents/src/queue.ts` — deployQueue() + sslPollerQueue() singletons
- `packages/agents/src/worker.ts` — all three jobs registered, parallel graceful shutdown
- `packages/agents/src/index.ts` — deployQueue + createDeployQueue exported
- `packages/agents/package.json` — @monster/deployment + @monster/domains workspace deps
- `packages/agents/tsup.config.ts` — node-ssh + cloudflare in external list
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — enqueueSiteDeploy, getLatestDeployStatus, getDeploymentCard, checkDomainAvailability, registerDomain
- `apps/admin/src/app/(dashboard)/sites/[id]/DeployStatus.tsx` — client polling component
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — availability check + registration form
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Deploy button, Deployment card, Domain Management card
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — 8 new keys (11 total)
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — schema + error types extended
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Cloudflare card + Spaceship section expanded
- `apps/admin/package.json` — @monster/domains: workspace:*
- `package.json` (root) — pnpm.onlyBuiltDependencies for ssh2/cpu-features
