# T03: Implement ProvisioningService + update index exports

## Why

`ProvisioningService.provision()` is the core orchestration method that closes the S01 boundary contract — it wires together Hetzner API server creation, SSH bootstrap execution, and the `servers` table insert into a single callable operation. Without it, `POST /api/infra/provision` (S03) has nothing to call. This task also updates `packages/deployment/src/index.ts` to export `HetznerClient`, `ProvisioningService`, `Server`, and `ProvisionOpts` — making them available to the admin app.

## Description

Create `packages/deployment/src/provisioning.ts` implementing `ProvisioningService` with three methods:

- `provision(opts: ProvisionOpts)` — full orchestration flow
- `waitForBoot(serverId: number)` — polls Hetzner API until server `status === 'running'`
- `bootstrapVps(publicIp: string, tailscaleKey: string, sshPublicKey: string)` — SSHs in as root, uploads setup scripts, runs bootstrap

The SSH bootstrap uses `NodeSSH` (already a dep of `@monster/deployment`). Scripts are uploaded from `scripts/setup-vps2.sh` and `scripts/lib/vps2-check.sh` relative to the monorepo root (`process.cwd()`). After successful bootstrap, a row is inserted into `servers` via `createServiceClient()`.

Also export the `Server` interface and `ProvisionOpts` interface — these are the boundary contract types for S02/S03.

## Steps

1. **Define the exported types** at the top of `provisioning.ts`:

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
  tailscaleKey: string;   // one-time use, never stored or logged
  sshPublicKey: string;   // operator's public key string
}
```

2. **Implement `ProvisioningService`**:

```typescript
import { join } from 'node:path';
import { NodeSSH } from 'node-ssh';
import { createServiceClient } from '@monster/db';
import { HetznerClient } from './hetzner.js';

const BOOT_POLL_INTERVAL_MS = 10_000;
const BOOT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const SSH_RETRY_ATTEMPTS = 6;
const SSH_RETRY_DELAY_MS = 5_000;

export class ProvisioningService {
  private hetzner = new HetznerClient();

  async provision(opts: ProvisionOpts): Promise<Server> {
    console.log(`[ProvisioningService] starting provision for "${opts.name}"`);

    // 1. Register SSH key with Hetzner (idempotent)
    const sshKeyId = await this.hetzner.registerSshKey('monster-provisioning', opts.sshPublicKey);
    console.log(`[ProvisioningService] SSH key id=${sshKeyId}`);

    // 2. Create the server
    const { server: hServer } = await this.hetzner.createServer({
      name: opts.name,
      server_type: opts.serverType,
      image: 'ubuntu-24.04',
      datacenter: opts.datacenter,
      ssh_keys: [sshKeyId],
    });
    console.log(`[ProvisioningService] server created id=${hServer.id} status=${hServer.status}`);

    // 3. Wait for boot
    const publicIp = await this.waitForBoot(hServer.id);
    console.log(`[ProvisioningService] server running at ${publicIp}`);

    // 4. SSH bootstrap
    await this.bootstrapVps(publicIp, opts.tailscaleKey, opts.sshPublicKey);
    console.log(`[ProvisioningService] bootstrap complete`);

    // 5. Insert into servers table
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('servers')
      .insert({
        name: opts.name,
        provider: 'hetzner',
        external_id: hServer.id,
        status: 'active',
        public_ip: publicIp,
        datacenter: opts.datacenter,
        server_type: opts.serverType,
        ssh_user: 'root',
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`[ProvisioningService] DB insert failed: ${error?.message ?? 'no data'}`);
    }

    console.log(`[ProvisioningService] server registered in DB id=${data.id}`);
    return data as Server;
  }

  /**
   * Polls getServer() every 10s until status === 'running'.
   * Timeout at 5 minutes. Returns the server's public IPv4.
   */
  private async waitForBoot(serverId: number): Promise<string> {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const { server } = await this.hetzner.getServer(serverId);
      console.log(`[ProvisioningService] server ${serverId} status=${server.status}`);

      if (server.status === 'running') {
        const ip = server.public_net.ipv4?.ip;
        if (!ip) {
          throw new Error(`[ProvisioningService] server running but no public IPv4 assigned`);
        }
        return ip;
      }

      await new Promise((r) => setTimeout(r, BOOT_POLL_INTERVAL_MS));
    }

    throw new Error(`[ProvisioningService] timeout waiting for server ${serverId} to boot`);
  }

  /**
   * SSHes into the new server as root, uploads setup scripts, runs bootstrap.
   *
   * SSH connect retried up to SSH_RETRY_ATTEMPTS times (SSH daemon may not
   * be listening immediately after Hetzner reports status=running).
   */
  private async bootstrapVps(
    publicIp: string,
    tailscaleKey: string,
    _sshPublicKey: string,
  ): Promise<void> {
    const conn = new NodeSSH();
    const monorepoRoot = process.cwd();

    // Connect with retry — SSH daemon may not be ready immediately
    let lastErr: unknown;
    for (let attempt = 1; attempt <= SSH_RETRY_ATTEMPTS; attempt++) {
      try {
        console.log(`[ProvisioningService] SSH connect attempt ${attempt}/${SSH_RETRY_ATTEMPTS}`);
        await conn.connect({
          host: publicIp,
          username: 'root',
          agent: process.env.SSH_AUTH_SOCK,
          readyTimeout: 10_000,
        });
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < SSH_RETRY_ATTEMPTS) {
          await new Promise((r) => setTimeout(r, SSH_RETRY_DELAY_MS));
        }
      }
    }

    if (!conn.isConnected()) {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      throw new Error(`[ProvisioningService] SSH connect failed after ${SSH_RETRY_ATTEMPTS} attempts: ${msg}`);
    }

    try {
      const setupScript = join(monorepoRoot, 'scripts', 'setup-vps2.sh');
      const checkScript = join(monorepoRoot, 'scripts', 'lib', 'vps2-check.sh');

      // Upload scripts
      console.log('[ProvisioningService] uploading setup-vps2.sh');
      await conn.putFile(setupScript, '/tmp/setup-vps2.sh');

      console.log('[ProvisioningService] uploading vps2-check.sh');
      await conn.putFile(checkScript, '/tmp/vps2-check.sh');

      // Make executable
      const chmodResult = await conn.execCommand('chmod +x /tmp/setup-vps2.sh /tmp/vps2-check.sh');
      if (chmodResult.stderr) {
        console.warn(`[ProvisioningService] chmod stderr: ${chmodResult.stderr}`);
      }

      // Run bootstrap — NEVER log tailscaleKey
      console.log('[ProvisioningService] running setup-vps2.sh bootstrap');
      const bootstrapResult = await conn.execCommand(
        `bash /tmp/setup-vps2.sh --tailscale-key ${tailscaleKey}`,
        { execOptions: { pty: false } },
      );

      if (bootstrapResult.stdout) {
        console.log(`[ProvisioningService] bootstrap stdout:\n${bootstrapResult.stdout}`);
      }
      if (bootstrapResult.stderr) {
        console.warn(`[ProvisioningService] bootstrap stderr:\n${bootstrapResult.stderr}`);
      }

      // Non-zero exit code from bash -c doesn't surface as exception in node-ssh;
      // check stderr for known failure patterns
      if (bootstrapResult.stderr?.includes('FATAL') || bootstrapResult.stderr?.includes('Error')) {
        throw new Error(`[ProvisioningService] bootstrap reported errors — check stderr above`);
      }

      console.log('[ProvisioningService] bootstrap finished');
    } finally {
      conn.dispose();
    }
  }
}
```

3. **Update `packages/deployment/src/index.ts`** to add the new exports:

```typescript
export { RsyncService } from './rsync.js';
export { CaddyService } from './caddy.js';
export { InfraService } from './infra.js';
export type { Vps2Health } from './infra.js';
export { HetznerClient, HetznerApiError } from './hetzner.js';
export type { HetznerServer, HetznerDatacenter, HetznerServerType, HetznerSshKey, CreateServerOpts } from './hetzner.js';
export { ProvisioningService } from './provisioning.js';
export type { Server, ProvisionOpts } from './provisioning.js';
```

4. **Build the deployment package**: `pnpm --filter @monster/deployment build`

5. **Typecheck**: `pnpm --filter @monster/deployment typecheck`

## Must-Haves

- `packages/deployment/src/provisioning.ts` exists with `ProvisioningService`, `Server`, `ProvisionOpts`
- `provision()` orchestrates all 5 steps: register key → create server → waitForBoot → bootstrapVps → DB insert
- `waitForBoot()` polls every 10s, times out after 5 minutes
- `bootstrapVps()` retries SSH connect up to 6 times (SSH daemon may not be ready immediately)
- `bootstrapVps()` uploads BOTH `scripts/setup-vps2.sh` AND `scripts/lib/vps2-check.sh` to `/tmp/`
- `tailscaleKey` is NEVER logged (only passed directly to the command string — do not `console.log` it separately)
- `packages/deployment/src/index.ts` exports `HetznerClient`, `HetznerApiError`, `ProvisioningService`, `Server`, `ProvisionOpts`
- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/deployment build` exits 0

## Inputs

- `packages/deployment/src/hetzner.ts` — `HetznerClient` class (from T02)
- `packages/db/src/types/supabase.ts` — `servers` table types (from T01)
- `packages/deployment/src/infra.ts` — reference for `NodeSSH` usage pattern + D028 settings pattern
- `packages/deployment/src/caddy.ts` — reference for `NodeSSH` connect + `putFile` + `execCommand` pattern
- `scripts/setup-vps2.sh` and `scripts/lib/vps2-check.sh` — exist at monorepo root (verify with `ls scripts/`)
- `node-ssh` — already in `packages/deployment/package.json` dependencies
- `@monster/db` — already in `packages/deployment/package.json` dependencies

## Expected Output

- `packages/deployment/src/provisioning.ts` — `ProvisioningService` with full `provision()` flow
- `packages/deployment/src/index.ts` — updated to export all new types and classes
- `packages/deployment/dist/` — rebuilt with all exports available

## Verification

```bash
pnpm --filter @monster/deployment typecheck
pnpm --filter @monster/deployment build
# Verify exports exist in built types
grep -c "ProvisioningService\|Server\|ProvisionOpts\|HetznerClient" packages/deployment/dist/index.d.ts
```

## Done When

- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/deployment build` exits 0
- `packages/deployment/dist/index.d.ts` contains `ProvisioningService`, `Server`, `ProvisionOpts`, `HetznerClient`, `HetznerApiError`

## Observability Impact

- `[ProvisioningService]` prefix on all log lines
- Each phase logs start + completion with key IDs/IPs
- `tailscaleKey` NEVER appears in any log line (it's interpolated directly into the command string — a separate `console.log` of it is forbidden)
- SSH stdout/stderr from setup-vps2.sh is logged verbatim (could be long — that's expected)
