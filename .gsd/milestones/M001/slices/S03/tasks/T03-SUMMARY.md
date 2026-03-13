---
id: T03
parent: S03
milestone: M001
provides:
  - apps/admin/package.json with @monster/db and @monster/shared as workspace:* dependencies
  - apps/admin/tsconfig.json extending base with Bundler moduleResolution and src/**/* include
  - apps/admin/src/index.ts placeholder enabling tsc to run without TS18003 on empty include
  - pnpm workspace links: apps/admin/node_modules/@monster/{db,shared} → workspace packages
key_files:
  - apps/admin/package.json
  - apps/admin/tsconfig.json
  - apps/admin/src/index.ts
key_decisions:
  - Added apps/admin/src/index.ts placeholder rather than removing the include glob — S04 overwrites this file with real Next.js setup; keeps tsconfig stable
  - Did not need paths entries in tsconfig — bare workspace resolution via pnpm symlinks + Bundler moduleResolution resolves @monster/* directly from node_modules without explicit paths config
patterns_established:
  - Workspace consumer pattern: package.json deps use workspace:*, tsconfig extends base + sets moduleResolution:Bundler + includes src/**/*; no manual paths entries needed when dist exports map is correct
observability_surfaces:
  - "Workspace links: ls apps/admin/node_modules/@monster/{db,shared}"
  - "tsc resolution errors: pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -40"
  - "Missing link diagnosis: pnpm install at monorepo root re-links all workspace deps"
duration: ~15m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Wire workspace imports and verify cross-package resolution

**Wired `apps/admin` to both workspace packages via pnpm workspace protocol; `tsc --noEmit` resolves `@monster/db` and `@monster/shared` with zero errors.**

## What Happened

Updated `apps/admin/package.json` to add `@monster/db: workspace:*` and `@monster/shared: workspace:*` in dependencies, plus `typescript` as devDep. Updated `tsconfig.json` to include `src/**/*` (the extends + moduleResolution:Bundler were already there from scaffold). Ran `pnpm install` — workspace links appeared at `apps/admin/node_modules/@monster/`.

Created `apps/admin/src/probe.ts` importing and using values from both packages (`createBrowserClient`, `Tables<'sites'>`, `SiteStatus`, `AmazonMarket`, `AMAZON_MARKETS`, `SITE_STATUS_FLOW`) with explicit type assertions to force tsc to actually resolve the imports. `tsc --noEmit` passed with zero errors.

Deleted `probe.ts`. Without it, tsc emits TS18003 (no inputs found). Fixed by adding `apps/admin/src/index.ts` — a one-line placeholder comment that S04 will overwrite with real Next.js app setup. `tsc --noEmit` exits 0 again.

## Verification

```bash
# All passed:
ls apps/admin/node_modules/@monster/db    # OK: db linked
ls apps/admin/node_modules/@monster/shared # OK: shared linked
pnpm --filter @monster/admin exec tsc --noEmit  # Exit: 0
[ ! -f apps/admin/src/probe.ts ] && echo "OK: probe deleted"  # OK
pnpm --filter @monster/db build && pnpm --filter @monster/shared build  # both clean
grep -r "next/headers|next/server|next/navigation" packages/db/src/  # OK: no Next.js imports
node -e "...zero runtime deps check..."  # OK: zero runtime deps
node --input-type=module -e "...createServiceClient throw check..."  # OK: descriptive error
```

## Diagnostics

- **Workspace link health:** `ls apps/admin/node_modules/@monster/` — both db and shared must be symlinks to workspace packages
- **tsc resolution failures:** `pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -40` — emits `TS2307: Cannot find module '@monster/db'` if symlink is broken or exports map is wrong
- **Wrong moduleResolution:** If tsconfig uses `Node` instead of `Bundler`, tsc errors on `.js` extension imports in dist. Fix: ensure `"moduleResolution": "Bundler"` in tsconfig.
- **Quick health check:**
  ```bash
  ls apps/admin/node_modules/@monster/
  pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -20
  cat apps/admin/tsconfig.json
  ```

## Deviations

- Added `apps/admin/src/index.ts` placeholder — not in the task plan, but necessary to prevent TS18003 after probe.ts deletion. The plan said "configure include appropriately" for the empty case; this is the implementation of that.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/package.json` — added workspace deps for @monster/db and @monster/shared; added typescript devDep
- `apps/admin/tsconfig.json` — added `"include": ["src/**/*"]` (extends and moduleResolution were already correct)
- `apps/admin/src/index.ts` — new placeholder; S04 replaces with real Next.js entry
- `apps/admin/src/probe.ts` — created then deleted (no artifact remains)
- `.gsd/milestones/M001/slices/S03/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
