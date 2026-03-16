---
estimated_steps: 10
estimated_files: 2
---

# T02: Configure Caddy (Caddyfile, dirs, sudoers) and write self-check

**Slice:** S01 — VPS2 Bootstrap Script
**Milestone:** M010

## Description

Extend `scripts/setup-vps2.sh` with steps 4–7: write the global Caddyfile with `import sites/*`, create `/etc/caddy/sites/` and `/var/www/sites/` directories with correct ownership, add the passwordless `systemctl reload caddy` sudoers entry, and enable+start Caddy. Then write `scripts/lib/vps2-check.sh` as a reusable SSH health check that asserts all postconditions. Call it at the end of `setup-vps2.sh`.

## Steps

1. Step 4 in setup-vps2.sh: write `/etc/caddy/Caddyfile`. Use a heredoc. Check if file already contains `import sites/*` before writing — if yes, skip (idempotent). The Caddyfile content: global email block + `import sites/*`. Back up existing Caddyfile to `.bak` if it exists and doesn't already have the import.
2. Step 5: `mkdir -p /etc/caddy/sites /var/www/sites`. Set `/var/www/sites` owned by deploy user (`$DEPLOY_USER`, defaulting to the SSH user). Set `/etc/caddy/sites` owned by root.
3. Step 6: Write sudoers entry. Create `/etc/sudoers.d/caddy-reload` with `$DEPLOY_USER ALL=(ALL) NOPASSWD: /bin/systemctl reload caddy`. Validate with `visudo -c -f /etc/sudoers.d/caddy-reload`. If validation fails, remove the file and abort with clear error.
4. Step 7: `systemctl enable --now caddy`.
5. Add `DEPLOY_USER` parameter parsing alongside `--tailscale-key` (default: current user `$(whoami)`).
6. Write `scripts/lib/vps2-check.sh`: accepts `<host> <user>` args. SSHes in (agent auth, StrictHostKeyChecking=no, timeout 10) and runs: (a) `tailscale status`, (b) `systemctl is-active caddy`, (c) `test -d /etc/caddy/sites`, (d) `test -d /var/www/sites`, (e) `sudo systemctl reload caddy`. Prints ✓/✗ for each. Exits 1 if any check fails.
7. At end of `setup-vps2.sh`: call `bash "$SCRIPT_DIR/lib/vps2-check.sh" <internal-ip-or-localhost>`. (When run on VPS2 directly, can use `localhost`.)
8. Add `chmod +x scripts/lib/vps2-check.sh`.
9. Make `setup-vps2.sh` executable and double-check `bash -n` on both files.
10. Review: verify sudoers line uses full path `/bin/systemctl` (not just `systemctl`).

## Must-Haves

- [ ] `/etc/caddy/Caddyfile` contains `import sites/*`; write is idempotent (no duplicate if re-run)
- [ ] `/etc/caddy/sites/` and `/var/www/sites/` exist after script run
- [ ] `/etc/sudoers.d/caddy-reload` passes `visudo -c` validation before being left in place
- [ ] `scripts/lib/vps2-check.sh` standalone: prints ✓/✗ for each of the 5 checks; exits 1 on any failure
- [ ] `bash -n scripts/setup-vps2.sh` exits 0
- [ ] `bash -n scripts/lib/vps2-check.sh` exits 0

## Verification

- `bash -n scripts/setup-vps2.sh` exits 0
- `bash -n scripts/lib/vps2-check.sh` exits 0
- `shellcheck` both scripts — no errors
- Visual review: Caddyfile heredoc content is syntactically valid Caddy config; sudoers line uses full `/bin/systemctl` path

## Inputs

- `scripts/setup-vps2.sh` — extended from T01 (steps 1–3 already present)
- `scripts/lib/` — directory from T01

## Expected Output

- `scripts/setup-vps2.sh` — complete with steps 1–7 + self-check call (120–180 lines)
- `scripts/lib/vps2-check.sh` — standalone SSH health checker (60–90 lines)
