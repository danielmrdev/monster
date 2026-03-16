---
id: S01-UAT
parent: S01
milestone: M011
uat_mode: artifact-driven
written: 2026-03-16
---

# S01: Hetzner API Client + servers table — UAT

**Milestone:** M011
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven (contract + integration)
- Why this mode is sufficient: S01 delivers library code and DB schema — no end-user UI yet. Contract verification (types, exports, build) + integration verification (live DB query, structured error paths, dist-bundle observability) fully validate deliverables without requiring a running admin server or live Hetzner credentials.

## Preconditions

1. Working directory: `/home/daniel/monster/.gsd/worktrees/M011`
2. Supabase env vars available: `export $(cat /home/daniel/monster/.env | grep -E 'SUPABASE|NEXT_PUBLIC' | xargs)`
3. `@monster/deployment` is built: `packages/deployment/dist/index.js` exists
4. `@monster/db` is built: `packages/db/dist/index.js` exists
5. `@monster/admin` is built: `apps/admin/.next/` exists (or rebuild before Test 3)

## Smoke Test

```bash
export $(cat /home/daniel/monster/.env | grep -E 'SUPABASE|NEXT_PUBLIC' | xargs)
node --input-type=module <<'EOF'
import { HetznerClient, ProvisioningService } from './packages/deployment/dist/index.js';
console.log('HetznerClient:', typeof HetznerClient);
console.log('ProvisioningService:', typeof ProvisioningService);
EOF
```

**Expected:** prints `HetznerClient: function` and `ProvisioningService: function` — confirms the module loads without errors and both classes are exported.

---

## Test Cases

### 1. `servers` table exists and is accessible

```bash
export $(cat /home/daniel/monster/.env | grep -E 'SUPABASE|NEXT_PUBLIC' | xargs)
node --input-type=module <<'EOF'
import { createServiceClient } from './packages/db/dist/index.js';
const sb = createServiceClient();
const { data, error } = await sb.from('servers').select('id,name,status,public_ip,provider').limit(5);
if (error) { console.error('FAIL:', error.message); process.exit(1); }
console.log('OK: servers table accessible, rows:', data.length);
EOF
```

**Expected:** `OK: servers table accessible, rows: 0` (empty is correct — no servers provisioned yet). Any Supabase error (especially `PGRST106` relation not found) indicates the migration was not applied.

---

### 2. `servers` types present in `@monster/db` dist

```bash
grep -c 'servers' packages/db/dist/index.d.ts
```

**Expected:** `12` or higher — confirms Row, Insert, and Update type blocks are present in the compiled type declarations.

```bash
grep -A5 'servers:' packages/db/dist/index.d.ts | head -20
```

**Expected:** shows `Row: { id: string; name: string; provider: string; ... }` structure.

---

### 3. `HetznerClient` exports all 7 methods + `HetznerApiError`

```bash
grep "HetznerClient\|HetznerApiError\|createServer\|listDatacenters\|listServerTypes\|registerSshKey\|deleteServer\|getServer\|listServers\|listSshKeys" \
  packages/deployment/dist/index.d.ts
```

**Expected:** lines showing `declare class HetznerClient`, `declare class HetznerApiError`, and all 7 method signatures (`createServer`, `getServer`, `listServers`, `deleteServer`, `listDatacenters`, `listServerTypes`, `listSshKeys`, `registerSshKey`).

---

### 4. `ProvisioningService`, `Server`, `ProvisionOpts` exported from `@monster/deployment`

```bash
grep "ProvisioningService\|ProvisionOpts\|^.*Server\b" packages/deployment/dist/index.d.ts
```

**Expected:** lines showing:
- `declare class ProvisioningService`
- `interface ProvisionOpts`
- `interface Server` (or `type Server`)
- All three in the `export { ... }` line at the bottom of the file.

---

### 5. `HetznerClient` structured error path (token absent)

```bash
export $(cat /home/daniel/monster/.env | grep -E 'SUPABASE|NEXT_PUBLIC' | xargs)
node --input-type=module <<'EOF'
import { HetznerClient, HetznerApiError } from './packages/deployment/dist/index.js';
const c = new HetznerClient();
try {
  await c.listDatacenters();
  console.log('FAIL: should have thrown');
  process.exit(1);
} catch(e) {
  if (e.message === '[HetznerClient] hetzner_api_token not found in settings') {
    console.log('OK: structured token-absent error confirmed');
  } else {
    console.log('UNEXPECTED error:', e.message);
    process.exit(1);
  }
}
EOF
```

**Expected:** `OK: structured token-absent error confirmed` — confirms error path is wired before token is configured in Settings.

---

### 6. All failure-path observability strings in dist bundle

```bash
node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs';
const src = readFileSync('./packages/deployment/dist/index.js', 'utf8');
const checks = [
  '[ProvisioningService] DB insert failed',
  '[ProvisioningService] SSH connect failed after',
  '[ProvisioningService] timeout waiting for server',
  '[ProvisioningService] server running but no public IPv4',
  '[HetznerClient]',
];
let allOk = true;
for (const c of checks) {
  if (!src.includes(c)) {
    console.error(`MISSING: "${c}"`);
    allOk = false;
  } else {
    console.log(`OK: "${c}"`);
  }
}
if (!allOk) process.exit(1);
console.log('All failure-path strings confirmed');
EOF
```

**Expected:** 5 `OK:` lines followed by `All failure-path strings confirmed`.

---

### 7. Deployment package typechecks clean

```bash
pnpm --filter @monster/deployment typecheck
echo "exit: $?"
```

**Expected:** no output, exit code 0.

---

### 8. `POST /api/infra/provision` route registered in admin build

```bash
grep "provision" apps/admin/.next/server/app-paths-manifest.json
```

**Expected:** `"/api/infra/provision/route": "app/api/infra/provision/route.js"` — confirms the Next.js route is compiled and registered.

---

### 9. `POST /api/infra/provision` returns correct stub response (live check)

*Requires admin server running on port 3004.*

```bash
curl -s -X POST http://localhost:3004/api/infra/provision \
  -H 'Content-Type: application/json' \
  -d '{"name":"test","datacenter":"nbg1-dc3","serverType":"cx22","tailscaleKey":"unused","sshPublicKey":"ssh-ed25519 AAAA"}' \
  | python3 -m json.tool
```

**Expected:**
```json
{
  "ok": false,
  "error": "not implemented"
}
```
with HTTP status 501.

---

### 10. Admin build includes provision route (full build verification)

```bash
# Build all deps in order (KN004)
pnpm --filter @monster/shared build
pnpm --filter @monster/domains build
pnpm --filter @monster/seo-scorer build
pnpm --filter @monster/agents build
pnpm --filter @monster/deployment build
pnpm --filter @monster/admin build 2>&1 | tail -10
```

**Expected:** last lines include `✓ Compiled successfully` or `Route (app)` table with `/api/infra/provision` listed as `ƒ` (Dynamic). No TypeScript errors.

---

## Edge Cases

### Token configured but invalid

After `hetzner_api_token` is set in Supabase settings with an invalid token value:

```bash
# (Requires token inserted as: INSERT INTO settings (key,value) VALUES ('hetzner_api_token','{"value":"bad-token"}'))
node --input-type=module <<'EOF'
import { HetznerClient, HetznerApiError } from './packages/deployment/dist/index.js';
try {
  await new HetznerClient().listDatacenters();
} catch(e) {
  if (e instanceof HetznerApiError && e.status === 401) {
    console.log('OK: HetznerApiError with status 401 thrown for invalid token');
    console.log('body preview:', JSON.stringify(e.body).slice(0, 80));
  } else {
    console.log('UNEXPECTED:', e.message);
  }
}
EOF
```

**Expected:** `OK: HetznerApiError with status 401 thrown for invalid token` — confirms the error class carries HTTP status and response body.

---

### registerSshKey idempotency (duplicate name)

This cannot be tested without a real Hetzner token. Verify the 409 handler is present in source:

```bash
grep "409\|already exists\|looking up ID" packages/deployment/src/hetzner.ts
```

**Expected:** 3+ matching lines showing the 409 branch, the log message `already exists, looking up ID`, and `listSshKeys()` fallback.

---

### `servers` table schema completeness

```bash
cat packages/db/supabase/migrations/20260316160000_servers.sql
```

**Expected:** `CREATE TABLE IF NOT EXISTS servers` with all 12 columns: `id, name, provider, external_id, status, public_ip, tailscale_ip, datacenter, server_type, ssh_user, created_at, last_health_check`. `ALTER TABLE servers ENABLE ROW LEVEL SECURITY` present.

---

## Failure Signals

- `PGRST106: relation "servers" does not exist` — migration was not applied to Supabase remote.
- `grep -c 'servers' dist/index.d.ts` returns `0` — `@monster/db` was not rebuilt after `supabase.ts` edit.
- TypeScript errors in `pnpm --filter @monster/deployment typecheck` — type mismatches in `hetzner.ts` or `provisioning.ts`.
- `HetznerClient` not in `packages/deployment/dist/index.d.ts` — `index.ts` export not added or `@monster/deployment` not rebuilt.
- Admin build fails with `Cannot find module '@monster/deployment'` — deployment package not built before admin.
- Admin build fails with `Cannot find module '@monster/agents'` — agents not built (KN004 pre-condition).
- `POST /api/infra/provision` returns 404 — route file not created or admin rebuild required.
- `POST /api/infra/provision` returns 500 — route file has a syntax/import error.

---

## Requirements Proved By This UAT

- R006 (Automated deployment to VPS) — partially advanced: `servers` table is now the authoritative multi-server registry; `ProvisioningService` enables programmatic creation. Full validation deferred to S02+S03 (services migration + fleet UI + live provision flow).

---

## Not Proven By This UAT

- Live `HetznerClient.listDatacenters()` returning real datacenter names — blocked by `hetzner_api_token` not yet configured in Supabase settings.
- `ProvisioningService.provision()` end-to-end (create → boot → SSH → DB insert) — blocked by token and requires a real Hetzner server creation. Full provision UAT is S03 human UAT.
- `POST /api/infra/provision` live curl check — admin server must be running on port 3004.
- Fleet dashboard rendering all servers — S03 deliverable.
- Settings page showing `hetzner_api_token` field — S02 deliverable.

---

## Notes for Tester

- **KN005:** The `hetzner_api_token` not configured error is expected and correct. It confirms the code is wired to the settings table, not to a missing env var or hardcoded value. The real token will be entered via the Settings UI once S02 delivers the field.
- **KN004:** Admin build requires building sibling packages first. If you get "Cannot find module" errors, run the sequential build from Test 10 above.
- **S03 UAT (human):** Full end-to-end provisioning (create a real CX22 on Hetzner, watch it boot, confirm it appears in the fleet view) is the S03 human UAT. This UAT intentionally stops at contract + integration level.
- The BullMQ webpack warning (`Critical dependency: the request of a dependency is an expression`) in admin build is pre-existing and benign — not caused by this slice.
