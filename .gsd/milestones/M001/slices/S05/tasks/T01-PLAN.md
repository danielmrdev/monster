---
estimated_steps: 6
estimated_files: 4
---

# T01: Fix ecosystem.config.js, write deploy.sh, create logs dir, document M001

**Slice:** S05 — pm2 + Deploy Script
**Milestone:** M001

## Description

All four S05 deliverables in one task. The ecosystem bug fix is the centerpiece — without it pm2 cannot start Next.js. Everything else (logs dir, deploy script, summary) depends on verifying that pm2 works, so they naturally belong together. This is the only task in S05.

## Steps

1. **Fix `ecosystem.config.js`**: change `script: 'node_modules/.bin/next'` to `script: 'node_modules/next/dist/bin/next'`. The `.bin/next` shim is a POSIX shell script — pm2 runs it as Node.js and gets `SyntaxError: missing ) after argument list`. The dist path is the actual JS entrypoint.

2. **Create `logs/.gitkeep`**: `mkdir -p logs && touch logs/.gitkeep`. pm2 log paths in ecosystem.config.js point to `./logs/pm2-*.log` relative to the repo root. The dir must exist before pm2 starts on a fresh clone.

3. **Write `scripts/deploy.sh`**:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   cd "$(dirname "$0")/.."
   git pull origin main
   pnpm install --frozen-lockfile
   pnpm -r build
   pm2 reload monster-admin || pm2 start ecosystem.config.js --only monster-admin
   pm2 save
   ```
   Make it executable (`chmod +x scripts/deploy.sh`). The `||` fallback handles first-run when the process isn't registered yet. `pm2 save` re-persists the process list after each deploy so it survives the next reboot.

4. **Verify pm2 starts and Next.js responds**:
   - Stop any existing monster-admin process: `pm2 delete monster-admin 2>/dev/null || true`
   - Ensure production build exists: `pnpm --filter @monster/db build && pnpm --filter @monster/shared build && pnpm --filter @monster/admin build`
   - Start: `pm2 start /home/daniel/monster/ecosystem.config.js --only monster-admin`
   - Check: `pm2 list | grep monster-admin` should show `online`
   - HTTP: `curl -sI http://localhost:3004/login | head -1` should return `HTTP/1.1 200 OK`

5. **Run `pm2 save`** to persist the process list to `~/.pm2/dump.pm2`.

6. **Write `.gsd/milestones/M001/M001-SUMMARY.md`** with:
   - Worktree protocol (create, develop, squash-merge)
   - Deploy protocol (deploy.sh steps, lockfile-drift caveat, env symlink caveat)
   - pm2 process management (start, reload, save, the one-time systemd startup command)
   - Reference to the `pm2 startup systemd` command and why it requires manual `sudo` (generates `sudo env PATH=... pm2 startup systemd -u daniel --hp /home/daniel`)

## Must-Haves

- [ ] `ecosystem.config.js` script field is `node_modules/next/dist/bin/next`
- [ ] `logs/.gitkeep` exists
- [ ] `scripts/deploy.sh` exists, is executable, uses `set -euo pipefail`, includes the `|| pm2 start` fallback and `pm2 save`
- [ ] `pm2 list` shows `monster-admin` as `online`
- [ ] `curl -sI http://localhost:3004/login | head -1` returns `HTTP/1.1 200 OK`
- [ ] `M001-SUMMARY.md` exists with worktree, deploy, and pm2 sections

## Verification

```bash
# Ecosystem fix
grep "node_modules/next/dist/bin/next" ecosystem.config.js

# Logs dir
test -f logs/.gitkeep && echo "logs/.gitkeep OK"

# Deploy script
test -x scripts/deploy.sh && bash -n scripts/deploy.sh && echo "deploy.sh OK"

# pm2 running
pm2 list | grep monster-admin | grep online

# HTTP response
curl -sI http://localhost:3004/login | head -1
# Expected: HTTP/1.1 200 OK

# Summary exists
grep -c "worktree\|deploy\|pm2" .gsd/milestones/M001/M001-SUMMARY.md
```

## Observability Impact

**Signals this task creates:**
- `pm2 list` becomes the primary status surface for monster-admin; `online` = healthy, `errored` = check logs
- `logs/pm2-out.log` / `logs/pm2-err.log` — persistent log files written by pm2 for the monster-admin process
- `pm2 show monster-admin` exposes pid, uptime, restart count, and log paths — key for a future agent diagnosing a crash

**How a future agent inspects this task's output:**
```bash
pm2 list | grep monster-admin          # process state
cat logs/pm2-err.log | tail -30        # last error output
pm2 logs monster-admin --lines 20      # live tail
curl -sI http://localhost:3004/login   # HTTP liveness check
```

**Failure state that becomes visible:**
- ecosystem.config.js wrong path → `pm2 list` shows `errored`; `pm2 logs monster-admin --err` shows `SyntaxError`
- logs dir missing → pm2 starts but log rotation fails silently; check `pm2 show` for log paths that 404
- deploy.sh `set -euo pipefail` exits early on any error → shell exit code ≠ 0, deploy aborts with the failing step visible in stderr

**Redaction:** do not echo `logs/pm2-err.log` or `logs/pm2-out.log` verbatim in agent output — they may contain env var values logged by Next.js at startup.

## Inputs

- `ecosystem.config.js` — exists with correct structure but wrong script path; needs one field changed
- `apps/admin/` — compilable Next.js project from S04; `pnpm build` must succeed before pm2 start
- `scripts/new-worktree.sh`, `scripts/squash-merge.sh` — already complete; referenced in summary

## Expected Output

- `ecosystem.config.js` — corrected script path; pm2 can start Next.js successfully
- `scripts/deploy.sh` — executable deploy script; handles both first-run and subsequent reloads
- `logs/.gitkeep` — empty marker file; ensures logs/ exists on fresh clone
- `.gsd/milestones/M001/M001-SUMMARY.md` — operational documentation for the milestone; three protocol sections
