---
milestone: M001
title: Foundation
status: complete
completed_at: 2026-03-13
slices: [S01, S02, S03, S04, S05]
---

# M001 Summary — Foundation

M001 established the full monorepo scaffold and the operational runtime for the admin panel: repo structure, pnpm workspaces, shared packages (db, shared), Next.js 15 admin app, authentication via Supabase, and pm2 process management with a deploy script.

---

## Worktree Protocol

Each slice gets an isolated git worktree so development never touches the main tree.

### Create a worktree

```bash
# From the main repo (/home/daniel/monster)
./scripts/new-worktree.sh M001 S01
# Creates: /home/daniel/monster-work/gsd/M001/S01
# Branch:  gsd/M001/S01

cd /home/daniel/monster-work/gsd/M001/S01
pnpm install
```

### Develop in the worktree

Work proceeds normally in the worktree directory. Commit to the slice branch as needed.

### Squash-merge to main

```bash
# From inside the slice worktree:
cd /home/daniel/monster-work/gsd/M001/S01
./scripts/squash-merge.sh
# Checks out main, runs git merge --squash gsd/M001/S01, commits

# Clean up the branch and worktree after merge
git branch -D gsd/M001/S01
git worktree prune
```

**Note:** `squash-merge.sh` runs from the branch you want to merge — it checks itself out of main and merges. Always run it from the slice branch, not from main.

---

## Deploy Protocol

`scripts/deploy.sh` is the single-command deploy for the VPS.

### What it does

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."     # → /home/daniel/monster

git pull origin main          # get latest code
pnpm install --frozen-lockfile   # sync deps (fails if lockfile drifted)
pnpm -r build                 # build all packages + admin Next.js
pm2 reload monster-admin || pm2 start ecosystem.config.js --only monster-admin
pm2 save                      # persist process list for reboot survival
```

### Running it

```bash
cd /home/daniel/monster
./scripts/deploy.sh
```

### Caveats

**Lockfile drift:** `pnpm install --frozen-lockfile` will fail if `pnpm-lock.yaml` is out of sync with `package.json` files. This surfaces as a deploy error before any code runs — which is intentional. Fix: run `pnpm install` locally, commit the updated lockfile, then redeploy.

**Env symlink:** The admin's `.env.local` is not committed. On a fresh VPS clone, create it manually before first deploy:
```bash
# Example — use real values from secrets store
cp /path/to/secrets/admin.env /home/daniel/monster/apps/admin/.env.local
```
The deploy script does not manage env files.

**First-run vs reload:** The `pm2 reload monster-admin || pm2 start ...` pattern handles both cases:
- If `monster-admin` is already registered: `pm2 reload` performs a zero-downtime restart
- If not yet registered (first deploy): `reload` fails, `|| pm2 start` registers it fresh

---

## pm2 Process Management

The admin panel runs as a pm2-managed process named `monster-admin`.

### Start / status / logs

```bash
# Start (or restart after reboot if startup isn't configured)
pm2 start /home/daniel/monster/ecosystem.config.js --only monster-admin

# Status
pm2 list                          # process table (id, status, uptime, restarts)
pm2 show monster-admin            # detailed: pid, log paths, env, restart count

# Logs
pm2 logs monster-admin --lines 50 # live tail (stdout + stderr)
pm2 logs monster-admin --err      # errors only
cat /home/daniel/monster/logs/pm2-error.log   # on-disk error log
cat /home/daniel/monster/logs/pm2-out.log     # on-disk stdout log

# Stop / restart
pm2 stop monster-admin
pm2 restart monster-admin
pm2 reload monster-admin   # zero-downtime reload (preferred for deploys)

# Remove from pm2 registry
pm2 delete monster-admin
```

### Persist across reboots

pm2's process list is saved to `~/.pm2/dump.pm2`. It is restored by the systemd unit on boot.

```bash
# Save current process list (run after any start/stop/delete)
pm2 save
```

### One-time systemd startup setup (requires manual sudo)

pm2 cannot install its own systemd unit — it requires `sudo`. Run this once on the VPS:

```bash
# Step 1: generate the command
pm2 startup systemd

# Step 2: copy and run the sudo command it prints, e.g.:
sudo env PATH=$PATH:/home/daniel/.nvm/versions/node/v22.22.1/bin \
  /home/daniel/.nvm/versions/node/v22.22.1/lib/node_modules/pm2/bin/pm2 \
  startup systemd -u daniel --hp /home/daniel

# Step 3: save the current process list
pm2 save
```

After this, `monster-admin` starts automatically on boot and is managed by systemd as `pm2-daniel.service`.

### ecosystem.config.js notes

- `script: 'node_modules/next/dist/bin/next'` — the actual JS entrypoint. The `.bin/next` shim is a POSIX shell script; pm2 executes it as Node.js and gets a syntax error.
- `cwd: '/home/daniel/monster/apps/admin'` — Next.js reads `.next/` relative to this path
- `error_file` / `out_file` point to `/home/daniel/monster/logs/` — the `logs/` directory is tracked in git (via `.gitkeep`) so it exists on fresh clone
- `max_memory_restart: '1G'` — pm2 auto-restarts if RSS exceeds 1GB

---

## Liveness Check

```bash
curl -sI http://localhost:3004/login | head -1
# Expected: HTTP/1.1 200 OK
```
