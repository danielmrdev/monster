---
id: T02
parent: S01
milestone: M011
provides:
  - HetznerClient class in packages/deployment/src/hetzner.ts with all 7 methods
  - HetznerApiError custom error class exported from @monster/deployment
  - All Hetzner response shape types exported (HetznerServer, HetznerDatacenter, HetznerServerType, HetznerSshKey, CreateServerOpts)
key_files:
  - packages/deployment/src/hetzner.ts
  - packages/deployment/src/index.ts
  - packages/deployment/dist/index.js
  - packages/deployment/dist/index.d.ts
key_decisions:
  - HetznerClient reads hetzner_api_token from Supabase settings at call time (D028 pattern, no constructor arg) — consistent with InfraService/SpaceshipClient pattern
  - registerSshKey handles 409 Conflict idempotently by listing all SSH keys and matching by name
  - fetch() wrapper logs every API call with [HetznerClient] prefix but never logs the token value
patterns_established:
  - D028 settings-read pattern: createServiceClient().from('settings').select('value').eq('key', key).single()
  - HetznerApiError(status, body, message) — status + body available for structured catch in callers
  - Idempotent registerSshKey: POST → catch 409 → listSshKeys() → find by name → return id
observability_surfaces:
  - "[HetznerClient] METHOD /path" logged for every API call"
  - "[HetznerClient] registered SSH key \"name\" id=N" on success"
  - "[HetznerClient] SSH key \"name\" already exists, looking up ID" on 409 retry"
  - "HetznerApiError { status, body } thrown on any non-2xx — structured for upstream catch"
duration: 15m
verification_result: passed
completed_at: 2026-03-16T17:00:00Z
blocker_discovered: false
---

# T02: Implement HetznerClient

**Created `packages/deployment/src/hetzner.ts` with all 7 Hetzner Cloud API methods + `HetznerApiError`; typecheck and build pass clean.**

## What Happened

Created `packages/deployment/src/hetzner.ts` following the D028 settings-read pattern from `infra.ts`. The file implements `HetznerClient` with a private `getToken()` that reads `hetzner_api_token` from the Supabase `settings` table at call time, and a private `fetch<T>()` wrapper that applies Bearer auth and throws `HetznerApiError` on non-2xx responses.

All 7 required methods implemented:
- `createServer(opts)` — POST /servers
- `getServer(id)` — GET /servers/:id
- `listServers()` — GET /servers
- `deleteServer(id)` — DELETE /servers/:id
- `listDatacenters()` — GET /datacenters
- `listServerTypes()` — GET /server_types
- `listSshKeys()` — GET /ssh_keys
- `registerSshKey(name, publicKey)` — POST /ssh_keys, idempotent on 409 Conflict

Updated `packages/deployment/src/index.ts` to export `HetznerClient`, `HetznerApiError`, and all 5 response shape types.

## Verification

```
# Typecheck (exit 0, no output = clean)
pnpm --filter @monster/deployment typecheck  ✅

# Build
pnpm --filter @monster/deployment build
→ dist/index.js 13.22 KB, dist/index.d.ts 3.97 KB  ✅

# HetznerClient in dist
grep "HetznerClient" packages/deployment/dist/index.d.ts
→ declare class HetznerApiError extends Error
→ declare class HetznerClient
→ export { ..., HetznerApiError, HetznerClient, ... }  ✅

# All 7 methods in dist
→ createServer, getServer, listServers, deleteServer, listDatacenters, listServerTypes, listSshKeys, registerSshKey  ✅
```

**Slice checks status:**
- ✅ Check 1: `pnpm --filter @monster/deployment typecheck` exits 0
- ✅ Check 2: `pnpm --filter @monster/deployment build` exits 0
- ❌ Check 3: `pnpm --filter @monster/admin build` fails — pre-existing issue (see Known Issues)
- ⏳ Check 4: Live Hetzner API test — `hetzner_api_token` not in settings yet (T04 gate)
- ✅ Check 5: `servers` table accessible — verified in T01
- ⏳ Check 6: `POST /api/infra/provision` stub — T04 task
- ⏳ Check 7: Failure-path diagnostic — constructor signature mismatch (see KN003)

## Diagnostics

**How to inspect this task's output later:**
```bash
# Confirm HetznerClient is exported from built package
grep "HetznerClient\|HetznerApiError" packages/deployment/dist/index.d.ts

# Test live API (requires hetzner_api_token in Supabase settings)
export $(cat /home/daniel/monster/.env | grep -E 'SUPABASE' | xargs)
node --input-type=module <<'EOF'
import { HetznerClient } from './packages/deployment/dist/index.js';
const c = new HetznerClient();
const dcs = await c.listDatacenters();
console.log('datacenters:', dcs.map(x => x.name));
EOF

# Error shape inspection — HetznerApiError has .status + .body
node --input-type=module <<'EOF'
import { HetznerApiError } from './packages/deployment/dist/index.js';
console.log('HetznerApiError fields:', Object.getOwnPropertyNames(new HetznerApiError(404, {}, 'test')));
EOF
```

**Runtime log signals to look for:**
- `[HetznerClient] GET /datacenters` — normal call
- `[HetznerClient] GET /datacenters → 401` — bad token
- `[HetznerClient] hetzner_api_token not found in settings` — token missing from DB

## Deviations

None. Implementation follows the task plan exactly.

## Known Issues

1. **Admin build (slice check #3) fails** — `packages/agents`, `packages/shared`, `packages/domains` have no `dist/` in this worktree. Pre-existing, unrelated to T02. See KN004. T04 should build all packages before admin build check.

2. **Slice check #7 constructor mismatch** — The S01-PLAN check #7 passes a token string to `new HetznerClient('invalid-token-diagnostic-check')` but `HetznerClient` has no constructor argument (reads from Supabase settings). See KN003. T04 must update this check.

## Files Created/Modified

- `packages/deployment/src/hetzner.ts` — new: full `HetznerClient` implementation with 7 methods + `HetznerApiError`
- `packages/deployment/src/index.ts` — updated: added exports for `HetznerClient`, `HetznerApiError`, and 5 type exports
- `packages/deployment/dist/index.js` — rebuilt: includes hetzner module
- `packages/deployment/dist/index.d.ts` — rebuilt: includes all exported types
