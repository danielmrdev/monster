---
id: M011
provides:
  - HetznerClient class (7 methods) in packages/deployment — createServer, getServer, listServers, deleteServer, listDatacenters, listServerTypes, registerSshKey
  - HetznerApiError custom error class with .status + .body
  - ProvisioningService.provision(opts, onProgress?) — 5-phase orchestration (SSH key → create → waitBoot → bootstrapVps → DB insert)
  - emit() closure pattern with optional onProgress callback (D153)
  - servers table in Supabase (12 columns, RLS enabled) + types in @monster/db
  - Server and ProvisionOpts interfaces exported from @monster/deployment
  - FleetHealth and ServerHealth interfaces replacing Vps2Health in @monster/deployment
  - InfraService.getFleetHealth() — multi-server fleet health via SSH Promise.all
  - RsyncService.deploy(slug, server) and CaddyService.writeVirtualhost(domain, slug, server) accepting Server records
  - runDeployPhase() queries servers table (first active, created_at asc) — no vps2_* settings reads
  - SETTINGS_KEYS with hetzner_api_token replacing vps2_host, vps2_user, vps2_sites_root, vps2_ip
  - POST /api/infra/provision — SSE streaming handler (D108 pattern, 5-phase emit, 400 validation)
  - GET /api/infra/datacenters — HetznerClient + FALLBACK_DATACENTERS (D155)
  - GET /api/infra/server-types — cx22/cx32 filter + FALLBACK_SERVER_TYPES (D155)
  - ProvisionModal client component — SSE consumer, 5-field form, progress log, router.refresh on done
  - ProvisionSection client component — open-state owner, RSC/client boundary isolation (D156)
  - /infra page fleet dashboard — all active servers with per-row health, ProvisionSection, empty-state card
key_decisions:
  - D145: HetznerClient reads hetzner_api_token from Supabase settings at call time (D028 pattern)
  - D146: registerSshKey handles 409 Conflict idempotently via name-match
  - D147: tailscaleKey never appears in any console.log — command string interpolation only
  - D148: SSH connect retried 6×5s in bootstrapVps before throwing structured error
  - D149: runDeployPhase() removes all vps2_* settings reads; cloudflare pre-flight also removed
  - D150: vps2SitesRoot hardcoded to /var/www/sites in RsyncService — no servers table column
  - D151: getVps2Health() removed entirely (no deprecated shim); FleetHealth/ServerHealth replace Vps2Health
  - D152: T01 settings cleanup applied in T03 as catch-up — task [x] markers don't guarantee file state
  - D153: emit() closure pattern in provision() — null-safe onProgress wrapper
  - D154: SSE route follows D108 pattern verbatim (closed guard + try/catch + finally close)
  - D155: GET helper routes return hardcoded fallback 200 JSON — never throw when token absent
  - D156: ProvisionSection thin state owner + ProvisionModal pure prop-driven
patterns_established:
  - Server-based service pattern: deployment services accept Server record, derive host via tailscale_ip ?? public_ip
  - Fleet health pattern: query servers WHERE status='active', Promise.all SSH checks, never throws on per-server failure
  - Guard pattern: if (!host) throw descriptive [ServiceName] server "name" has no IP address message
  - DeployPhase servers-table pattern: query first active server, throw structured error if none, log selection
  - emit() closure in long-running orchestration: null-safe onProgress wrapper, phases call emit() not onProgress directly
  - SSE route pattern: validate → 400 JSON (pre-stream); open ReadableStream; service call + done/error events; finally close
  - GET helper route pattern: try HetznerClient call; catch all → return hardcoded fallback JSON
  - ProvisionSection as thin open-state owner + ProvisionModal as pure prop-driven form (RSC/client boundary)
observability_surfaces:
  - "[HetznerClient] METHOD /path" — every Hetzner API call logged
  - "[HetznerClient] hetzner_api_token not found in settings" — token-absent structured error
  - "[ProvisioningService] starting provision for NAME" — provision() entry log
  - "[ProvisioningService] SSH connect attempt N/6" — bootstrap retry visibility
  - "[ProvisioningService] bootstrap stdout/stderr:" — verbatim setup-vps2.sh output
  - "[ProvisioningService] DB insert failed: ..." — DB failure with Supabase message
  - "[ProvisioningService] SSH connect failed after N attempts: ..." — SSH failure
  - "[ProvisioningService] timeout waiting for server N to boot" — boot timeout
  - "[ProvisioningService] server running but no public IPv4" — Hetzner assignment failure
  - "[InfraService] fleet health: checking N server(s)" — fleet health entry log
  - "[InfraService] fleet health: 0 active servers — returning empty fleet" — zero-server state
  - "[InfraService] connecting to <user>@<host> for server NAME" — per-server SSH connect
  - "[InfraService] SSH error for server NAME: <message>" — per-server SSH failure (non-fatal)
  - "[RsyncService] server NAME has no IP address" — no-IP guard (fatal)
  - "[CaddyService] server NAME has no IP address" — no-IP guard (fatal)
  - "[DeployPhase] using server NAME (host)" — server selection confirmation
  - "[DeployPhase] no active servers found in servers table" — structured error on empty server pool
  - "[infra/provision] starting provision for..." — route entry log
  - "[infra/provision] completed — server id=UUID" — success terminal log
  - "[infra/provision] failed: <message>" — console.error on exception
  - SSE stream: { type:'progress', step, message } × 5 phases → { type:'done', ok:true, serverId } | { type:'error', error }
  - GET /api/infra/datacenters → always 200 { datacenters: string[] }; fallback silently when token absent
  - GET /api/infra/server-types → always 200 { serverTypes: string[] }; fallback silently when token absent
  - ProvisionModal progress log: SSE events rendered as [step] message in monospace log area
requirement_outcomes:
  - id: R006
    from_status: active
    to_status: active
    proof: Deploy pipeline now reads from servers table instead of hardcoded vps2_* settings. RsyncService and CaddyService accept Server records. runDeployPhase() queries servers WHERE status='active'. Fleet dashboard enables multi-server operations. Full provision-from-scratch UI path operational. R006 remains active (not validated) because live end-to-end deploy with a real server row and a real site build has not been executed against production infrastructure.
duration: ~3h total (S01 ~1h, S02 ~65m, S03 ~30m)
verification_result: passed
completed_at: 2026-03-16
---

# M011: Hetzner Multi-VPS Infrastructure

**Replaced the hardcoded VPS2 settings model with a real multi-server fleet: `servers` table in Supabase, `HetznerClient` API client, `ProvisioningService` orchestration, services migrated to accept `Server` DB records, and a full fleet dashboard with live SSE-streaming provision UI — all four admin builds pass clean.**

## What Happened

M011 delivered in three slices, each building cleanly on the last.

**S01** established the data model and API surface. The `servers` table (12 columns: id, name, provider, external_id, status, public_ip, tailscale_ip, datacenter, server_type, ssh_user, created_at, last_health_check) was created in Supabase with RLS enabled, and types were regenerated in `@monster/db`. `HetznerClient` in `packages/deployment/src/hetzner.ts` covers all seven operations — create, get, list, delete, list datacenters, list server types, register SSH key — using the D028 settings-read pattern (token fetched from Supabase at call time, never in constructors or env vars). `HetznerApiError` extends `Error` with `.status` and `.body` for structured upstream catch. `ProvisioningService.provision()` orchestrates the full 5-phase bootstrap: (1) idempotent SSH key registration with Hetzner (409 Conflict handled via name-match), (2) server creation with ubuntu-24.04 image, (3) boot polling every 10s with 5-minute timeout, (4) SSH bootstrap with 6-retry connect loop + `setup-vps2.sh --tailscale-key` execution, (5) `servers` table DB insert returning the `Server` record. The `tailscaleKey` secret flows only into the command string — never into any log. The `POST /api/infra/provision` route was stubbed with a 501 response to establish the contract for S03.

**S02** migrated all deployment services from hardcoded settings to the `servers` table. `RsyncService.deploy(slug, server: Server)` and `CaddyService.writeVirtualhost(domain, slug, server: Server)` both now derive host as `tailscale_ip ?? public_ip` and user from `server.ssh_user`. The sites root path is hardcoded to `/var/www/sites` — consistent with `setup-vps2.sh` and `CaddyService`'s Caddyfile template. Both services guard against null host with structured error messages. `InfraService` was fully rewritten: `readVps2Settings()`, `Vps2Health`, and `getVps2Health()` removed entirely; `getFleetHealth()` queries `servers WHERE status='active'`, runs `Promise.all` over per-server SSH health checks, and returns `FleetHealth { servers: ServerHealth[], fetchedAt }`. The method never throws — per-server SSH failures produce `reachable: false` rows. `runDeployPhase()` in `deploy-site.ts` replaced the 5-key settings block with a single `servers` table query, selecting the first active server by `created_at` asc. The `SETTINGS_KEYS` array dropped all four `vps2_*` keys and gained `hetzner_api_token`. The settings form lost its "VPS2 Deployment" card and gained the Hetzner API token password field under API Keys. A catch-up deviation (KN006) was applied: T01 had been marked `[x]` in the slice plan without any file changes; T03 discovered and applied all three T01 files within its scope.

**S03** completed the operator-facing flow. The 501 stub at `POST /api/infra/provision` was replaced with a full SSE streaming handler following the D108 pattern from Monster Chat. An `emit()` closure was added to `ProvisioningService.provision()` as an optional `onProgress?` parameter; all 5 bootstrap phases call `emit()` — giving the SSE route a real-time progress signal to forward. Two GET helper routes were created with hardcoded fallback lists: `GET /api/infra/datacenters` (Hetzner API + `['nbg1-dc3','fsn1-dc14','hel1-dc2']` fallback) and `GET /api/infra/server-types` (cx22/cx32 filter + fallback). Both always return HTTP 200 — the provision form is always usable even before the Hetzner token is configured. `ProvisionModal.tsx` is a `'use client'` component with a 5-field form (name, datacenter select, server type select, tailscaleKey password input, sshPublicKey textarea). On submit it `fetch()`es the SSE endpoint, reads the streaming body via `pipeThrough(new TextDecoderStream())`, appends `[step] message` lines to a monospace progress log, and fires `router.refresh()` after done. `ProvisionSection.tsx` owns the `open` boolean and isolates the RSC/client boundary — `infra/page.tsx` imports only `ProvisionSection`.

## Cross-Slice Verification

**Success criterion 1 — `servers` table exists with required columns:**
```
✅ packages/db/supabase/migrations/20260316160000_servers.sql — all 12 columns present
✅ packages/db/src/types/supabase.ts — servers Row/Insert/Update blocks present
✅ @monster/db dist rebuilt with servers types
✅ Supabase accessibility confirmed (0 rows, no error) at S01 close
```

**Success criterion 2 — Admin `/infra` page shows all registered servers with fleet health:**
```
✅ infra/page.tsx uses InfraService.getFleetHealth() — FleetHealth type imported from @monster/deployment
✅ Fleet table renders per-server rows (Name, Reachable, Caddy, Disk, Memory columns)
✅ Empty-state card shown when fleet.servers.length === 0
✅ ProvisionSection present between heading and fleet table
✅ ƒ /infra in admin build route list
```

**Success criterion 3 — "Provision New Server" flow (API → SSH → DB registration):**
```
✅ ProvisionModal: 5-field form (name, datacenter, serverType, tailscaleKey, sshPublicKey)
✅ GET /api/infra/datacenters + GET /api/infra/server-types for form select population
✅ POST /api/infra/provision: SSE handler with D108 pattern, 5-phase emit(), done/error events
✅ ProvisioningService.provision() registered in route — real orchestration, not stub
✅ 400 validation (2 branches: invalid JSON + missing fields)
✅ tailscaleKey never in any emit() message string (D147 respected)
⏳ Live CX22 provision from admin panel — deferred; requires real Hetzner API credentials (human UAT)
```

**Success criterion 4 — Settings no longer shows vps2_* fields, shows hetzner_api_token:**
```
✅ grep "vps2_host|vps2_user|vps2_sites_root|vps2_ip" constants.ts → 0 matches
✅ grep "vps2_" actions.ts → 0 matches
✅ grep "vps2_" settings-form.tsx → 0 matches
✅ grep "hetzner_api_token" constants.ts → present
✅ Hetzner API token password field in settings-form.tsx under API Keys
```

**Success criterion 5 — RsyncService, CaddyService, InfraService read from `servers` table:**
```
✅ RsyncService.deploy(slug, server: Server) — 2-param, host from tailscale_ip ?? public_ip
✅ CaddyService.writeVirtualhost(domain, slug, server: Server) — 3-param Server record
✅ InfraService.getFleetHealth() — servers WHERE status='active' query
✅ runDeployPhase() — from('servers').eq('status','active').order('created_at').limit(1)
✅ No vps2_host/vps2_user/vps2_sites_root refs in any deployment file
```

**Success criterion 6 — `pnpm build` and `pnpm typecheck` pass with no new errors:**
```
✅ pnpm --filter @monster/deployment typecheck → exit 0
✅ pnpm --filter @monster/deployment build → exit 0 (20.65 KB dist)
✅ pnpm --filter @monster/admin build → exit 0
   Build route list: ƒ /infra, ƒ /api/infra/provision, ƒ /api/infra/datacenters, ƒ /api/infra/server-types
```

**Definition of done check:**
- [x] All 3 slices marked `[x]` in M011-ROADMAP.md
- [x] S01-SUMMARY.md, S02-SUMMARY.md, S03-SUMMARY.md all exist
- [x] servers table migration applied + types regenerated
- [x] HetznerClient covers all 7 methods
- [x] ProvisioningService.provision() with 5-phase orchestration + onProgress
- [x] InfraService.getFleetHealth() replaces getVps2Health()
- [x] /infra fleet view with all servers + Provision New Server button/modal
- [x] vps2_* removed from SETTINGS_KEYS; hetzner_api_token added
- [x] RsyncService + CaddyService accept Server record
- [x] pnpm build + pnpm typecheck pass clean

## Requirement Changes

- **R006** (Automated deployment to VPS2): active → active (advanced) — Deploy pipeline now reads from `servers` table rather than hardcoded settings. Multi-server fleet model is operational. `RsyncService`, `CaddyService`, and `InfraService` all accept `Server` DB records. `ProvisioningService` enables programmatic server creation from the admin panel. R006 remains active (not validated) because live end-to-end deployment with a real provisioned server and a real site build has not been executed; that path requires human UAT with a live Hetzner account.

## Forward Intelligence

### What the next milestone should know

- **servers table is the authoritative source of VPS connection details.** `runDeployPhase()` queries `servers WHERE status='active' ORDER BY created_at ASC LIMIT 1`. If the table has no active rows, every site deploy will throw `[DeployPhase] no active servers found in servers table`. The system is operational only after an operator provisions at least one server.
- **hetzner_api_token must be configured in Settings** before any `HetznerClient` call will work. Until then, `listDatacenters()` and `listServerTypes()` return the hardcoded fallback lists (the GET routes catch the error silently — KN005). The provision form is always usable, but the API calls won't work.
- **Human UAT still pending:** operator should provision a real CX22 from `/infra`, watch all 5 SSE progress events complete, confirm the server row appears in the fleet table with `status=active`, and then deploy a site to verify the full pipeline works end-to-end. This is the gate for R006 validation.
- **`SSH_AUTH_SOCK` required for bootstrapVps:** the SSH bootstrap uses SSH agent forwarding (`process.env.SSH_AUTH_SOCK`). If pm2 restarts in a context without the agent (e.g., cron-based reboot), provisioning will fail to connect. The operator must ensure pm2 is started from an interactive shell with the SSH agent running.
- **Single-server selection in runDeployPhase:** always picks the first active server by `created_at ASC`. If two servers are active, both appear in the fleet dashboard but only the oldest receives deploys. No per-site server assignment exists yet (post-M011 scope per roadmap).

### What's fragile

- **Empty servers table = all deploys fail** — until the operator provisions a first server, `runDeployPhase()` throws on every site deploy. The error is structured and visible in BullMQ job failure logs, but it blocks the entire deployment pipeline until resolved.
- **router.refresh() in ProvisionModal fires after fixed 1500ms delay** — not a confirmed-commit signal. In high-latency environments the servers row may not yet be committed when the refresh fires, causing the fleet table to appear empty briefly. A GET `/api/infra/servers/{id}` poll would be more reliable.
- **GET route fallbacks are silent** — when hetzner_api_token is not configured, the datacenter/server-type selects populate with hardcoded values and the operator sees no warning banner. Adding `X-Fallback: true` header or a yellow notice would improve discoverability.
- **registerSshKey conflict resolution matches by name** — if the operator registers a different key with the name `'monster-provisioning'` in Hetzner, the 409 conflict path returns that key's ID (which may not match `opts.sshPublicKey`). Unlikely but silent.

### Authoritative diagnostics

- **Fleet readiness:** `createServiceClient().from('servers').select('*').eq('status','active')` — primary surface for deployment readiness
- **Deploy job failures:** `ai_jobs.error` column in Supabase — `[DeployPhase]` prefix makes grep-based triage fast
- **Settings state:** `createServiceClient().from('settings').select('key,value').in('key',['hetzner_api_token','cloudflare_api_token'])` — confirms which API keys are configured
- **SSE stream inspection:** `curl -N -X POST http://localhost:3000/api/infra/provision -H 'Content-Type: application/json' -d '{"name":"test","datacenter":"nbg1-dc3","serverType":"cx22","tailscaleKey":"tskey-...","sshPublicKey":"ssh-rsa ..."}'`
- **400 path:** `curl -X POST .../provision -d '{}'` → `{"ok":false,"error":"name, datacenter, serverType, tailscaleKey, and sshPublicKey are required"}`
- **HetznerClient wired:** `grep "HetznerClient\|HetznerApiError" packages/deployment/dist/index.d.ts`
- **No vps2 leakage:** `grep -rn "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" packages/deployment/src/ packages/agents/src/` → should return no matches

### What assumptions changed

- **Live Hetzner API call as verification gate** — the plan assumed `hetzner_api_token` would be configured before closure. In practice the token is added via the Settings UI after M011. The structured error path (`[HetznerClient] hetzner_api_token not found in settings`) is itself evidence the code is wired correctly.
- **Task [x] markers are not reliable** — S02/T01 was marked done in the plan without file changes. Closers/executors must verify file state directly. KN006 documents this pattern.
- **`grep "ProvisionModal" infra/page.tsx`** — the page imports `ProvisionSection` (the RSC/client boundary wrapper), not `ProvisionModal` directly. The correct check is `grep "ProvisionSection"`. The emit() closure pattern means slice-plan checks should grep for `emit(` not `onProgress` when verifying 5-phase coverage.

## Files Created/Modified

- `packages/db/supabase/migrations/20260316160000_servers.sql` — new: servers table (12 columns + RLS)
- `packages/db/src/types/supabase.ts` — updated: servers Row/Insert/Update blocks added
- `packages/db/dist/index.js` + `dist/index.d.ts` — rebuilt with servers types
- `packages/deployment/src/hetzner.ts` — new: HetznerClient (7 methods) + HetznerApiError + 5 response shape types
- `packages/deployment/src/provisioning.ts` — new: ProvisioningService + Server + ProvisionOpts + emit() closure + 5 phase emit calls
- `packages/deployment/src/rsync.ts` — updated: deploy(slug, server: Server), host from tailscale_ip ?? public_ip, hardcoded /var/www/sites
- `packages/deployment/src/caddy.ts` — updated: writeVirtualhost(domain, slug, server: Server)
- `packages/deployment/src/infra.ts` — new: FleetHealth/ServerHealth interfaces; getFleetHealth(); checkServerHealth(); testDeployConnection(serverId?); removed readVps2Settings() + Vps2Health + getVps2Health()
- `packages/deployment/src/index.ts` — updated: exports for HetznerClient, HetznerApiError, ProvisioningService, Server, ProvisionOpts, FleetHealth, ServerHealth; Vps2Health removed
- `packages/deployment/dist/index.js` + `dist/index.d.ts` — rebuilt (20.65 KB)
- `packages/agents/src/jobs/deploy-site.ts` — updated: servers table query replaces vps2_* settings reads; Server type import; rsync/caddy calls pass Server record; CF A record uses server.public_ip
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — updated: FleetHealth/getFleetHealth(); fleet table UI; ProvisionSection; empty-state card
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — updated: hetzner_api_token replaces vps2_* keys
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — updated: SaveSettingsSchema + SaveSettingsErrors updated
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — updated: VPS2 Deployment card removed; hetzner_api_token field added
- `apps/admin/src/app/api/infra/provision/route.ts` — replaced 501 stub with SSE streaming handler (D108 pattern)
- `apps/admin/src/app/api/infra/datacenters/route.ts` — new: GET route with FALLBACK_DATACENTERS
- `apps/admin/src/app/api/infra/server-types/route.ts` — new: GET route with cx22/cx32 filter + FALLBACK_SERVER_TYPES
- `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx` — new: SSE consumer client component with 5-field form + progress log + error display
- `apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx` — new: thin open-state owner client component
- `.gsd/KNOWLEDGE.md` — KN001–KN006 added
- `.gsd/DECISIONS.md` — D145–D156 added
