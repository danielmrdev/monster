# S03: Shared Packages

**Goal:** `packages/db` exports a typed Supabase client factory and type helpers; `packages/shared` exports domain types and constants; both compile cleanly and are importable from `apps/admin`.
**Demo:** `pnpm build` at monorepo root succeeds for both packages, producing `dist/index.js` + `dist/index.d.ts`; a type-check probe in `apps/admin` resolving `@monster/db` and `@monster/shared` passes `tsc --noEmit` with zero errors.

## Must-Haves

- `packages/db/src/client.ts` exports `createBrowserClient()` and `createServiceClient()` — both typed with `Database` generic, env vars read at call time (not module scope)
- `packages/db/src/index.ts` re-exports `Database`, `Json`, `Tables`, `TablesInsert`, `TablesUpdate`, `createBrowserClient`, `createServiceClient`
- `packages/shared/src/types/index.ts` defines `SiteStatus`, `AmazonMarket`, `Language`, `SiteTemplate`, `Site`, `TsaCategory`, `TsaProduct` as TypeScript string-literal types and interfaces
- `packages/shared/src/constants/index.ts` exports `AMAZON_MARKETS`, `SUPPORTED_LANGUAGES`, `SITE_STATUS_FLOW`, `REBUILD_TRIGGERS` as `as const` objects
- Both `package.json` files have `"type": "module"`, correct `exports` map (`"."` → `./dist/index.js` import + `./dist/index.d.ts` types), and build scripts using tsup
- Both packages have `tsup.config.ts` configured for ESM output + `.d.ts` generation
- `apps/admin/package.json` references `@monster/db` and `@monster/shared` as `workspace:*`
- `pnpm build --filter @monster/db --filter @monster/shared` succeeds with no errors
- A type-check probe in `apps/admin` (`tsc --noEmit`) resolves both workspace imports cleanly
- `packages/db` does NOT import from `next/headers` or any Next.js module
- `packages/shared` has zero runtime dependencies

## Verification

```bash
# Build both packages
pnpm --filter @monster/db build && pnpm --filter @monster/shared build

# dist artifacts exist
ls packages/db/dist/index.js packages/db/dist/index.d.ts
ls packages/shared/dist/index.js packages/shared/dist/index.d.ts

# No Next.js leak in packages/db
grep -r "next/headers\|next/server\|next/navigation" packages/db/src/ && echo "FAIL: Next.js leak" || echo "OK: no Next.js imports"

# packages/shared has zero runtime deps
node -e "const p = JSON.parse(require('fs').readFileSync('packages/shared/package.json','utf8')); const d = Object.keys(p.dependencies||{}); console.assert(d.length===0, 'FAIL: deps found: '+d); console.log('OK: zero runtime deps')"

# Cross-workspace type check via admin probe
pnpm --filter @monster/admin exec tsc --noEmit

# Failure-path diagnostic: createServiceClient throws descriptively on missing key
node -e "
import('@monster/db').then(m => {
  try { m.createServiceClient(); console.log('FAIL: should have thrown'); }
  catch(e) { console.log('OK:', e.message.includes('SUPABASE_SERVICE_ROLE_KEY') ? 'descriptive error' : 'unexpected error: ' + e.message); }
}).catch(e => console.error('import failed:', e.message));
" 2>&1 || true

# Failure-path diagnostic: packages/shared build failure surfaces
# If tsup.config.ts is missing or malformed, build exits non-zero with structured error:
#   pnpm --filter @monster/shared build 2>&1 | grep -E "error|Error|FAIL"
# If dist artifacts are absent after build, ls exits non-zero:
#   ls packages/shared/dist/index.{js,d.ts} 2>&1
# If SITE_STATUS_FLOW is missing a SiteStatus key, tsc --noEmit surfaces:
#   pnpm --filter @monster/shared typecheck 2>&1 | head -20
# Quick combined health probe for both packages (run after any change):
#   pnpm --filter @monster/db build 2>&1 | tail -5 && pnpm --filter @monster/shared build 2>&1 | tail -5
#   ls -la packages/db/dist/index.{js,d.ts} packages/shared/dist/index.{js,d.ts}
```

## Observability / Diagnostics

- **Build errors:** tsup and tsc emit structured stderr with file + line context. Build failures for `@monster/db` and `@monster/shared` are immediately visible via `pnpm --filter @monster/db build` exit code and stderr.
- **Missing env vars:** `createServiceClient()` throws a descriptive `Error` with the variable name when `SUPABASE_SERVICE_ROLE_KEY` is absent. The error surfaces at call time (not module load), making it easy to trace in server logs.
- **Type resolution failures:** `tsc --noEmit` in `apps/admin` surfaces cross-package resolution errors with full import path and type mismatch details. Run `pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -40` to inspect.
- **Dist inspection:** `ls -la packages/db/dist/ packages/shared/dist/` shows whether build artifacts are present and non-empty.
- **Diagnostic command for a future agent:**
  ```bash
  # Quick health check for both packages
  pnpm --filter @monster/db build 2>&1 | tail -5
  pnpm --filter @monster/shared build 2>&1 | tail -5
  ls packages/db/dist/index.{js,d.ts} packages/shared/dist/index.{js,d.ts}
  ```
- **No secrets in logs:** env var values are never logged. Error messages mention only the variable name.

## Integration Closure

- Upstream surfaces consumed: `packages/db/src/types/supabase.ts` (1218-line generated types from S02); `.env` with all 4 Supabase env vars
- New wiring introduced: `apps/admin/package.json` workspace deps; both packages' exports maps enabling NodeNext resolution
- What remains before milestone is truly usable end-to-end: S04 (Next.js app with real server components using the typed client)

## Tasks

- [x] **T01: Build `packages/db` — typed Supabase client** `est:45m`
  - Why: The generated types from S02 are unusable without a typed factory layer. This is the primary consumer contract for S04.
  - Files: `packages/db/src/client.ts`, `packages/db/src/index.ts`, `packages/db/package.json`, `packages/db/tsup.config.ts`
  - Do: Install tsup as devDep; add `@supabase/ssr` and `@supabase/supabase-js` as runtime deps; write `client.ts` with `createBrowserClient<Database>()` and `createServiceClient<Database>()`; write `index.ts` re-exporting all type helpers + client factories; set `"type": "module"` and `exports` map in package.json; write `tsup.config.ts` (entry: src/index.ts, format: esm, dts: true, clean: true); add build + typecheck scripts. Env vars must be read inside factory function bodies, NOT at module scope.
  - Verify: `pnpm --filter @monster/db build` produces `dist/index.js` and `dist/index.d.ts`; `grep "next/headers\|next/server" packages/db/src/` returns empty
  - Done when: dist artifacts exist, no Next.js imports, `tsc --noEmit` clean in packages/db

- [x] **T02: Build `packages/shared` — domain types and constants** `est:30m`
  - Why: Shared types and constants are needed by both `packages/db` consumers and `apps/admin` components. Zero-dep pure-TS package.
  - Files: `packages/shared/src/types/index.ts`, `packages/shared/src/constants/index.ts`, `packages/shared/src/index.ts`, `packages/shared/package.json`, `packages/shared/tsup.config.ts`
  - Do: Create `src/` directory structure; write string-literal union types and domain interfaces in `types/index.ts`; write `as const` constant objects in `constants/index.ts`; write barrel `index.ts`; set `"type": "module"`, exports map, zero dependencies in package.json; write `tsup.config.ts` (same pattern as db); add build + typecheck scripts. `packages/shared` must have NO runtime dependencies — types and constants only.
  - Verify: `pnpm --filter @monster/shared build` produces `dist/index.js` and `dist/index.d.ts`; `node -e "..."` confirms zero runtime deps
  - Done when: dist artifacts exist, zero runtime deps confirmed, `tsc --noEmit` clean in packages/shared

- [x] **T03: Wire workspace imports and verify cross-package resolution** `est:20m`
  - Why: Closes the S03 contract — S04 needs to import `@monster/db` and `@monster/shared` from `apps/admin`. This task proves the wiring works before S04 begins.
  - Files: `apps/admin/package.json`, `apps/admin/tsconfig.json`, `apps/admin/src/probe.ts` (temp verification file, deleted after)
  - Do: Add `@monster/db: workspace:*` and `@monster/shared: workspace:*` to `apps/admin/package.json`; ensure `apps/admin/tsconfig.json` extends base and has `moduleResolution: Bundler` (compatible with pre-compiled dist); run `pnpm install` to link; create a temporary `probe.ts` that imports and uses types from both packages; run `tsc --noEmit` in admin; delete probe.ts after passing.
  - Verify: `pnpm install` links workspace packages; `pnpm --filter @monster/admin exec tsc --noEmit` exits 0
  - Done when: admin tsc resolves both workspace packages with zero errors

## Files Likely Touched

- `packages/db/src/client.ts` (new)
- `packages/db/src/index.ts` (new)
- `packages/db/package.json`
- `packages/db/tsup.config.ts` (new)
- `packages/shared/src/types/index.ts` (new)
- `packages/shared/src/constants/index.ts` (new)
- `packages/shared/src/index.ts` (new)
- `packages/shared/package.json`
- `packages/shared/tsup.config.ts` (new)
- `apps/admin/package.json`
- `apps/admin/tsconfig.json`
