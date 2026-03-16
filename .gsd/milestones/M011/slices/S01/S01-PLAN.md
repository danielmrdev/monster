# S01: Hetzner API Client + servers table

**Goal:** `HetznerClient` can create/list/delete Hetzner VPS servers via real API; `servers` table exists in Supabase with types regenerated; `ProvisioningService.provision()` creates a server, SSHs in, runs setup-vps2.sh, and inserts a row — all verifiable by `pnpm typecheck` exit 0 + live `listDatacenters()` call returning real data.

**Demo:** `pnpm --filter @monster/deployment typecheck` exits 0; `pnpm --filter @monster/admin build` exits 0; `node -e "import('@monster/deployment').then(({HetznerClient}) => new HetznerClient().listDatacenters().then(d => console.log(d.map(x=>x.name))))"` returns real Hetzner datacenter names; `packages/db/src/types/supabase.ts` contains `servers` Row/Insert/Update blocks; `POST /api/infra/provision` stub exists returning `{ ok: false, error: 'not implemented' }`.

## Must-Haves

- `servers` table migration applied to Supabase; `supabase.ts` updated with `servers` Row/Insert/Update; `@monster/db` rebuilt
- `HetznerClient` in `packages/deployment/src/hetzner.ts`: 7 methods (`createServer`, `getServer`, `listServers`, `deleteServer`, `listDatacenters`, `listServerTypes`, `registerSshKey`) using raw fetch + Bearer auth; reads `hetzner_api_token` from settings (D028 pattern); handles 409 on `registerSshKey` idempotently
- `ProvisioningService` in `packages/deployment/src/provisioning.ts`: `provision(opts)` orchestrates Hetzner API → wait boot (10s poll, 5min timeout) → SSH bootstrap (upload `setup-vps2.sh` + `lib/vps2-check.sh`, run bootstrap) → insert `servers` row → return `Server` record
- `Server` and `ProvisionOpts` types exported from `packages/deployment/src/index.ts`
- `POST /api/infra/provision` stub route returns `{ ok: false, error: 'not implemented' }`
- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/admin build` exits 0

## Proof Level

- This slice proves: contract + integration
- Real runtime required: yes (live Hetzner API `listDatacenters()` call)
- Human/UAT required: no (full provision of real server is S03 UAT)

## Verification

```bash
# 1. Typecheck deployment package
pnpm --filter @monster/deployment typecheck

# 2. Build deployment package (dts included)
pnpm --filter @monster/deployment build

# 3. Admin build — confirm no import breakage
pnpm --filter @monster/admin build

# 4. Live Hetzner API integration test
node --input-type=module <<'EOF'
import { HetznerClient } from './packages/deployment/dist/index.js';
const c = new HetznerClient();
const dcs = await c.listDatacenters();
console.log('datacenters:', dcs.map(x => x.name));
if (!dcs.length) process.exit(1);
EOF

# 5. Verify servers table in DB
node --input-type=module <<'EOF'
import { createServiceClient } from './packages/db/dist/index.js';
const sb = createServiceClient();
const { data, error } = await sb.from('servers').select('id').limit(1);
if (error) { console.error('servers table error:', error.message); process.exit(1); }
console.log('servers table accessible, row count check: ok');
EOF

# 6. Verify route stub exists
curl -s -X POST http://localhost:3004/api/infra/provision \
  -H 'Content-Type: application/json' \
  -d '{}' | grep -q '"ok":false'

# 7. Failure-path diagnostic: ProvisioningService DB insert failure is observable
# (HetznerClient reads token from Supabase settings — no constructor override available)
# Instead verify: provision() throws a structured error when DB insert fails
# by checking ProvisioningService error message format in the dist bundle
node --input-type=module <<'EOF'
import { readFileSync } from 'node:fs';
const src = readFileSync('./packages/deployment/dist/index.js', 'utf8');
// Verify all failure-path log prefixes are present in the built output
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
    console.error(`MISSING failure-path string: "${c}"`);
    allOk = false;
  } else {
    console.log(`OK: "${c}" present in dist`);
  }
}
if (!allOk) process.exit(1);
console.log('All failure-path observability strings confirmed in dist bundle');
EOF
```

## Observability / Diagnostics

- Runtime signals: `[HetznerClient]` prefixed log lines for all API calls; `[ProvisioningService]` prefixed lines for each phase (SSH connect, file upload, bootstrap exec, DB insert); SSH stdout/stderr logged verbatim
- Inspection surfaces: `servers` table in Supabase; `packages/deployment/dist/` after build
- Failure visibility: `ProvisioningService.provision()` throws with phase name + original error message; `HetznerClient` methods throw `HetznerApiError` with status code + response body
- Redaction constraints: `hetzner_api_token` never logged; `tailscaleKey` never persisted or logged

## Integration Closure

- Upstream surfaces consumed: `@monster/db` `createServiceClient()` for settings reads and `servers` inserts; `node-ssh` NodeSSH for SSH bootstrap; `scripts/setup-vps2.sh` + `scripts/lib/vps2-check.sh` uploaded at provision time
- New wiring introduced in this slice: `HetznerClient` + `ProvisioningService` exported from `@monster/deployment`; `POST /api/infra/provision` stub route contract established
- What remains before milestone is truly usable end-to-end: S02 (services migration + settings cleanup) + S03 (fleet UI + full provision route handler)

## Tasks

- [x] **T01: Apply servers table migration + update Supabase types** `est:30m`
  Write and apply the `servers` table SQL migration; manually add `servers` Row/Insert/Update blocks to `supabase.ts`; rebuild `@monster/db` to propagate types.

- [x] **T02: Implement HetznerClient** `est:45m`
  Create `packages/deployment/src/hetzner.ts` with all 7 API methods using raw fetch + Bearer auth; read `hetzner_api_token` from Supabase settings (D028); handle 409 idempotency on `registerSshKey`; typecheck clean.

- [x] **T03: Implement ProvisioningService** `est:1h`
  Create `packages/deployment/src/provisioning.ts`; implement `provision()` + `waitForBoot()` + `bootstrapVps()`; update `packages/deployment/src/index.ts` to export `HetznerClient`, `ProvisioningService`, `Server`, `ProvisionOpts`.

- [x] **T04: Add provision route stub + verify full build** `est:30m`
  Create `apps/admin/src/app/api/infra/provision/route.ts` returning `{ ok: false, error: 'not implemented' }`; run full verification sequence (typecheck + build + live `listDatacenters()` API call).

## Files Likely Touched

- `packages/db/supabase/migrations/20260316160000_servers.sql` (new)
- `packages/db/src/types/supabase.ts` (edit — add servers table blocks)
- `packages/deployment/src/hetzner.ts` (new)
- `packages/deployment/src/provisioning.ts` (new)
- `packages/deployment/src/index.ts` (extend exports)
- `apps/admin/src/app/api/infra/provision/route.ts` (new)
