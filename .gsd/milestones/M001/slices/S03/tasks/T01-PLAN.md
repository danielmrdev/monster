---
estimated_steps: 6
estimated_files: 4
---

# T01: Build `packages/db` — typed Supabase client

**Slice:** S03 — Shared Packages
**Milestone:** M001

## Description

Install tsup and Supabase deps into `packages/db`. Write `src/client.ts` with `createBrowserClient<Database>()` and `createServiceClient<Database>()`. Write `src/index.ts` re-exporting all type helpers from the generated types plus the two client factories. Update `package.json` with `"type": "module"`, proper exports map, and build scripts. Write `tsup.config.ts`. The key constraint: `packages/db` must NOT import anything from Next.js, and env vars in `createServiceClient` must be read inside the function body (not at module scope).

## Steps

1. Add `@supabase/ssr` and `@supabase/supabase-js` as runtime dependencies and `tsup` + `typescript` as devDependencies in `packages/db/package.json`
2. Update `packages/db/package.json`: set `"type": "module"`, set exports map `{ ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`, add scripts `"build": "tsup"` and `"typecheck": "tsc --noEmit"`
3. Write `packages/db/tsup.config.ts`: entry `["src/index.ts"]`, format `["esm"]`, dts `true`, clean `true`, sourcemap `false`
4. Write `packages/db/src/client.ts`:
   - Import `createBrowserClient` from `@supabase/ssr`, `createClient` from `@supabase/supabase-js`, and `Database` type from `./types/supabase.js`
   - Export `createBrowserClient<Database>()` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — env vars read inside the function
   - Export `createServiceClient()` using `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — env vars read inside the function; add a guard throwing a descriptive error if key is missing
5. Write `packages/db/src/index.ts` re-exporting: `Database`, `Json`, `Tables`, `TablesInsert`, `TablesUpdate` from `./types/supabase.js`; `createBrowserClient`, `createServiceClient` from `./client.js`
6. Run `pnpm install` in the repo root (to register new deps), then `pnpm --filter @monster/db build` and `pnpm --filter @monster/db typecheck`

## Must-Haves

- [ ] `packages/db/package.json` has `"type": "module"` and a non-empty exports map pointing to `dist/`
- [ ] `tsup.config.ts` exists with ESM format and dts enabled
- [ ] `src/client.ts` exports both factory functions with `Database` generic applied
- [ ] `createServiceClient()` reads `SUPABASE_SERVICE_ROLE_KEY` inside the function body (not at module scope) and throws descriptively if missing
- [ ] `src/index.ts` re-exports all five type helpers plus both client factories
- [ ] No import from `next/headers`, `next/server`, `next/navigation`, or any `next/*` path
- [ ] `pnpm --filter @monster/db build` exits 0 and produces `dist/index.js` + `dist/index.d.ts`
- [ ] `pnpm --filter @monster/db typecheck` exits 0

## Verification

```bash
# Build passes
pnpm --filter @monster/db build

# Artifacts produced
ls packages/db/dist/index.js packages/db/dist/index.d.ts

# No Next.js imports
grep -r "from 'next" packages/db/src/ && echo "FAIL" || echo "OK: no next imports"

# Typecheck clean
pnpm --filter @monster/db typecheck
```

## Inputs

- `packages/db/src/types/supabase.ts` — 1218-line generated types from S02; do NOT edit; provides `Database`, `Json`, `Tables`, `TablesInsert`, `TablesUpdate`
- `.env` — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` all present from S02/T03
- `packages/db/package.json` — currently has empty `exports: {}` and empty `scripts: {}`; must be updated
- `packages/db/tsconfig.json` — already correct (`module: NodeNext, moduleResolution: NodeNext`); used for typecheck only, tsup owns emit

## Expected Output

- `packages/db/src/client.ts` — two typed factory functions
- `packages/db/src/index.ts` — barrel re-exporting types + factories
- `packages/db/tsup.config.ts` — ESM + dts build config
- `packages/db/package.json` — updated with type:module, exports map, deps, scripts
- `packages/db/dist/index.js` + `packages/db/dist/index.d.ts` — compiled ESM output

## Observability Impact

- **Missing service key:** `createServiceClient()` throws `Error: Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY` at call time. Safe — no secret value is logged.
- **Build health:** `pnpm --filter @monster/db build` exit code signals package health. tsup stderr includes file-level errors with line numbers.
- **Dist presence check:** `ls packages/db/dist/index.js packages/db/dist/index.d.ts` — both must exist and be non-empty after build.
- **Type contract:** `pnpm --filter @monster/db typecheck` via `tsc --noEmit`. Errors surface as file:line:col messages.
- **No Next.js leak:** `grep -r "from 'next" packages/db/src/` returns nothing.
- **Module scope safety:** env vars are NOT read at module scope — import succeeds without env vars; error only surfaces at call time.
