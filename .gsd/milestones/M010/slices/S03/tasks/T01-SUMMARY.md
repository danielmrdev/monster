---
id: T01
parent: S03
milestone: M010
provides:
  - scripts/setup-vps1.sh — idempotent VPS1 provisioning from bare Ubuntu 24.04
key_files:
  - scripts/setup-vps1.sh
key_decisions:
  - Mirrored setup-vps2.sh patterns exactly (log/step helpers, arg parsing, banner format) for consistency
  - Script runs as regular user (sudo only for Tailscale) unlike setup-vps2.sh which requires root
  - nvm v0.40.1 pinned (latest stable at time of writing)
  - pm2 startup command captured and auto-executed via eval
patterns_established:
  - VPS setup scripts share log()/step() helpers, argument parsing, and banner formatting
observability_surfaces:
  - Structured log lines: [setup-vps1] [step N/6] [timestamp] LEVEL: message
  - --help prints usage; no args exits 1 with ERROR: --tailscale-key is required
  - Tailscale key always printed as [REDACTED]
  - Summary banner prints installed versions for post-run verification
duration: 12m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: Write setup-vps1.sh

**Wrote `scripts/setup-vps1.sh` — a 248-line idempotent VPS1 provisioning script covering Tailscale, nvm/Node.js 22, pnpm, pm2, monorepo clone, build, and pm2 startup.**

## What Happened

Created `scripts/setup-vps1.sh` mirroring the `setup-vps2.sh` patterns (log/step helpers, arg parsing with `--tailscale-key` required, banner format, structured output). The script has 6 sections:

1. **Tailscale** — `command -v tailscale` idempotency check, apt install from official repo, `tailscale up` with key redaction
2. **nvm + Node.js 22** — `~/.nvm` directory check, curl install of nvm v0.40.1, explicit `source ~/.nvm/nvm.sh` before any nvm commands (critical for non-interactive shells)
3. **pnpm + pm2** — `npm install -g pnpm pm2` (inherently idempotent)
4. **Monorepo** — git clone if `/home/daniel/monster/.git` doesn't exist, else fetch+pull
5. **Build** — `pnpm install --frozen-lockfile` + `pnpm -r build`, creates `logs/` directory
6. **pm2** — `pm2 start ecosystem.config.js --update-env || true` (handles already-started), `pm2 save`, captures and executes `pm2 startup` sudo command

Key difference from setup-vps2.sh: this script runs as a regular user (only Tailscale commands use `sudo`), since VPS1 doesn't need system-level service configuration like Caddy.

## Verification

- ✅ `bash -n scripts/setup-vps1.sh` exits 0 — syntax valid
- ✅ `bash scripts/setup-vps1.sh --help` prints usage and exits 1
- ✅ `bash scripts/setup-vps1.sh` (no args) prints `ERROR: --tailscale-key is required` and exits 1
- ✅ `bash -n scripts/deploy.sh` exits 0 (unchanged, still valid)
- ⏭️ shellcheck not available in this environment — noted for VPS1 run
- ✅ Visual review: nvm source line (142) precedes nvm install (145); all 6 sections clearly commented with separator bars
- ✅ Script is executable (`chmod +x`)

### Slice-level verification (T01 is intermediate — partial passes expected):
- ✅ `bash -n scripts/setup-vps1.sh` exits 0
- ✅ `bash -n scripts/deploy.sh` exits 0
- ⏭️ shellcheck: not available locally
- ⏭️ deploy.sh pre-flight check: T02 scope

## Diagnostics

- Run `bash scripts/setup-vps1.sh --help` to verify script is accessible without executing
- Run with `--tailscale-key` omitted to verify error path
- On VPS1: structured log output provides step-by-step progress; last log line before failure identifies the failing step
- Summary banner at end prints all installed versions for quick post-run audit

## Deviations

- Script is 248 lines vs estimated 100-140 — the extra lines come from faithfully mirroring setup-vps2.sh's verbose formatting (banners, separators, summary section). This is a feature, not bloat.
- Added `git pull origin main` after fetch when repo already exists (plan only said `fetch`) — more useful for reprovisioning since you typically want the latest code.
- Added `mkdir -p logs/` before build step — required by ecosystem.config.js log paths.

## Known Issues

- None

## Files Created/Modified

- `scripts/setup-vps1.sh` — New 248-line idempotent VPS1 provisioning script
- `.gsd/milestones/M010/slices/S03/S03-PLAN.md` — Added Observability/Diagnostics section, marked T01 done
- `.gsd/milestones/M010/slices/S03/tasks/T01-PLAN.md` — Added Observability Impact section
