# S02: Cloudflare Automation + Deploy Pipeline — Research

**Date:** 2026-03-14

## Summary

S02 wires the S01 deployment primitives (`RsyncService`, `CaddyService`) into a full end-to-end deploy pipeline: rsync → Caddy config → Cloudflare zone + A record → `sites.status` state transitions. It also adds the `SslPollerJob` (a BullMQ delayed job that polls CF for SSL cert readiness) and the admin panel "Deploy" button with a status card.

The codebase is in excellent shape for this slice. `packages/domains/` is a bare stub (no src dir, no exports, no scripts) and needs full setup from scratch — mirroring the pattern established by `packages/deployment`. The `cloudflare` npm package (v5.2.0) is well-typed and confirmed installable. The `GenerateSiteJob` in `packages/agents` is the natural extension point: add a `deploy` phase after `score_pages`, following the exact same `ai_jobs` progress pattern. A separate `DeploySiteJob` handles standalone redeploys (triggered without regeneration). Both the deploy phase and the SSL poller persist state through the `SITE_STATUS_FLOW` transitions already defined in `packages/shared`.

The single structural gap is a missing `cf_nameservers text[]` column on the `domains` table — needed to display assigned Cloudflare NS records to the user so they can update DNS at Spaceship. A new migration (the 9th) handles this.

**Key non-obvious finding:** `zones.create()` in the Cloudflare npm package v5 requires an `account` param, but `account.id` is marked optional. Calling `zones.create({ account: {}, name: domain, type: 'full' })` works for personal CF accounts — CF associates the zone with the token owner's account. No `cloudflare_account_id` setting is needed unless multi-account scenarios arise. This simplifies settings to: `cloudflare_api_token` + `vps2_ip`.

## Recommendation

**Extend `GenerateSiteJob` with a `deploy` phase** (not a separate job) for the generate+deploy flow. Add `DeploySiteJob` on queue `'deploy'` for standalone redeploys only. Add `SslPollerJob` on queue `'ssl-poller'` as a BullMQ delayed job that re-enqueues itself with a 60s delay until `certificate_status === 'active'`. Install `cloudflare` npm package into `packages/domains`. Set up `packages/domains` with tsup + proper exports following the `packages/deployment` pattern. Add a DB migration for `cf_nameservers`. The admin "Deploy" button enqueues a deploy job and polls an `ai_jobs` row — reuse the `JobStatus` polling pattern already established in M003.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Cloudflare zones, DNS, SSL | `cloudflare` npm pkg v5.2.0 — `client.zones.list()`, `client.zones.create()`, `client.dns.records.create()`, `client.ssl.verification.get()` | Full TS types, auto-pagination, consistent error handling. `name_servers` field present on `Zone` type. `VerificationGetResponse = Array<Verification>`, each with `certificate_status` union. |
| tsup build config for domains | Copy `packages/deployment/tsup.config.ts` + `package.json` pattern | Identical constraints: ESM, Node 20, external node-ssh, dts: true |
| State machine guard | `SITE_STATUS_FLOW` from `@monster/shared` | Already maps all valid transitions. Guard transitions before writing to DB. |
| ai_jobs progress tracking | Existing `ai_jobs` progress pattern in `GenerateSiteJob` | `payload: { phase, done, total }` pattern already established and consumed by admin JobStatus component |
| Deploy BullMQ queue factory | Copy `createGenerateQueue()` → `createDeployQueue()` in `queue.ts` | Same Redis options, same Worker pattern. Reuse `createRedisOptions()`. |
| Admin polling for deploy status | Extend `getLatestJobStatus()` to accept `job_type` or add new action | `JobStatus` client component + server action polling is already wired. Add `getLatestDeployStatus()` for deploy jobs. |

## Existing Code and Patterns

- `packages/agents/src/jobs/generate-site.ts` — **Primary extension point.** Add `deploy` phase after `score_pages` (after `process.chdir(prevCwd)` is restored). Follow `ai_jobs` progress pattern exactly: update `payload: { phase: 'deploy', done: 0, total: 3 }` then increment as rsync, Caddy, CF complete. Transition `sites.status` via `SITE_STATUS_FLOW`: `generating → deploying → dns_pending → ssl_pending`. Enqueue `SslPollerJob` on the `'ssl-poller'` queue before returning.
- `packages/agents/src/worker.ts` — Standalone entrypoint. Add `SslPollerJob` registration here. If `DeploySiteJob` exists, register it too. Both follow the same `new XJob().register()` → `worker.on('failed', ...)` pattern.
- `packages/agents/src/queue.ts` — Add `createDeployQueue()` and `createSslPollerQueue()` alongside existing `createGenerateQueue()`. Export `deployQueue()` singleton for admin server actions.
- `packages/deployment/src/` — **`RsyncService` and `CaddyService` are ready.** `packages/agents` needs `@monster/deployment` added as a workspace dependency for the deploy phase.
- `packages/shared/src/constants/index.ts` — `SITE_STATUS_FLOW` and `SiteStatus` type. Import in deploy phase to guard transitions.
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — Add `enqueueSiteDeploy(siteId)` server action following `enqueueSiteGeneration` pattern: insert `ai_jobs` row (`job_type: 'deploy_site'`) → enqueue `deployQueue` → return `jobId`. Add `getLatestDeployStatus(siteId)` for the poll cycle.
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Add "Deploy" button alongside "Generate Site" button. Add `DeployStatus` client component (clone of `JobStatus` using `getLatestDeployStatus`). Add a "Deployment" card showing `site.status` + latest `deployments` row + Cloudflare nameservers (if zone created).
- `apps/admin/src/app/(dashboard)/settings/constants.ts` + `actions.ts` + `settings-form.tsx` — Add `cloudflare_api_token` (password type, secret) and `vps2_ip` (text type). Pattern is identical to the VPS2 Deployment card added in S01. Three-file touch point.
- `packages/agents/src/clients/dataforseo.ts` — **Credential read pattern (D028/D050).** `CloudflareClient` reads `cloudflare_api_token` from Supabase `settings` table at call time: `(row.value as { value: string }).value`. Never from `process.env`.

## Constraints

- **`packages/domains` is a stub with no src dir.** Must create `src/cloudflare.ts`, `src/index.ts`, `tsup.config.ts`, and update `package.json` with `type: "module"`, proper `exports`, `scripts`, and `dependencies: { cloudflare, @monster/db }`. The `packages/domains/tsconfig.json` already extends `../../tsconfig.base.json` with NodeNext module resolution — no tsconfig changes needed.
- **`cloudflare` package not yet installed in monorepo.** Must run `pnpm --filter @monster/domains add cloudflare` and `pnpm --filter @monster/domains add -D tsup typescript @types/node`. Also add `@monster/deployment` as workspace dep to `@monster/agents` for the deploy phase.
- **`zones.create()` requires `account: { id?: string }`** — pass `account: {}` (empty, id optional) for personal CF accounts. CF assigns the zone to the token owner's default account. This avoids needing a `cloudflare_account_id` setting.
- **SSL verification API shape:** `client.ssl.verification.get({ zone_id })` returns `Array<Verification>`. Each `Verification` has `certificate_status: 'initializing' | 'authorizing' | 'active' | 'expired' | 'issuing' | 'timing_out' | 'pending_deployment'`. Check `verifications.some(v => v.certificate_status === 'active')` — not the first element alone.
- **Zone `name_servers` field:** `Zone.name_servers: Array<string>` is present on both `zones.create()` response and `zones.list()` results. This is the assigned CF nameserver array to display in the admin panel and store in `domains.cf_nameservers`.
- **DB migration required:** `domains` table has no `cf_nameservers` column. Add migration `20260314000002_cf_nameservers.sql` with `ALTER TABLE domains ADD COLUMN IF NOT EXISTS cf_nameservers text[] DEFAULT '{}';`. Also regenerate Supabase types after migration.
- **Idempotent zone creation:** `client.zones.list({ name: domain })` first. If a zone is found, return its `{id, name_servers}`. Only call `zones.create()` if list returns empty. This makes the deploy phase retryable without creating duplicate zones.
- **Idempotent A record:** `client.dns.records.list({ zone_id, type: 'A', name: domain })`. If an A record exists, delete and recreate (simplest approach for VPS2 IP change case) or skip if content matches.
- **`process.chdir(prevCwd)` precondition:** Deploy phase must run after the `finally` block that restores `process.cwd()`. This is already guaranteed by placement after `score_pages`. `RsyncService` uses `process.cwd()` for monorepo root — cwd must be the monorepo root, not `GENERATOR_ROOT`.
- **BullMQ `lockDuration: 300000`** already set in `GenerateSiteJob` worker options — covers rsync + CF API calls. `SslPollerJob` is a short-lived job (poll + re-enqueue) that completes quickly; default `lockDuration` is sufficient.
- **SSL poller re-enqueue pattern:** After each `ssl-poller` job run, if status isn't `active`, enqueue a new delayed job to the same queue with `{ delay: 60000 }`. Do not use `job.moveToDelayed()` (BullMQ v5 API) — just add a new job. Max retries = 30 (30 minutes of polling before giving up and setting `sites.status = 'error'`).
- **D028 pattern for CF credentials:** Read `cloudflare_api_token` from Supabase at call time. Instantiate `new Cloudflare({ apiToken })` inside the method body, not at class construction.
- **`@monster/deployment` workspace dep:** Must add to `packages/agents/package.json` `dependencies`. tsup external list in agents already excludes `astro`; `@monster/deployment` should be bundled (`noExternal` in tsup, same as `@monster/db`, `@monster/shared`, `@monster/seo-scorer`).

## Common Pitfalls

- **`ssl.verification.get()` is the wrong endpoint for universal SSL cert status.** The endpoint returns certificate *verification* details (used for custom/advanced certificates). For Universal SSL (which CF provisions automatically for new zones), `certificate_status` should still come through on this endpoint but may return an empty array until the cert is provisioned. If the array is empty, treat as `pending`. Also consider checking `zone.status === 'active'` first — CF won't issue SSL until NS propagate.
- **Zone status vs. SSL status are separate.** Zone `status: 'pending'` means NS haven't propagated. Zone `status: 'active'` means NS propagated and CF is proxying. SSL `certificate_status: 'active'` means the cert is issued. The deploy pipeline must transition `sites.status` in order: `deploying → dns_pending` (CF zone created, waiting for NS) → `ssl_pending` (zone active, cert issuing) → `live` (cert active). Don't shortcut.
- **`dns.records.list()` returns a paginated iterator, not a plain array.** Use `for await` or `.allSettled()` on the page promise. To check if an A record exists: `const page = await client.dns.records.list({ zone_id, type: 'A', name: domain }); const existing = page.result;` (`.result` on the first page is sufficient since there's at most 1 A record per domain).
- **`RecordCreateParams` is a discriminated union.** For type 'A': `{ zone_id, type: 'A', name: domain, content: vps2Ip, ttl: 1, proxied: true }`. The `name` field must be the full domain (e.g. `example.com`), not `@`. `ttl: 1` means auto.
- **`packages/domains` tsup config must mark `cloudflare` as external.** Like `node-ssh` in deployment, `cloudflare` is a large package that should not be bundled. Add `external: ['cloudflare']` in `tsup.config.ts`.
- **Worker registration order matters.** `SslPollerJob` must be registered in `worker.ts` before the process.on handlers. If `DeploySiteJob` is added, it also goes here. All three jobs (`generate`, `deploy`, `ssl-poller`) share the same process.
- **Deploy button in admin must handle 'no domain' gracefully.** If `site.domain` is null, the Deploy button should be disabled with a tooltip: "Set a domain first". The Caddy virtualhost and CF zone both require a real domain — deploying to a null domain would fail inside the job with a cryptic error.
- **`domains` table upsert on deploy.** When the deploy phase creates a CF zone, it must upsert a row in `domains`: `{ site_id, domain, cf_zone_id, cf_nameservers, registrar: 'cloudflare', dns_status: 'pending' }`. This is how CF nameservers get persisted for display in the admin panel.
- **`deployments` table row lifecycle.** Insert a `deployments` row at start of deploy phase (`status: 'running'`, `created_at: now()`). Update to `succeeded`/`failed` + `deployed_at` + `duration_ms` at end. This is the audit trail for redeploys.
- **tsup DTS for `packages/domains`.** Unlike `packages/agents` (which disabled DTS due to ioredis version conflict), `packages/domains` has no native addon dependency conflicts. Enable `dts: true` — it should work cleanly with the `cloudflare` package and `@monster/db`.

## Open Risks

- **`ssl.verification.get()` returning empty array for Universal SSL.** Universal SSL certs (auto-provisioned by CF for new zones) may not appear in `ssl.verification.get()` — that endpoint is primarily for custom cert packs. Alternative: poll `client.zones.get({ zone_id })` and check `zone.ssl` or `zone.status`. This should be tested with a live CF account. If `ssl.verification.get()` is unreliable for Universal SSL, fall back to HTTP check: `curl -I https://<domain>` and verify `CF-RAY` header (or check zone status = 'active' as a proxy for cert readiness). Document the fallback in the `SslPollerJob` implementation.
- **NS propagation timing in `dns_pending`.** NS propagation can take 24–48h. The `SslPollerJob` polling `ssl.verification.get()` won't see `active` until after NS propagation. 30-minute SSL polling cap will expire in `dns_pending` phase, not `ssl_pending` phase. Consider polling the zone status separately: if `zone.status === 'active'` (NS propagated), transition `dns_pending → ssl_pending` and then poll SSL. This separates the two async waits correctly.
- **Supabase type regeneration after migration.** After adding `cf_nameservers` via migration, `supabase gen types` must be re-run to update `packages/db/src/types/supabase.ts`. Without this, `domains.Insert` won't have `cf_nameservers` typed and the compile will fail.
- **SSH_AUTH_SOCK in worker process for redeploys.** `DeploySiteJob` calls `CaddyService` which requires `SSH_AUTH_SOCK`. For standalone redeploys triggered from the admin panel, the worker process must have the SSH agent available. This is the same constraint documented in S01 — verify pm2 env before first live redeploy.
- **`@monster/deployment` bundling in tsup.** The agents tsup config uses `noExternal: [/@monster\/.*/]` to bundle workspace packages. Adding `@monster/deployment` to `packages/agents/dependencies` means it will be bundled into `dist/worker.js`. `node-ssh` (a dep of `@monster/deployment`) is already in `tsup.config.ts` as external — verify the external list includes it after the new dep is added.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Cloudflare API (npm package v5) | none found | Use official `cloudflare` npm pkg directly — API is well-typed |
| BullMQ delayed jobs | none needed | Standard BullMQ pattern — documented in M004-RESEARCH.md |

## Sources

- `cloudflare` npm package v5.2.0 type inspection: `Zone.name_servers: Array<string>`, `Zone.status: 'initializing' | 'pending' | 'active' | 'moved'`, `zones.list(query?: ZoneListParams)`, `zones.create({ account: { id?: string }, name, type })` — `account.id` is optional (source: `/tmp/node_modules/cloudflare/resources/zones/zones.d.ts`)
- `Verification.certificate_status` union: `'initializing' | 'authorizing' | 'active' | 'expired' | 'issuing' | 'timing_out' | 'pending_deployment'`, `VerificationGetResponse = Array<Verification>` (source: `/tmp/node_modules/cloudflare/resources/ssl/verification.d.ts`)
- `dns.records.create()` params: `{ zone_id, type: 'A', name, content, ttl: 1, proxied: true }` — `RecordCreateParams` is a discriminated union (source: `/tmp/node_modules/cloudflare/resources/dns/records.d.ts`)
- `SITE_STATUS_FLOW` and `SiteStatus` type (source: `packages/shared/src/constants/index.ts`, `packages/shared/src/types/index.ts`)
- `ai_jobs` progress tracking pattern — `payload: { phase, done, total }` (source: `packages/agents/src/jobs/generate-site.ts`)
- `enqueueSiteGeneration` + `getLatestJobStatus` pattern for admin server actions (source: `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`)
- `JobStatus` client component polling pattern (source: `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx`)
- Settings 3-file touch pattern: `constants.ts`, `actions.ts`, `settings-form.tsx` (source: S01-SUMMARY.md patterns_established)
- `domains` table schema — has `cf_zone_id`, `dns_status`, no `cf_nameservers` (source: `packages/db/supabase/migrations/20260313000001_core.sql`, `packages/db/src/types/supabase.ts`)
- `deployments` table schema — `status: 'pending'|'running'|'succeeded'|'failed'`, `deployed_at`, `duration_ms`, `error`, `metadata` (source: `packages/db/supabase/migrations/20260313000001_core.sql`)
- DataForSEO credentials read from Supabase pattern (D028/D050) to replicate for `CloudflareClient` (source: `packages/agents/src/clients/dataforseo.ts`)
- `process.chdir(prevCwd)` constraint: deploy phase must run after the `finally` block restores cwd (D049, source: `generate-site.ts`)
- BullMQ delayed job SSL poller approach (D067 — separate delayed job, not blocking worker)
