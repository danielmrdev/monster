# M011: Hetzner Multi-VPS Infrastructure

**Vision:** Replace the hardcoded VPS2 settings with a real multi-server model: a `servers` table in DB that tracks every Hetzner VPS, a Hetzner Cloud API client that creates/destroys servers programmatically, and an admin flow that provisions a new Caddy site-server from scratch (API → SSH bootstrap → DB registration) in one operator action. The `/infra` page evolves from a single-VPS health widget into a fleet dashboard that shows all registered servers. Settings loses the VPS2 hardcoded fields and gains a `hetzner_api_token`.

## Success Criteria

- `servers` table exists in Supabase with columns: `id, name, provider, external_id, status, public_ip, tailscale_ip, datacenter, server_type, ssh_user, created_at, last_health_check`.
- Admin `/infra` page shows all registered servers (not just a single VPS2), with per-server health (reachability, Caddy status, disk, memory) fetched live via SSH.
- "Provision New Server" flow: operator fills name + datacenter + server type → Hetzner API creates CX22/CX32 → `setup-vps2.sh` is executed remotely via SSH → server registered in `servers` table with `status='active'`. Operator provides Tailscale key in the form (not stored; used once).
- Settings page no longer shows `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`. Shows `hetzner_api_token` instead.
- `RsyncService`, `CaddyService`, and `InfraService` read server connection details from the `servers` table (by server `id` or by selecting active server), not from settings.
- `pnpm build` and `pnpm typecheck` pass with no new errors.

## Key Risks / Unknowns

- Hetzner API SSH key management — when creating a server via API, an SSH public key must be pre-registered in Hetzner or passed at creation time; the operator flow must handle this cleanly without storing private keys in DB.
- Tailscale auth key is one-time-use — must be collected at provision time in the form, never persisted; but the SSH bootstrap needs it passed to `setup-vps2.sh --tailscale-key`.
- Backward compatibility during transition — existing `vps2_host`/`vps2_user`/`vps2_sites_root` settings records must be migrated (or referenced) until the `servers` table is the sole source of truth, and any existing deployments must not break.

## Proof Strategy

- Hetzner API SSH key management → retire in S01 by having `HetznerClient.createServer()` accept an SSH public key string, register it with Hetzner API if not already registered, and receive a booted server with that key installed — verified by successful SSH login immediately after creation.
- Backward compatibility → retire in S02 by migrating `RsyncService` and `CaddyService` callers to pass a `Server` record from DB, with a compatibility shim for existing call sites that still pass host/user directly.

## Verification Classes

- Contract verification: `pnpm --filter @monster/deployment typecheck` exits 0; `pnpm --filter @monster/admin build` exits 0 with `/infra` in route list; `bash -n scripts/setup-vps2.sh` exits 0 (no changes needed to script).
- Integration verification: `HetznerClient.listDatacenters()` returns real Hetzner datacenter list (live API call); `POST /api/infra/provision` returns structured `{ ok, serverId?, error? }`.
- Operational verification: existing `RsyncDeployJob` and `CaddyService` calls continue working after services switch to reading from `servers` table.
- UAT / human verification: operator provisions a real CX22 on Hetzner from `/infra` UI, waits for bootstrap to complete, sees server appear as healthy in fleet view.

## Milestone Definition of Done

This milestone is complete only when all are true:

- `servers` table migration is applied and exported Supabase types are regenerated.
- `HetznerClient` in `packages/deployment/src/hetzner.ts` covers: create server, delete server, get server, list servers, list datacenters, list server types, register SSH key.
- `ProvisioningService` in `packages/deployment/src/provisioning.ts` orchestrates: create Hetzner server → wait for boot → run setup-vps2.sh via SSH → register in `servers` table → return server record.
- `InfraService.getFleetHealth()` returns health for all active servers (replaces `getVps2Health()`).
- `/infra` page renders fleet view with all servers; "Provision New Server" button opens a form/modal.
- Settings: `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip` removed from SETTINGS_KEYS and form. `hetzner_api_token` added.
- `RsyncService` and `CaddyService` updated to accept a `Server` record (or `serverId`) instead of bare host/user strings. Existing callers updated.
- `pnpm build` and `pnpm typecheck` pass clean.
- Success criteria re-checked against DB state and running admin panel.

## Requirement Coverage

- Covers: none from REQUIREMENTS.md (infra-ops milestone)
- Partially covers: R006 (deployment pipeline is now properly multi-server, not tied to a hardcoded host)
- Leaves for later: actual site-to-server assignment UI (which site deploys to which server)
- Orphan risks: none

## Slices

- [x] **S01: Hetzner API Client + servers table** `risk:high` `depends:[]`
  > After this: `HetznerClient` can create/list/delete Hetzner VPS servers via real API; `servers` table exists in Supabase; `ProvisioningService.provision()` creates a server, SSHs in, runs setup-vps2.sh, and inserts a row in `servers` — verified by `pnpm typecheck` exit 0 + contract test against Hetzner API listing datacenters.

- [x] **S02: Services migration + Settings cleanup** `risk:medium` `depends:[S01]`
  > After this: `RsyncService`, `CaddyService`, and `InfraService` all read from `servers` table; settings form no longer shows VPS2 fields, shows `hetzner_api_token` instead; `SETTINGS_KEYS` updated; existing deploy pipeline still works (reads first active server from DB).

- [x] **S03: Infra fleet dashboard + Provision UI** `risk:low` `depends:[S01,S02]`
  > After this: `/infra` shows all servers in a fleet table with per-row health status; "Provision New Server" form lets operator fill datacenter + server type + Tailscale key, calls `POST /api/infra/provision`, and polls for completion — full flow exercisable from the admin panel.

## Boundary Map

### S01 → S02

Produces:
- `packages/deployment/src/hetzner.ts` — `HetznerClient` class: `createServer()`, `deleteServer()`, `getServer()`, `listServers()`, `listDatacenters()`, `listServerTypes()`, `registerSshKey()`
- `packages/deployment/src/provisioning.ts` — `ProvisioningService.provision(opts)`: creates Hetzner server, waits for boot, SSHs in, runs setup-vps2.sh, inserts `servers` row, returns `Server` record
- Supabase migration: `servers` table with `id, name, provider, external_id, status, public_ip, tailscale_ip, datacenter, server_type, ssh_user, created_at, last_health_check`
- `packages/db/src/types/supabase.ts` regenerated with `servers` table types
- `Server` type exported from `packages/deployment/src/index.ts`

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- (same as S01 → S02)
- `POST /api/infra/provision` route contract: `{ name, datacenter, serverType, tailscaleKey, sshPublicKey } → { ok, serverId?, error? }`

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- `InfraService.getFleetHealth()` — returns `FleetHealth: { servers: ServerHealth[] }` where each `ServerHealth` includes reachability, Caddy status, disk, memory for one server
- Updated `RsyncService` and `CaddyService` signatures accepting `Server` record
- `SETTINGS_KEYS` without `vps2_*`, with `hetzner_api_token`

Consumes from S01:
- `servers` table schema stable
- `Server` type exported from `@monster/deployment`

### S03 → (none)

Produces:
- `/infra` fleet table component (server component + client refresh button)
- `ProvisionModal` client component — form + SSE/polling for provision progress
- `POST /api/infra/provision` route handler (calls `ProvisioningService.provision()`)
- Updated `apps/admin/src/app/(dashboard)/infra/page.tsx` using `getFleetHealth()`

Consumes from S01:
- `ProvisioningService.provision()` callable from route handler
- `HetznerClient.listDatacenters()` + `listServerTypes()` for form selects

Consumes from S02:
- `InfraService.getFleetHealth()` for fleet table data
