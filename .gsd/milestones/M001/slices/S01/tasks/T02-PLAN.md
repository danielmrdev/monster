---
estimated_steps: 5
estimated_files: 5
---

# T02: Scripts + Ecosystem Skeleton

**Slice:** S01 — Monorepo + Worktree Scaffold
**Milestone:** M001

## Description

Delivers the operational tooling: worktree creation script (R014), squash-merge script, pm2 ecosystem skeleton (for S05), `.env.example`, and the migrations directory stub. The worktree script is the only piece with real logic — it must handle three edge cases gracefully: branch already checked out in main worktree, worktree path already exists, and missing parent directory.

## Steps

1. Create `scripts/` directory. Write `new-worktree.sh`:
   - Usage: `./scripts/new-worktree.sh <MILESTONE> <SLICE>` (e.g. `M001 S01`)
   - Derive: `BRANCH="gsd/$1/$2"`, `TARGET="/home/daniel/monster-work/gsd/$1/$2"`
   - `mkdir -p "$TARGET"`
   - Attempt `git worktree add --force "$TARGET" "$BRANCH" 2>/dev/null` — succeeds when branch exists (even if checked out here, `--force` allows it)
   - If that fails (branch doesn't exist yet): `git worktree add -b "$BRANCH" "$TARGET"` 
   - If target already exists as a worktree: `git worktree list` check and print info, exit 0
   - After success: print instructions to `cd $TARGET && pnpm install`
   - `chmod +x scripts/new-worktree.sh`

2. Write `scripts/squash-merge.sh`:
   - Gets current branch: `BRANCH=$(git branch --show-current)`
   - Validates not on main: errors if `BRANCH == main`
   - `git checkout main && git merge --squash "$BRANCH" && git commit -m "feat($BRANCH): squash merge"`
   - `chmod +x scripts/squash-merge.sh`

3. Write `ecosystem.config.js` at repo root:
   ```js
   module.exports = {
     apps: [{
       name: 'monster-admin',
       script: 'node_modules/.bin/next',
       args: 'start',
       cwd: '/home/daniel/monster/apps/admin',
       env: { PORT: '3004', NODE_ENV: 'production' },
       error_file: '/home/daniel/monster/logs/pm2-error.log',
       out_file: '/home/daniel/monster/logs/pm2-out.log',
       log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
     }]
   }
   ```
   Skeleton only — S05 fills in any remaining fields.

4. Write `.env.example` with all env var names from research (≥15 entries across Supabase, Anthropic, Upstash, DataForSEO, Spaceship, Cloudflare, Hetzner, VPS2, Amazon, Unsplash, App sections). Values left blank.

5. Create `packages/db/supabase/migrations/.gitkeep` so the directory is tracked in git before S02 creates migrations.

## Must-Haves

- [ ] `scripts/new-worktree.sh` is executable (`chmod +x`)
- [ ] `new-worktree.sh` handles "branch already checked out" case without erroring (uses `--force`)
- [ ] `new-worktree.sh` creates parent dir with `mkdir -p` before `git worktree add`
- [ ] `scripts/squash-merge.sh` is executable and validates not-on-main
- [ ] `ecosystem.config.js` is valid JS (`node -e "require('./ecosystem.config.js')"` exits 0)
- [ ] `ecosystem.config.js` uses port 3004 (not 3001)
- [ ] `.env.example` contains entries for all major service categories
- [ ] `packages/db/supabase/migrations/.gitkeep` exists

## Verification

```bash
cd /home/daniel/monster
# Scripts executable
test -x scripts/new-worktree.sh && echo "OK: new-worktree" || echo "FAIL"
test -x scripts/squash-merge.sh && echo "OK: squash-merge" || echo "FAIL"
# Ecosystem config valid
node -e "const c = require('./ecosystem.config.js'); console.log(c.apps[0].name, c.apps[0].env.PORT)"
# Should print: monster-admin 3004
# Worktree script dry-run (M001/S01 branch already checked out here)
bash scripts/new-worktree.sh M001 S01
# Must not error — should print worktree info or "already exists" message
# .env.example sanity
grep -c '=' .env.example  # should be ≥15
# Migrations dir
test -f packages/db/supabase/migrations/.gitkeep && echo "OK" || echo "FAIL"
```

## Inputs

- `ecosystem.config.js` pattern: `/home/daniel/nous/ecosystem.config.js` (name, script, cwd, log paths shape)
- Research notes on port allocation (3004 is free)
- Research notes on `git worktree add --force` for already-checked-out branches
- T01 must complete first (workspace dirs exist so `.gitkeep` path resolves)

## Expected Output

- `scripts/new-worktree.sh` — executable worktree creation script
- `scripts/squash-merge.sh` — executable squash-merge helper
- `ecosystem.config.js` — pm2 process config skeleton
- `.env.example` — all required env var names, blank values
- `packages/db/supabase/migrations/.gitkeep` — tracks the migrations directory
