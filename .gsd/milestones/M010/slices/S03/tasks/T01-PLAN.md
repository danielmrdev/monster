---
estimated_steps: 7
estimated_files: 1
---

# T01: Write setup-vps1.sh

**Slice:** S03 — VPS1 Setup Script + Deploy Pre-flight
**Milestone:** M010

## Description

Write `scripts/setup-vps1.sh` — a `set -euo pipefail` bash script that provisions VPS1 from a fresh Ubuntu 24.04: Tailscale join, Node.js 22 via nvm, pnpm + pm2 globally, monorepo clone, build, and pm2 start. Uses idempotency checks throughout.

## Steps

1. Create `scripts/setup-vps1.sh` with shebang and `set -euo pipefail`.
2. Parse `--tailscale-key <key>` arg (required) and `--repo-url <url>` (default: actual GitHub URL from git remote).
3. Add `log()` helper matching setup-vps2.sh pattern.
4. Section 1 — Tailscale: same install pattern as setup-vps2.sh (reuse logic, idempotency check).
5. Section 2 — nvm + Node.js 22: install nvm if not present (`~/.nvm` check); `source ~/.nvm/nvm.sh && nvm install 22 && nvm use 22 && nvm alias default 22`.
6. Section 3 — pnpm + pm2: `npm install -g pnpm pm2` (idempotent — npm install -g is safe to re-run).
7. Section 4 — monorepo: if `/home/daniel/monster` doesn't exist, `git clone <repo-url> /home/daniel/monster`; else `git -C /home/daniel/monster fetch`.
8. Section 5 — build: `cd /home/daniel/monster && pnpm install --frozen-lockfile && pnpm -r build`.
9. Section 6 — pm2: `pm2 start ecosystem.config.js --update-env || true; pm2 save; pm2 startup` (the `|| true` handles "already started" case).
10. Add `chmod +x scripts/setup-vps1.sh`.
11. `bash -n scripts/setup-vps1.sh` — syntax check.

(Count: 7 real steps with idempotency, not counting subcommands.)

## Must-Haves

- [ ] `set -euo pipefail` at top
- [ ] `--tailscale-key` required; clear error on missing
- [ ] nvm section sources `~/.nvm/nvm.sh` before using nvm commands (required for non-interactive shells)
- [ ] pm2 start uses `--update-env` and handles "already started" gracefully
- [ ] `bash -n scripts/setup-vps1.sh` exits 0

## Verification

- `bash -n scripts/setup-vps1.sh` exits 0
- shellcheck if available — no errors
- Visual review: nvm source line present before `nvm install`; all sections clearly commented

## Inputs

- `scripts/setup-vps2.sh` — logging and arg-parsing patterns to mirror
- `ecosystem.config.js` — referenced directly in pm2 start command

## Expected Output

- `scripts/setup-vps1.sh` — complete 6-section script, ~100–140 lines

## Observability Impact

- **New structured logs:** `[setup-vps1] [step N/6] [timestamp] LEVEL: message` — 6 step transitions, each ending with `✓` on success.
- **Failure visibility:** `set -euo pipefail` causes immediate exit on any command failure; the last emitted log line identifies which step and command failed.
- **Inspection surface:** `--help` flag prints usage without executing. Running without `--tailscale-key` exits 1 with `ERROR: --tailscale-key is required`.
- **Summary banner:** Final output prints installed versions (Node.js, pnpm, pm2, Tailscale hostname) for post-run verification.
- **Redaction:** Tailscale authkey is always printed as `[REDACTED]` — never appears in logs.
