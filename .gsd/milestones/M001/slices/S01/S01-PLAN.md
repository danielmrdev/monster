# S01: Monorepo + Worktree Scaffold

**Goal:** `pnpm install` works across all workspaces; all package directories exist with correct `package.json` and `tsconfig.json` stubs; worktree creation script works end-to-end.
**Demo:** `pnpm install` at monorepo root completes with zero errors; `./scripts/new-worktree.sh M001 S01` creates a worktree at the correct path (or exits cleanly if branch already checked out).

## Must-Haves

- Root `package.json` (private, `"packageManager": "pnpm@10.30.3"`) + `pnpm-workspace.yaml`
- `tsconfig.base.json` at repo root that all packages extend
- All 9 workspace directories exist with correct `package.json` (`@monster/<name>`, `"private": true`) and `tsconfig.json`
- `scripts/new-worktree.sh` — handles branch-already-exists, worktree-already-exists, and missing parent dir
- `scripts/squash-merge.sh` — squash-merges current slice branch to main
- `ecosystem.config.js` skeleton at repo root (port 3004, filled in S05)
- `.env.example` with all required env var names
- `pnpm install` exits 0 from monorepo root

## Verification

```bash
# From /home/daniel/monster
pnpm install --frozen-lockfile=false   # exits 0
pnpm ls -r --depth 0 2>&1 | grep -c '@monster'  # should print 9
# Verify all workspace package.json files exist
for pkg in apps/admin apps/generator packages/db packages/shared packages/agents packages/analytics packages/domains packages/seo-scorer packages/deployment; do
  test -f "$pkg/package.json" && echo "OK: $pkg" || echo "MISSING: $pkg"
done
# Verify scripts are executable
test -x scripts/new-worktree.sh && echo "OK: new-worktree.sh" || echo "FAIL"
test -x scripts/squash-merge.sh && echo "OK: squash-merge.sh" || echo "FAIL"
# Dry-run worktree script (branch already checked out case)
bash scripts/new-worktree.sh M001 S01
```

## Tasks

- [x] **T01: Monorepo root config + workspace stubs** `est:45m`
  - Why: Establishes the structural foundation — workspace config, TypeScript base, and all 9 package stubs that every downstream slice builds on.
  - Files: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.npmrc`, `apps/admin/package.json`, `apps/admin/tsconfig.json`, `apps/generator/package.json`, `apps/generator/tsconfig.json`, `packages/*/package.json`, `packages/*/tsconfig.json`
  - Do: Create root `package.json` (private, no dependencies, `packageManager: pnpm@10.30.3`, scripts placeholder). Create `pnpm-workspace.yaml` with `apps/*` + `packages/*`. Create `tsconfig.base.json` with `strict`, `moduleResolution: Bundler`, `target: ES2022`. Create `.npmrc` with `shamefully-hoist=false`. Create each workspace directory with minimal `package.json` (`name`, `version: 0.1.0`, `private: true`, no deps) and a `tsconfig.json` extending `../../tsconfig.base.json` (or `../tsconfig.base.json` for apps). Apps use `moduleResolution: Bundler`; packages use `moduleResolution: NodeNext` + `outDir: dist` + `declaration: true`.
  - Verify: `pnpm install --frozen-lockfile=false` exits 0; `pnpm ls -r --depth 0 2>&1 | grep -c '@monster'` prints 9.
  - Done when: `pnpm install` clean, all 9 `@monster/*` packages visible in workspace list.

- [x] **T02: Scripts + ecosystem skeleton** `est:30m`
  - Why: Delivers R014 (worktree workflow) — the scripts that make the development workflow operational. Ecosystem skeleton and `.env.example` round out the scaffold.
  - Files: `scripts/new-worktree.sh`, `scripts/squash-merge.sh`, `ecosystem.config.js`, `.env.example`, `packages/db/supabase/migrations/.gitkeep`
  - Do: Write `new-worktree.sh` — takes `$M $S` args, builds branch name `gsd/$M/$S` and target path `/home/daniel/monster-work/gsd/$M/$S`, `mkdir -p` the target, attempts `git worktree add --force <path> <branch>` and falls back to `git worktree add -b <branch> <path>` if branch doesn't exist yet; run `pnpm install` in new worktree. Write `squash-merge.sh` — gets current branch, squash-merges to main with formatted commit message. Both scripts: `chmod +x`. Write `ecosystem.config.js` skeleton with `monster-admin` entry using `env: { PORT: '3004', NODE_ENV: 'production' }`, cwd `apps/admin`, log paths `./logs/pm2-*.log`. Write `.env.example` with all variables from research. Create `packages/db/supabase/migrations/.gitkeep` so the directory is tracked.
  - Verify: `bash scripts/new-worktree.sh M001 S01` exits without error (branch already checked out case handled); `ls -la scripts/` shows both scripts executable; `node -e "require('./ecosystem.config.js')"` exits 0.
  - Done when: Both scripts executable and handle the already-checked-out branch case; ecosystem.config.js valid JS; `.env.example` present with ≥15 variable entries.

## Files Likely Touched

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.npmrc`
- `ecosystem.config.js`
- `.env.example`
- `apps/admin/package.json`, `apps/admin/tsconfig.json`
- `apps/generator/package.json`, `apps/generator/tsconfig.json`
- `packages/db/package.json`, `packages/db/tsconfig.json`
- `packages/shared/package.json`, `packages/shared/tsconfig.json`
- `packages/agents/package.json`, `packages/agents/tsconfig.json`
- `packages/analytics/package.json`, `packages/analytics/tsconfig.json`
- `packages/domains/package.json`, `packages/domains/tsconfig.json`
- `packages/seo-scorer/package.json`, `packages/seo-scorer/tsconfig.json`
- `packages/deployment/package.json`, `packages/deployment/tsconfig.json`
- `scripts/new-worktree.sh`
- `scripts/squash-merge.sh`
- `packages/db/supabase/migrations/.gitkeep`
