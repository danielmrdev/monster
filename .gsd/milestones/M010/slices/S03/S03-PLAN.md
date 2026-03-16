# S03: VPS1 Setup Script + Deploy Pre-flight

**Goal:** Produce `scripts/setup-vps1.sh` — a runnable documentation script for reprovisioning VPS1 (Node.js/nvm, pnpm, pm2, Tailscale join, monorepo clone). Extend `scripts/deploy.sh` with a pre-flight check that validates VPS2 SSH connectivity and Caddy is running before executing rsync, exiting with an actionable error if either check fails.

**Demo:** Running `bash scripts/deploy.sh` on VPS1 when VPS2 is unreachable exits immediately with `[pre-flight] ERROR: VPS2 not reachable via SSH — check vps2_host setting and Tailscale connection` rather than silently failing mid-rsync. Running it when VPS2 is healthy proceeds normally. `scripts/setup-vps1.sh` contains all commands needed to reprovision VPS1 from scratch.

## Must-Haves

- `scripts/setup-vps1.sh`: covers nvm install, Node.js 22 via nvm, pnpm install via npm, pm2 install globally, Tailscale install + join, git clone of monorepo, `pnpm install --frozen-lockfile`, `pnpm -r build`, pm2 start + save. Script uses `set -euo pipefail`. Each section clearly commented.
- `scripts/deploy.sh` extended: before `git pull`, call `scripts/lib/vps2-check.sh` (or inline equivalent) to assert VPS2 SSH reachable and Caddy active. On failure, print an actionable error message including the setting name to check (`vps2_host`, `vps2_user`) and exit 1. On success, proceed with existing pull/build/pm2 steps.
- Pre-flight check in `deploy.sh` uses the same SSH pattern as `RsyncService` and `CaddyService` — meaning it uses the SSH agent (`$SSH_AUTH_SOCK`).
- `pnpm build` and `pnpm typecheck` exit 0 (no TypeScript changes here, but validate no regressions).
- `bash -n scripts/setup-vps1.sh` and `bash -n scripts/deploy.sh` syntax checks pass.

## Verification

- `bash -n scripts/setup-vps1.sh` exits 0
- `bash -n scripts/deploy.sh` exits 0
- shellcheck both scripts if available on VPS1
- Human review: setup-vps1.sh covers all required steps for a fresh VPS1; deploy.sh pre-flight check is clearly readable

## Tasks

- [ ] **T01: Write setup-vps1.sh** `est:30m`
  - Why: VPS1 reprovisioning currently requires tribal knowledge. A script makes it a 15-minute task.
  - Files: `scripts/setup-vps1.sh`
  - Do: Write `set -euo pipefail` script. Section 1: Tailscale install + join (same apt pattern as setup-vps2.sh; accepts `--tailscale-key`). Section 2: nvm install (curl from nvm.sh) + `nvm install 22 && nvm use 22 && nvm alias default 22`. Section 3: `npm install -g pnpm pm2`. Section 4: git clone `https://github.com/<user>/monster` → `/home/daniel/monster` (or skip if exists). Section 5: `cd /home/daniel/monster && pnpm install --frozen-lockfile && pnpm -r build`. Section 6: `pm2 start ecosystem.config.js && pm2 save && pm2 startup`. Add clear comments above each section. Use idempotency checks (skip if already installed).
  - Verify: `bash -n scripts/setup-vps1.sh` exits 0
  - Done when: script covers all 6 sections, syntax-valid, idempotency checks present

- [ ] **T02: Extend deploy.sh with VPS2 pre-flight check** `est:30m`
  - Why: Silent mid-rsync failures are confusing. An upfront check exits fast with a clear error.
  - Files: `scripts/deploy.sh`, `scripts/lib/vps2-check.sh` (use from S01)
  - Do: At the top of `deploy.sh` (before `git pull`), add a pre-flight section. Read `vps2_host` and `vps2_user` from environment or from a local `.vps2.env` file (if present — not committed). Run `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "$VPS2_USER@$VPS2_HOST" 'systemctl is-active caddy'` and capture exit code. If non-zero, print actionable error: `[pre-flight] ERROR: VPS2 SSH check failed. Verify vps2_host/vps2_user settings and Tailscale connection.` and exit 1. If 0, print `[pre-flight] VPS2 reachable, Caddy active.` and continue. Make VPS2_HOST/VPS2_USER overrideable via env vars so the check can be skipped in CI/local by setting `SKIP_VPS2_CHECK=1`.
  - Verify: `bash -n scripts/deploy.sh` exits 0; review pre-flight logic is readable
  - Done when: deploy.sh has pre-flight, SKIP_VPS2_CHECK escape hatch, actionable error message

## Files Likely Touched

- `scripts/setup-vps1.sh` (new)
- `scripts/deploy.sh` (extend)
- `scripts/lib/vps2-check.sh` (reference from S01)
