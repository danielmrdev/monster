---
estimated_steps: 8
estimated_files: 2
---

# T01: Write setup-vps2.sh with system prep, Tailscale, and Caddy install

**Slice:** S01 — VPS2 Bootstrap Script
**Milestone:** M010

## Description

Create `scripts/setup-vps2.sh` — a `set -euo pipefail` bash script that bootstraps VPS2 system packages, Tailscale, and Caddy. The script accepts `--tailscale-key <key>` as a required argument. Steps 1–3: apt update/upgrade, Tailscale install and join, Caddy apt install. Each step is idempotent (check before act). Tailscale key is redacted in log output. Also create the `scripts/lib/` directory structure.

## Steps

1. Create `scripts/lib/` directory.
2. Write `scripts/setup-vps2.sh` with shebang `#!/usr/bin/env bash` and `set -euo pipefail`.
3. Add argument parsing: `--tailscale-key <key>` required; print usage and exit 1 if missing.
4. Add `log()` helper: prints `[setup-vps2] [step N/M]` prefix with timestamp.
5. Step 1: apt update + upgrade — `apt-get update -qq && apt-get upgrade -y`.
6. Step 2: Tailscale install via official apt repo (Ubuntu 24.04 / noble). Check `command -v tailscale` first; skip install if already present. After install: `tailscale up --authkey "$TAILSCALE_KEY"` — echo key as `[REDACTED]` in log.
7. Step 3: Caddy install via official Caddy apt repo (https://caddyserver.com/docs/install#debian-ubuntu-raspbian). Check `command -v caddy` first; skip if present.
8. Add `chmod +x scripts/setup-vps2.sh`.

## Must-Haves

- [ ] Script has `set -euo pipefail` at top
- [ ] `--tailscale-key` argument required; clear usage message on missing
- [ ] Tailscale key never echoed to stdout; only `[REDACTED]` appears in log
- [ ] Tailscale install step skipped if `tailscale` already in PATH (idempotent)
- [ ] Caddy install step skipped if `caddy` already in PATH (idempotent)
- [ ] `bash -n scripts/setup-vps2.sh` exits 0

## Verification

- `bash -n scripts/setup-vps2.sh` exits 0
- `shellcheck scripts/setup-vps2.sh` (if shellcheck available) — no errors
- Visual review: `grep TAILSCALE_KEY scripts/setup-vps2.sh | grep -v REDACTED` returns nothing (key never printed)

## Inputs

- `scripts/` directory — create if not exists
- `scripts/lib/` directory — create

## Expected Output

- `scripts/setup-vps2.sh` — 70–120 lines, steps 1–3, idempotency checks, redacted key
- `scripts/lib/` — directory created (vps2-check.sh added in T02)
