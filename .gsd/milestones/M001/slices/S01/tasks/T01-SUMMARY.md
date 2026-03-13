---
id: T01
parent: S01
milestone: M001
provides:
  - Root pnpm workspace config (package.json, pnpm-workspace.yaml, .npmrc)
  - Shared TypeScript base config (tsconfig.base.json)
  - 9 workspace package.json stubs (apps/admin, apps/generator, packages/db, packages/shared, packages/agents, packages/analytics, packages/domains, packages/seo-scorer, packages/deployment)
  - 9 workspace tsconfig.json stubs extending tsconfig.base.json
  - pnpm-lock.yaml generated
key_files:
  - package.json
  - pnpm-workspace.yaml
  - tsconfig.base.json
  - .npmrc
  - apps/admin/package.json
  - apps/admin/tsconfig.json
  - apps/generator/package.json
  - apps/generator/tsconfig.json
  - packages/db/package.json
  - packages/db/tsconfig.json
  - packages/shared/package.json
  - packages/shared/tsconfig.json
  - packages/agents/package.json
  - packages/agents/tsconfig.json
  - packages/analytics/package.json
  - packages/analytics/tsconfig.json
  - packages/domains/package.json
  - packages/domains/tsconfig.json
  - packages/seo-scorer/package.json
  - packages/seo-scorer/tsconfig.json
  - packages/deployment/package.json
  - packages/deployment/tsconfig.json
  - pnpm-lock.yaml
key_decisions:
  - D014: pnpm ls -r text output is empty in pnpm 10 with zero deps — use --json for reliable workspace enumeration
patterns_established:
  - Apps use moduleResolution:Bundler (Next.js/Astro compatible)
  - Packages use module:NodeNext + moduleResolution:NodeNext + outDir:dist + declaration:true
  - All tsconfigs extend ../../tsconfig.base.json (consistent relative path)
  - apps/admin tsconfig includes plugins:[{name:"next"}] stub so S04 doesn't need to touch tsconfig structure
observability_surfaces:
  - none
duration: ~15m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Monorepo Root Config + Workspace Stubs

**22 files written; `pnpm install` clean; all 9 `@monster/*` workspaces resolving.**

## What Happened

Created the complete monorepo skeleton from scratch. Root config files first (package.json, pnpm-workspace.yaml, .npmrc, tsconfig.base.json), then app workspaces (apps/admin, apps/generator), then all 7 package workspaces. `pnpm install` ran in 380ms with zero errors, generating the lockfile. All 9 `@monster/*` packages confirmed via `pnpm ls -r --depth 0 --json`.

One pattern difference from the nous reference: apps/core tsconfig uses `module:NodeNext` — the task plan explicitly calls for `module:NodeNext` on packages only, with `moduleResolution:Bundler` on apps. Followed the plan (not the reference verbatim) since these are different targets (Next.js/Astro vs Node packages).

## Verification

```
pnpm install --frozen-lockfile=false  →  Exit: 0  (380ms)
pnpm ls -r --depth 0 --json           →  10 workspaces (root + 9 @monster/*)
node -e "require('./packages/db/tsconfig.json').extends"  →  ../../tsconfig.base.json
all 9 package.json files present      →  OK
all 9 tsconfig.json files present     →  OK (verified extends path for each)
root package.json private:true        →  OK
root packageManager:pnpm@10.30.3      →  OK
```

## Diagnostics

`pnpm -r exec pwd` lists all 9 workspace paths — useful sanity check when workspace resolution is in question.

## Deviations

- **pnpm ls -r text output:** The task plan verification uses `pnpm ls -r --depth 0 2>&1 | grep '@monster' | wc -l` which expects "9". In pnpm 10, this command produces no text output when packages have zero dependencies installed. Used `--json` form instead — confirms 9 `@monster/*` workspaces. Added D014 to DECISIONS.md.

## Known Issues

none

## Files Created/Modified

- `package.json` — root workspace config (private, packageManager: pnpm@10.30.3)
- `pnpm-workspace.yaml` — apps/* + packages/* glob definitions
- `tsconfig.base.json` — shared compiler options (strict, ES2022, Bundler, skipLibCheck)
- `.npmrc` — shamefully-hoist=false, strict-peer-dependencies=false
- `apps/admin/package.json` — @monster/admin stub
- `apps/admin/tsconfig.json` — extends base, Bundler, next plugin
- `apps/generator/package.json` — @monster/generator stub
- `apps/generator/tsconfig.json` — extends base, Bundler
- `packages/db/package.json` — @monster/db stub (dist/index.js main)
- `packages/db/tsconfig.json` — extends base, NodeNext, outDir:dist
- `packages/shared/package.json` — @monster/shared stub
- `packages/shared/tsconfig.json` — extends base, NodeNext, outDir:dist
- `packages/agents/package.json` — @monster/agents stub
- `packages/agents/tsconfig.json` — extends base, NodeNext, outDir:dist
- `packages/analytics/package.json` — @monster/analytics stub
- `packages/analytics/tsconfig.json` — extends base, NodeNext, outDir:dist
- `packages/domains/package.json` — @monster/domains stub
- `packages/domains/tsconfig.json` — extends base, NodeNext, outDir:dist
- `packages/seo-scorer/package.json` — @monster/seo-scorer stub
- `packages/seo-scorer/tsconfig.json` — extends base, NodeNext, outDir:dist
- `packages/deployment/package.json` — @monster/deployment stub
- `packages/deployment/tsconfig.json` — extends base, NodeNext, outDir:dist
- `pnpm-lock.yaml` — generated by pnpm install
- `.gsd/DECISIONS.md` — appended D014 (pnpm ls --json pattern)
