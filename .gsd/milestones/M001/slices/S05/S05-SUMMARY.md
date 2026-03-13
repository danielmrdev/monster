---
id: S05
parent: M001
milestone: M001
provides:
  - ecosystem.config.js with correct Next.js script path — pm2 can start monster-admin
  - scripts/deploy.sh — full production deploy cycle (pull → install → build → pm2 reload)
  - logs/.gitkeep — ensures logs/ dir exists on fresh clone so pm2 log paths resolve
  - M001-SUMMARY.md — operational documentation for worktree, deploy, and pm2 protocols
requires:
  - slice: S04
    provides: apps/admin compilable Next.js project with pnpm build working
affects: []
key_files:
  - ecosystem.config.js
  - scripts/deploy.sh
  - logs/.gitkeep
  - .gsd/milestones/M001/M001-SUMMARY.md
key_decisions:
  - D025 — pm2 must use node_modules/next/dist/bin/next (not .bin/next shim)
  - D026 — next build required before pm2 start; dev builds use eval() which is blocked in edge sandbox
patterns_established:
  - pm2 lifecycle: ecosystem.config.js → start → verify online + HTTP 200 → save → systemd (manual sudo)
  - deploy.sh pattern: pull → install --frozen-lockfile → build → pm2 reload || pm2 start → pm2 save
  - Production build diagnostic: middleware-manifest.json __NEXT_BUILD_ID != "development"
observability_surfaces:
  - pm2 list | grep monster-admin — primary status (online/errored/stopped + restart count)
  - pm2 show monster-admin — pid, uptime, restart count, log paths
  - pm2 logs monster-admin --err — live error tail
  - cat logs/pm2-error.log — on-disk error log (EvalError = dev build; EADDRINUSE = port conflict)
  - curl -sI http://localhost:3004/login — HTTP liveness check
  - middleware-manifest.json __NEXT_BUILD_ID field — "development" = wrong build, real hash = production build
drill_down_paths:
  - .gsd/milestones/M001/slices/S05/tasks/T01-SUMMARY.md
duration: ~45m
verification_result: passed
completed_at: 2026-03-13
---

# S05: pm2 + Deploy Script

**pm2 runs monster-admin on port 3004 (online, 0 restarts, HTTP 200); deploy.sh handles the full production cycle; process list saved to ~/.pm2/dump.pm2.**

## What Happened

Single task (T01) covering all S05 deliverables. Four files implemented in sequence:

**ecosystem.config.js** — the critical fix was changing `script` from `node_modules/.bin/next` (a POSIX shell shim that pm2 tries to execute as Node.js, causing `SyntaxError`) to `node_modules/next/dist/bin/next` (the actual JS entrypoint). Log paths configured to `./logs/pm2-out.log` and `./logs/pm2-error.log`. Port 3004 set via env `PORT`.

**logs/.gitkeep** — marker file ensures the `logs/` directory exists on fresh clone so pm2's log path config resolves without manual intervention.

**scripts/deploy.sh** — written with `set -euo pipefail`, covers: `git pull origin main` → `pnpm install --frozen-lockfile` → `pnpm -r build` → `pm2 reload monster-admin || pm2 start ecosystem.config.js` (fallback for first run) → `pm2 save`. Made executable.

**M001-SUMMARY.md** — documents worktree protocol, deploy protocol, and pm2 process management including the one-time `pm2 startup systemd` sudo requirement (manual step by design).

**Two unexpected issues discovered and resolved during verification:**

1. *Orphaned next dev process:* A `next dev` process from S04 development was holding port 3004, causing pm2 to crash-loop with `EADDRINUSE`. Killed the orphaned process; pm2 started cleanly. This is a development-environment artifact — won't occur on a fresh VPS.

2. *Dev build in production:* After the port conflict was resolved, `curl` returned HTTP 500 from a `EvalError: Code generation from strings disallowed` in the middleware. Root cause: `.next/` contained a development build (from `next dev`). Development builds use `eval()` in webpack bundles; pm2's `next start` runs middleware in the V8 edge runtime sandbox where `eval()` is forbidden. Diagnostic signal: `middleware-manifest.json __NEXT_BUILD_ID: "development"`. Fix: ran `pnpm -r build` (production build). New BUILD_ID was a real hash (`MW73blIiQbTkK2qWpbUk-`). HTTP 200 after restart.

Both issues documented as D025 and D026 in DECISIONS.md. The deploy.sh handles D026 by design (always runs `pnpm -r build`).

## Verification

All 6 slice-level checks passed:

| Check | Result |
|---|---|
| `pm2 list \| grep monster-admin \| grep online` | `online`, 0 restarts |
| `curl -sI http://localhost:3004/login \| grep "200"` | `HTTP/1.1 200 OK` |
| `bash -n scripts/deploy.sh && test -x scripts/deploy.sh` | pass |
| `test -f logs/.gitkeep` | pass |
| `grep -l "worktree\|deploy\|pm2" .gsd/milestones/M001/M001-SUMMARY.md` | pass (42 matches) |
| `pm2 show monster-admin \| grep -E "status\|restart"` | `online`, 0 unstable restarts |

Observability surfaces confirmed reachable: pm2 show resolves log paths, `logs/pm2-error.log` exists on disk, production BUILD_ID verified as real hash (not "development").

## Requirements Advanced

- R013 (Admin panel on VPS1 via pm2) — fully validated: pm2 shows monster-admin online, HTTP 200 on port 3004, process list saved. Status updated from `active` to `validated` in REQUIREMENTS.md.

## Requirements Validated

- R013 — pm2 online with 0 restarts + HTTP 200 + `pm2 save` completed. This is the primary deliverable of M001/S05.

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

**Dev build used vs production build required:** The task plan referenced `pnpm --filter @monster/admin build` without specifying that a stale dev build would cause middleware EvalError. In practice, a full `pnpm -r build` was required. The deploy.sh correctly uses `pnpm -r build` so this is handled going forward — but fresh environments that have only run `next dev` will hit the same issue until deploy.sh is run at least once.

**Orphaned next dev process conflict:** Not in the plan. Development-environment artifact that won't occur on a fresh VPS deployment.

## Known Limitations

- **pm2 startup (systemd unit) not yet activated.** The `pm2 startup systemd` command was documented in M001-SUMMARY.md as a manual sudo step. The process list is saved (`~/.pm2/dump.pm2`) but automatic restart on VPS reboot requires running: `sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u daniel --hp /home/daniel`. This is a one-time VPS setup step, intentionally left to the human operator.
- **deploy.sh runs `pnpm -r build`** which rebuilds all workspaces. Acceptable for now; in a larger monorepo this would need selective filtering.

## Follow-ups

- Run the pm2 startup systemd sudo command on VPS1 to complete the reboot-survival requirement (manual step documented in M001-SUMMARY.md).
- Consider adding `--only monster-admin` filter to deploy.sh build step once other apps exist in the monorepo.

## Files Created/Modified

- `ecosystem.config.js` — fixed script path from `.bin/next` shim to `dist/bin/next` JS entrypoint; log paths and env vars configured
- `scripts/deploy.sh` — new; full deploy cycle with pm2 reload fallback and save
- `logs/.gitkeep` — new; marker file ensuring logs/ exists on fresh clone
- `.gsd/milestones/M001/M001-SUMMARY.md` — new; operational documentation (worktree, deploy, pm2 protocols)
- `.gsd/DECISIONS.md` — appended D025 (pm2 script path) and D026 (production build requirement)

## Forward Intelligence

### What the next slice should know
- Port 3004 is the canonical admin panel port. All references to the admin URL should use this port unless the ecosystem.config.js is updated.
- `pm2 save` must be run after any pm2 process change (start, stop, reload, delete) to update `~/.pm2/dump.pm2`. deploy.sh handles this automatically.
- The deploy.sh `pm2 reload || pm2 start` pattern is intentional — `reload` fails gracefully when the process doesn't exist yet (first deploy), falling through to `start`.

### What's fragile
- **pm2 systemd unit not installed** — the process won't auto-start on reboot until the manual sudo step is run. This is the one remaining operational gap for M001.
- **Port 3004 orphan risk in dev** — if `next dev` is run and then pm2 is started, EADDRINUSE will occur. Always kill dev processes before starting pm2.

### Authoritative diagnostics
- `pm2 show monster-admin` → check `script path` field. Must be `node_modules/next/dist/bin/next`, not `.bin/next`.
- `middleware-manifest.json __NEXT_BUILD_ID` → "development" means a dev build is running under pm2 (will crash with EvalError); a real hash confirms production build.
- `cat logs/pm2-error.log | tail -30` → most reliable error signal for pm2 startup failures.

### What assumptions changed
- **Original assumption:** `pnpm build` produces a deployable artifact in `.next/`. **What actually happened:** The `.next/` dir from `next dev` is also named `.next/` but is not production-deployable. The presence of `.next/` is not sufficient — the BUILD_ID must be a real hash, not "development".
