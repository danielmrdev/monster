---
estimated_steps: 4
estimated_files: 3
---

# T03: Wire workspace imports and verify cross-package resolution

**Slice:** S03 — Shared Packages
**Milestone:** M001

## Description

Wire `apps/admin` to depend on `@monster/db` and `@monster/shared` via pnpm workspace protocol, then run a `tsc --noEmit` probe that actually imports from both packages to confirm NodeNext/Bundler resolution works across the workspace boundary. This closes the S03 contract: "importable from apps/admin." The probe file is a temporary type-check vehicle deleted after it passes.

## Steps

1. Add `"@monster/db": "workspace:*"` and `"@monster/shared": "workspace:*"` to `apps/admin/package.json` dependencies; also add `typescript` as devDependency if not present
2. Update `apps/admin/tsconfig.json`: extend `../../tsconfig.base.json`, set `moduleResolution: "Bundler"` (matches the base; compatible with pre-compiled dist from tsup), include `src/**/*`; add a `paths` entry for `@monster/*` pointing to the dist if needed — check first whether bare workspace resolution works without paths
3. Run `pnpm install` at monorepo root to link workspace packages
4. Create `apps/admin/src/probe.ts` that:
   - Imports `Database`, `createBrowserClient`, `Tables` from `@monster/db`
   - Imports `SiteStatus`, `AmazonMarket`, `AMAZON_MARKETS`, `SITE_STATUS_FLOW` from `@monster/shared`
   - Uses them in type assertions (e.g. `const _: SiteStatus = 'live'`, `const __: AmazonMarket = 'ES'`) so tsc actually resolves the imports
5. Run `pnpm --filter @monster/admin exec tsc --noEmit --project tsconfig.json` — fix any resolution errors (missing paths config, wrong moduleResolution) until it exits 0
6. Delete `apps/admin/src/probe.ts` and verify tsc still exits 0 on the remaining tsconfig (no src files = either empty or configure `include` appropriately)

## Must-Haves

- [ ] `apps/admin/package.json` lists both workspace packages in `dependencies`
- [ ] `pnpm install` links `@monster/db` and `@monster/shared` into `apps/admin/node_modules`
- [ ] `pnpm --filter @monster/admin exec tsc --noEmit` exits 0 while probe.ts exists
- [ ] `probe.ts` actually imports and uses types from both packages (not just `import type {}`)
- [ ] `probe.ts` deleted after verification passes
- [ ] `apps/admin/package.json` and `apps/admin/tsconfig.json` left in correct state for S04 to build on

## Verification

```bash
# Workspace links exist
ls apps/admin/node_modules/@monster/db
ls apps/admin/node_modules/@monster/shared

# Tsc clean with probe (run from repo root)
pnpm --filter @monster/admin exec tsc --noEmit

# probe.ts deleted
[ ! -f apps/admin/src/probe.ts ] && echo "OK: probe deleted" || echo "FAIL: probe still exists"
```

## Observability Impact

- **Workspace link health:** `ls apps/admin/node_modules/@monster/db apps/admin/node_modules/@monster/shared` — both must resolve to symlinks. Missing symlink means `pnpm install` wasn't re-run after editing `package.json`.
- **tsc resolution errors surface clearly:** `pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -40` emits `error TS2307: Cannot find module '@monster/db'` (or similar) when the workspace link or `exports` map is broken. The file + line points directly to the probe import.
- **Failure: wrong moduleResolution:** If `moduleResolution` is set to `Node` instead of `Bundler`, tsc will error on `.js` extension imports in the dist. Error message includes `does not provide an export named` or `could not be found` depending on tsc version — inspect `tsconfig.json` at `apps/admin/`.
- **Post-probe-deletion tsc:** After `probe.ts` is deleted, `tsc --noEmit` must still exit 0. If it errors, the tsconfig's `include` glob is likely pulling in unintended files.
- **Quick diagnostic for a future agent:**
  ```bash
  ls apps/admin/node_modules/@monster/
  pnpm --filter @monster/admin exec tsc --noEmit 2>&1 | head -20
  cat apps/admin/tsconfig.json
  ```

## Inputs

- `packages/db/dist/index.js` + `packages/db/dist/index.d.ts` — from T01; must exist before this task
- `packages/shared/dist/index.js` + `packages/shared/dist/index.d.ts` — from T02; must exist before this task
- `apps/admin/package.json` — currently minimal scaffold; needs workspace deps added
- `apps/admin/tsconfig.json` — may not exist yet; if missing, create one extending base

## Expected Output

- `apps/admin/package.json` — updated with `@monster/db` and `@monster/shared` workspace deps
- `apps/admin/tsconfig.json` — created/updated with Bundler moduleResolution, extend base
- `apps/admin/src/probe.ts` — created then deleted (leaves no artifact)
- Symlinks in `apps/admin/node_modules/@monster/` pointing to workspace packages (managed by pnpm)
