---
id: T02
parent: S02
milestone: M011
provides:
  - RsyncService.deploy(slug, server: Server) with 2-param Server-based signature
  - CaddyService.writeVirtualhost(domain, slug, server: Server) with 3-param Server-based signature
  - InfraService.getFleetHealth() returning FleetHealth with per-server SSH health metrics
  - InfraService.testDeployConnection(serverId?: string) reading from servers table
  - FleetHealth and ServerHealth interfaces exported from @monster/deployment
key_files:
  - packages/deployment/src/rsync.ts
  - packages/deployment/src/caddy.ts
  - packages/deployment/src/infra.ts
  - packages/deployment/src/index.ts
key_decisions:
  - Removed getVps2Health() entirely (not just deprecated) — T03 updates page.tsx immediately so no window where it's needed
  - Removed readVps2Settings() helper — replaced by direct servers table queries
  - Hardcoded sitesRoot='/var/www/sites' in RsyncService (no param) per D063
  - testDeployConnection uses .single() query for both serverId and auto-resolve paths
patterns_established:
  - Server-based service pattern: all deployment services accept Server record, derive host via tailscale_ip ?? public_ip
  - Fleet health pattern: query servers WHERE status='active', Promise.all SSH checks, never throws
  - Guard pattern: if (!host) return/throw with descriptive [ServiceName] server "name" has no IP address message
observability_surfaces:
  - "[InfraService] fleet health: checking N server(s)" — fleet health entry
  - "[InfraService] fleet health: 0 active servers — returning empty fleet" — zero-server state
  - "[InfraService] connecting to <user>@<host> for server \"<name>\"" — per-server SSH connect
  - "[InfraService] SSH error for server \"<name>\": <message>" — per-server SSH failure
  - "[RsyncService] server \"<name>\" has no IP address" — no-IP guard
  - "[CaddyService] server \"<name>\" has no IP address" — no-IP guard
duration: 25m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Service signatures — update RsyncService, CaddyService, InfraService; export FleetHealth

**Migrated RsyncService, CaddyService, and InfraService to accept a `Server` DB record instead of bare host/user strings; added `FleetHealth`/`ServerHealth` interfaces with `getFleetHealth()` fleet-wide SSH health check; both typecheck and build pass clean.**

## What Happened

Updated all four deployment package source files:

1. **`rsync.ts`**: Changed `deploy(slug, server: Server)` — imports `Server` from `./provisioning.js`, derives `host = server.tailscale_ip ?? server.public_ip` and `user = server.ssh_user`, hardcodes `sitesRoot = '/var/www/sites'`. Guards against null host with descriptive error. Completion log now uses `host` instead of old `vps2Host`.

2. **`caddy.ts`**: Changed `writeVirtualhost(domain, slug, server: Server)` — same `Server` import pattern; derives host/user from server fields; guards against null host before SSH connect.

3. **`infra.ts`**: Full rewrite. Removed `Vps2Health` interface, `readVps2Settings()` helper, `getVps2Health()` method. Added `ServerHealth` and `FleetHealth` interfaces. Added `getFleetHealth()` that queries `servers` table for `status='active'`, runs `Promise.all` over per-server SSH checks. Added private `checkServerHealth()` with same metric collection logic (caddy/df/free) as old `getVps2Health()`. Updated `testDeployConnection(serverId?: string)` to query `servers` table — uses serverId if provided, else auto-resolves to first active server.

4. **`index.ts`**: Replaced `Vps2Health` export with `FleetHealth` and `ServerHealth` exports.

`getVps2Health()` was removed entirely rather than deprecated — T03 updates `page.tsx` in the same slice, so there's no gap where callers would need the old method.

## Verification

```
pnpm --filter @monster/deployment typecheck  → exit 0 (no output = clean)
pnpm --filter @monster/deployment build      → exit 0, dist/index.js 19.72 KB, dist/index.d.ts 5.33 KB

grep -c "vps2_host|vps2_user|vps2_sites_root" rsync.ts caddy.ts infra.ts  → all 0

grep "FleetHealth|ServerHealth" dist/index.d.ts:
  line 60: interface ServerHealth { ... }
  line 70: interface FleetHealth { servers: ServerHealth[]; fetchedAt: string; }
  line 187: export { ..., type FleetHealth, ..., type ServerHealth }

grep "Vps2Health" dist/index.d.ts → no match (correct)

# Failure-path observability in dist bundle:
grep "[InfraService] fleet health: 0 active servers" dist/index.js → 1 match
grep "has no IP address" dist/index.js → 3 matches (RsyncService + CaddyService + checkServerHealth)
```

## Diagnostics

- **Fleet health (zero servers):** `[InfraService] fleet health: 0 active servers — returning empty fleet` — emitted when `servers` table has no active rows
- **Per-server SSH failure:** `[InfraService] SSH error for server "name": <message>` — emitted per server when SSH connect fails; does not abort fleet check
- **No-IP guard:** `[RsyncService] server "name" has no IP address` / `[CaddyService] server "name" has no IP address` — emitted when server record has both `tailscale_ip` and `public_ip` as null
- **DB query failure:** `[InfraService] failed to query servers table: <message>` — emitted when Supabase query returns error; returns empty fleet

## Deviations

- **`getVps2Health()` removed entirely** (plan said "keep deprecated or remove entirely — recommended: remove"). Chose removal since T03 updates the only caller (`infra/page.tsx`) in the same slice.

## Known Issues

None.

## Files Created/Modified

- `packages/deployment/src/rsync.ts` — `deploy(slug, server: Server)` 2-param signature, derives host from server fields, hardcodes `/var/www/sites`
- `packages/deployment/src/caddy.ts` — `writeVirtualhost(domain, slug, server: Server)` 3-param signature, derives host/user from server fields
- `packages/deployment/src/infra.ts` — `FleetHealth`/`ServerHealth` interfaces; `getFleetHealth()`; private `checkServerHealth()`; `testDeployConnection(serverId?)`; `readVps2Settings()` deleted; `Vps2Health`/`getVps2Health()` removed
- `packages/deployment/src/index.ts` — exports `FleetHealth`, `ServerHealth`; `Vps2Health` removed
- `.gsd/milestones/M011/slices/S02/S02-PLAN.md` — added failure-path observability verification checks; marked T02 `[x]`
