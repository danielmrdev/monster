# S01: VPS2 Bootstrap Script

**Goal:** Produce `scripts/setup-vps2.sh` — a single idempotent bash script that takes a fresh Hetzner Ubuntu 24.04 VPS from bare OS to fully operational Caddy sites server: Tailscale joined, Caddy installed and configured with `import sites/*`, sites directories created, and a passwordless-reload sudoers entry. The script ends with a self-test that asserts all postconditions.

**Demo:** Running `bash scripts/setup-vps2.sh <host> <user> --tailscale-key <key>` from a local machine (or directly on VPS2) on a fresh Ubuntu 24.04 instance exits 0 and a follow-up SSH check confirms: `tailscale status` shows the node connected, `systemctl is-active caddy` returns `active`, `/etc/caddy/sites/` exists, `/var/www/sites/` exists, and `sudo systemctl reload caddy` succeeds without a password prompt.

## Must-Haves

- Script is idempotent: re-running it on a configured VPS produces no errors and no duplicate config.
- Tailscale join step accepts `--tailscale-key <key>` parameter; script errors clearly if key is missing.
- Caddy installed via official Caddy apt repository (not snap, not manual binary).
- `/etc/caddy/Caddyfile` contains `import sites/*` in the `{global}` block or as a top-level directive; does not conflict with default example config.
- `/etc/caddy/sites/` directory created and owned by root with group caddy (or www-data), writable by the deploy user via sudo tee pattern.
- `/var/www/sites/` directory created and owned by the deploy user (or www-data), writable by rsync.
- Sudoers entry: deploy user can run `sudo systemctl reload caddy` without password — exact visudo line validated with `visudo -c` before writing.
- Self-check at end of script: asserts each postcondition via SSH command, prints ✓/✗ per check, exits non-zero if any check fails.
- `scripts/lib/vps2-check.sh` extracted as a reusable check helper (sourced or called by setup-vps2.sh and later by deploy.sh S03).

## Proof Level

- This slice proves: operational (real server setup, not fixtures)
- Real runtime required: yes (requires a real VPS2 SSH connection for full verification; script syntax/logic verifiable offline)
- Human/UAT required: yes (operator runs the script against a real or fresh VPS2 and confirms all checks pass)

## Verification

- `bash -n scripts/setup-vps2.sh` — syntax check exits 0
- `bash -n scripts/lib/vps2-check.sh` — syntax check exits 0
- `shellcheck scripts/setup-vps2.sh scripts/lib/vps2-check.sh` — no errors (if shellcheck available on VPS1)
- Human UAT: script executed against real VPS2; all self-check assertions pass; `sudo systemctl reload caddy` succeeds without password; `systemctl is-active caddy` → active

## Observability / Diagnostics

- Runtime signals: script logs each step with `[step N/M]` prefix + timestamp; self-check prints ✓/✗ per assertion
- Inspection surfaces: `scripts/lib/vps2-check.sh <host> <user>` callable standalone for spot checks
- Failure visibility: any command failure causes `set -e` exit; the failing step and its stderr are visible in terminal output
- Redaction constraints: Tailscale auth key echoed only as `[REDACTED]` in log output; never printed to stdout

## Tasks

- [x] **T01: Write setup-vps2.sh with system prep, Tailscale, and Caddy install** `est:45m`
  - Why: Core bootstrap — system update, Tailscale install and join, Caddy apt install.
  - Files: `scripts/setup-vps2.sh`, `scripts/lib/vps2-check.sh`
  - Do: Create `scripts/` dir. Write `setup-vps2.sh` with `set -euo pipefail`. Parse `--tailscale-key` from args; fail clearly if missing. Step 1: `apt-get update && apt-get upgrade -y`. Step 2: Tailscale install (curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.nosetup.gpg … apt install tailscale) + `tailscale up --authkey <key>`. Step 3: Caddy install via official apt repo (https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Make each step idempotent (check before install). Log each step with `[step N/M]` prefix.
  - Verify: `bash -n scripts/setup-vps2.sh` exits 0; shellcheck if available
  - Done when: script syntax-valid, all 3 steps implemented with idempotency checks, Tailscale key redacted in log output

- [x] **T02: Configure Caddy (Caddyfile, dirs, sudoers) and write self-check** `est:45m`
  - Why: VPS2 is useless until Caddy is configured for the sites pattern and CaddyService's `sudo tee + reload` pattern works.
  - Files: `scripts/setup-vps2.sh` (extend), `scripts/lib/vps2-check.sh`
  - Do: Step 4 in setup-vps2.sh: write `/etc/caddy/Caddyfile` with `import sites/*` — use a heredoc, check if already contains import before writing (idempotency). Step 5: `mkdir -p /etc/caddy/sites /var/www/sites`, set ownership. Step 6: sudoers entry — write to `/etc/sudoers.d/caddy-reload` with content `<user> ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy`; validate with `visudo -c -f /etc/sudoers.d/caddy-reload`. Step 7: `systemctl enable --now caddy`. Extract `scripts/lib/vps2-check.sh` as a standalone checker: SSH to host, assert tailscale connected, caddy active, dirs exist, sudo reload works. Call it at end of setup-vps2.sh.
  - Verify: `bash -n` and shellcheck both pass; review Caddyfile heredoc is correct; sudoers line matches `visudo -c` pattern
  - Done when: setup-vps2.sh covers all 7 steps + calls vps2-check.sh; lib/vps2-check.sh standalone with pass/fail output

## Files Likely Touched

- `scripts/setup-vps2.sh` (new)
- `scripts/lib/vps2-check.sh` (new)
