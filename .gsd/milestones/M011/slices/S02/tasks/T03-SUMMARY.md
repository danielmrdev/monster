---
id: T03
parent: S02
milestone: M011
provides:
  - runDeployPhase() queries servers table (no vps2_* settings reads)
  - rsync.deploy(slug, server) and caddy.writeVirtualhost(domain, slug, server) called with Server record
  - /infra page renders FleetHealth fleet table with empty-state handling
  - pnpm --filter @monster/agents build exits 0
  - pnpm --filter @monster/admin build exits 0 with /infra route present
  - T01 settings cleanup applied (hetzner_api_token added, vps2_* removed from constants/actions/form)
key_files:
  - packages/agents/src/jobs/deploy-site.ts
  - apps/admin/src/app/(dashboard)/infra/page.tsx
  - apps/admin/src/app/api/infra/test-connection/route.ts
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - Applied T01 settings cleanup in T03 (T01 was marked done in S02-PLAN but never executed)
  - cloudflare_api_token settings pre-flight check removed entirely per plan — CloudflareClient reads its own token via D028
  - server cast as Server type-only import (Supabase row satisfies the shape at runtime)
patterns_established:
  - DeployPhase servers-table pattern: query first active server, throw structured error if none, log selection before rsync
observability_surfaces:
  - "[DeployPhase] using server \"<name>\" (<host>)" — server selection confirmation before rsync
  - "[DeployPhase] no active servers found in servers table" — structured error on empty server pool
  - "[DeployPhase] server \"<name>\" has no IP address" — missing IP guard
duration: 40m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Caller updates — deploy-site.ts, infra/page.tsx, test-connection route; admin build

**Updated all callers to use Server-based service signatures; removed all vps2_* settings reads from runDeployPhase(); replaced /infra single-server card with fleet table; both agents and admin builds pass clean.**

## What Happened

Applied changes across three primary files plus the T01 settings cleanup that was marked done but never executed:

1. **`deploy-site.ts`**: Replaced the 5-key settings read block (`vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`, `cloudflare_api_token`) with a single `servers` table query (first active server, ordered by `created_at`). Added `[DeployPhase] no active servers found` throw guard and `[DeployPhase] server "name" has no IP address` throw guard. Added `[DeployPhase] using server "<name>" (<host>)` log before rsync. Updated `rsync.deploy(slug, server)` and `caddy.writeVirtualhost(domain, slug, server)` to pass the Server record directly. Updated Cloudflare A record to use `server.public_ip`. Added `import type { Server } from '@monster/deployment'`.

2. **`infra/page.tsx`**: Replaced `Vps2Health` import with `FleetHealth`. Replaced `getVps2Health()` with `getFleetHealth()`. Replaced the 4-card single-server grid with a fleet table showing Name, Reachable, Caddy, Disk, Memory columns. Added empty-state card for zero servers. Updated page subtitle to "Live health status of all registered servers". Updated error card title to "Fleet Health Error".

3. **`test-connection/route.ts`**: No changes needed — already calls `infra.testDeployConnection()` with no args which matches the new auto-resolve signature.

4. **T01 settings cleanup** (applied because T01 was marked `[x]` in S02-PLAN but no summary existed and the files were unmodified): Updated `constants.ts` to 6-key SETTINGS_KEYS with `hetzner_api_token` replacing all 4 `vps2_*` keys. Updated `actions.ts` `SaveSettingsSchema` and `SaveSettingsErrors`. Updated `settings-form.tsx` to remove the entire "VPS2 Deployment" card and `vps2_ip` field, add `hetzner_api_token` password field under API Keys card.

5. **S02-PLAN Verification section**: Added T03 DeployPhase failure-path observability checks (`grep` for `[DeployPhase]` structured error strings in agents dist bundle) per the pre-flight requirement.

## Verification

```bash
# No vps2_* in deploy-site.ts
grep -c "vps2_host|vps2_user|vps2_sites_root|vps2_ip" packages/agents/src/jobs/deploy-site.ts
# → 0

# All service files clean
grep -rn "vps2_host|vps2_user|vps2_sites_root|vps2_ip" packages/deployment/src/infra.ts \
  packages/deployment/src/rsync.ts packages/deployment/src/caddy.ts \
  packages/agents/src/jobs/deploy-site.ts
# → no matches

# agents build
pnpm --filter @monster/agents build  # → exit 0

# admin build
pnpm --filter @monster/admin build   # → exit 0, /infra in route list

# T01 clean
grep "vps2_" apps/admin/src/app/(dashboard)/settings/constants.ts   # 0 lines
grep "vps2_" apps/admin/src/app/(dashboard)/settings/actions.ts      # 0 lines
grep "vps2_" apps/admin/src/app/(dashboard)/settings/settings-form.tsx  # 0 lines
grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts  # present

# FleetHealth present, Vps2Health absent
grep "FleetHealth" packages/deployment/dist/index.d.ts  # present
grep "Vps2Health" packages/deployment/dist/index.d.ts   # absent

# DeployPhase observability in agents dist
grep -c "[DeployPhase] no active servers found in servers table" packages/agents/dist/worker.js   # 1
grep -c "[DeployPhase] server.*has no IP address" packages/agents/dist/worker.js                  # 1
grep -c "[DeployPhase] using server" packages/agents/dist/worker.js                               # 1
```

All checks passed.

## Diagnostics

**Inspecting DeployPhase server selection at runtime:**
```bash
# Check active server pool
createServiceClient().from('servers').select('*').eq('status','active')
```

**Structured log signals:**
- `[DeployPhase] using server "<name>" (<host>)` — confirms which server was selected
- `[DeployPhase] no active servers found in servers table` — deploy will fail; add a server record with `status='active'`
- `[DeployPhase] server "<name>" has no IP address` — server row has both `tailscale_ip` and `public_ip` as null

**Fleet health at `/infra`:**
- Zero servers: empty-state card shown
- One+ servers: table with per-server SSH health metrics
- SSH failure: server row shows `reachable: No` with null metrics

## Deviations

**T01 applied in T03**: T01 was marked `[x]` in S02-PLAN.md but no T01-SUMMARY.md existed and the settings files were unmodified. Applied T01's three-file changes (constants.ts, actions.ts, settings-form.tsx) within T03 to satisfy the slice-level verification requirement (`grep "hetzner_api_token" constants.ts` must return a match). This is a catch-up deviation, not a plan conflict.

## Known Issues

None.

## Files Created/Modified

- `packages/agents/src/jobs/deploy-site.ts` — replaced vps2_* settings reads with servers table query; updated rsync/caddy calls to pass Server record; updated CF A record to use server.public_ip; added Server type import
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — replaced Vps2Health/getVps2Health with FleetHealth/getFleetHealth; fleet table UI with empty state
- `apps/admin/src/app/api/infra/test-connection/route.ts` — unchanged (already correct)
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — T01: removed vps2_* keys, added hetzner_api_token
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — T01: removed vps2_* from schema and error type, added hetzner_api_token
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — T01: removed VPS2 Deployment card and vps2_ip field, added hetzner_api_token field
- `.gsd/milestones/M011/slices/S02/S02-PLAN.md` — marked T03 done; added DeployPhase failure-path observability checks to Verification section
