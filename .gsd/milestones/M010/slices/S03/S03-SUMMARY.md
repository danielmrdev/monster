---
id: S03
parent: M010
milestone: M010
provides:
  - scripts/setup-vps1.sh — idempotent VPS1 provisioning from bare Ubuntu 24.04 (6 steps)
  - scripts/deploy.sh — VPS2 pre-flight SSH + Caddy health check before deploy steps
requires:
  - slice: S01
    provides: scripts/setup-vps2.sh patterns (log/step helpers, arg parsing, banner format)
affects: []
key_files:
  - scripts/setup-vps1.sh
  - scripts/deploy.sh
key_decisions:
  - D141 — setup-vps1.sh mirrors setup-vps2.sh patterns for consistency
  - D142 — setup-vps1.sh runs as regular user (sudo only for Tailscale)
  - D143 — deploy.sh pre-flight inlines SSH check instead of sourcing vps2-check.sh
patterns_established:
  - VPS setup scripts (vps1 + vps2) share identical log()/step() helpers, argument parsing, and banner formatting — consistent operator experience
  - deploy.sh pre-flight lines prefixed with `[pre-flight]` (✓/✗/⏭) — agents grep for deploy readiness
  - .vps2.env file sourced by deploy.sh for local VPS2 connection overrides (not committed)
observability_surfaces:
  - setup-vps1.sh: structured `[setup-vps1] [step N/6] [timestamp] LEVEL: message` log lines
  - setup-vps1.sh: `--help` prints usage; no args exits 1 with ERROR
  - setup-vps1.sh: Tailscale key always printed as [REDACTED]
  - setup-vps1.sh: summary banner prints installed versions for post-run audit
  - deploy.sh: `[pre-flight] ✓` / `[pre-flight] ✗` / `[pre-flight] ⏭` structured log lines
  - deploy.sh: non-zero exit (1) on VPS2 health check failure with actionable error
drill_down_paths:
  - .gsd/milestones/M010/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M010/slices/S03/tasks/T02-SUMMARY.md
duration: 22m
verification_result: passed
completed_at: 2026-03-16
---

# S03: VPS1 Setup Script + Deploy Pre-flight

**Idempotent VPS1 bootstrap script (248 lines, 6 provisioning steps) and deploy.sh pre-flight gate that fails fast with actionable errors when VPS2 is unreachable or Caddy is down.**

## What Happened

Two scripts were produced to eliminate tribal knowledge from VPS provisioning and prevent silent deploy failures.

**T01: setup-vps1.sh** — A 248-line idempotent provisioning script covering everything needed to stand up VPS1 from bare Ubuntu 24.04: (1) Tailscale install + tailnet join, (2) nvm v0.40.1 + Node.js 22, (3) pnpm + pm2 globally, (4) monorepo git clone (or fetch+pull if exists), (5) `pnpm install --frozen-lockfile` + `pnpm -r build`, (6) pm2 start + save + startup with auto-executed sudo command. The script mirrors `setup-vps2.sh` patterns exactly — same `log()`/`step()` helpers, same argument parsing (`--tailscale-key` required), same banner format. Key difference: runs as regular user `daniel` with sudo only for Tailscale (VPS1 has no Caddy or system services to configure). Every section has idempotency checks (`command -v`, directory existence, `|| true` for already-started pm2 apps).

**T02: deploy.sh pre-flight** — Extended `deploy.sh` with a ~30-line pre-flight section inserted before `git pull`. Three-way branch: `SKIP_VPS2_CHECK=1` skips with log (CI/local escape hatch), empty `VPS2_HOST` skips with log (backward compatibility for environments without VPS2 config), set `VPS2_HOST` runs `ssh -o ConnectTimeout=5 -o BatchMode=yes` to check SSH reachability + `systemctl is-active caddy`. Failure prints actionable diagnostics naming the specific variables to check (`VPS2_HOST`, `VPS2_USER`, Tailscale status) and exits 1 before any deploy steps execute. Reads host/user from environment with `.vps2.env` file override.

## Verification

- ✅ `bash -n scripts/setup-vps1.sh` exits 0 — syntax valid
- ✅ `bash -n scripts/deploy.sh` exits 0 — syntax valid
- ✅ `bash scripts/setup-vps1.sh --help` prints usage without executing provisioning
- ✅ `bash scripts/setup-vps1.sh` (no args) exits non-zero with `ERROR: --tailscale-key is required`
- ✅ `SKIP_VPS2_CHECK=1` path logs `⏭ VPS2 check skipped` and proceeds
- ✅ Empty `VPS2_HOST` path logs `⏭ VPS2 check skipped (VPS2_HOST not set)` — backward compatible
- ✅ `pnpm --filter @monster/admin build` exits 0
- ✅ `pnpm --filter @monster/deployment typecheck` exits 0
- ✅ Both scripts are executable (`chmod +x`)
- ⏭ shellcheck not available in this environment — noted for VPS1 run
- ℹ️ `pnpm -r typecheck` has pre-existing failures: `@monster/deployment` TS7016 when run in parallel (build ordering issue — passes when run alone), `@monster/agents` `template_type` column error — both unrelated to S03

## Requirements Advanced

- R006 — Deployment operability improved: deploy.sh now validates VPS2 health before rsyncing, preventing silent mid-rsync failures and providing actionable error messages

## Requirements Validated

- none

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- deploy.sh inlines SSH check rather than sourcing `scripts/lib/vps2-check.sh` as the boundary map specified. The pre-flight needs only a simple pass/fail gate, not the full diagnostic tool. Documented as D143.
- setup-vps1.sh is 248 lines vs the plan's implied ~100-140 — extra lines come from mirroring setup-vps2.sh verbose formatting (banners, separators, summary section). This is intentional consistency, not bloat.
- Added `git pull origin main` after fetch when repo already exists (plan only mentioned clone). More useful for reprovisioning.
- Added `mkdir -p logs/` before build — required by ecosystem.config.js log paths.

## Known Limitations

- Neither script has been run on a real fresh VPS yet — syntax-validated and logic-reviewed only. Operator UAT is the final proof.
- shellcheck not available in the development environment — should be run on VPS1 before trusting the scripts.
- nvm v0.40.1 is pinned — may need updating if a newer version is required.
- pm2 startup command is captured via grep + eval — if pm2 changes its output format, this step may need adjustment.

## Follow-ups

- Run both scripts on actual VPS instances (VPS1 fresh provision, VPS2 fresh provision) and verify all health indicators green in `/infra` page.
- Install shellcheck on VPS1 and lint both scripts.
- M010 milestone completion: all three slices (S01, S02, S03) are done — milestone ready for M010-SUMMARY.md and final verification.

## Files Created/Modified

- `scripts/setup-vps1.sh` — New 248-line idempotent VPS1 provisioning script (6 steps)
- `scripts/deploy.sh` — Extended with VPS2 pre-flight SSH + Caddy health check (~30 lines added)

## Forward Intelligence

### What the next slice should know
- M010 is now complete (all 3 slices done). The milestone closer should verify that `setup-vps2.sh` (S01), `/infra` page (S02), and `setup-vps1.sh` + `deploy.sh` pre-flight (S03) form a coherent provisioning + monitoring story.
- Both VPS setup scripts accept `--tailscale-key` as a required argument — operator needs a Tailscale auth key from the admin console before running either.

### What's fragile
- pm2 startup command capture (`pm2 startup 2>&1 | grep "sudo" | head -1`) — depends on pm2's stdout format. If pm2 changes how it outputs the sudo command, the `eval` step will silently become a no-op (captured by `|| true`).
- nvm source path (`[ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"`) — must run before any `nvm` command in a non-interactive shell. This is already correct but easy to break if someone reorders the script.

### Authoritative diagnostics
- `bash scripts/setup-vps1.sh --help` — confirms script is accessible and arg parsing works without executing
- `grep "\[pre-flight\]" <deploy_output>` — confirms deploy.sh pre-flight ran and shows pass/fail/skip status
- setup-vps1.sh summary banner at end prints all installed versions — single-glance verification of a successful run

### What assumptions changed
- Boundary map assumed deploy.sh would source `scripts/lib/vps2-check.sh` — instead the check was inlined for simplicity (D143). The shell-level pre-flight and the TypeScript `InfraService.testDeployConnection()` are independent implementations of the same SSH check, serving different contexts (shell deploy script vs admin panel UI).
