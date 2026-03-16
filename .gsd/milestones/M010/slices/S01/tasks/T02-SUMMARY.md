---
id: T02
parent: S01
milestone: M010
provides:
  - setup-vps2.sh steps 4-7: Caddyfile with import sites/*, dirs, sudoers, service enable
  - scripts/lib/vps2-check.sh — standalone SSH/local postcondition checker (5 checks)
  - Idempotency: grep-before-write on Caddyfile, grep-before-write on sudoers
  - visudo -c -f validation before sudoers file is left in place
  - Self-check invoked at end of setup-vps2.sh (local or as deploy user)
key_files:
  - scripts/setup-vps2.sh
  - scripts/lib/vps2-check.sh
key_decisions:
  - "vps2-check.sh supports --local / localhost / no-args mode to skip SSH when running on VPS2 itself"
  - "Caddy start failure treated as warning (not error) — empty sites/* dir may cause caddy to refuse start"
  - "Self-check runs as deploy user via sudo -u when DEPLOY_USER != current user"
  - "caddy validate --adapter caddyfile may warn on empty import glob; treated as non-fatal"
patterns_established:
  - "run_check() in vps2-check.sh: dispatches to local eval or SSH based on LOCAL_MODE flag"
drill_down_paths:
  - .gsd/milestones/M010/slices/S01/tasks/T02-PLAN.md
duration: 25min
verification_result: pass
completed_at: 2026-03-16T13:15:00Z
---

# T02: setup-vps2.sh steps 4-7 + vps2-check.sh self-check

**setup-vps2.sh extended to all 7 steps; vps2-check.sh written as reusable 5-assertion health checker.**

## What Happened

Extended `scripts/setup-vps2.sh` with steps 4-7:

**Step 4 (Caddyfile):** Writes `/etc/caddy/Caddyfile` with a heredoc containing `import sites/*`. Idempotency: checks `grep -q "import sites/\*"` first; if present, skips. Backs up existing Caddyfile to `.bak`. Runs `caddy validate` afterwards — treats warnings as non-fatal (empty `sites/*` glob causes a benign validation warning).

**Step 5 (dirs):** Creates `/etc/caddy/sites/` (root-owned, 755) and `/var/www/sites/` (deploy-user-owned, 755). Ownership of `/var/www/sites` is set to `$DEPLOY_USER` so rsync can write without sudo.

**Step 6 (sudoers):** Writes `$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy` to `/etc/sudoers.d/caddy-reload`. Full path `/bin/systemctl` is used (required on some Ubuntu systems). Validates with `visudo -c -f` before leaving the file in place — removes it and aborts if validation fails.

**Step 7 (service):** `systemctl enable caddy` + `systemctl start caddy`. Start failure is treated as a warning since a fresh Caddy with an empty `sites/*` glob may refuse to start until the first `.caddy` snippet is written.

**vps2-check.sh:** Created as a standalone checker in `scripts/lib/`. Supports three invocation modes: `--local` (no SSH, run checks directly), `localhost`/`127.0.0.1` as host (same), or `<host> <user>` (SSH). Five checks: Tailscale connected, Caddy active, `/etc/caddy/sites/` exists, `/var/www/sites/` exists, `sudo systemctl reload caddy` works. Prints ✓/✗ per check, exits 0 only if all pass.

The self-check at the end of `setup-vps2.sh` calls `vps2-check.sh --local` (or `sudo -u $DEPLOY_USER bash vps2-check.sh --local` when running as root but deploy user differs).

## Deviations

- Caddy `systemctl start` on a fresh server with empty `sites/*` may produce a warning status — handled as non-fatal. The plan assumed Caddy would be `active` after setup; in practice it may start in degraded state until first site is deployed. The self-check for "Caddy active" may show ✗ on a brand-new VPS with no sites — this is expected and documented in the troubleshooting output.

## Files Created/Modified

- `scripts/setup-vps2.sh` — extended with steps 4-7 + self-check invocation (349 lines total)
- `scripts/lib/vps2-check.sh` — standalone 122-line health checker
