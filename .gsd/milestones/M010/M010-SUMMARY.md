---
id: M010
provides:
  - scripts/setup-vps2.sh — idempotent 7-step VPS2 bootstrap (Tailscale, Caddy, sites dirs, sudoers)
  - scripts/lib/vps2-check.sh — reusable VPS2 health checker (local + remote SSH modes)
  - scripts/setup-vps1.sh — idempotent 6-step VPS1 bootstrap (Tailscale, nvm, pnpm, pm2, monorepo)
  - scripts/deploy.sh — pre-flight SSH + Caddy health gate before rsync
  - /infra admin page — live VPS2 health dashboard (reachability, Caddy, disk, memory)
  - InfraService class in @monster/deployment — getVps2Health(), testDeployConnection()
  - POST /api/infra/test-connection — structured pass/fail for deploy SSH path
key_decisions:
  - "D135: setup-vps2.sh is idempotent — safe to re-run on a configured VPS"
  - "D136: vps2-check.sh supports --local mode for on-VPS self-check and remote SSH mode"
  - "D137: Caddy start warning treated as non-fatal — empty sites/* may cause degraded start"
  - "D138: /bin/systemctl full path in sudoers — required on Ubuntu 24.04"
  - "D139: InfraService reads settings internally (self-contained)"
  - "D140: webpack.externals + serverExternalPackages both needed for node-ssh/ssh2/cpu-features"
  - "D141: setup-vps1.sh mirrors setup-vps2.sh patterns for consistency"
  - "D142: setup-vps1.sh runs as regular user (sudo only for Tailscale)"
  - "D143: deploy.sh pre-flight inlines SSH check instead of sourcing vps2-check.sh"
patterns_established:
  - "VPS setup scripts share log()/step() helpers, --tailscale-key arg parsing, banner format — consistent operator UX"
  - "InfraService never-throw pattern: both methods return structured error objects instead of throwing"
  - "Webpack externals for native SSH modules in next.config.ts — covers any future route importing @monster/deployment"
  - "deploy.sh pre-flight [pre-flight] ✓/✗/⏭ log lines — agents grep for deploy readiness"
  - ".vps2.env file sourced by deploy.sh for local VPS2 connection overrides (not committed)"
observability_surfaces:
  - "/infra admin page — single pane of glass for VPS2 health (reachability, Caddy, disk, memory)"
  - "POST /api/infra/test-connection — { ok: boolean, error?: string } structured SSH test result"
  - "[InfraService] prefixed console logs trace SSH connections and metric collection"
  - "setup-vps2.sh summary banner prints postcondition check results"
  - "setup-vps1.sh summary banner prints installed versions for post-run audit"
  - "deploy.sh [pre-flight] ✓/✗/⏭ structured log lines"
requirement_outcomes:
  - id: R006
    from_status: active
    to_status: active
    proof: "Deployment operability improved — VPS2 is now reproducibly provisioned, operator can verify health from admin panel, deploy.sh validates VPS2 before rsync. R006 remains active (full Cloudflare automation pipeline validation pending)."
duration: 97m
verification_result: passed
completed_at: 2026-03-16
---

# M010: VPS Hetzner Provisioning

**Reproducible VPS provisioning scripts (VPS1 + VPS2), admin /infra health dashboard with live SSH metrics, and deploy.sh pre-flight gate — eliminating tribal knowledge from infrastructure operations.**

## What Happened

Three slices delivered a coherent provisioning + monitoring + deploy-safety story for both VPS servers.

**S01 (VPS2 Bootstrap Script)** produced `scripts/setup-vps2.sh` (349 lines, 7 idempotent steps) that takes a fresh Ubuntu 24.04 VPS from bare OS to fully operational Caddy sites server. Steps: system update → Tailscale install + join → Caddy install (official apt repo) → Caddyfile with `import sites/*` → `/etc/caddy/sites/` + `/var/www/sites/` directories → sudoers entry for passwordless `systemctl reload caddy` → Caddy service enable. Every step checks before acting (idempotent). `scripts/lib/vps2-check.sh` (122 lines) validates 5 postconditions and supports both `--local` mode (run on VPS2 itself) and remote SSH mode (run from VPS1).

**S02 (Admin Infra Health Page)** built the `/infra` admin page with `InfraService` in `packages/deployment`. `getVps2Health()` SSHes into VPS2 via Tailscale, runs `systemctl is-active caddy`, `df -h /`, `free -m`, and returns a typed `Vps2Health` object. `testDeployConnection()` verifies the SSH path used by RsyncService/CaddyService. Both methods never throw — they return structured error objects. The page renders 4 status cards (reachability, Caddy, disk, memory) and a "Test Deploy Connection" button (`TestConnectionButton` client component with loading/pass/fail states). Webpack externals config (D140) covers native SSH modules imported transitively via workspace packages.

**S03 (VPS1 Setup Script + Deploy Pre-flight)** produced `scripts/setup-vps1.sh` (248 lines, 6 steps: Tailscale → nvm + Node.js 22 → pnpm + pm2 → monorepo clone → deps install + build → pm2 start + save + startup). Mirrors VPS2 script patterns exactly (D141). Extended `scripts/deploy.sh` with a ~30-line pre-flight section: three-way branch handles `SKIP_VPS2_CHECK=1` (CI escape hatch), empty `VPS2_HOST` (backward compatibility), or set `VPS2_HOST` (SSH + Caddy check with actionable error on failure).

## Cross-Slice Verification

**Success Criterion 1:** `bash scripts/setup-vps2.sh <host> <user>` on fresh Ubuntu 24.04 produces fully functional VPS2.
- ✅ `bash -n scripts/setup-vps2.sh` exits 0 (syntax valid)
- ✅ Script covers all 7 required steps: system update, Tailscale join, Caddy install, Caddyfile with `import sites/*`, `/etc/caddy/sites/` + `/var/www/sites/` directories, sudoers entry, Caddy service enable
- ✅ `--tailscale-key` accepted as parameter; `--deploy-user` optional with default
- ✅ Self-check via `vps2-check.sh` embedded at script end
- ⬜ Live run on actual fresh VPS deferred to operator UAT

**Success Criterion 2:** Admin `/infra` page shows VPS2 reachability, Caddy status, disk, memory — all live via SSH.
- ✅ `apps/admin/src/app/(dashboard)/infra/page.tsx` renders 4 status cards (VPS2 Reachability, Caddy Service, Disk Usage, Memory)
- ✅ `InfraService.getVps2Health()` fetches live data via SSH over Tailscale
- ✅ Page renders gracefully when VPS2 unreachable (structured error banner, not 500)
- ✅ `/infra` nav item present in NavSidebar with Server icon
- ✅ `pnpm --filter @monster/admin build` exits 0 with `/infra` in route list

**Success Criterion 3:** "Test Deploy Connection" button confirms SSH path works with clear pass/fail.
- ✅ `TestConnectionButton` client component with loading spinner and inline ✓/✗ badge
- ✅ `POST /api/infra/test-connection` returns `{ ok: boolean, error?: string }`
- ✅ `InfraService.testDeployConnection()` runs `echo ok` over same SSH path as RsyncService/CaddyService

**Success Criterion 4:** `scripts/setup-vps1.sh` documents and automates VPS1 setup.
- ✅ `bash -n scripts/setup-vps1.sh` exits 0 (syntax valid)
- ✅ 6 steps cover: Tailscale, nvm + Node.js 22, pnpm + pm2, git clone, pnpm install + build, pm2 start + save + startup
- ✅ `--help` prints usage; no args exits non-zero with error
- ✅ Runs as regular user (sudo only for Tailscale)
- ⬜ Live run on actual fresh VPS deferred to operator UAT

**Success Criterion 5:** `deploy.sh` pre-flight check verifies SSH + Caddy before rsync.
- ✅ `bash -n scripts/deploy.sh` exits 0 (syntax valid)
- ✅ Three-branch logic: `SKIP_VPS2_CHECK=1` → skip, empty `VPS2_HOST` → skip (backward compat), set → SSH + Caddy check
- ✅ Failure exits 1 with actionable error naming VPS2_HOST, VPS2_USER, Tailscale status
- ✅ `[pre-flight] ✓/✗/⏭` structured log lines

**Definition of Done checklist:**
- ✅ `scripts/setup-vps2.sh` covers all required steps
- ✅ `scripts/setup-vps1.sh` documents VPS1 setup as a runnable script
- ✅ Admin `/infra` page fetches and displays VPS2 health live
- ✅ "Test Deploy Connection" button runs real SSH check with pass/fail
- ✅ `deploy.sh` pre-flight verifies SSH + Caddy before rsync
- ✅ `pnpm --filter @monster/admin build` exits 0
- ✅ `pnpm --filter @monster/deployment typecheck` exits 0
- ✅ `pnpm --filter @monster/admin exec tsc --noEmit` exits 0
- ⬜ Live VPS2 script execution + green health indicators — deferred to operator UAT

## Requirement Changes

- R006: active → active — Deployment operability significantly improved: VPS2 is now reproducibly provisioned via script, operator can verify VPS2 health from admin panel before and after deploys, deploy.sh validates VPS2 connectivity before rsyncing. R006 remains active because the full deployment automation pipeline (Cloudflare zone + SSL validation end-to-end) is not yet validated with a live deploy.

## Forward Intelligence

### What the next milestone should know
- Both VPS setup scripts require `--tailscale-key` as a required argument — operator needs a Tailscale auth key from the admin console before running either script.
- `InfraService` in `packages/deployment/src/infra.ts` uses `readVps2Settings()` to fetch `vps2_host`/`vps2_user` from Supabase settings. The settings value extraction pattern is `(s.value as { value?: string })?.value` — non-obvious and differs from the lossy `s.value as string` cast in `deploy-site.ts`. If settings value structure changes, both patterns need updating.
- `ssh2` native module externalization requires both `serverExternalPackages` AND `webpack.externals` (D140) — forgetting either causes build failure with cryptic binary parse errors.
- `vps2-check.sh` is a comprehensive diagnostic tool for VPS2 health; `deploy.sh` pre-flight inlines a simpler pass/fail gate (D143) — these are independent implementations of the same SSH check.
- Caddy may start in degraded state on a fresh VPS with no sites configured (empty `sites/*` glob). First site deploy resolves this.

### What's fragile
- pm2 startup command capture in `setup-vps1.sh` (`pm2 startup 2>&1 | grep "sudo" | head -1`) depends on pm2's stdout format — if pm2 changes output, the `eval` step silently becomes a no-op.
- nvm source path (`[ -s "${NVM_DIR}/nvm.sh" ] && \. "${NVM_DIR}/nvm.sh"`) must run before any `nvm` command in non-interactive shell — correct but easy to break if script is reordered.
- nvm v0.40.1 is pinned — may need updating.

### Authoritative diagnostics
- `bash scripts/setup-vps2.sh --help` / `bash scripts/setup-vps1.sh --help` — confirms scripts are accessible and arg parsing works without executing
- `curl -X POST /api/infra/test-connection` — returns `{ ok, error? }` with structured SSH error detail; fastest way to verify deploy SSH path
- `/infra` page in browser — single pane of glass for VPS2 health
- `grep "[pre-flight]" <deploy_output>` — confirms deploy.sh pre-flight ran and shows pass/fail/skip

### What assumptions changed
- Assumed `serverExternalPackages` alone handles native module externalization — actually need explicit `webpack.externals` too for workspace package transitive deps (D140)
- Assumed `@monster/deployment` was already in admin's package.json from M004 — it wasn't; had to add it

## Files Created/Modified

- `scripts/setup-vps2.sh` — 349-line idempotent VPS2 bootstrap (7 steps, Tailscale + Caddy + sites dirs + sudoers)
- `scripts/lib/vps2-check.sh` — 122-line reusable VPS2 health checker (local + remote SSH modes)
- `scripts/setup-vps1.sh` — 248-line idempotent VPS1 bootstrap (6 steps, Tailscale + nvm + pnpm + pm2 + monorepo)
- `scripts/deploy.sh` — extended with ~30-line VPS2 pre-flight SSH + Caddy health check
- `packages/deployment/src/infra.ts` — InfraService class with getVps2Health() + testDeployConnection() (~160 lines)
- `packages/deployment/src/index.ts` — added InfraService + Vps2Health exports
- `packages/deployment/package.json` — added @monster/db workspace dependency
- `packages/deployment/tsup.config.ts` — added @monster/db to external array
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — async server component with 4 health cards
- `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` — client component for deploy connection testing
- `apps/admin/src/app/api/infra/test-connection/route.ts` — POST route handler
- `apps/admin/src/components/nav-sidebar.tsx` — added Server icon import + /infra nav item
- `apps/admin/next.config.ts` — added serverExternalPackages + webpack.externals for SSH native modules
- `apps/admin/package.json` — added @monster/deployment workspace dependency
