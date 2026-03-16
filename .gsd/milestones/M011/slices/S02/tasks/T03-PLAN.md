# T03: Caller updates — deploy-site.ts, infra/page.tsx, test-connection route; admin build

**Slice:** S02 — Services migration + Settings cleanup  
**Estimate:** 45m  
**Status:** pending  
**Depends on:** T02 (updated service signatures + rebuilt `@monster/deployment`)

## Description

Update all callers of `RsyncService`, `CaddyService`, and `InfraService` to use the new `Server`-based signatures from T02. `runDeployPhase()` replaces its `vps2_*` settings reads with a `servers` table query. The `/infra` page renders a fleet table instead of a single-server card. Rebuild `@monster/agents` then `@monster/admin` to verify the entire chain compiles clean.

## Why

This is the integration closure task. After T02 changed the service signatures, their callers have type errors. This task fixes all callers and runs the full build chain to prove the migration is complete.

## Inputs

From T02 (must already be complete):
- `@monster/deployment` rebuilt with `RsyncService.deploy(slug, server: Server)`, `CaddyService.writeVirtualhost(domain, slug, server: Server)`, `InfraService.getFleetHealth()`, `InfraService.testDeployConnection(serverId?)`
- `FleetHealth`, `ServerHealth` exported from `@monster/deployment`
- `Vps2Health` NOT exported

Current callers:
- `packages/agents/src/jobs/deploy-site.ts` — `runDeployPhase()` reads `vps2_*` from settings, calls `rsync.deploy(slug, vps2Host, vps2User, vps2SitesRoot)` and `caddy.writeVirtualhost(domain, slug, vps2Host, vps2User)`
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — imports `Vps2Health`, calls `getVps2Health()`
- `apps/admin/src/app/api/infra/test-connection/route.ts` — calls `testDeployConnection()` (no param needed — auto-resolves)

## Steps

### 1. Update `deploy-site.ts`

In `runDeployPhase()`:

**Replace the settings read block:**
```ts
// REMOVE:
const { data: settings, error: settingsErr } = await supabase
  .from('settings')
  .select('key, value')
  .in('key', ['vps2_host', 'vps2_user', 'vps2_sites_root', 'vps2_ip', 'cloudflare_api_token']);
// ... and all vps2_* extraction
```

**With a servers table query:**
```ts
// Get first active server for deployment
const { data: serverRow, error: serverErr } = await supabase
  .from('servers')
  .select('*')
  .eq('status', 'active')
  .order('created_at', { ascending: true })
  .limit(1)
  .single();

if (serverErr || !serverRow) {
  throw new Error('[DeployPhase] no active servers found in servers table');
}

const server = serverRow;
const deployHost = server.tailscale_ip ?? server.public_ip;
if (!deployHost) {
  throw new Error(`[DeployPhase] server "${server.name}" has no IP address`);
}

// Still read cloudflare_api_token from settings (that key is NOT being removed)
const { data: cfSettings, error: cfErr } = await supabase
  .from('settings')
  .select('key, value')
  .eq('key', 'cloudflare_api_token')
  .single();

if (cfErr) {
  throw new Error(`[DeployPhase] Failed to read cloudflare settings: ${cfErr.message}`);
}

const cfApiToken = (cfSettings?.value as { value?: string })?.value;
if (!cfApiToken) {
  throw new Error('[DeployPhase] Missing required setting: cloudflare_api_token');
}
```

**Add log line:**
```ts
console.log(`[DeployPhase] using server "${server.name}" (${deployHost})`);
```

**Update missing-check:** Replace the old `missing` array check with the server + cfApiToken null checks above.

**Update rsync call:**
```ts
// OLD:
await rsync.deploy(slug, vps2Host!, vps2User!, vps2SitesRoot!);
// NEW:
await rsync.deploy(slug, server);
```

**Update caddy call:**
```ts
// OLD:
await caddy.writeVirtualhost(domain, slug, vps2Host!, vps2User!);
// NEW:
await caddy.writeVirtualhost(domain, slug, server);
```

**Update Cloudflare A record:**
```ts
// OLD:
await cf.ensureARecord(zoneId, vps2Ip!, domain);
// NEW:
await cf.ensureARecord(zoneId, server.public_ip!, domain);
```

**Update missing settings log** in the error throw at the top of the deploy function — change the `missing` array logic to just check `server` and `cfApiToken` individually (already done above).

**Add `Server` import:**
```ts
import type { Server } from '@monster/deployment';
```
(This is a type-only import; at runtime `server` is the raw Supabase row which satisfies the `Server` interface shape.)

**Note on `cloudflare_api_token`:** The current code reads `cloudflare_api_token` from settings only for a pre-flight "is it configured?" check — `CloudflareClient` reads its own token internally via D028. Remove the `cfApiToken` pre-flight check too; `CloudflareClient` will throw a descriptive error itself if the token is missing (`[CloudflareClient] cloudflare_api_token not configured`). This simplifies `runDeployPhase()` — no settings reads at all, only the `servers` table query.

**Note on IP usage:** The `Cloudflare A record` step uses `server.public_ip` — this is the correct public-facing IP. The Tailscale IP is for internal SSH-based deploy operations only; the public IP is what Cloudflare's DNS A record should point to.

### 2. Update `infra/page.tsx`

**Replace import:**
```ts
// OLD:
import { InfraService, type Vps2Health } from '@monster/deployment'
// NEW:
import { InfraService, type FleetHealth } from '@monster/deployment'
```

**Replace health call:**
```ts
// OLD:
let health: Vps2Health
// ...
health = await infra.getVps2Health()
// NEW:
let fleet: FleetHealth
// ...
fleet = await infra.getFleetHealth()
```

**Replace rendered content:**

Replace the single-server card grid with a fleet table. The page must handle:
- Zero active servers: show a simple empty-state message ("No active servers registered yet. Provision a server to get started.")
- One or more servers: show a table with columns: Name, Status, Reachable, Caddy, Disk %, Memory, Last Checked

Example fleet table structure (keep it simple — S03 owns full fleet UI polish):
```tsx
{fleet.servers.length === 0 ? (
  <Card>
    <CardContent className="py-8 text-center">
      <p className="text-sm text-muted-foreground">
        No active servers registered yet. Provision a server to get started.
      </p>
    </CardContent>
  </Card>
) : (
  <Card>
    <CardHeader>
      <CardTitle className="text-sm font-medium">Server Fleet</CardTitle>
    </CardHeader>
    <CardContent>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-2 font-medium">Name</th>
            <th className="text-left py-2 font-medium">Reachable</th>
            <th className="text-left py-2 font-medium">Caddy</th>
            <th className="text-left py-2 font-medium">Disk</th>
            <th className="text-left py-2 font-medium">Memory</th>
          </tr>
        </thead>
        <tbody>
          {fleet.servers.map((s) => (
            <tr key={s.serverId} className="border-b last:border-0">
              <td className="py-2 font-medium">{s.serverName}</td>
              <td className={`py-2 ${s.reachable ? 'text-green-500' : 'text-red-500'}`}>
                {s.reachable ? 'Yes' : 'No'}
              </td>
              <td className={`py-2 ${s.caddyActive ? 'text-green-500' : 'text-red-500'}`}>
                {s.caddyActive ? 'Active' : 'Inactive'}
              </td>
              <td className="py-2">
                {s.diskUsedPct != null ? `${s.diskUsedPct}%` : '—'}
              </td>
              <td className="py-2">
                {s.memUsedMb != null && s.memTotalMb != null
                  ? `${s.memUsedMb} / ${s.memTotalMb} MB`
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  </Card>
)}
```

**Update the page subtitle:**
```tsx
// OLD: "Live health status of VPS2 — fetched at {date}"
// NEW: "Live health status of all registered servers — fetched at {date}"
// Use fleet.fetchedAt instead of health.fetchedAt
```

Keep the `TestConnectionButton` section (no changes needed there).

**Remove** any remaining `health.` references (replace with `fleet.`). The error card at the top (caught exception path) can stay as-is — change the title to "Fleet Health Error".

### 3. Update `test-connection/route.ts`

The `testDeployConnection()` now auto-resolves to the first active server when called with no args. The route handler needs no parameter change — it just calls `infra.testDeployConnection()` as before. This file requires no changes unless TypeScript complains. Verify it still compiles.

### 4. Build chain

Build in the correct order (KN004):

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# deployment was already built in T02
# rebuild agents (depends on deployment)
pnpm --filter @monster/agents build

# rebuild admin (depends on agents + deployment)
pnpm --filter @monster/admin build
```

## Must-Haves

- `runDeployPhase()` no longer reads `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip` from settings
- `runDeployPhase()` queries first active server from `servers` table
- `runDeployPhase()` throws `[DeployPhase] no active servers found in servers table` when no active server exists
- `runDeployPhase()` logs `[DeployPhase] using server "<name>" (<host>)` before rsync
- `rsync.deploy(slug, server)` and `caddy.writeVirtualhost(domain, slug, server)` called with `Server` record
- Cloudflare A record uses `server.public_ip` (not Tailscale IP)
- `cloudflare_api_token` settings pre-flight check removed — `CloudflareClient` reads its own token internally via D028. The only settings read in `runDeployPhase()` is the `servers` table query.
- `/infra` page imports `FleetHealth` not `Vps2Health`; calls `getFleetHealth()`; renders fleet table; empty state for zero servers
- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/admin build` exits 0
- `/infra` in admin build route list

## Observability Impact

New log lines in `runDeployPhase()`:
- `[DeployPhase] using server "<name>" (${host})` — server selection confirmation
- `[DeployPhase] no active servers found in servers table` — structured error on empty pool
- `[DeployPhase] server "<name>" has no IP address` — missing IP error

## Verification

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# no vps2_* in deploy-site.ts
grep -c "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  packages/agents/src/jobs/deploy-site.ts   # expect: 0

# builds pass
pnpm --filter @monster/agents build    # exit 0
pnpm --filter @monster/admin build     # exit 0

# /infra in route list
grep "infra" apps/admin/.next/server/app-paths-manifest.json

# fleet health types present in deployment dist
grep "FleetHealth\|ServerHealth" packages/deployment/dist/index.d.ts   # present
grep "Vps2Health" packages/deployment/dist/index.d.ts                  # absent

# no vps2_* in any deployment service files
grep -rn "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  packages/deployment/src/infra.ts \
  packages/deployment/src/rsync.ts \
  packages/deployment/src/caddy.ts \
  packages/agents/src/jobs/deploy-site.ts   # no matches
```

## Done When

`pnpm --filter @monster/agents build` and `pnpm --filter @monster/admin build` both exit 0; no `vps2_*` references in the four target files; `/infra` in admin build route list.

## Expected Output

- `packages/agents/src/jobs/deploy-site.ts` — `runDeployPhase()` queries `servers` table; calls `rsync.deploy(slug, server)` and `caddy.writeVirtualhost(domain, slug, server)`; uses `server.public_ip` for CF A record; reads only `cloudflare_api_token` from settings
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — imports `FleetHealth`; calls `getFleetHealth()`; renders fleet table with empty state
- `apps/admin/src/app/api/infra/test-connection/route.ts` — unchanged (or minimal type-only fix if needed)
- `packages/agents/dist/` — rebuilt
- `apps/admin/.next/` — built with `/infra` route present
