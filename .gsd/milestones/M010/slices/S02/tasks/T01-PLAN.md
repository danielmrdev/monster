---
estimated_steps: 7
estimated_files: 3
---

# T01: InfraService in packages/deployment

**Slice:** S02 — Admin Infra Health Page
**Milestone:** M010

## Description

Add `InfraService` class to `packages/deployment/src/infra.ts`. Two methods: `getVps2Health()` SSHes into VPS2 via SSH agent, runs three commands, and returns a typed `Vps2Health` object. `testDeployConnection()` does a minimal SSH round-trip and returns `{ ok, error? }`. Both read `vps2_host` and `vps2_user` from Supabase settings (D028 pattern). Export both from the package index.

## Steps

1. Read `packages/deployment/src/index.ts` and `packages/deployment/src/caddy.ts` for existing patterns.
2. Create `packages/deployment/src/infra.ts`.
3. Define `Vps2Health` interface: `{ reachable: boolean, caddyActive: boolean, diskUsedPct: number | null, memUsedMb: number | null, memTotalMb: number | null, fetchedAt: string, error?: string }`.
4. Implement `getVps2Health()`: read `vps2_host` + `vps2_user` from Supabase (createServiceClient); create NodeSSH connection with SSH agent; run `systemctl is-active caddy` → `caddyActive = stdout.trim() === 'active'`; run `df -h / | tail -1 | awk '{print $5}'` → parse disk percent (strip `%`); run `free -m | awk '/^Mem:/{print $3, $2}'` → parse mem used and total. Dispose SSH connection in finally. Return typed object. On SSH connection failure, return `{ reachable: false, caddyActive: false, diskUsedPct: null, memUsedMb: null, memTotalMb: null, fetchedAt: now, error: err.message }`.
5. Implement `testDeployConnection()`: same SSH settings, run `echo ok`, dispose in finally. Return `{ ok: true }` or `{ ok: false, error: err.message }`.
6. Export `InfraService` and `Vps2Health` from `packages/deployment/src/index.ts`.
7. Rebuild: `pnpm --filter @monster/deployment build`.

## Must-Haves

- [ ] `Vps2Health` interface exported from `@monster/deployment`
- [ ] `InfraService.getVps2Health()` returns `Vps2Health` with `reachable: false` on SSH failure (no throw)
- [ ] `InfraService.testDeployConnection()` returns `{ ok, error? }` (no throw)
- [ ] `pnpm --filter @monster/deployment build` exits 0

## Verification

- `pnpm --filter @monster/deployment build` exits 0
- TypeScript resolves `InfraService` import from `@monster/deployment` in a test import

## Inputs

- `packages/deployment/src/caddy.ts` — NodeSSH pattern to follow (D070)
- `packages/deployment/src/index.ts` — add exports here
- `packages/db` — `createServiceClient` for settings read

## Expected Output

- `packages/deployment/src/infra.ts` — InfraService class, ~100 lines
- `packages/deployment/src/index.ts` — updated with InfraService and Vps2Health exports

## Observability Impact

- **New log lines:** `[InfraService]` prefixed console logs for SSH connection attempts, health metric results (caddy status, disk %, memory), and connection test outcomes.
- **Inspection:** Callers (API routes) can inspect the returned `Vps2Health` or `{ ok, error? }` objects. Errors are always surfaced in the `error` field — never swallowed.
- **Failure visibility:** SSH failures, missing settings, and unexpected command output all produce structured error objects with descriptive messages. No method throws — all failures are returned as typed error values.
- **Redaction:** VPS2 host and user are read from Supabase settings at runtime. Host/user values are not logged (only `[InfraService] connecting to VPS2 via SSH agent`).
