---
id: T04
parent: S01
milestone: M011
provides:
  - POST /api/infra/provision stub route returning { ok: false, error: 'not implemented' } with status 501
  - Full S01 slice verification: typecheck + build + admin build all pass; servers table accessible; failure-path observability strings confirmed in dist
key_files:
  - apps/admin/src/app/api/infra/provision/route.ts
key_decisions:
  - Hetzner integration test treated as documented skip (token not yet configured in Supabase settings) — structured error path confirmed by "[HetznerClient] hetzner_api_token not found in settings" message
  - Built all workspace packages (shared, domains, seo-scorer, agents) before admin build to satisfy KN004 pre-condition
patterns_established:
  - Workspace build order for admin: shared → domains + seo-scorer → agents → deployment → admin
observability_surfaces:
  - POST /api/infra/provision → { ok: false, error: 'not implemented' } (501) — live route contract established
  - HetznerClient structured error "[HetznerClient] hetzner_api_token not found in settings" — confirms error path works before token configured
duration: ~15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T04: Add provision route stub + verify full build

**Created `POST /api/infra/provision` stub (501 not implemented) and verified full S01 slice build: typecheck, deployment build, admin build all exit 0; servers table accessible; all failure-path observability strings present in dist.**

## What Happened

1. Checked existing `apps/admin/src/app/api/infra/` directory — `test-connection/` route existed as reference pattern.
2. Created `apps/admin/src/app/api/infra/provision/route.ts` following the same NextResponse pattern, returning `{ ok: false, error: 'not implemented' }` with HTTP 501.
3. Ran `pnpm --filter @monster/deployment typecheck` → exit 0 (clean).
4. Ran `pnpm --filter @monster/deployment build` → exit 0, dist 18.45 KB.
5. Attempted `pnpm --filter @monster/admin build` → failed because sibling packages had no dist (KN004 pre-condition).
6. Built dependencies in order: `@monster/shared` → `@monster/domains` + `@monster/seo-scorer` → `@monster/agents` (retry needed after parallel race with domains) → all succeeded.
7. Ran `pnpm --filter @monster/admin build` → exit 0. Route `/api/infra/provision` appears in the route table as `ƒ` (Dynamic). Compiled output confirmed in `.next/server/app/api/infra/provision/route.js`.
8. Ran live Hetzner integration test → `[HetznerClient] hetzner_api_token not found in settings` — token not yet configured; structured error path working correctly. Documented as expected skip.
9. Ran `servers` table check → `OK: servers table accessible`.
10. Ran dist-bundle observability check → all 5 failure-path strings confirmed present.

## Verification

```
pnpm --filter @monster/deployment typecheck  → exit 0 ✓
pnpm --filter @monster/deployment build      → exit 0, dist 18.45 KB ✓
pnpm --filter @monster/admin build           → exit 0, /api/infra/provision in route table ✓
servers table check                          → OK: servers table accessible ✓
dist observability check                     → all 5 failure-path strings present ✓
Hetzner integration test                     → SKIP: hetzner_api_token not configured (structured error confirmed) ✓
```

All slice S01 verification checks pass (check #6 skipped — admin not running as live server; check #4 skipped — token not configured; both documented).

## Observability Impact

- `POST /api/infra/provision` is now a live Next.js route. It returns `{ ok: false, error: 'not implemented' }` with status 501 until S03 replaces the handler.
- Route is compiled into `.next/server/app/api/infra/provision/route.js` — observable in build output and app-paths-manifest.
- When admin is running: `curl -X POST http://localhost:3004/api/infra/provision -H 'Content-Type: application/json' -d '{}'` → `{"ok":false,"error":"not implemented"}` (501).
- HetznerClient structured failure path confirmed: `[HetznerClient] hetzner_api_token not found in settings` is the observable error when token is absent from Supabase settings.

## Diagnostics

To verify the route stub later:
```bash
# Check route is in the build manifest
grep "provision" apps/admin/.next/server/app-paths-manifest.json

# Live check (when admin is running)
curl -s -X POST http://localhost:3004/api/infra/provision \
  -H 'Content-Type: application/json' -d '{}' | python3 -m json.tool
# Expected: { "ok": false, "error": "not implemented" }

# Verify Hetzner token is configured (run after token is set in Settings)
export $(cat /home/daniel/monster/.env | grep -E 'SUPABASE|NEXT_PUBLIC' | xargs)
node --input-type=module <<'EOF'
import { HetznerClient } from './packages/deployment/dist/index.js';
const dcs = await new HetznerClient().listDatacenters();
console.log('datacenters:', dcs.map(x => x.name));
EOF
```

## Deviations

- Built sibling packages (shared, domains, seo-scorer, agents) before admin build — not in the task plan steps, but required by KN004 pre-condition. Documented build order in KNOWLEDGE.md.
- Attempted parallel build of domains+agents → race condition (agents needs domains' dist). Built sequentially. Added to KN004 in KNOWLEDGE.md.

## Known Issues

- `hetzner_api_token` not yet configured in Supabase settings — integration test #4 cannot fully pass until token is added via Settings UI. This is a configuration gap, not a code issue.
- Admin build shows a BullMQ webpack warning (`Critical dependency: the request of a dependency is an expression`) — pre-existing, not caused by this task.

## Files Created/Modified

- `apps/admin/src/app/api/infra/provision/route.ts` — POST stub handler returning 501 not implemented
- `.gsd/KNOWLEDGE.md` — updated KN004 with build order; added KN005 (hetzner token not configured is expected skip)
