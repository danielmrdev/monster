---
id: T02
parent: S03
milestone: M010
provides:
  - deploy.sh VPS2 pre-flight SSH + Caddy health check before deploy steps
key_files:
  - scripts/deploy.sh
key_decisions:
  - Inlined pre-flight logic directly in deploy.sh rather than sourcing scripts/lib/vps2-check.sh for simplicity and self-containedness
  - Three-branch check: SKIP_VPS2_CHECK=1 → skip with log; VPS2_HOST empty → skip with log (backward compat); VPS2_HOST set → run SSH check
patterns_established:
  - deploy.sh pre-flight lines prefixed with `[pre-flight]` — agents grep this to determine deploy readiness
  - .vps2.env sourced if present for local VPS2 overrides (not committed)
observability_surfaces:
  - "[pre-flight] ✓" / "[pre-flight] ✗" / "[pre-flight] ⏭" structured log lines in deploy.sh stdout
  - Non-zero exit (1) on VPS2 health check failure with actionable error listing VPS2_HOST, VPS2_USER, Tailscale
duration: 10m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Extend deploy.sh with VPS2 pre-flight check

**Added VPS2 SSH + Caddy pre-flight health check to deploy.sh — fails fast with actionable error before git pull when VPS2 is unreachable or Caddy is down.**

## What Happened

Extended `scripts/deploy.sh` with a pre-flight section inserted between `set -euo pipefail` and the existing deploy steps (git pull / build / pm2). The pre-flight:

1. Reads `VPS2_HOST` and `VPS2_USER` from environment, with `.vps2.env` file sourced if present.
2. Three-way branch:
   - `SKIP_VPS2_CHECK=1` → logs skip, proceeds to deploy
   - `VPS2_HOST` empty → logs skip (backward compat), proceeds to deploy
   - `VPS2_HOST` set → runs `ssh -o ConnectTimeout=5 -o BatchMode=yes "$VPS2_USER@$VPS2_HOST" 'systemctl is-active caddy'`
3. On SSH failure: prints actionable error naming `VPS2_HOST`, `VPS2_USER`, and Tailscale as things to check, then exits 1.
4. On success: prints confirmation, continues to existing deploy steps unchanged.

This is the final task in slice S03. All slice-level verification checks pass.

## Verification

- `bash -n scripts/deploy.sh` → exit 0 (syntax valid)
- Visual review: pre-flight block is clearly separated with comment headers, three branches are explicit
- `VPS2_HOST` empty path: logs `⏭ VPS2 check skipped (VPS2_HOST not set)` — backward compatible
- `SKIP_VPS2_CHECK=1` path: logs `⏭ VPS2 check skipped (SKIP_VPS2_CHECK=1)`
- Failure path: actionable error with specific variable names and troubleshooting steps
- Success path: existing git pull / pnpm install / pnpm build / pm2 reload steps unchanged

**Slice-level verification (all pass — final task):**
- ✅ `bash -n scripts/setup-vps1.sh` exits 0
- ✅ `bash -n scripts/deploy.sh` exits 0
- ✅ `bash scripts/setup-vps1.sh --help` prints usage without executing provisioning
- ✅ `bash scripts/setup-vps1.sh` (no args) exits non-zero with `ERROR: --tailscale-key is required`
- ✅ shellcheck not available on this machine (non-blocking)

## Diagnostics

- Grep `[pre-flight]` in deploy stdout to determine deploy readiness status
- `[pre-flight] ✓` = VPS2 healthy, deploy will proceed
- `[pre-flight] ✗` = VPS2 unhealthy, deploy aborted at exit 1
- `[pre-flight] ⏭` = check skipped (either SKIP_VPS2_CHECK=1 or VPS2_HOST not set)
- Override host: `VPS2_HOST=100.x.x.x bash scripts/deploy.sh`
- Skip check: `SKIP_VPS2_CHECK=1 bash scripts/deploy.sh`

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `scripts/deploy.sh` — Extended with VPS2 pre-flight SSH + Caddy health check (~30 lines added)
- `.gsd/milestones/M010/slices/S03/tasks/T02-PLAN.md` — Added Observability Impact section
