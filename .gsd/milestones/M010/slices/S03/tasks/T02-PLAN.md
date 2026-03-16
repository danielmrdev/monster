---
estimated_steps: 5
estimated_files: 1
---

# T02: Extend deploy.sh with VPS2 pre-flight check

**Slice:** S03 — VPS1 Setup Script + Deploy Pre-flight
**Milestone:** M010

## Description

Extend `scripts/deploy.sh` with a VPS2 pre-flight SSH check at the top: before git pull, SSH into VPS2 and confirm `systemctl is-active caddy`. Fail fast with an actionable error if unreachable or Caddy is down. Provide a `SKIP_VPS2_CHECK=1` escape hatch. Read VPS2 host/user from environment variables that default to well-known env var names.

## Steps

1. Read current `scripts/deploy.sh` to understand the exact current content.
2. Add at the top (after `set -euo pipefail`): `VPS2_HOST=${VPS2_HOST:-}` and `VPS2_USER=${VPS2_USER:-root}`. These can be set in the shell environment or a `.vps2.env` file. Add: `if [ -f "$(dirname "$0")/../.vps2.env" ]; then source "$(dirname "$0")/../.vps2.env"; fi`.
3. Add pre-flight block: `if [ "${SKIP_VPS2_CHECK:-0}" != "1" ] && [ -n "$VPS2_HOST" ]; then` ... run SSH check ... `fi`. If `VPS2_HOST` is empty, skip pre-flight (backward compat for VPS1 environments where VPS2 vars are not set).
4. SSH check command: `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes "$VPS2_USER@$VPS2_HOST" 'systemctl is-active caddy'`. On non-zero exit: print `[pre-flight] ✗ VPS2 health check failed.` + instructions (check vps2_host env var, Tailscale connection). Exit 1.
5. On success: print `[pre-flight] ✓ VPS2 reachable, Caddy active.` then proceed with existing deploy steps.
6. `bash -n scripts/deploy.sh` — syntax check.

## Must-Haves

- [ ] Pre-flight skipped gracefully if `VPS2_HOST` is not set (backward compat)
- [ ] `SKIP_VPS2_CHECK=1` skips the check entirely
- [ ] On failure: actionable error message naming the variables to check
- [ ] On success: proceeds with existing git pull / build / pm2 steps unchanged
- [ ] `bash -n scripts/deploy.sh` exits 0

## Observability Impact

- **New structured log lines:** `[pre-flight] ✓ VPS2 reachable, Caddy active.` on success; `[pre-flight] ✗ VPS2 health check failed.` on failure; `[pre-flight] ⏭ VPS2 check skipped (...)` when bypassed. Agents grep for `[pre-flight]` prefix to determine deploy readiness.
- **Failure state:** Non-zero exit (code 1) with actionable error listing `VPS2_HOST`, `VPS2_USER`, and Tailscale as things to check. The error message is self-contained — no need to read source to diagnose.
- **Inspection:** `SKIP_VPS2_CHECK=1 bash scripts/deploy.sh` to bypass in CI/local. `VPS2_HOST=<ip> bash scripts/deploy.sh` to test against a specific host.

## Verification

- `bash -n scripts/deploy.sh` exits 0
- Visual review: pre-flight block is readable; fallback when VPS2_HOST empty is clear

## Inputs

- `scripts/deploy.sh` — current content (read first)
- `scripts/lib/vps2-check.sh` — reference (pre-flight uses inline SSH, not this script, for simplicity in deploy.sh)

## Expected Output

- `scripts/deploy.sh` — extended with pre-flight block (~25 additional lines)
