---
id: T01
parent: S03
milestone: M001
provides:
  - packages/db typed Supabase client factory (createBrowserClient, createServiceClient)
  - packages/db barrel re-exporting Database, Json, Tables, TablesInsert, TablesUpdate
  - packages/db dist artifacts (ESM + .d.ts)
key_files:
  - packages/db/src/client.ts
  - packages/db/src/index.ts
  - packages/db/tsup.config.ts
  - packages/db/package.json
  - packages/db/tsconfig.json
  - packages/db/src/types/supabase.ts
key_decisions:
  - Env vars read inside factory function bodies, not module scope — safe to import without env vars present
  - "@types/node added as devDep + types:[\"node\"] in tsconfig to support process.env in DTS build"
  - supabase.ts had 32 lines of Docker pull output prepended (S02 bug); stripped cleanly
patterns_established:
  - createServiceClient throws Error with variable name (no secret value) when key is missing
  - tsup ESM-only build with dts:true, clean:true for all packages/db artifacts
observability_surfaces:
  - "Missing service key: Error thrown at call time with message containing 'SUPABASE_SERVICE_ROLE_KEY'"
  - "Build health: pnpm --filter @monster/db build exit code + tsup stderr"
  - "Dist presence: ls packages/db/dist/index.{js,d.ts}"
  - "Type check: pnpm --filter @monster/db typecheck"
duration: ~35m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Build `packages/db` — typed Supabase client

**Stripped Docker noise from supabase.ts (S02 artifact corruption) and built a typed Supabase client package — createBrowserClient/createServiceClient with Database generic, ESM output, clean DTS.**

## What Happened

Pre-flight: added Observability Impact section to T01-PLAN.md and Observability/Diagnostics section to S03-PLAN.md as required.

Implementation proceeded in order: updated package.json (type:module, exports map, deps, scripts), wrote tsup.config.ts, wrote src/client.ts and src/index.ts.

First build attempt failed on DTS step: `supabase.ts` started with 32 lines of Docker pull output that was prepended during S02's type generation (the `supabase gen types` command apparently wrote its own stderr/stdout interleaved into the file). The TypeScript content started at line 33. Stripped the noise with `tail -n +33`, confirmed all five required exports (`Database`, `Json`, `Tables`, `TablesInsert`, `TablesUpdate`) were present.

Second build attempt failed on `process.env` not found in DTS build — `@types/node` was absent. Added it as devDep and added `"types": ["node"]` to tsconfig.json. Third build: clean pass.

## Verification

All checks pass:

```
pnpm --filter @monster/db build        → ESM build success + DTS build success
ls packages/db/dist/index.{js,d.ts}   → both present, index.js 1262B, index.d.ts 109154B
grep -r "from 'next" packages/db/src/ → OK: no next imports
pnpm --filter @monster/db typecheck   → exit 0, no output
```

Must-have spot checks:
- `"type": "module"` in package.json: OK
- exports map `{ ".": { import, types } }` pointing to dist/: OK
- `createServiceClient()` throws `Error: Missing required env var: SUPABASE_SERVICE_ROLE_KEY...` when key absent: OK (tested with node --input-type=module)

## Diagnostics

- **Inspect missing key error:** `node --input-type=module -e "import {createServiceClient} from './packages/db/dist/index.js'; process.env.NEXT_PUBLIC_SUPABASE_URL='x'; createServiceClient();"` → throws with `SUPABASE_SERVICE_ROLE_KEY` in message
- **Build health:** `pnpm --filter @monster/db build 2>&1 | tail -5`
- **Dist present:** `ls -la packages/db/dist/`
- **No Next.js:** `grep -r "from 'next" packages/db/src/ && echo FAIL || echo OK`

## Deviations

1. **supabase.ts corruption fix (unplanned):** S02 left 32 lines of Docker stdout prepended to the generated types file. Stripped them. File now starts cleanly with `export type Json`. This is a bug fix on S02 output, not a plan deviation for T01.
2. **`@types/node` + tsconfig `types:["node"]` (unplanned):** Not mentioned in the plan. Required for `process.env` to typecheck in the DTS build pass. Standard addition for any Node.js package.

## Known Issues

None.

## Files Created/Modified

- `packages/db/src/client.ts` — new; two typed factory functions reading env vars at call time
- `packages/db/src/index.ts` — new; barrel re-exporting 5 type helpers + 2 client factories
- `packages/db/tsup.config.ts` — new; ESM + dts, clean, no sourcemap
- `packages/db/package.json` — updated; type:module, exports map, @supabase/ssr + supabase-js deps, @types/node devDep, build/typecheck/dev scripts
- `packages/db/tsconfig.json` — updated; added `"types": ["node"]`
- `packages/db/src/types/supabase.ts` — fixed; stripped 32 lines of Docker output prepended by S02
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — pre-flight: added Observability/Diagnostics section + failure-path diagnostic verification step
- `.gsd/milestones/M001/slices/S03/tasks/T01-PLAN.md` — pre-flight: added Observability Impact section
