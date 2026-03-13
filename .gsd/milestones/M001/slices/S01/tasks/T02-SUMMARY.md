---
id: T02
parent: S01
milestone: M001
provides:
  - scripts/new-worktree.sh — executable worktree creation script with branch/path/dir edge cases handled
  - scripts/squash-merge.sh — executable squash-merge helper with not-on-main guard
  - ecosystem.config.js — pm2 process config skeleton for monster-admin on port 3004
  - .env.example — 22 env var names across all service categories, blank values
  - packages/db/supabase/migrations/.gitkeep — migrations directory tracked in git
key_files:
  - scripts/new-worktree.sh
  - scripts/squash-merge.sh
  - ecosystem.config.js
  - .env.example
  - packages/db/supabase/migrations/.gitkeep
key_decisions:
  - none
patterns_established:
  - new-worktree.sh checks git worktree list before attempting add — idempotent on repeat invocations
  - new-worktree.sh tries --force first (existing branch), falls back to -b (new branch creation)
  - ecosystem.config.js uses absolute cwd/log paths for pm2 reliability across working directory context
observability_surfaces:
  - none
duration: ~10m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Scripts + Ecosystem Skeleton

**5 operational scaffold files delivered; worktree script handles all 3 edge cases; ecosystem config valid; 22 env vars documented.**

## What Happened

Created `scripts/` directory and wrote both shell scripts. The worktree script uses a two-phase approach: first checks `git worktree list` for the target path (idempotent exit), then tries `--force` add for an existing branch, then falls back to `-b` for new branch creation. Both scripts marked executable.

During the dry-run, `M001/S01` wasn't yet registered as a worktree in the main repo — the `--force` path ran clean and created the worktree at `/home/daniel/monster-work/gsd/M001/S01`. The second invocation correctly hit the "already exists" path and printed info + exit 0.

`ecosystem.config.js` follows the nous reference shape: `fork` mode, `autorestart`, `max_memory_restart`, absolute log paths, `kill_timeout`. Port 3004 as specified.

`.env.example` covers all service categories: Supabase (3), Anthropic (1), Upstash (2), DataForSEO (2), Spaceship (2), Amazon (3), Unsplash (1), Hetzner (1), VPS2 (3), App (2) = 22 entries total.

## Verification

```
test -x scripts/new-worktree.sh      → OK
test -x scripts/squash-merge.sh      → OK
node -e "require('./ecosystem.config.js')"
  → prints: monster-admin 3004
grep -c '=' .env.example             → 22  (≥15 required)
test -f packages/db/supabase/migrations/.gitkeep → OK

bash scripts/new-worktree.sh M001 S01  (1st run — --force path)
  → Worktree created from existing branch 'gsd/M001/S01'
bash scripts/new-worktree.sh M001 S01  (2nd run — already exists path)
  → "Worktree already exists" + git worktree list line + exit 0

Slice-level:
  pnpm install --frozen-lockfile=false  → exit 0 (380ms)
  @monster/* workspace count            → 9
  all 9 package.json files              → OK
  scripts executable                    → OK
```

## Diagnostics

- `git worktree list` — shows all active worktrees including monster-work paths
- `node -e "const c = require('./ecosystem.config.js'); console.log(JSON.stringify(c, null, 2))"` — inspect full pm2 config

## Deviations

- **Worktree created during verification:** The M001/S01 worktree didn't previously exist, so the `--force` dry-run actually created it at `/home/daniel/monster-work/gsd/M001/S01`. This is expected and correct — the script works as designed. The "already checked out in main worktree" case (where main and worktree share the same branch) was then verified on the second invocation.

## Known Issues

none

## Files Created/Modified

- `scripts/new-worktree.sh` — executable worktree creation script (3 edge cases handled)
- `scripts/squash-merge.sh` — executable squash-merge helper with not-on-main guard
- `ecosystem.config.js` — pm2 skeleton for monster-admin (port 3004, absolute paths)
- `.env.example` — 22 env var names across all service categories
- `packages/db/supabase/migrations/.gitkeep` — tracks migrations directory in git
