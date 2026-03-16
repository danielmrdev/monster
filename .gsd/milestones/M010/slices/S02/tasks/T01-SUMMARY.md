---
id: T01
parent: S02
milestone: M010
provides:
  - InfraService class in packages/deployment/src/infra.ts
  - Vps2Health interface: { reachable, caddyActive, diskUsedPct, memUsedMb, memTotalMb, fetchedAt, error? }
  - ConnectionTestResult interface: { ok, error? }
  - getVps2Health() — SSH health fetch; returns { reachable: false } on SSH failure (no throw)
  - testDeployConnection() — SSH echo round-trip; returns { ok, error? } (no throw)
key_files:
  - packages/deployment/src/infra.ts
  - packages/deployment/src/index.ts
  - packages/deployment/tsup.config.ts
  - packages/deployment/package.json
key_decisions:
  - "Added @monster/db to packages/deployment dependencies (workspace:*) to resolve DTS types"
  - "Added @monster/db to tsup external list alongside node-ssh"
  - "Both methods never throw — they return typed error objects for graceful UI degradation"
patterns_established:
  - "InfraService follows CaddyService NodeSSH + SSH agent pattern (D070/D071)"
  - "Settings read via fetchVps2Settings() — D028 pattern, reads vps2_host and vps2_user in one query"
drill_down_paths:
  - .gsd/milestones/M010/slices/S02/tasks/T01-PLAN.md
duration: 20min
verification_result: pass
completed_at: 2026-03-16T13:35:00Z
---

# T01: InfraService in packages/deployment — SSH health fetch + connection test

**`InfraService` with `getVps2Health()` and `testDeployConnection()` exported from `@monster/deployment`; build passes.**

## What Happened

Created `packages/deployment/src/infra.ts` with `InfraService` class following the `CaddyService` NodeSSH + SSH agent pattern (D070/D071). `fetchVps2Settings()` reads `vps2_host` and `vps2_user` from Supabase settings in one query (D028 pattern).

`getVps2Health()` runs three SSH commands: `systemctl is-active caddy` (parses `active` → boolean), `df -h / | tail -1 | awk '{print $5}'` (disk percent), `free -m | awk '/^Mem:/{print $3, $2}'` (mem used/total). Disposes SSH in `finally`. On any SSH failure returns `{ reachable: false, error }` — never throws.

`testDeployConnection()` opens an SSH connection, runs `echo ok`, disposes. Returns `{ ok: true }` or `{ ok: false, error }`.

Exported both class and interfaces from `packages/deployment/src/index.ts`.

**Build fix:** `@monster/db` was missing from `packages/deployment`'s dependencies — added as `workspace:*`. Also added to tsup `external` list alongside `node-ssh`. DTS build then resolved successfully.

## Deviations

None from plan.

## Files Created/Modified

- `packages/deployment/src/infra.ts` — new, ~200 lines
- `packages/deployment/src/index.ts` — added InfraService + type exports
- `packages/deployment/tsup.config.ts` — added @monster/db to external list
- `packages/deployment/package.json` — added @monster/db workspace dep
- `pnpm-lock.yaml` — updated
