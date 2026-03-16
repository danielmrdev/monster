# T02: Service signatures — update RsyncService, CaddyService, InfraService; export FleetHealth

**Slice:** S02 — Services migration + Settings cleanup  
**Estimate:** 45m  
**Status:** pending

## Description

Migrate the three service classes in `packages/deployment` to accept a `Server` record from DB instead of bare host/user strings. Add `FleetHealth` / `ServerHealth` interfaces and `getFleetHealth()` to `InfraService`. Update `index.ts` exports. Rebuild `@monster/deployment`. T03 callers depend on these updated signatures.

## Why

`RsyncService`, `CaddyService`, and `InfraService` currently accept/read hardcoded `vps2_*` settings. After S02, all three must read from the `servers` table. The service-level signature change here is the foundation that T03 caller updates build on. Both must complete before the admin package can build cleanly.

## Inputs

- `packages/deployment/src/rsync.ts` — current signature: `deploy(slug, vps2Host, vps2User, vps2SitesRoot)`
- `packages/deployment/src/caddy.ts` — current signature: `writeVirtualhost(domain, slug, vps2Host, vps2User)`
- `packages/deployment/src/infra.ts` — contains `Vps2Health`, `readVps2Settings()`, `getVps2Health()`, `testDeployConnection()`
- `packages/deployment/src/index.ts` — current exports including `Vps2Health`
- `packages/deployment/src/provisioning.ts` — exports `Server` interface (source type)

**`Server` interface (from provisioning.ts):**
```ts
export interface Server {
  id: string;
  name: string;
  provider: string;
  external_id: number | null;
  status: string;
  public_ip: string | null;
  tailscale_ip: string | null;
  datacenter: string | null;
  server_type: string | null;
  ssh_user: string;
  created_at: string;
  last_health_check: string | null;
}
```

## Steps

### 1. Update `rsync.ts`

Replace the 4-parameter signature with `Server`-based signature:

```ts
import type { Server } from './provisioning.js';

export class RsyncService {
  deploy(slug: string, server: Server): Promise<void> {
    const host = server.tailscale_ip ?? server.public_ip;
    const user = server.ssh_user;
    const sitesRoot = '/var/www/sites';  // hardcoded — matches CaddyService (D063)

    if (!host) {
      return Promise.reject(new Error(`[RsyncService] server "${server.name}" has no IP address`));
    }

    const monorepoRoot = process.cwd();
    const sourcePath = join(monorepoRoot, '.generated-sites', slug, 'dist') + '/';
    const remotePath = `${user}@${host}:${sitesRoot}/${slug}/dist/`;

    // ... rest of spawn logic unchanged, replace vps2Host references with host
  }
}
```

Key changes:
- Import `Server` type from `./provisioning.js`
- Drop `vps2Host`, `vps2User`, `vps2SitesRoot` params
- Add `server: Server` param
- Derive `host = server.tailscale_ip ?? server.public_ip`
- Derive `user = server.ssh_user`
- Hardcode `sitesRoot = '/var/www/sites'`
- Guard: if `host` is null, reject with descriptive error
- Log message: `[RsyncService] starting: rsync ${args.join(' ')}` (unchanged)
- Completion log: `[RsyncService] completed: ${slug} → ${host}` (was `vps2Host`)

### 2. Update `caddy.ts`

Replace 4-parameter signature with `Server`-based signature:

```ts
import type { Server } from './provisioning.js';

export class CaddyService {
  async writeVirtualhost(domain: string, slug: string, server: Server): Promise<void> {
    const host = server.tailscale_ip ?? server.public_ip;
    const user = server.ssh_user;

    if (!host) {
      throw new Error(`[CaddyService] server "${server.name}" has no IP address`);
    }

    // ... rest of method unchanged, replace vps2Host/vps2User with host/user
  }
}
```

Key changes:
- Import `Server` type from `./provisioning.js`
- Drop `vps2Host`, `vps2User` params
- Add `server: Server` param
- Derive `host`, `user` from server fields
- Guard: if `host` is null, throw with descriptive error

### 3. Rewrite `infra.ts`

This is the most significant change. The file needs:

**New interfaces:**
```ts
export interface ServerHealth {
  serverId: string;
  serverName: string;
  reachable: boolean;
  caddyActive: boolean;
  diskUsedPct: number | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  error?: string;
}

export interface FleetHealth {
  servers: ServerHealth[];
  fetchedAt: string;
}
```

Keep `Vps2Health` interface but mark as `@deprecated` (it's used by `infra/page.tsx` until T03 replaces it):
```ts
/** @deprecated Use ServerHealth + FleetHealth instead. Removed in S02/T03. */
export interface Vps2Health { ... }
```

**Delete `readVps2Settings()`** — this private helper reads `vps2_host`/`vps2_user` from settings. Replace all its callers within the file with direct `servers` table queries.

**Add `getFleetHealth()`:**
```ts
async getFleetHealth(): Promise<FleetHealth> {
  const now = new Date().toISOString();
  const supabase = createServiceClient();

  const { data: servers, error } = await supabase
    .from('servers')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true });

  if (error) {
    console.error(`[InfraService] failed to query servers table: ${error.message}`);
    return { servers: [], fetchedAt: now };
  }

  if (!servers || servers.length === 0) {
    console.log('[InfraService] fleet health: 0 active servers — returning empty fleet');
    return { servers: [], fetchedAt: now };
  }

  console.log(`[InfraService] fleet health: checking ${servers.length} server(s)`);

  const results: ServerHealth[] = await Promise.all(
    servers.map((server) => this.checkServerHealth(server))
  );

  return { servers: results, fetchedAt: now };
}
```

**Add private `checkServerHealth(server)`** — same metric collection logic as current `getVps2Health()` SSH block, parameterized:
```ts
private async checkServerHealth(server: {
  id: string; name: string; tailscale_ip: string | null;
  public_ip: string | null; ssh_user: string;
}): Promise<ServerHealth> {
  const host = server.tailscale_ip ?? server.public_ip;
  const base: ServerHealth = {
    serverId: server.id,
    serverName: server.name,
    reachable: false,
    caddyActive: false,
    diskUsedPct: null,
    memUsedMb: null,
    memTotalMb: null,
  };

  if (!host) {
    return { ...base, error: 'No IP address available' };
  }

  const conn = new NodeSSH();
  try {
    console.log(`[InfraService] connecting to ${server.ssh_user}@${host} for server "${server.name}"`);
    await conn.connect({ host, username: server.ssh_user, agent: process.env.SSH_AUTH_SOCK });

    // ... same caddy/df/free commands as current getVps2Health()

    return { ...base, reachable: true, caddyActive, diskUsedPct, memUsedMb, memTotalMb };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[InfraService] SSH error for server "${server.name}": ${message}`);
    return { ...base, error: message };
  } finally {
    conn.dispose();
  }
}
```

**Update `testDeployConnection(serverId?: string)`:**
- If `serverId` provided: query `from('servers').select('*').eq('id', serverId).single()`
- If not provided: query `from('servers').select('*').eq('status','active').order('created_at',{ascending:true}).limit(1).single()`
- SSH to that server; return `{ ok: true }` or `{ ok: false, error }`
- Delete the old `readVps2Settings()` call from this method

**Keep `getVps2Health()`** but make it delegate to `getFleetHealth()` for backward compat during the T03 transition (T03 will remove the import from `infra/page.tsx`). Actually — it's simpler to just leave it as a deprecated stub that returns the first server's health from `getFleetHealth()`, or remove it entirely since T03 removes the import from `page.tsx`. **Recommended: remove `getVps2Health()` entirely.** T03 updates `page.tsx` immediately after, so there's no window where it's needed. TypeScript will catch any missed references.

### 4. Update `index.ts`

```ts
// Remove:
export type { Vps2Health } from './infra.js';

// Add:
export type { FleetHealth, ServerHealth } from './infra.js';
```

Keep all other exports unchanged.

### 5. Rebuild `@monster/deployment`

```bash
cd /home/daniel/monster/.gsd/worktrees/M011
pnpm --filter @monster/deployment typecheck
pnpm --filter @monster/deployment build
```

## Must-Haves

- `RsyncService.deploy(slug, server: Server)` — 2 params, hardcodes `/var/www/sites`
- `CaddyService.writeVirtualhost(domain, slug, server: Server)` — 3 params
- `InfraService.getFleetHealth()` exists and returns `FleetHealth`
- `InfraService.testDeployConnection(serverId?: string)` reads from `servers` table
- `readVps2Settings()` is deleted
- `FleetHealth` and `ServerHealth` exported from `index.ts`
- `Vps2Health` NOT exported from `index.ts` (removed)
- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/deployment build` exits 0
- No `vps2_host`, `vps2_user`, `vps2_sites_root` references remain in rsync.ts, caddy.ts, infra.ts

## Observability Impact

New log lines introduced:
- `[InfraService] fleet health: checking N server(s)` — fleet health entry point
- `[InfraService] fleet health: 0 active servers — returning empty fleet` — zero-server state
- `[InfraService] connecting to <user>@<host> for server "<name>"` — per-server SSH connect (was: "connecting to VPS2")
- `[RsyncService] server "<name>" has no IP address` — new error path
- `[CaddyService] server "<name>" has no IP address` — new error path

## Verification

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# typecheck and build
pnpm --filter @monster/deployment typecheck   # exit 0
pnpm --filter @monster/deployment build       # exit 0

# no vps2_* in service files
grep -c "vps2_host\|vps2_user\|vps2_sites_root" \
  packages/deployment/src/rsync.ts \
  packages/deployment/src/caddy.ts \
  packages/deployment/src/infra.ts   # all 0

# FleetHealth exported
grep "FleetHealth\|ServerHealth" packages/deployment/dist/index.d.ts   # present

# Vps2Health NOT exported
grep "Vps2Health" packages/deployment/dist/index.d.ts   # absent
```

## Done When

`pnpm --filter @monster/deployment typecheck` and `build` both exit 0; `FleetHealth`/`ServerHealth` exported from dist; `Vps2Health` not exported; no `vps2_*` settings references in service files.

## Expected Output

- `packages/deployment/src/rsync.ts` — `deploy(slug: string, server: Server)` accepting Server record
- `packages/deployment/src/caddy.ts` — `writeVirtualhost(domain: string, slug: string, server: Server)` accepting Server record
- `packages/deployment/src/infra.ts` — `FleetHealth`, `ServerHealth` interfaces; `getFleetHealth()`; `checkServerHealth()` private; `testDeployConnection(serverId?)`; no `readVps2Settings()`, no `Vps2Health`, no `getVps2Health()`
- `packages/deployment/src/index.ts` — exports `FleetHealth`, `ServerHealth`; no `Vps2Health`
- `packages/deployment/dist/` — rebuilt with new type declarations
