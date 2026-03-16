# M010: VPS Hetzner Provisioning

**Vision:** Turn VPS2 (the public sites server) from a manually-configured black box into a reproducible, scriptable, testable piece of infrastructure. Deliver a `scripts/setup-vps2.sh` bootstrap script that takes a fresh Hetzner CX22/CX32 from bare Ubuntu to fully operational Caddy sites server — Tailscale joined, Caddy installed and configured with the `import sites/*` pattern, sites root directory created, sudoers entry for Caddy reload without password. Add a VPS Health page in the admin panel that shows VPS2 reachability, Caddy status, disk/memory at a glance, and lets the operator re-run Caddy reload from the UI. This milestone makes reprovisiong a new or replacement VPS2 a 10-minute operator task instead of an hour of manual steps.

## Success Criteria

- Running `bash scripts/setup-vps2.sh <host> <user>` on a fresh Hetzner Ubuntu 24.04 VPS produces a fully functional VPS2: Tailscale joined, Caddy installed, `/etc/caddy/Caddyfile` with `import sites/*`, `/etc/caddy/sites/` directory, `/var/www/sites/` directory, sudoers entry for `systemctl reload caddy` without password.
- The admin panel `/infra` page shows VPS2 reachability (SSH ping via node-ssh), Caddy service status (`systemctl is-active caddy`), disk usage, and memory usage — all fetched live from VPS2 over Tailscale SSH.
- A "Test Deploy Connection" button on the `/infra` page confirms that the VPS2 SSH connection used by `RsyncService` and `CaddyService` works correctly, and shows a clear pass/fail with error detail.
- `scripts/setup-vps1.sh` documents (and where possible, automates) the Monster admin setup: Node.js, pnpm, pm2, Tailscale join — enabling VPS1 reprovisioning without tribal knowledge.
- The `deploy.sh` script is extended with a pre-flight check: verifies SSH connectivity to VPS2 and Caddy is running before rsyncing; exits with an actionable error message if the check fails.

## Key Risks / Unknowns

- Tailscale auth key provisioning — the setup script needs a Tailscale auth key at runtime; this is a one-time operator input, not a stored secret — low risk but the UX of the script must be clear.
- Caddy sudoers entry on Ubuntu 24.04 — the exact sudoers line and visudo pattern must be tested on the actual OS; a wrong format silently fails and Caddy reload breaks deployment.

## Proof Strategy

- Tailscale auth key provisioning → retire in S01 by shipping a working `setup-vps2.sh` that accepts `--tailscale-key` as a parameter and successfully joins the tailnet (tested manually on a fresh VPS or verified by SSH auth working after script run).
- Caddy sudoers entry → retire in S01 by verifying `sudo systemctl reload caddy` succeeds without a password for the configured user after script run.

## Verification Classes

- Contract verification: `bash -n scripts/setup-vps2.sh` (syntax check), `shellcheck` if available; admin panel `/infra` page renders without TypeScript errors; `pnpm build` exits 0.
- Integration verification: SSH connectivity test via node-ssh in `/infra` health check; Caddy status fetch from real VPS2 via SSH; `rsync` dry-run to VPS2 passes.
- Operational verification: `systemctl reload caddy` succeeds after sudoers entry; Caddy serves a test site after setup; `pm2 reload monster-worker` continues functioning after VPS1 changes.
- UAT / human verification: operator runs `setup-vps2.sh` against a fresh or existing VPS2 and confirms all health indicators are green in the admin `/infra` page.

## Milestone Definition of Done

This milestone is complete only when all are true:

- `scripts/setup-vps2.sh` covers all required steps: system update, Tailscale join, Caddy install, global Caddyfile with `import sites/*`, sites directories, sudoers entry.
- `scripts/setup-vps1.sh` documents VPS1 setup (Node.js, nvm, pnpm, pm2, Tailscale) as a runnable script.
- Admin panel `/infra` page fetches and displays VPS2 health live (reachability, Caddy status, disk, memory).
- "Test Deploy Connection" button on `/infra` runs the real SSH check used by `RsyncService` and `CaddyService` and shows pass/fail.
- `deploy.sh` pre-flight check verifies SSH + Caddy before rsyncing.
- `pnpm build` and `pnpm typecheck` pass with no new errors.
- Success criteria re-checked against live VPS2 after script execution.

## Requirement Coverage

- Covers: none from REQUIREMENTS.md (infra-ops milestone, no product-facing requirements)
- Partially covers: R006 (R006 automation quality improves when VPS2 is reproducibly provisioned and operator can verify connection health from admin)
- Leaves for later: none
- Orphan risks: none — this milestone addresses operational concerns not captured in product requirements

## Slices

- [x] **S01: VPS2 Bootstrap Script** `risk:high` `depends:[]`
  > After this: running `bash scripts/setup-vps2.sh <host> <user> --tailscale-key <key>` on a fresh Ubuntu 24.04 VPS produces a fully functional VPS2 (Tailscale joined, Caddy installed, sites dirs created, sudoers entry added) — verified by a post-run health check embedded in the script.

- [ ] **S02: Admin Infra Health Page** `risk:medium` `depends:[S01]`
  > After this: the admin panel has an `/infra` page showing VPS2 reachability, Caddy service status, disk and memory usage fetched live via SSH — and a "Test Deploy Connection" button that confirms rsync + Caddy SSH paths work.

- [ ] **S03: VPS1 Setup Script + Deploy Pre-flight** `risk:low` `depends:[S01]`
  > After this: `scripts/setup-vps1.sh` documents and automates VPS1 setup (Node.js/nvm, pnpm, pm2, Tailscale); `deploy.sh` runs an SSH + Caddy pre-flight check before rsync and exits with an actionable error if VPS2 is unreachable or Caddy is not running.

## Boundary Map

### S01 → S02

Produces:
- `scripts/setup-vps2.sh` — complete bootstrap script; self-documents all VPS2 prerequisites
- VPS2 postcondition: `/etc/caddy/Caddyfile` with `import sites/*`, `/etc/caddy/sites/` dir, `/var/www/sites/` dir, Tailscale joined, sudoers entry for reload
- `scripts/lib/vps2-check.sh` — post-run health check helper (reachable, Caddy running, dirs exist) invoked by setup-vps2.sh at the end; imported by S03 deploy.sh pre-flight

Consumes:
- nothing (first slice)

### S01 → S03

Produces:
- (same as S01 → S02)
- `scripts/lib/vps2-check.sh` — SSH-based health check assertions reusable by deploy.sh pre-flight

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — server component; fetches health via `InfraService`
- `packages/deployment/src/infra.ts` — `InfraService` class: `getVps2Health()`, `testDeployConnection()` via node-ssh
- `apps/admin/src/app/api/infra/test-connection/route.ts` — POST route handler for "Test Deploy Connection" button

Consumes from S01:
- VPS2 is reachable via SSH over Tailscale (prerequisite for live health fetch)

### S03 → (none)

Produces:
- `scripts/setup-vps1.sh` — VPS1 bootstrap script (Node.js/nvm, pnpm, pm2, Tailscale)
- `scripts/deploy.sh` (modified) — pre-flight check calls `scripts/lib/vps2-check.sh` before rsync

Consumes from S01:
- `scripts/lib/vps2-check.sh` — reused as pre-flight check in deploy.sh

Consumes from S02:
- `InfraService.testDeployConnection()` — wired into deploy.sh logic (shell equivalent of the SSH test)
