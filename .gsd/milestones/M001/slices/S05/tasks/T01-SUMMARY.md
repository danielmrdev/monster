---
id: T01
parent: S05
milestone: M001
provides:
  - ecosystem.config.js with correct script path (pm2 can start Next.js)
  - scripts/deploy.sh for full production deploy cycle
  - logs/.gitkeep ensures logs/ dir exists on fresh clone
  - M001-SUMMARY.md with worktree, deploy, and pm2 protocol documentation
key_files:
  - ecosystem.config.js
  - scripts/deploy.sh
  - logs/.gitkeep
  - .gsd/milestones/M001/M001-SUMMARY.md
key_decisions:
  - D025 — pm2 must use node_modules/next/dist/bin/next (not .bin/next shim)
  - D026 — next build required before pm2 start; dev builds use eval() which is blocked in edge sandbox
patterns_established:
  - pm2 lifecycle: start → verify online + HTTP 200 → save → systemd (manual)
  - deploy.sh pattern: pull → install --frozen-lockfile → build → pm2 reload || pm2 start → pm2 save
observability_surfaces:
  - pm2 list | grep monster-admin — primary status (online/errored/stopped)
  - pm2 show monster-admin — pid, uptime, restart count, log paths
  - pm2 logs monster-admin --err — live error tail
  - cat logs/pm2-error.log — on-disk error log (check for EvalError = dev build was used)
  - curl -sI http://localhost:3004/login — HTTP liveness check
  - middleware-manifest.json __NEXT_BUILD_ID field — "development" = wrong build, real ID = production build
duration: ~45m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Fix ecosystem.config.js, write deploy.sh, create logs dir, document M001

**Fixed ecosystem.config.js script path and rebuilt with `pnpm build` (production mode); pm2 now runs monster-admin online on port 3004 with HTTP 200.**

## What Happened

Four files implemented in sequence:

1. **ecosystem.config.js** — changed `script` from `node_modules/.bin/next` (POSIX shell shim) to `node_modules/next/dist/bin/next` (actual JS entrypoint). This was the blocker.

2. **logs/.gitkeep** — created logs/ directory with marker file so pm2 log paths resolve on fresh clone.

3. **scripts/deploy.sh** — written with `set -euo pipefail`, the `pm2 reload || pm2 start` fallback for first-run, and `pm2 save` to persist the process list after each deploy. Made executable.

4. **M001-SUMMARY.md** — documented worktree protocol, deploy protocol, and pm2 process management including the one-time `pm2 startup systemd` sudo requirement.

**Unexpected issue discovered during verification:** After starting pm2 with the corrected script path, `curl` returned HTTP 200 but from an orphaned `next dev` process (PID 3775447) left over from S04 development. pm2's monster-admin was crash-looping with EADDRINUSE. After killing the orphaned process, pm2 started cleanly — but then returned HTTP 500 from a `EvalError: Code generation from strings disallowed` in the middleware.

**Root cause:** The existing `.next/` build was a development build. A `next dev`-produced bundle uses `eval()` in the webpack middleware chunk. `pm2 start` runs `next start` (production mode), which executes middleware in the V8 edge runtime sandbox where `eval()` is forbidden. The diagnostic signal: `middleware-manifest.json` showed `__NEXT_BUILD_ID: "development"`.

**Fix:** Ran `pnpm -r build` (production build). New BUILD_ID was a real hash. Restarted pm2. HTTP 200, 0 restarts, stable.

Saved the process list to `~/.pm2/dump.pm2`. Documented both decisions as D025 and D026 in DECISIONS.md.

## Verification

All task-level and slice-level checks passed:

```
ecosystem fix:    grep "node_modules/next/dist/bin/next" ecosystem.config.js → found
logs dir:         test -f logs/.gitkeep → OK
deploy.sh:        test -x scripts/deploy.sh && bash -n scripts/deploy.sh → OK
pm2 online:       pm2 list | grep monster-admin | grep online → found (0 restarts)
HTTP 200:         curl -sI http://localhost:3004/login | head -1 → HTTP/1.1 200 OK
summary exists:   grep -c "worktree|deploy|pm2" M001-SUMMARY.md → 42 matches
failure-path:     pm2 show monster-admin | grep status → online, restarts: 0
```

All 6 slice-level verification commands pass.

## Diagnostics

```bash
# Process health
pm2 list | grep monster-admin      # online + restart count
pm2 show monster-admin             # full metadata incl. log paths
cat logs/pm2-error.log | tail -30  # check for EvalError (= dev build) or EADDRINUSE

# HTTP liveness
curl -sI http://localhost:3004/login | head -1

# Confirm production build (not dev)
python3 -c "import json; d=json.load(open('apps/admin/.next/server/middleware-manifest.json')); print(list(d['middleware'].values())[0]['env']['__NEXT_BUILD_ID'])"
# Output should be a real hash, not "development"

# Orphaned next dev processes (if EADDRINUSE recurs)
lsof -i :3004
ps aux | grep "next dev"
```

## Deviations

**dev build used vs production build required:** The task plan said "Ensure production build exists" and referenced `pnpm --filter @monster/admin build` without explaining that a stale dev build would cause middleware EvalError. In practice, a full `pnpm -r build` was required (not just checking if `.next/` exists). The deploy.sh already handles this correctly via `pnpm -r build`.

**Orphaned next dev process conflict:** Not in the plan. A background `next dev` from S04 was holding port 3004 and had to be killed before pm2 could bind. This is a development-environment artifact — on a real VPS deployment this won't happen.

## Known Issues

None. pm2 is stable, HTTP is responding correctly, process list is saved.

## Files Created/Modified

- `ecosystem.config.js` — fixed script path from `.bin/next` shim to `dist/bin/next` JS entrypoint
- `scripts/deploy.sh` — new; full deploy cycle with pm2 reload fallback and save
- `logs/.gitkeep` — new; marker file ensuring logs/ exists on fresh clone
- `.gsd/milestones/M001/M001-SUMMARY.md` — new; operational documentation (worktree, deploy, pm2)
- `.gsd/DECISIONS.md` — appended D025 (pm2 script path) and D026 (production build requirement)
- `.gsd/milestones/M001/slices/S05/S05-PLAN.md` — added Observability/Diagnostics section and failure-path checks
- `.gsd/milestones/M001/slices/S05/tasks/T01-PLAN.md` — added Observability Impact section
