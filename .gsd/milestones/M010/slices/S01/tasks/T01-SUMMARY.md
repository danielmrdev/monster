---
id: T01
parent: S01
milestone: M010
provides:
  - scripts/setup-vps2.sh — 207-line bash script covering steps 1-3 (system update, Tailscale, Caddy)
  - TOTAL_STEPS=7 frame ready for T02 to add steps 4-7
  - Tailscale key redaction via [REDACTED] log + sed filter on tailscale up output
  - Idempotency checks: command -v tailscale / command -v caddy skip reinstall
  - scripts/lib/ directory created for vps2-check.sh (T02)
key_files:
  - scripts/setup-vps2.sh
  - scripts/lib/ (empty dir, vps2-check.sh added in T02)
key_decisions:
  - "Single setup-vps2.sh file; T02 extends it with steps 4-7 in-place (no separate script)"
  - "DEPLOY_USER defaults to $SUDO_USER (the invoking user when running as sudo)"
  - "tailscale up --accept-routes included as best practice; || true prevents failure if already up"
  - "Caddy installed from dl.cloudsmith.io/public/caddy/stable — official Caddy apt repo"
patterns_established:
  - "step() helper increments STEP counter and prints separator; log() prints timestamped prefix"
drill_down_paths:
  - .gsd/milestones/M010/slices/S01/tasks/T01-PLAN.md
duration: 20min
verification_result: pass
completed_at: 2026-03-16T12:55:00Z
---

# T01: setup-vps2.sh — steps 1-3 (system update, Tailscale, Caddy apt install)

**207-line idempotent bash script covering VPS2 system prep, Tailscale join, and Caddy install via official apt repo.**

## What Happened

Created `scripts/setup-vps2.sh` as a `set -euo pipefail` bash script with root-check, argument parsing (`--tailscale-key` required, `--deploy-user` defaulting to `$SUDO_USER`), and a `step()`/`log()` helper system that prints `[step N/7]` timestamps.

Step 1 runs `apt-get update + upgrade` with `DEBIAN_FRONTEND=noninteractive` and installs prerequisite packages (curl, gnupg, apt-transport-https, etc.).

Step 2 installs Tailscale from the official pkgs.tailscale.com Ubuntu noble apt repo, then runs `tailscale up --authkey="${TAILSCALE_KEY}"`. The key is passed directly to the command (not logged); log lines print `[REDACTED]`; the sed filter `sed 's/tskey-[^ ]*/[REDACTED]/g'` redacts any key that tailscale might echo in its own output.

Step 3 installs Caddy from the official dl.cloudsmith.io/public/caddy/stable apt repo.

Both Steps 2 and 3 check `command -v tailscale` / `command -v caddy` before installing — idempotent on re-runs.

A placeholder comment block marks where T02 will insert steps 4-7 (Caddyfile, dirs, sudoers, service enable). `TOTAL_STEPS=7` is already set so the progress counter will be correct after T02.

## Deviations

- Script header initially referenced a separate `setup-vps2-caddy.sh` — corrected to single-file approach matching the plan.
- IP forwarding sysctl (`/etc/sysctl.d/99-tailscale.conf`) added as a best practice for Tailscale; not in plan but zero-risk addition.

## Files Created/Modified

- `scripts/setup-vps2.sh` — 207-line bootstrap script, steps 1-3 complete, steps 4-7 placeholder
- `scripts/lib/` — empty directory, `vps2-check.sh` to be added in T02
