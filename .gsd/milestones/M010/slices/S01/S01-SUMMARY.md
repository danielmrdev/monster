---
id: S01
milestone: M010
provides:
  - scripts/setup-vps2.sh — complete 7-step idempotent VPS2 bootstrap script
  - scripts/lib/vps2-check.sh — reusable SSH/local health checker for VPS2 postconditions
  - All VPS2 prerequisites covered: Tailscale, Caddy apt, Caddyfile with import sites/*, dirs, sudoers
key_files:
  - scripts/setup-vps2.sh
  - scripts/lib/vps2-check.sh
key_decisions:
  - "D135: setup-vps2.sh is idempotent — safe to re-run on a configured VPS"
  - "D136: vps2-check.sh supports --local mode for on-VPS self-check and remote SSH mode for VPS1→VPS2 checks"
  - "D137: Caddy start warning treated as non-fatal — empty sites/* may cause degraded start; first deploy fixes it"
  - "D138: /bin/systemctl full path in sudoers — required on Ubuntu 24.04 where /bin is /usr/bin symlink"
patterns_established:
  - "setup-vps2.sh step()/log() helper pattern reused by setup-vps1.sh (S03)"
  - "vps2-check.sh run_check() dispatch pattern reusable for other health checks"
drill_down_paths:
  - .gsd/milestones/M010/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M010/slices/S01/tasks/T02-SUMMARY.md
completed_at: 2026-03-16T13:20:00Z
---

# S01: VPS2 Bootstrap Script

**`setup-vps2.sh` — 349-line idempotent 7-step VPS2 bootstrap; `vps2-check.sh` — 122-line reusable health checker.**

## What Was Built

`scripts/setup-vps2.sh` takes a fresh Ubuntu 24.04 VPS from bare OS to fully operational Caddy sites server in one command:

```
sudo bash scripts/setup-vps2.sh --tailscale-key tskey-auth-xxxx [--deploy-user <user>]
```

**7 steps:**
1. `apt-get update + upgrade` + prerequisite packages
2. Tailscale install (official apt repo, Ubuntu noble) + `tailscale up --authkey`
3. Caddy install (official Caddy apt repo via cloudsmith)
4. `/etc/caddy/Caddyfile` written with `import sites/*` global directive
5. `/etc/caddy/sites/` (root-owned) and `/var/www/sites/` (deploy-user-owned) created
6. `/etc/sudoers.d/caddy-reload` with passwordless `systemctl reload caddy`, `visudo -c` validated
7. `systemctl enable --now caddy`

All steps are idempotent: check-before-act for Tailscale install, Caddy install, Caddyfile content, and sudoers entry.

`scripts/lib/vps2-check.sh` asserts 5 postconditions: Tailscale connected, Caddy active, both dirs exist, sudo reload works without password. Works in both `--local` mode (called from setup-vps2.sh on VPS2) and remote SSH mode (called from VPS1 after setup).

## Deviations

Caddy may start in degraded state on a fresh VPS with no sites configured (empty `sites/*` glob). The self-check "Caddy active" may show ✗ on initial setup — expected and documented. First site deploy resolves this.
