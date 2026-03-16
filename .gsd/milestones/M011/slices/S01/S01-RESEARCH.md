# S01: Hetzner API Client + servers table — Research

**Date:** 2026-03-16

## Summary

S01 introduces the two foundational pieces M011 is built on: a `servers` table in Supabase (tracking every VPS in the fleet) and a `HetznerClient` class wrapping the Hetzner Cloud REST API. A `ProvisioningService` orchestrates the full "API → boot → SSH bootstrap → DB insert" flow. The `POST /api/infra/provision` route contract is defined in S01 (the handler implementation lands in S03).

The work is moderately complex: the Hetzner API pattern is new to this codebase but straightforward REST (matches the `SpaceshipClient` pattern already established with `D065`). The trickiest part is SSH key lifecycle — the operator's public key must be registered with Hetzner before server creation so the new root account accepts it, and the private key must already be in the SSH agent for the subsequent bootstrap SSH session. No private keys are stored anywhere.

The recommendation is to implement `HetznerClient` as a raw-fetch client reading `hetzner_api_token` from the settings table (D028 pattern, same as SpaceshipClient), add the `servers` migration, manually update `supabase.ts`, and implement `ProvisioningService` that uses `node-ssh` (already installed in `@monster/deployment`) for the bootstrap SSH session.

## Recommendation

Use raw `fetch` for all Hetzner API calls (no npm client — the available packages are either deprecated or low-quality). Follow the `SpaceshipClient` pattern in `packages/domains/src/spaceship.ts` precisely: credential read from Supabase settings at call time, `Authorization: Bearer <token>` header, structured error handling. The `ProvisioningService` uses `NodeSSH` (already a dep of `packages/deployment`) for the bootstrap phase — same as `CaddyService`.

## Implementation Landscape

### Key Files

- `packages/deployment/src/hetzner.ts` — **create new**. `HetznerClient` class: 7 methods (see below). Reads `hetzner_api_token` from settings at call time. Raw fetch, base URL `https://api.hetzner.cloud/v1`.
- `packages/deployment/src/provisioning.ts` — **create new**. `ProvisioningService.provision(opts)`: orchestrates Hetzner API → wait boot → SSH upload scripts → run bootstrap → insert servers row → return Server record.
- `packages/deployment/src/index.ts` — **extend**: add `export { HetznerClient } from './hetzner.js'`, `export { ProvisioningService } from './provisioning.js'`, `export type { Server, ProvisionOpts } from './provisioning.js'`.
- `packages/db/supabase/migrations/20260316160000_servers.sql` — **create new**. `servers` table migration.
- `packages/db/src/types/supabase.ts` — **edit manually**: add `servers` table `Row/Insert/Update` blocks. Follow exact existing table format. Rebuild `@monster/db` after edit (D098).
- `packages/deployment/tsup.config.ts` — **no change needed**: `dts: true` is already set; `node-ssh` and `@monster/db` already in `external`. `node-ssh` is already a dep.
- `apps/admin/src/app/api/infra/provision/route.ts` — **create new** (stub only — S01 defines the contract; S03 implements the full handler). Contract: `POST { name, datacenter, serverType, tailscaleKey, sshPublicKey } → { ok, serverId?, error? }`.
- `apps/admin/next.config.ts` — **no change needed**: `@monster/deployment` already in `serverExternalPackages`; `node-ssh`/`ssh2`/`cpu-features` already externalized.

### servers Table Schema

```sql
CREATE TABLE IF NOT EXISTS servers (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  provider         text        NOT NULL DEFAULT 'hetzner',
  external_id      bigint,                        -- Hetzner server ID
  status           text        NOT NULL DEFAULT 'provisioning',
  public_ip        text,
  tailscale_ip     text,
  datacenter       text,
  server_type      text,
  ssh_user         text        NOT NULL DEFAULT 'root',
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_health_check timestamptz
);
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
```

Status values: `provisioning | active | error | decommissioned`.

### HetznerClient Methods

All methods read `hetzner_api_token` from settings (D028 via `createServiceClient()`). Base URL `https://api.hetzner.cloud/v1`. Auth header: `Authorization: Bearer <token>`.

| Method | HTTP | Endpoint |
|--------|------|----------|
| `createServer(opts)` | POST | `/servers` |
| `getServer(id)` | GET | `/servers/{id}` |
| `listServers()` | GET | `/servers` |
| `deleteServer(id)` | DELETE | `/servers/{id}` |
| `listDatacenters()` | GET | `/datacenters` |
| `listServerTypes()` | GET | `/server_types` |
| `registerSshKey(name, publicKey)` | POST | `/ssh_keys` |

**createServer payload:**
```json
{ "name": "...", "server_type": "cx22", "image": "ubuntu-24.04", "datacenter": "nbg1-dc3", "ssh_keys": [<id>] }
```

**getServer response shape (relevant fields):**
```json
{
  "server": {
    "id": 123456,
    "status": "running",  // initializing | starting | running | off
    "public_net": { "ipv4": { "ip": "1.2.3.4" } }
  }
}
```

**registerSshKey payload:**
```json
{ "name": "monster-provisioning", "public_key": "ssh-rsa AAAA..." }
```
Response: `{ "ssh_key": { "id": 789 } }`

### ProvisioningService.provision() Flow

```typescript
async provision(opts: ProvisionOpts): Promise<Server> {
  // 1. Register SSH public key with Hetzner (idempotent check-or-create)
  const sshKeyId = await this.hetzner.registerSshKey('monster-provisioning', opts.sshPublicKey);

  // 2. Create server
  const { server } = await this.hetzner.createServer({
    name: opts.name, server_type: opts.serverType,
    image: 'ubuntu-24.04', datacenter: opts.datacenter,
    ssh_keys: [sshKeyId]
  });

  // 3. Poll until status === 'running' (timeout 5min, 10s intervals)
  const publicIp = await this.waitForBoot(server.id);

  // 4. SSH in as root, upload scripts, run setup-vps2.sh
  await this.bootstrapVps(publicIp, opts.tailscaleKey, opts.sshPublicKey);

  // 5. Insert servers row
  const { data } = await supabase.from('servers').insert({ ... }).select().single();
  return data;
}
```

**waitForBoot:** poll `getServer(id)` every 10 seconds, timeout at 5 minutes. Return `server.public_net.ipv4.ip` once `status === 'running'`.

**bootstrapVps:** 
- Connect with `NodeSSH` as `root@<publicIp>` using `agent: process.env.SSH_AUTH_SOCK` (operator's SSH key registered with Hetzner must be in agent).
- Upload `scripts/setup-vps2.sh` and `scripts/lib/vps2-check.sh` to `/tmp/` via `conn.putFile()`.
- `conn.execCommand('chmod +x /tmp/setup-vps2.sh /tmp/vps2-check.sh')`.
- `conn.execCommand('bash /tmp/setup-vps2.sh --tailscale-key <key>')` — note setup-vps2.sh checks `$EUID -ne 0` and exits if not root; SSH as root satisfies this.
- Log all stdout/stderr with `[ProvisioningService]` prefix.

### registerSshKey Idempotency

Hetzner returns 409 if you try to register a key that's already registered (same public key content). The client must handle this: on 409, list all keys and find the matching one by name or fingerprint, return its ID. Simplest approach: catch 409, call `listSshKeys()` filter by name, return found ID.

### Type: Server

```typescript
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

export interface ProvisionOpts {
  name: string;
  datacenter: string;     // e.g. 'nbg1-dc3'
  serverType: string;     // e.g. 'cx22'
  tailscaleKey: string;   // one-time use, never stored
  sshPublicKey: string;   // operator's pub key string (e.g. 'ssh-rsa AAAA...')
}
```

### Build Order

1. **Migration first** (`20260316160000_servers.sql`): write and apply via temp pg script against `SUPABASE_DB_URL` from `.env` (D112 pattern). Then manually add `servers` table to `packages/db/src/types/supabase.ts` and rebuild `@monster/db`.

2. **HetznerClient** (`packages/deployment/src/hetzner.ts`): implement all 7 methods. Can be typecheck-verified before ProvisioningService exists.

3. **ProvisioningService** (`packages/deployment/src/provisioning.ts`): depends on HetznerClient and `servers` types. Implement `provision()` + `waitForBoot()` + `bootstrapVps()`.

4. **Update index.ts**: export Server type + both classes.

5. **Stub provision route** (`apps/admin/src/app/api/infra/provision/route.ts`): minimal stub returning `{ ok: false, error: 'not implemented' }` — ensures the route exists for S03 to implement. This satisfies the boundary map contract spec.

6. **Verify**: `pnpm install` in worktree first (no node_modules). Then `pnpm --filter @monster/deployment build` (tsup with dts:true) and `pnpm --filter @monster/admin build` (next build — checks `/infra` still compiles). Integration test: call `HetznerClient.listDatacenters()` with real token from settings to verify live API connectivity.

### Verification Approach

```bash
# 1. Install deps (worktree has no node_modules)
cd /home/daniel/monster/.gsd/worktrees/M011
pnpm install

# 2. Build deployment package (includes dts)
pnpm --filter @monster/deployment build

# 3. Typecheck deployment
pnpm --filter @monster/deployment typecheck

# 4. Build admin panel (verifies no import breakage)
pnpm --filter @monster/admin build

# 5. Contract integration test: listDatacenters (requires hetzner_api_token in settings)
node -e "
import('@monster/deployment').then(({ HetznerClient }) => {
  const c = new HetznerClient();
  c.listDatacenters().then(d => console.log('datacenters:', d.map(x => x.name)));
});
"

# 6. Verify servers table in DB
# psql $SUPABASE_DB_URL -c "\d servers"
```

## Common Pitfalls

- **SSH agent required for bootstrapVps**: The `NodeSSH` connection uses `agent: process.env.SSH_AUTH_SOCK`. If the agent isn't running or doesn't have the private key matching the registered public key, SSH will fail. The executor must ensure this is clear in the ProvisioningService error messages.

- **setup-vps2.sh requires root + script upload path**: The script's self-check (`lib/vps2-check.sh`) is found via `SCRIPT_DIR` which resolves to `/tmp` if uploaded there. The `vps2-check.sh` must be uploaded alongside `setup-vps2.sh`. Upload both to `/tmp/` before executing.

- **Hetzner API 409 on duplicate SSH key**: `POST /v1/ssh_keys` returns 409 Conflict if a key with that name or fingerprint already exists. Handle idempotently: on 409, call `GET /v1/ssh_keys` and find the matching key by name.

- **Server boot time**: A fresh Hetzner CX22 takes 30-90 seconds to reach `status=running`. The 10-second polling interval with 5-minute timeout is sufficient.

- **`pnpm install` required in worktree**: The worktree has no `node_modules`. Every executor task must start with `pnpm install` or check that deps exist. The worktree shares the pnpm store with the main repo so installation is fast (hardlinks).

- **`@monster/db` rebuild after supabase.ts edit** (D098): After manually editing `packages/db/src/types/supabase.ts` to add the `servers` table, run `pnpm --filter @monster/db build` before running any typecheck that imports db types.

- **No npm Hetzner SDK needed**: `hcloud-js` (the only semi-viable option) is old, uses axios, has low TypeScript coverage, and its last release was 2022. Raw fetch is the right call here — same reasoning as D065 for SpaceshipClient. Hetzner's REST API is well-documented and the endpoints needed are simple.

## Open Risks

- **SSH bootstrap timing**: After Hetzner API reports `status=running`, the SSH daemon may not yet be listening. Add a short retry loop (up to 30s) on SSH connect failure in `bootstrapVps()` before surfacing as a hard error.

- **setup-vps2.sh timeout**: The bootstrap script runs `apt-get update`, installs packages, and joins Tailscale. This can take 2-5 minutes on a fresh Ubuntu 24.04. The `execCommand` in node-ssh has no default timeout. Set an explicit timeout option or handle the long-running case in the SSH exec options.
