---
id: S02
parent: M011
milestone: M011
provides:
  - RsyncService.deploy(slug, server: Server) — Server-record-based signature, host derived from tailscale_ip ?? public_ip
  - CaddyService.writeVirtualhost(domain, slug, server: Server) — Server-record-based signature
  - InfraService.getFleetHealth() returning FleetHealth with per-server SSH health for all active servers
  - InfraService.testDeployConnection(serverId?: string) auto-resolving from servers table
  - FleetHealth and ServerHealth interfaces exported from @monster/deployment; Vps2Health removed
  - runDeployPhase() queries servers table (no vps2_* settings reads)
  - /infra page fleet table replacing single-server card; empty-state for zero servers
  - SETTINGS_KEYS with hetzner_api_token replacing vps2_host, vps2_user, vps2_sites_root, vps2_ip
  - SaveSettingsSchema, SaveSettingsErrors, settings-form.tsx all updated to match
requires:
  - slice: S01
    provides: servers table schema; Server type from @monster/deployment; ProvisioningService.provision()
affects:
  - S03
key_files:
  - packages/deployment/src/rsync.ts
  - packages/deployment/src/caddy.ts
  - packages/deployment/src/infra.ts
  - packages/deployment/src/index.ts
  - packages/agents/src/jobs/deploy-site.ts
  - apps/admin/src/app/(dashboard)/infra/page.tsx
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - Server-based service pattern: all deployment services derive host via tailscale_ip ?? public_ip (D149, D150)
  - vps2SitesRoot hardcoded to /var/www/sites — no servers table column needed (D150)
  - cloudflare_api_token pre-flight check removed from runDeployPhase — CloudflareClient self-reads via D028 (D149)
  - getVps2Health() removed entirely (not deprecated); Vps2Health removed from public exports (D151)
  - T01 settings cleanup applied in T03 (catch-up deviation — T01 marker was set without execution) (D152, KN006)
patterns_established:
  - Server-based service pattern: deployment services accept Server record, derive host via tailscale_ip ?? public_ip
  - Fleet health pattern: query servers WHERE status='active', Promise.all SSH checks, never throws on per-server failure
  - Guard pattern: if (!host) throw descriptive [ServiceName] server "name" has no IP address message
  - DeployPhase servers-table pattern: query first active server, throw structured error if none, log selection before rsync
observability_surfaces:
  - "[InfraService] fleet health: checking N server(s)" — fleet health entry log
  - "[InfraService] fleet health: 0 active servers — returning empty fleet" — zero-server state
  - "[InfraService] connecting to <user>@<host> for server \"<name>\"" — per-server SSH connect
  - "[InfraService] SSH error for server \"<name>\": <message>" — per-server SSH failure (non-fatal)
  - "[RsyncService] server \"<name>\" has no IP address" — no-IP guard (fatal)
  - "[CaddyService] server \"<name>\" has no IP address" — no-IP guard (fatal)
  - "[DeployPhase] using server \"<name>\" (<host>)" — server selection confirmation before rsync
  - "[DeployPhase] no active servers found in servers table" — structured error on empty server pool
  - "[DeployPhase] server \"<name>\" has no IP address" — missing IP guard (fatal)
drill_down_paths:
  - .gsd/milestones/M011/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M011/slices/S02/tasks/T03-SUMMARY.md
duration: ~65m (T02: 25m, T03: 40m — T01 work absorbed into T03)
verification_result: passed
completed_at: 2026-03-16
---

# S02: Services migration + Settings cleanup

**All deployment services migrated to accept `Server` DB records; `vps2_*` settings fully removed; deploy pipeline reads from `servers` table; `/infra` renders fleet health; all four package builds pass clean.**

## What Happened

S02 delivered the services-layer migration from hardcoded VPS2 settings to the `servers` table established by S01. Three tasks executed across the deployment package (T02), the callers + admin UI (T03), and a settings cleanup (T01 — absorbed into T03 as a catch-up deviation).

**T02 — Service signature migration** (`packages/deployment/`):

`RsyncService.deploy(slug, server: Server)` and `CaddyService.writeVirtualhost(domain, slug, server: Server)` both now accept a `Server` record. Host is derived as `server.tailscale_ip ?? server.public_ip`; user from `server.ssh_user`; remote sites root hardcoded to `/var/www/sites` (no settings read). Both guard against null host with structured error messages.

`InfraService` was fully rewritten: `readVps2Settings()` deleted; `Vps2Health`/`getVps2Health()` removed entirely (no deprecation window needed since the only caller was updated in the same slice). New `getFleetHealth()` queries `servers WHERE status='active'`, runs `Promise.all` over per-server SSH health checks (Caddy status, disk %, memory), and returns `FleetHealth { servers: ServerHealth[], fetchedAt: string }`. The method never throws — per-server SSH failures produce `reachable: false` rows. `testDeployConnection(serverId?: string)` uses `.single()` against the servers table with optional serverId filtering.

`index.ts` exports `FleetHealth` and `ServerHealth`; `Vps2Health` export removed.

Both `pnpm --filter @monster/deployment typecheck` and `build` exit 0 after these changes.

**T03 — Caller updates** (`packages/agents/`, `apps/admin/`):

`runDeployPhase()` in `deploy-site.ts` was the most significant caller change. The 5-key settings read block (`vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`, `cloudflare_api_token` pre-flight check) was replaced with a single Supabase query against the `servers` table. Structured guards throw `[DeployPhase] no active servers found in servers table` and `[DeployPhase] server "<name>" has no IP address` before any I/O. A `[DeployPhase] using server "<name>" (<host>)` log confirms server selection. `rsync.deploy(slug, server)` and `caddy.writeVirtualhost(domain, slug, server)` are called with the Server record directly. Cloudflare A record uses `server.public_ip`.

`infra/page.tsx` replaced `Vps2Health`/`getVps2Health()` with `FleetHealth`/`getFleetHealth()`. Single-server card grid replaced with a fleet table (Name, Reachable, Caddy, Disk, Memory columns). Empty-state card shown when `fleet.servers.length === 0`.

`test-connection/route.ts` required no changes — `infra.testDeployConnection()` with no args already matches the new auto-resolve signature.

**T01 (applied in T03 as catch-up)** — Settings cleanup:

T01 was marked `[x]` in the slice plan without a summary file or file modifications. T03 executor discovered this and applied all three T01 files: `constants.ts` updated to 6-key `SETTINGS_KEYS` with `hetzner_api_token` replacing the 4 `vps2_*` keys; `actions.ts` `SaveSettingsSchema` and `SaveSettingsErrors` updated to match; `settings-form.tsx` VPS2 Deployment card removed, `vps2_ip` Cloudflare card field removed, `hetzner_api_token` password field added under API Keys. This deviation is documented in KN006.

## Verification

```bash
# T01 — Settings cleanup
grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts       # ✓ present
grep -c "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" ...constants.ts           # ✓ 0
grep -c "vps2_" ...actions.ts                                                         # ✓ 0
grep -c "vps2_" ...settings-form.tsx                                                  # ✓ 0

# T02 — Service signatures + deployment package
pnpm --filter @monster/deployment typecheck                                            # ✓ exit 0
pnpm --filter @monster/deployment build                                                # ✓ exit 0 (19.72 KB dist)
grep -c "vps2_host|vps2_user|vps2_sites_root" rsync.ts caddy.ts infra.ts            # ✓ all 0
grep "FleetHealth|ServerHealth" packages/deployment/dist/index.d.ts                  # ✓ both present
grep "Vps2Health" packages/deployment/dist/index.d.ts                                # ✓ absent
grep -c "[InfraService] fleet health: 0 active servers" dist/index.js               # ✓ 1
grep -c "has no IP address" dist/index.js                                             # ✓ 3

# T03 — Callers + admin build
grep -rn "vps2_host|vps2_user|vps2_sites_root|vps2_ip" [4 target files]             # ✓ 0 matches
pnpm --filter @monster/agents build                                                    # ✓ exit 0
pnpm --filter @monster/admin build                                                     # ✓ exit 0
# Admin build route list includes: ƒ /infra                                           # ✓ present
grep -c "[DeployPhase] no active servers found in servers table" worker.js           # ✓ 1
grep -c "[DeployPhase] server.*has no IP address" worker.js                          # ✓ 1
grep -c "[DeployPhase] using server" worker.js                                        # ✓ 1
```

All slice-level verification checks passed.

## Requirements Advanced

- **R006** (Automated deployment to VPS2 via Cloudflare) — deploy pipeline now reads from `servers` table instead of hardcoded settings; each active server in DB is a potential deployment target; existing callers work without changes if a server row exists with `status='active'`.

## Requirements Validated

- None newly validated by this slice (build + typecheck only; no live runtime).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

**T01 applied in T03 (catch-up):** T01 was marked `[x]` in S02-PLAN.md without a summary file or file changes. The T03 executor discovered this when running slice verification and applied T01's three-file changes (`constants.ts`, `actions.ts`, `settings-form.tsx`) within T03's scope. This is documented as KN006.

**`getVps2Health()` removed entirely:** Plan said "keep deprecated or remove entirely — recommended: remove." T02 removed it entirely since T03 updated the only caller in the same slice. No deprecated shim was created. Documented as D151.

## Known Limitations

- **Zero active servers = deploy failure:** `runDeployPhase()` throws `[DeployPhase] no active servers found in servers table` if the `servers` table has no `status='active'` row. Operators must provision a server (S03) before deployments work. The error is structured and visible in BullMQ job failure logs.
- **Single server selection:** `runDeployPhase()` always picks the first active server by `created_at` asc. No per-site server assignment. Deferred to post-M011 (noted in roadmap as "site-to-server assignment UI").
- **`testDeployConnection` uses `.single()`:** Throws if `servers` table has zero active rows. Callers (the test-connection API route) must handle this error.

## Follow-ups

- **S03 depends on `InfraService.getFleetHealth()`** being stable — verify the empty-state path in `/infra` renders correctly once S03's fleet table UI is in place.
- **Per-site server assignment** (not in M011 scope): when more than one server exists, there is no mechanism to route a specific site's deploy to a specific server. Future slice needed after S03.

## Files Created/Modified

- `packages/deployment/src/rsync.ts` — `deploy(slug, server: Server)` 2-param signature, host from tailscale_ip ?? public_ip, hardcoded `/var/www/sites`
- `packages/deployment/src/caddy.ts` — `writeVirtualhost(domain, slug, server: Server)` 3-param signature
- `packages/deployment/src/infra.ts` — `FleetHealth`/`ServerHealth` interfaces; `getFleetHealth()`; `checkServerHealth()`; `testDeployConnection(serverId?)`; `readVps2Settings()` + `Vps2Health` + `getVps2Health()` deleted
- `packages/deployment/src/index.ts` — exports `FleetHealth`, `ServerHealth`; `Vps2Health` removed
- `packages/agents/src/jobs/deploy-site.ts` — servers table query replaces vps2_* settings reads; Server type import; rsync/caddy calls pass Server record; CF A record uses server.public_ip
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — FleetHealth/getFleetHealth(); fleet table UI; empty-state card
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — hetzner_api_token replaces vps2_* keys
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — SaveSettingsSchema + SaveSettingsErrors updated
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — VPS2 Deployment card removed; hetzner_api_token field added
- `.gsd/milestones/M011/slices/S02/S02-PLAN.md` — T02 + T03 marked done; DeployPhase observability checks added to Verification section

## Forward Intelligence

### What the next slice should know

- `InfraService.getFleetHealth()` is the primary data source for S03's fleet dashboard. It returns an empty `servers: []` array when the `servers` table has no active rows — the `/infra` page already handles this with an empty-state card.
- `POST /api/infra/provision` route stub exists in the admin build (`ƒ /api/infra/provision` appears in the build output) but contains only a stub handler from a prior slice. S03 must implement the real handler calling `ProvisioningService.provision()`.
- `HetznerClient.listDatacenters()` and `listServerTypes()` are available in `@monster/deployment` for populating form selects in the Provision New Server modal.
- The `hetzner_api_token` settings key is now in `SETTINGS_KEYS`. `HetznerClient` reads it via D028 — operators must save it in Settings before any Hetzner API call works.

### What's fragile

- **Servers table empty = runtime errors on deploy:** Any site deploy job that runs before a server is provisioned will throw a structured error. This is the expected empty-state path, but it means M011 is not truly operational until S03's Provision flow creates at least one server row.
- **Single-server assumption in runDeployPhase:** The `.limit(1)` query always picks one server. If operators provision two servers, both are "active" in the fleet table but only the oldest one receives deploys. No warning is surfaced.

### Authoritative diagnostics

- **Fleet health state:** `createServiceClient().from('servers').select('*').eq('status','active')` — primary inspection surface for deployment readiness
- **Deploy job failures:** BullMQ job failure reason in `ai_jobs.error` column — structured `[DeployPhase]` prefix makes grep-based triage fast
- **Settings state:** `createServiceClient().from('settings').select('key,value').in('key',['hetzner_api_token','cloudflare_api_token'])` — confirms which API keys are configured

### What assumptions changed

- **T01 was assumed complete** (slice plan had `[x]`) but no files had been modified. Assumptions about prior task completion must be verified by file state, not plan markers. See KN006.
- **`cloudflare_api_token` pre-flight check was assumed necessary** in deploy phase. Removed — `CloudflareClient` enforces its own credential presence (D028 pattern). The pre-flight was duplicate validation.
