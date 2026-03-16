---
id: S02
parent: M011
milestone: M011
---

# S02: Services migration + Settings cleanup — UAT

**Milestone:** M011
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S02 is a services migration — callers wire to DB, builds pass, error strings land in compiled bundles. No live Hetzner server is required. The slice plan explicitly states: "Real runtime required: no (build + typecheck verification is sufficient; `servers` table is empty in the test environment but the code path handles zero-rows gracefully)." Human/UAT deferred to S03 full-flow UAT.

## Preconditions

- Worktree at `/home/daniel/monster/.gsd/worktrees/M011` has packages built in dependency order (shared → domains → seo-scorer → agents → deployment → admin).
- `packages/deployment/dist/` exists (from `pnpm --filter @monster/deployment build`).
- `packages/agents/dist/` exists (from `pnpm --filter @monster/agents build`).
- `apps/admin/.next/` exists (from `pnpm --filter @monster/admin build`).

## Smoke Test

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# All four packages build clean
pnpm --filter @monster/deployment typecheck  # exit 0 (no output)
pnpm --filter @monster/deployment build      # exit 0, 19.72 KB
pnpm --filter @monster/agents build          # exit 0
pnpm --filter @monster/admin build           # exit 0, /infra in route list

# Core invariant: vps2_* gone from all target files
grep -rn "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  packages/deployment/src/infra.ts \
  packages/deployment/src/rsync.ts \
  packages/deployment/src/caddy.ts \
  packages/agents/src/jobs/deploy-site.ts
# Expected: no output
```

## Test Cases

### 1. Settings cleanup — hetzner_api_token present, vps2_* absent

```bash
# Check constants.ts
grep "hetzner_api_token" apps/admin/src/app/\(dashboard\)/settings/constants.ts
# Expected: '  hetzner_api_token,' (present in SETTINGS_KEYS array)

grep -c "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  apps/admin/src/app/\(dashboard\)/settings/constants.ts
# Expected: 0

# Check actions.ts
grep "hetzner_api_token" apps/admin/src/app/\(dashboard\)/settings/actions.ts
# Expected: at least 1 match (in SaveSettingsSchema and SaveSettingsErrors)

grep -c "vps2_" apps/admin/src/app/\(dashboard\)/settings/actions.ts
# Expected: 0

# Check settings-form.tsx
grep "hetzner_api_token" apps/admin/src/app/\(dashboard\)/settings/settings-form.tsx
# Expected: at least 1 match (field render)

grep -c "vps2_\|VPS2 Deployment\|vps2_ip" \
  apps/admin/src/app/\(dashboard\)/settings/settings-form.tsx
# Expected: 0
```

**Expected:** All three files updated; `hetzner_api_token` present; zero `vps2_*` references.

### 2. Deployment package — Server-based service signatures

```bash
# Check RsyncService signature
grep -A5 "deploy(" packages/deployment/src/rsync.ts | head -10
# Expected: async deploy(slug: string, server: Server) — no vps2Host, no vps2User params

# Check CaddyService signature  
grep -A5 "writeVirtualhost(" packages/deployment/src/caddy.ts | head -10
# Expected: async writeVirtualhost(domain: string, slug: string, server: Server) — 3 params

# Check InfraService public API
grep "async get\|async test" packages/deployment/src/infra.ts
# Expected: getFleetHealth() and testDeployConnection(serverId?: string) — no getVps2Health

# Check exports
grep "FleetHealth\|ServerHealth\|Vps2Health" packages/deployment/dist/index.d.ts
# Expected: FleetHealth and ServerHealth exported; Vps2Health absent
```

**Expected:** Both services accept `Server` record; `getVps2Health` gone; `FleetHealth`/`ServerHealth` in d.ts; `Vps2Health` absent.

### 3. Deployment package — Observability strings in compiled bundle

```bash
# Fleet health zero-server path
grep -c "\[InfraService\] fleet health: 0 active servers" packages/deployment/dist/index.js
# Expected: 1

# Per-service no-IP guards
grep -c "\[RsyncService\] server.*has no IP address" packages/deployment/dist/index.js
# Expected: 1 (exact guard message for RsyncService)

grep -c "\[CaddyService\] server.*has no IP address" packages/deployment/dist/index.js
# Expected: 1 (exact guard message for CaddyService)

# Total "has no IP address" occurrences (RsyncService + CaddyService + checkServerHealth)
grep -c "has no IP address" packages/deployment/dist/index.js
# Expected: 3
```

**Expected:** All structured error strings present in the compiled bundle.

### 4. Deploy phase — servers table query, no vps2_* reads

```bash
# Confirm servers table query present in deploy-site.ts
grep "from('servers')" packages/agents/src/jobs/deploy-site.ts
# Expected: at least 1 match

# Confirm vps2_* reads absent
grep -c "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  packages/agents/src/jobs/deploy-site.ts
# Expected: 0

# Confirm cloudflare pre-flight check removed
grep "cloudflare_api_token" packages/agents/src/jobs/deploy-site.ts
# Expected: no match (or only in a comment — CloudflareClient reads its own token internally)

# Confirm Server type imported
grep "import.*Server.*@monster/deployment" packages/agents/src/jobs/deploy-site.ts
# Expected: import type { Server } from '@monster/deployment'
```

**Expected:** `servers` table query present; zero `vps2_*` reads; `cloudflare_api_token` pre-flight removed; `Server` type imported.

### 5. Deploy phase — observability strings in agents bundle

```bash
grep -c "\[DeployPhase\] no active servers found in servers table" packages/agents/dist/worker.js
# Expected: 1

grep -c "\[DeployPhase\] server.*has no IP address" packages/agents/dist/worker.js
# Expected: 1

grep -c "\[DeployPhase\] using server" packages/agents/dist/worker.js
# Expected: 1
```

**Expected:** All three structured log/error strings present in the compiled worker bundle.

### 6. /infra page — fleet table UI with empty state

```bash
# Check fleet table render
grep "FleetHealth\|getFleetHealth" apps/admin/src/app/\(dashboard\)/infra/page.tsx
# Expected: both present (import FleetHealth, call getFleetHealth())

grep "Vps2Health\|getVps2Health" apps/admin/src/app/\(dashboard\)/infra/page.tsx
# Expected: no match

# Check empty-state
grep "No active servers" apps/admin/src/app/\(dashboard\)/infra/page.tsx
# Expected: "No active servers registered yet. Provision a server to get started."

# Confirm /infra in build route list
pnpm --filter @monster/admin build 2>&1 | grep "infra"
# Expected: ƒ /infra    2.54 kB    (or similar)
```

**Expected:** `/infra` uses `FleetHealth`/`getFleetHealth()`; empty-state message present; route in build output.

### 7. Typecheck — full deployment package type safety

```bash
pnpm --filter @monster/deployment typecheck
# Expected: exit 0 with no output (clean)
```

**Expected:** No TypeScript errors after removing Vps2Health and adding Server-based signatures.

## Edge Cases

### Zero active servers in fleet health

The `getFleetHealth()` method must handle an empty `servers` table gracefully:

```bash
# Verify zero-server log path is in compiled code
grep "\[InfraService\] fleet health: 0 active servers — returning empty fleet" \
  packages/deployment/dist/index.js
# Expected: 1 match
```

**Expected:** Empty fleet returned (no throw); log emitted; `/infra` empty-state card rendered.

### Server with null tailscale_ip and null public_ip

```bash
# Verify no-IP guard in RsyncService
grep "\[RsyncService\] server.*has no IP address" packages/deployment/dist/index.js
# Expected: 1 match (structured throw, not silent failure)

# Verify no-IP guard in CaddyService
grep "\[CaddyService\] server.*has no IP address" packages/deployment/dist/index.js
# Expected: 1 match
```

**Expected:** Structured throw with server name; not a silent null dereference.

### Deploy with no active servers

```bash
grep "\[DeployPhase\] no active servers found in servers table" packages/agents/dist/worker.js
# Expected: 1 match (thrown before rsync/caddy are called)
```

**Expected:** Fail fast with structured error; BullMQ job failure reason is actionable.

### test-connection API route with no args

```bash
# Route must not require serverId param
grep "testDeployConnection" apps/admin/src/app/api/infra/test-connection/route.ts
# Expected: infra.testDeployConnection() — called with no args (auto-resolve path)
```

**Expected:** Route passes no serverId; `testDeployConnection()` auto-resolves to first active server from DB.

## Failure Signals

- `vps2_host` or `vps2_user` found in any of the four target files → T02/T03 changes not applied
- `Vps2Health` appears in `packages/deployment/dist/index.d.ts` → index.ts not updated
- `getVps2Health` found in `infra/page.tsx` → T03 page update not applied
- `pnpm --filter @monster/deployment typecheck` exits non-zero → type incompatibility introduced
- `pnpm --filter @monster/admin build` exits non-zero → caller type error (likely Server shape mismatch)
- `/infra` missing from admin build route list → page.tsx compile failure
- `grep -c "[DeployPhase] no active servers"` returns 0 → agents build not rebuilt after T03 changes

## Requirements Proved By This UAT

- **R006 (partial)** — Deploy pipeline no longer tied to hardcoded VPS2 settings; reads from `servers` table; existing deployment services are now multi-server-capable at the code level. Full operational proof (actual rsync to real VPS after provisioning) deferred to S03 live UAT.

## Not Proven By This UAT

- **Live deploy with a real server record:** This UAT is artifact-driven (build + grep). A live test with a real Hetzner server in `servers` table is deferred to S03 UAT.
- **Settings UI renders correctly at runtime:** `hetzner_api_token` field presence in the DOM is not verified here — only source-level. Verified visually in S03 when admin panel runs on VPS1.
- **Fleet SSH health with a real server:** `getFleetHealth()` SSH execution against a live VPS is deferred to S03.
- **`testDeployConnection()` with a real server:** Auto-resolve from DB + SSH connection test against real server deferred to S03.

## Notes for Tester

- All checks above are grep/build commands — no running process needed.
- If any check fails, the most likely cause is that the packages were not rebuilt after source changes. Run the build chain in order: `deployment` → `agents` → `admin`.
- The `/api/infra/provision` route appears in the admin build output (`ƒ /api/infra/provision`) but contains a stub handler. This is expected — S03 implements the real provision endpoint.
- `cloudflare_api_token` is intentionally absent from the Settings form's VPS2 section removal — it was always in the API Keys section. Confirm it still appears there in the form source.
