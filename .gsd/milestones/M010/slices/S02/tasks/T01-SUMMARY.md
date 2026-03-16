---
id: T01
parent: S02
milestone: M010
provides:
  - InfraService class with getVps2Health() and testDeployConnection() methods
  - Vps2Health type exported from @monster/deployment
key_files:
  - packages/deployment/src/infra.ts
  - packages/deployment/src/index.ts
  - packages/deployment/package.json
  - packages/deployment/tsup.config.ts
key_decisions:
  - InfraService reads settings internally (unlike CaddyService/RsyncService which receive params) per plan requirement
  - Added @monster/db as workspace dependency of @monster/deployment for Supabase settings access
  - Settings value extraction uses correct (s.value as { value?: string })?.value pattern (not the lossy cast in deploy-site.ts)
patterns_established:
  - InfraService never-throw pattern: both methods return structured error objects instead of throwing
  - readVps2Settings() shared helper extracts vps2_host/vps2_user from Supabase settings table
observability_surfaces:
  - "[InfraService]" prefixed console logs for SSH connection, health metrics, and test results
  - Vps2Health.error field surfaces SSH failures as structured data
  - testDeployConnection() returns { ok: false, error: "..." } on any failure
duration: 12m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T01: InfraService in packages/deployment

**Added InfraService with getVps2Health() and testDeployConnection() — both read VPS2 settings from Supabase, SSH via agent, never throw**

## What Happened

Created `packages/deployment/src/infra.ts` with the `InfraService` class and `Vps2Health` interface. Two methods:

1. `getVps2Health()` — reads `vps2_host`/`vps2_user` from Supabase settings, SSHes into VPS2, runs `systemctl is-active caddy`, `df -h /`, and `free -m`, parses results into a typed `Vps2Health` object. Returns `{ reachable: false, error }` on any failure.

2. `testDeployConnection()` — same SSH setup, runs `echo ok`, returns `{ ok: true }` or `{ ok: false, error }`.

Both follow the CaddyService SSH agent pattern (`SSH_AUTH_SOCK`) and use `createServiceClient` from `@monster/db` for settings access. A shared `readVps2Settings()` helper extracts settings using the correct `(s.value as { value?: string })?.value` pattern.

Added `@monster/db` as a workspace dependency and marked it as external in tsup config.

## Verification

- `pnpm --filter @monster/deployment build` → exits 0, `dist/index.d.ts` exports `InfraService`, `Vps2Health`, `CaddyService`, `RsyncService`
- `pnpm --filter @monster/deployment typecheck` → exits 0
- Node ESM test import confirms `InfraService` is a function with `getVps2Health` and `testDeployConnection` on prototype
- Slice verification partial:
  - ✅ `pnpm --filter @monster/deployment build` exits 0 with `InfraService` exported
  - ⏳ `pnpm -r build` — pre-existing failures in `@monster/generator` and `@monster/analytics` (unrelated to this change)
  - ⏳ `pnpm -r typecheck` — not run (depends on full build)
  - ⏳ Human UAT — requires T02/T03 (UI pages)

## Diagnostics

- `[InfraService]` prefixed log lines in console for SSH connection, caddy status, disk/mem parsing
- `Vps2Health.error` and `testDeployConnection().error` fields surface failure details as structured data
- Both methods guarantee no throw — callers never need try/catch

## Deviations

- Added `@monster/db` as workspace dependency (not explicitly in plan but required for `createServiceClient` import)
- Used correct settings value extraction pattern `(s.value as { value?: string })?.value` instead of the lossy `s.value as string` cast seen in deploy-site.ts

## Known Issues

- Pre-existing: `pnpm -r build` fails on `@monster/generator` (missing `site.json`) and `@monster/analytics` (esbuild issue) — not related to this task

## Files Created/Modified

- `packages/deployment/src/infra.ts` — new: InfraService class + Vps2Health interface (~160 lines)
- `packages/deployment/src/index.ts` — added InfraService + Vps2Health exports
- `packages/deployment/package.json` — added @monster/db workspace dependency
- `packages/deployment/tsup.config.ts` — added @monster/db to external array
- `.gsd/milestones/M010/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
