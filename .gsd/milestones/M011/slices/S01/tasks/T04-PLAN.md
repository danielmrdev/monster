# T04: Add provision route stub + verify full build

## Why

S01's boundary contract with S03 requires `POST /api/infra/provision` to exist as a route. S03 will implement the full handler; S01 only needs the stub that establishes the route URL and response shape. This task also runs the full verification sequence (typecheck + build + live API integration test) that closes S01's proof level.

## Description

Create a minimal Next.js Route Handler at `apps/admin/src/app/api/infra/provision/route.ts` that returns `{ ok: false, error: 'not implemented' }`. This establishes the route contract and ensures the admin build includes the `/api/infra/provision` path.

Then run the complete verification sequence:
1. `pnpm --filter @monster/deployment typecheck`
2. `pnpm --filter @monster/deployment build`
3. `pnpm --filter @monster/admin build`
4. Live `listDatacenters()` integration test (requires `hetzner_api_token` in Supabase settings)
5. Verify `servers` table accessible via `createServiceClient()`

## Steps

1. **Check if `apps/admin/src/app/api/infra/` directory exists** — if so, create just the `provision/` subdirectory and `route.ts`. If the `api/infra/` path already has other routes (e.g. `test-connection/`), follow the same pattern.

   Check: `ls apps/admin/src/app/api/infra/`

2. **Create `apps/admin/src/app/api/infra/provision/route.ts`**:

```typescript
import { NextResponse } from 'next/server';

// POST /api/infra/provision
//
// Stub — full implementation lands in M011/S03.
// Contract: { name, datacenter, serverType, tailscaleKey, sshPublicKey } → { ok, serverId?, error? }
//
// ProvisioningService.provision() will be called here in S03.
export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ ok: false, error: 'not implemented' }, { status: 501 });
}
```

3. **Run full verification sequence**:

```bash
# Typecheck deployment package
pnpm --filter @monster/deployment typecheck

# Build deployment package
pnpm --filter @monster/deployment build

# Build admin app — verifies no import breakage and /api/infra/provision appears in routes
pnpm --filter @monster/admin build
```

4. **Run live Hetzner API integration test** (requires `hetzner_api_token` configured in Supabase settings — skip with documented note if token not yet set):

```bash
node --input-type=module <<'EOF'
import { HetznerClient } from './packages/deployment/dist/index.js';
const c = new HetznerClient();
try {
  const dcs = await c.listDatacenters();
  console.log('datacenters:', dcs.map(x => x.name));
  if (!dcs.length) { console.error('FAIL: empty datacenter list'); process.exit(1); }
  console.log('OK: Hetzner API integration test PASSED');
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
EOF
```

5. **Verify `servers` table accessible**:

```bash
node --input-type=module <<'EOF'
import { createServiceClient } from './packages/db/dist/index.js';
const sb = createServiceClient();
const { data, error } = await sb.from('servers').select('id').limit(1);
if (error) { console.error('FAIL:', error.message); process.exit(1); }
console.log('OK: servers table accessible');
EOF
```

6. **Verify route stub responds** (if admin is running on port 3004):

```bash
curl -s -X POST http://localhost:3004/api/infra/provision \
  -H 'Content-Type: application/json' \
  -d '{}' | python3 -m json.tool
# Expected: { "ok": false, "error": "not implemented" }
```

## Must-Haves

- `apps/admin/src/app/api/infra/provision/route.ts` exists and exports `POST` handler
- Handler returns `{ ok: false, error: 'not implemented' }` with status 501
- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/deployment build` exits 0
- `pnpm --filter @monster/admin build` exits 0 (most important — no import breakage in admin app)
- Live `listDatacenters()` call returns real datacenter names OR failure is documented as "token not configured" (not a code error)

## Inputs

- `packages/deployment/src/hetzner.ts` — `HetznerClient` (from T02)
- `packages/deployment/src/provisioning.ts` — `ProvisioningService` (from T03)
- `packages/deployment/src/index.ts` — updated exports (from T03)
- `apps/admin/src/app/api/infra/test-connection/` — reference for existing infra API route pattern
- `apps/admin/next.config.ts` — already has `@monster/deployment` in `serverExternalPackages`; no change needed

## Expected Output

- `apps/admin/src/app/api/infra/provision/route.ts` — minimal POST handler stub
- All build and typecheck commands exit 0
- Live API integration test passes (or documented skip reason)

## Verification

```bash
# Contract verification
pnpm --filter @monster/deployment typecheck && echo "typecheck: OK"
pnpm --filter @monster/deployment build && echo "build deployment: OK"
pnpm --filter @monster/admin build && echo "build admin: OK"
```

## Done When

- All three pnpm commands above exit 0
- `apps/admin/src/app/api/infra/provision/route.ts` exists
- Integration test passes or skip reason documented (e.g. "hetzner_api_token not yet configured")
