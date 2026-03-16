---
id: S02
parent: M011
milestone: M011
---

# S02: Services migration + Settings cleanup

**Goal:** `RsyncService`, `CaddyService`, and `InfraService` read from the `servers` table instead of hardcoded settings keys; `SETTINGS_KEYS` drops all `vps2_*` entries and gains `hetzner_api_token`; the deploy pipeline (`runDeployPhase`) queries the first active server from DB instead of reading `vps2_*` from settings; the `/infra` page shows fleet health (all active servers) instead of a single VPS2 card; `pnpm build` and `pnpm typecheck` pass clean.

**Demo:** After this slice, `grep "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" packages/deployment/src/{infra,rsync,caddy}.ts packages/agents/src/jobs/deploy-site.ts` returns no matches; `pnpm --filter @monster/admin build` exits 0 with `/infra` in the route list; `grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts` returns a match.

## Must-Haves

- `SETTINGS_KEYS` in `constants.ts` no longer contains `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`. Contains `hetzner_api_token`.
- `SaveSettingsSchema` and `SaveSettingsErrors` in `actions.ts` match the updated keys.
- Settings form (`settings-form.tsx`) has no VPS2 Deployment card. Has a `hetzner_api_token` password field under API Keys.
- `RsyncService.deploy(slug, server: Server)` accepts a `Server` record. Hardcodes `/var/www/sites` as remote base (no `vps2SitesRoot` param).
- `CaddyService.writeVirtualhost(domain, slug, server: Server)` accepts a `Server` record.
- `InfraService.getFleetHealth()` queries all `status='active'` rows from `servers` table, SSHes each, returns `FleetHealth`.
- `InfraService.testDeployConnection(serverId?: string)` accepts optional `serverId` or auto-resolves to first active server.
- `FleetHealth` and `ServerHealth` interfaces exported from `@monster/deployment`. `Vps2Health` removed from exports.
- `runDeployPhase()` in `deploy-site.ts` queries first active server from `servers` table; uses `server.tailscale_ip ?? server.public_ip` as host, `server.ssh_user` as user, `server.public_ip` as vps2Ip for Cloudflare A record. No more `vps2_*` settings reads. No `cloudflare_api_token` pre-flight check (CloudflareClient reads its own token internally via D028).
- `/infra` page calls `getFleetHealth()` and renders a fleet table (all servers). Gracefully handles zero active servers.
- `POST /api/infra/test-connection` calls updated `testDeployConnection()`.
- `pnpm --filter @monster/deployment typecheck` exits 0.
- `pnpm --filter @monster/deployment build` exits 0.
- `pnpm --filter @monster/agents build` exits 0.
- `pnpm --filter @monster/admin build` exits 0.

## Proof Level

- This slice proves: operational (callers + services wired to DB; deploy pipeline no longer depends on `vps2_*` settings)
- Real runtime required: no (build + typecheck verification is sufficient; `servers` table is empty in the test environment but the code path handles zero-rows gracefully)
- Human/UAT required: no (deferred to S03 full-flow UAT)

## Verification

```bash
# T01: Settings cleanup
grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts   # present
grep -c "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" apps/admin/src/app/(dashboard)/settings/constants.ts  # 0

# T02: Service signatures
pnpm --filter @monster/deployment typecheck   # exit 0
pnpm --filter @monster/deployment build       # exit 0

# T02: Failure-path observability — verify structured error strings present in dist bundle
grep -c "\[InfraService\] fleet health: 0 active servers" packages/deployment/dist/index.js    # ≥1
grep -c "\[RsyncService\] server.*has no IP address" packages/deployment/dist/index.js        # ≥1
grep -c "\[CaddyService\] server.*has no IP address" packages/deployment/dist/index.js        # ≥1

# T03: Callers + admin build
pnpm --filter @monster/agents build           # exit 0
pnpm --filter @monster/admin build            # exit 0, /infra in route list
grep -rn "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  packages/deployment/src/infra.ts \
  packages/deployment/src/rsync.ts \
  packages/deployment/src/caddy.ts \
  packages/agents/src/jobs/deploy-site.ts    # no matches

# T03: DeployPhase failure-path observability — verify structured error strings in agents dist
grep -c "\[DeployPhase\] no active servers found in servers table" packages/agents/dist/worker.js   # ≥1
grep -c "\[DeployPhase\] server.*has no IP address" packages/agents/dist/worker.js                  # ≥1
grep -c "\[DeployPhase\] using server" packages/agents/dist/worker.js                               # ≥1
```

## Observability / Diagnostics

- Runtime signals: `[InfraService] connecting to <user>@<host> for server "<name>"` per server; `[InfraService] fleet health: N servers` summary; `[DeployPhase] using server "<name>" (<host>)` on deploy start
- Inspection surfaces: `createServiceClient().from('servers').select('*').eq('status','active')` to inspect active server pool; `getFleetHealth()` return value in Next.js server component rendering
- Failure visibility: `[InfraService] fleet health: 0 active servers — returning empty fleet` for zero-server state; `[DeployPhase] no active servers found in servers table` for missing server on deploy
- Redaction constraints: `tailscale_ip` and `public_ip` are not secrets — they're infrastructure coordinates, safe to log

## Integration Closure

- Upstream surfaces consumed: `Server` type from `packages/deployment/src/provisioning.ts`; `servers` table (D145: `status` column is plain text); Supabase `createServiceClient()` from `@monster/db`
- New wiring introduced in this slice: `InfraService.getFleetHealth()` ← `servers` table; `runDeployPhase()` ← `servers` table; Settings UI ← `hetzner_api_token` key
- What remains before the milestone is truly usable end-to-end: S03 — `/infra` full fleet UI, Provision New Server form, `POST /api/infra/provision` real handler

## Tasks

- [x] **T01: Settings cleanup — remove vps2_* keys, add hetzner_api_token** `est:20m`
  - Why: Removes the 4 hardcoded VPS2 settings fields from the constants, schema, and form, replacing them with the `hetzner_api_token` API key field. This has no dependencies on T02/T03.
  - Files: `apps/admin/src/app/(dashboard)/settings/constants.ts`, `apps/admin/src/app/(dashboard)/settings/actions.ts`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
  - Do: Remove `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip` from `SETTINGS_KEYS`. Add `hetzner_api_token`. Update `SaveSettingsSchema` and `SaveSettingsErrors` to remove `vps2_*` fields and add `hetzner_api_token: z.string().optional()`. Remove the entire "VPS2 Deployment" `<Card>` section from the form (3 fields). Remove `vps2_ip` from the Cloudflare card. Add `hetzner_api_token` password field under API Keys card (same pattern as `cloudflare_api_token`).
  - Verify: `grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts` returns a match; `grep -c "vps2_" apps/admin/src/app/(dashboard)/settings/constants.ts` returns 0
  - Done when: All three files are updated, no `vps2_*` references remain in any of the three files, `hetzner_api_token` appears in constants and form

- [x] **T02: Service signatures — update RsyncService, CaddyService, InfraService; export FleetHealth** `est:45m`
  - Why: Migrates the deployment package's service classes to accept a `Server` record from DB instead of bare host/user strings. This is the foundational change that T03 callers depend on.
  - Files: `packages/deployment/src/rsync.ts`, `packages/deployment/src/caddy.ts`, `packages/deployment/src/infra.ts`, `packages/deployment/src/index.ts`
  - Do: (1) `rsync.ts`: change `deploy(slug, server: Server)` — import `Server` from `./provisioning.js`; use `server.tailscale_ip ?? server.public_ip` for host, `server.ssh_user` for user; hardcode remote base as `/var/www/sites`. (2) `caddy.ts`: change `writeVirtualhost(domain, slug, server: Server)` — same `Server` import; use `server.tailscale_ip ?? server.public_ip` for host, `server.ssh_user` for user. (3) `infra.ts`: add `ServerHealth` interface (extends current `Vps2Health` fields + `serverId: string`, `serverName: string`); add `FleetHealth = { servers: ServerHealth[], fetchedAt: string }`; add `getFleetHealth()` that queries `servers` table for `status='active'`, SSHes each (same metric collection as `getVps2Health()`), returns `FleetHealth` with graceful empty state; update `testDeployConnection(serverId?: string)` to accept optional serverId or auto-resolve to first active server from `servers` table; delete `readVps2Settings()` private helper; keep `getVps2Health()` but mark as deprecated and remove internal `readVps2Settings()` call (replace with first-server-from-DB lookup — or remove entirely if not exported). (4) `index.ts`: add `FleetHealth`, `ServerHealth` exports; remove `Vps2Health` export (it's no longer part of the public API).
  - Verify: `pnpm --filter @monster/deployment typecheck` exits 0; `pnpm --filter @monster/deployment build` exits 0
  - Done when: typecheck + build both pass; `grep "vps2_host\|vps2_user\|vps2_sites_root" packages/deployment/src/{rsync,caddy,infra}.ts` returns no matches

- [x] **T03: Caller updates — deploy-site.ts, infra/page.tsx, test-connection route; admin build** `est:45m`
  - Why: Wires the updated service signatures into all callers. This is the integration closure task — after this, no caller reads `vps2_*` settings and the admin panel builds clean.
  - Files: `packages/agents/src/jobs/deploy-site.ts`, `apps/admin/src/app/(dashboard)/infra/page.tsx`, `apps/admin/src/app/api/infra/test-connection/route.ts`
  - Do: (1) `deploy-site.ts`: replace `vps2_host`/`vps2_user`/`vps2_sites_root`/`vps2_ip` settings reads in `runDeployPhase()` with a single Supabase query for the first active server (`from('servers').select('*').eq('status','active').order('created_at',{ascending:true}).limit(1).single()`); import `Server` type from `@monster/deployment`; throw `[DeployPhase] no active servers found in servers table` if no server found; use `server.tailscale_ip ?? server.public_ip` for rsync+caddy host, `server.ssh_user` for user, `server.public_ip` for Cloudflare A record; log `[DeployPhase] using server "<server.name>" (${host})` before rsync step; keep `cloudflare_api_token` settings read (that key is NOT being removed). (2) `infra/page.tsx`: import `FleetHealth`, `ServerHealth` from `@monster/deployment` instead of `Vps2Health`; call `infra.getFleetHealth()` instead of `getVps2Health()`; replace single-server card grid with a fleet table showing all servers with per-server health columns (name, status, reachability, Caddy, disk %, memory, last checked); add graceful empty state when `fleet.servers.length === 0` (message: "No active servers registered yet. Provision a server to get started."). (3) `test-connection/route.ts`: call `infra.testDeployConnection()` — no param change needed if signature auto-resolves.
  - Verify: `pnpm --filter @monster/agents build` exits 0; `pnpm --filter @monster/admin build` exits 0; `grep -rn "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" packages/deployment/src/infra.ts packages/deployment/src/rsync.ts packages/deployment/src/caddy.ts packages/agents/src/jobs/deploy-site.ts` returns no matches; `/infra` appears in admin build route list
  - Done when: all builds pass, no `vps2_*` references remain in the four target files, `/infra` route present in build output

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/settings/constants.ts`
- `apps/admin/src/app/(dashboard)/settings/actions.ts`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
- `packages/deployment/src/rsync.ts`
- `packages/deployment/src/caddy.ts`
- `packages/deployment/src/infra.ts`
- `packages/deployment/src/index.ts`
- `packages/agents/src/jobs/deploy-site.ts`
- `apps/admin/src/app/(dashboard)/infra/page.tsx`
- `apps/admin/src/app/api/infra/test-connection/route.ts`
