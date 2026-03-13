---
id: S03
parent: M001
milestone: M001
provides:
  - packages/db typed Supabase client factory (createBrowserClient, createServiceClient) with Database generic
  - packages/db barrel re-exporting Database, Json, Tables, TablesInsert, TablesUpdate + both client factories
  - packages/db dist artifacts (ESM index.js + index.d.ts 106KB declarations)
  - packages/shared domain types (SiteStatus, AmazonMarket, Language, SiteTemplate, Site, TsaCategory, TsaProduct, RebuildTrigger)
  - packages/shared constants (AMAZON_MARKETS × 10, SUPPORTED_LANGUAGES × 6, SITE_STATUS_FLOW × 8 states, REBUILD_TRIGGERS)
  - packages/shared dist artifacts (ESM index.js + index.d.ts)
  - apps/admin wired as workspace consumer of @monster/db and @monster/shared via workspace:*
  - Cross-package TypeScript resolution verified (tsc --noEmit exit 0 in apps/admin)
requires:
  - slice: S01
    provides: packages/db and packages/shared directory scaffolds with package.json stubs
  - slice: S02
    provides: packages/db/src/types/supabase.ts (1218-line generated types used to type client factories)
affects:
  - S04 (Next.js admin panel can import @monster/db for server components and @monster/shared for component props)
key_files:
  - packages/db/src/client.ts
  - packages/db/src/index.ts
  - packages/db/tsup.config.ts
  - packages/db/package.json
  - packages/db/tsconfig.json
  - packages/db/src/types/supabase.ts
  - packages/shared/src/types/index.ts
  - packages/shared/src/constants/index.ts
  - packages/shared/src/index.ts
  - packages/shared/tsup.config.ts
  - packages/shared/package.json
  - apps/admin/package.json
  - apps/admin/tsconfig.json
  - apps/admin/src/index.ts
key_decisions:
  - D018: tsup for ESM emit + dts generation across all shared packages (no plain tsc emit)
  - D019: packages/db has zero Next.js imports — server component clients go in apps/admin/src/lib/supabase/ (S04)
  - D020: workspace consumers use moduleResolution:Bundler + no manual paths entries; pnpm symlinks + exports map resolves @monster/* directly
  - D021: env vars read inside factory function bodies at call time, not at module scope — safe import without env present, descriptive error at invocation
patterns_established:
  - tsup config pattern: ESM-only, dts:true, clean:true, no sourcemap — applied identically to packages/db and packages/shared
  - Workspace consumer pattern: package.json uses workspace:*, tsconfig extends base + moduleResolution:Bundler + includes src/**/*; no paths entries
  - SITE_STATUS_FLOW typed as Record<SiteStatus, SiteStatus[]> — tsc enforces exhaustiveness; adding/removing a SiteStatus key surfaces immediately at typecheck
  - as const satisfies ReadonlyArray<{...}> for AMAZON_MARKETS and SUPPORTED_LANGUAGES — preserves literal types while validating entries against union types
observability_surfaces:
  - "Build health: pnpm --filter @monster/db build 2>&1 | tail -5 + pnpm --filter @monster/shared build 2>&1 | tail -5"
  - "Dist presence: ls -la packages/db/dist/index.{js,d.ts} packages/shared/dist/index.{js,d.ts}"
  - "Missing service key: createServiceClient() throws Error with 'SUPABASE_SERVICE_ROLE_KEY' in message at call time"
  - "Type resolution: pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -40"
  - "Workspace link health: ls apps/admin/node_modules/@monster/{db,shared}"
  - "Zero runtime deps: node -e \"const p=JSON.parse(require('fs').readFileSync('packages/shared/package.json','utf8')); console.log(Object.keys(p.dependencies||{}))\""
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T03-SUMMARY.md
duration: ~70m
verification_result: passed
completed_at: 2026-03-13
---

# S03: Shared Packages

**Both shared packages build cleanly to ESM + .d.ts; apps/admin resolves @monster/db and @monster/shared via workspace:* with tsc --noEmit exit 0.**

## What Happened

Three tasks in sequence, each building on the last.

**T01 — packages/db typed client:** Updated package.json (type:module, exports map, @supabase/ssr + supabase-js as runtime deps, @types/node as devDep), wrote tsup.config.ts, wrote src/client.ts with `createBrowserClient<Database>()` and `createServiceClient<Database>()`, and barrel index.ts. One unplanned fix was required: the supabase.ts file generated in S02 had 32 lines of Docker pull output prepended (a side effect of how `supabase gen types` was run). Stripped with `tail -n +33`. Second blocker: `process.env` unavailable in the DTS build pass without `@types/node`; added it as devDep with `"types": ["node"]` in tsconfig. Third build succeeded cleanly.

**T02 — packages/shared types and constants:** Straightforward. Created src/types/index.ts with 4 string-literal union types and 3 domain interfaces; src/constants/index.ts with 4 `as const` constants; barrel index.ts. Used `as const satisfies ReadonlyArray<...>` for AMAZON_MARKETS and SUPPORTED_LANGUAGES (more type-safe than plain `as const` — validates entries against union types while preserving literals). Typed SITE_STATUS_FLOW as `Record<SiteStatus, SiteStatus[]>` to get exhaustiveness checking. Added `RebuildTrigger` derived type as a convenience export. Build passed on first attempt.

**T03 — workspace wiring:** Added `@monster/db: workspace:*` and `@monster/shared: workspace:*` to apps/admin/package.json; added `typescript` as devDep; updated tsconfig.json to include `src/**/*`. Ran `pnpm install` — workspace symlinks appeared. Created probe.ts importing and using values from both packages to force tsc to actually resolve imports. tsc --noEmit passed. Deleted probe.ts. Added `apps/admin/src/index.ts` one-line placeholder to prevent TS18003 on empty include. Final tsc --noEmit exits 0.

## Verification

All slice-level checks passed:

```bash
pnpm --filter @monster/db build && pnpm --filter @monster/shared build
# → ESM + DTS success for both packages

ls packages/db/dist/index.js packages/db/dist/index.d.ts
ls packages/shared/dist/index.js packages/shared/dist/index.d.ts
# → all four artifacts present

grep -r "next/headers\|next/server\|next/navigation" packages/db/src/
# → OK: no Next.js imports

node -e "...zero deps check..."
# → OK: zero runtime deps

pnpm --filter @monster/admin exec tsc --noEmit
# → exit 0

createServiceClient() with missing key
# → Error: Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY — descriptive, no secret value leaked
```

## Requirements Advanced

- R002 (extensible site type architecture) — `packages/shared` exports `SiteType` string-literal union and `Site` interface typed against the extensible schema; shared types are site-type-aware from day one

## Requirements Validated

- None fully validated this slice (S04 required for end-to-end admin panel operation)

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

1. **supabase.ts corruption fix (T01, unplanned):** S02 left 32 lines of Docker stdout prepended to the generated types file. Stripped in T01. Classifies as a bug fix on S02 output, not a T01 deviation.
2. **`@types/node` + `"types": ["node"]` in packages/db tsconfig (T01, unplanned):** Required for `process.env` to type-check in the DTS build pass. Standard for any Node.js package; not mentioned in the plan.
3. **`as const satisfies` for AMAZON_MARKETS / SUPPORTED_LANGUAGES (T02, minor):** Plan specified `as const` objects. Used `as const satisfies ReadonlyArray<{...}>` instead — strictly more type-safe, preserves literal types while validating entries. No downstream impact.
4. **`RebuildTrigger` exported type (T02, unplanned):** Derived `type RebuildTrigger = (typeof REBUILD_TRIGGERS)[number]` and exported it. Convenience type, zero cost.
5. **`apps/admin/src/index.ts` placeholder (T03, unplanned):** Needed after probe.ts deletion to prevent TS18003. S04 overwrites with real Next.js entry.

## Known Limitations

- `createBrowserClient()` is a thin wrapper over `@supabase/ssr`'s `createBrowserClient`. In a Next.js App Router context, a server-side SSR client with cookie handling is required — this lives in `apps/admin/src/lib/supabase/server.ts` (S04 scope).
- `apps/admin/src/index.ts` is a one-line placeholder. Any `tsc --noEmit` run on admin before S04 adds real source files will type-check only this placeholder.
- `packages/db` dist artifacts are committed to git (no gitignore on dist/). This is intentional for workspace consumers — pnpm workspace protocol symlinks the entire package directory including dist/.

## Follow-ups

- S04 creates `apps/admin/src/lib/supabase/server.ts` (SSR client with cookie handling using `@supabase/ssr`) and `apps/admin/src/lib/supabase/client.ts` (browser client wrapper). These consume `createBrowserClient` and `createServiceClient` from `@monster/db`.
- S04 replaces `apps/admin/src/index.ts` placeholder with real Next.js App Router entry points.
- If `supabase gen types --linked` is re-run in a future slice, verify the output file does not have Docker/CLI stdout prepended. Strip anything before `export type Json` if present.

## Files Created/Modified

- `packages/db/src/client.ts` — new; createBrowserClient and createServiceClient factory functions
- `packages/db/src/index.ts` — new; barrel re-exporting 5 type helpers + 2 client factories
- `packages/db/tsup.config.ts` — new; ESM + dts, clean, no sourcemap
- `packages/db/package.json` — updated; type:module, exports map, runtime deps, devDeps, scripts
- `packages/db/tsconfig.json` — updated; added `"types": ["node"]`
- `packages/db/src/types/supabase.ts` — fixed; stripped 32 lines of Docker output from start of file
- `packages/shared/src/types/index.ts` — new; 4 union types + 3 domain interfaces + SiteType
- `packages/shared/src/constants/index.ts` — new; 4 as-const constants + RebuildTrigger derived type
- `packages/shared/src/index.ts` — new; barrel re-exporting all types and constants
- `packages/shared/tsup.config.ts` — new; ESM + dts, clean, no sourcemap
- `packages/shared/package.json` — updated; type:module, exports map, zero deps, scripts
- `apps/admin/package.json` — updated; workspace deps for @monster/db and @monster/shared; typescript devDep
- `apps/admin/tsconfig.json` — updated; added `"include": ["src/**/*"]`
- `apps/admin/src/index.ts` — new; one-line placeholder (S04 replaces)
- `.gsd/DECISIONS.md` — appended D020, D021

## Forward Intelligence

### What the next slice should know
- `@monster/db` is intentionally free of Next.js imports. The SSR client with cookie handling belongs in `apps/admin/src/lib/supabase/server.ts`, not in the package. Do not add `next/headers` imports to `packages/db/`.
- `moduleResolution: Bundler` in tsconfig is required for workspace resolution. Do not change to `Node` or `NodeNext` — NodeNext requires explicit `.js` extensions on every import in ESM source files, which tsup handles transparently but plain tsc does not.
- The probe test pattern (create probe.ts importing both packages → tsc --noEmit → delete) works cleanly for verifying cross-workspace type resolution without leaving build artifacts.
- `apps/admin/src/index.ts` is a placeholder — S04 should overwrite it (or delete it and ensure tsconfig has real source files to include so TS18003 doesn't recur).

### What's fragile
- `packages/db/src/types/supabase.ts` — if `supabase gen types --linked` is rerun, check the output file's first line is `export type Json`. Docker/CLI stdout can get prepended again depending on how the command is invoked. Strip everything before the first `export type` line if needed.
- `apps/admin/node_modules/@monster/{db,shared}` symlinks — if `pnpm install` is run with `--no-frozen-lockfile` flags or the lockfile gets corrupted, rerun `pnpm install` at monorepo root to re-link. The workspace symlinks are managed by pnpm, not committed.

### Authoritative diagnostics
- **Build broken:** `pnpm --filter @monster/db build 2>&1 | tail -10` — tsup emits structured errors with file + line
- **Type resolution broken in admin:** `pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -40` — TS2307 means symlink broken or exports map wrong; TS2305 means type not exported from the package
- **Missing key at runtime:** `createServiceClient()` throws with the variable name in the message — grep server logs for `Missing required environment variable`

### What assumptions changed
- Assumed `supabase gen types --linked` produces a clean output file — it did not in S02 (Docker stdout prepended). Added a pre-flight check as a known fragile point going forward.
- Assumed workspace resolution would require explicit `paths` entries in tsconfig — it did not. Bundler moduleResolution + correct exports map in each package is sufficient.
