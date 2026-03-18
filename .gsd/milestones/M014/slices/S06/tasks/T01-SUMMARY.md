---
id: T01
parent: S06
milestone: M014
provides:
  - is_local migration applied to servers table
  - servers.Row/Insert/Update types updated with is_local field
  - InfraService local-mode execSync branch with per-call try/catch
key_files:
  - packages/db/supabase/migrations/20260318120000_servers_is_local.sql
  - packages/db/src/types/supabase.ts
  - packages/deployment/src/infra.ts
key_decisions:
  - checkServerHealthLocal is a private method (not inline) for clarity and testability
  - getFleetHealth passes is_local via explicit object spread to satisfy TS inline type shape
  - Each execSync call individually try/caught; inactive Caddy (exit code 3) recovers stdout from error object
  - Rebuilt @monster/db before @monster/deployment — supabase.ts source changes only take effect after dist/ rebuild
patterns_established:
  - execSync error objects carry stdout/stderr even on non-zero exits — cast to { stdout?: string } to recover
  - Monorepo dependency rebuild order: packages/db build must precede packages/deployment build when types change
observability_surfaces:
  - "[InfraService] local-mode metrics for \"<name>\"" — logged to server stdout on every successful local health check
  - "[InfraService] local-mode error for \"<name>\": <msg>" — logged to stderr on execSync failure; also surfaced in ServerHealth.error field returned to /infra API
  - /infra page: reachable:true + numeric disk/mem values visible for any server with is_local=true
duration: 25m
verification_result: passed
completed_at: 2026-03-18T21:10:00Z
blocker_discovered: false
---

# T01: Add is_local migration and wire local-mode execSync in InfraService

**Added `is_local` column to servers table and wired InfraService to collect disk/memory/Caddy metrics via execSync instead of SSH when the server is the local machine.**

## What Happened

Created the SQL migration file, updated the Supabase TypeScript types, and rewrote `InfraService.checkServerHealth()` to short-circuit to `checkServerHealthLocal()` when `server.is_local === true`. The local method uses three `execSync` calls — one per metric — each wrapped individually in try/catch. The `systemctl is-active caddy` command exits non-zero (code 3) when Caddy is inactive, which causes `execSync` to throw; the inner catch recovers stdout from the error object to get the `"inactive"` string rather than propagating the exception.

`getFleetHealth()` now spreads the server row into an explicit object that includes `is_local: server.is_local ?? false`, satisfying the inline type shape accepted by `checkServerHealth()`.

The `@monster/db` package had to be rebuilt before the deployment package because the Supabase type changes live in `src/types/supabase.ts` and only propagate downstream via `dist/index.d.ts`. A first `pnpm --filter @monster/deployment build` failed with TS2339 on `is_local`; rebuilding db first resolved it.

The migration was applied via `npx supabase db push --db-url <explicit-url>` (not via env-var expansion in the shell invocation, which failed). The CLI prompted for confirmation and applied `20260318120000_servers_is_local.sql` successfully.

## Verification

All T01 checks passed:

- Migration file exists and contains correct `ALTER TABLE` SQL
- `grep "is_local" packages/db/src/types/supabase.ts` returns three matches (Row non-optional, Insert optional, Update optional)
- `pnpm --filter @monster/deployment build` exits 0, DTS succeeds
- Failure-path log strings present in source (`local-mode metrics` and `local-mode error`)
- Migration applied to remote Supabase DB: `Applying migration 20260318120000_servers_is_local.sql... Finished supabase db push.`

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `ls packages/db/supabase/migrations/20260318120000_servers_is_local.sql` | 0 | ✅ pass | <1s |
| 2 | `grep "is_local" packages/db/src/types/supabase.ts` | 0 | ✅ pass | <1s |
| 3 | `cd packages/db && npx supabase db push --db-url <url>` | 0 | ✅ pass | ~4s |
| 4 | `pnpm --filter @monster/deployment build` | 0 | ✅ pass | 2.6s |
| 5 | `grep "local-mode" packages/deployment/src/infra.ts` | 0 | ✅ pass | <1s |

## Diagnostics

- **Success signal:** `[InfraService] local-mode metrics for "<name>"` in admin server stdout during any `/infra` health poll for a server with `is_local=true`
- **Failure signal:** `[InfraService] local-mode error for "<name>": <message>` in stderr; `/infra` page shows that server as `reachable: false` with the error string
- **To activate for hel1:** `PATCH /rest/v1/servers?name=eq.hel1` with body `{"is_local": true}` via Supabase dashboard or REST API (requires service_role key)
- **Inspect built types:** `grep is_local packages/db/dist/index.d.ts` confirms the type is present in the compiled output

## Deviations

- `@monster/db` must be rebuilt before `@monster/deployment` when `supabase.ts` changes — the plan did not mention this dependency. First build attempt of deployment package failed with TS2339; fixed by running `pnpm --filter @monster/db build` first.
- `SUPABASE_DB_URL` env var expansion in the shell invocation (`npx supabase db push --db-url $SUPABASE_DB_URL`) failed with local socket error; passing the URL literal inline worked correctly.

## Known Issues

None. The manual step to set `is_local=true` on the hel1 row is intentionally left to the operator (documented above).

## Files Created/Modified

- `packages/db/supabase/migrations/20260318120000_servers_is_local.sql` — new migration; adds `is_local boolean NOT NULL DEFAULT false` to servers
- `packages/db/src/types/supabase.ts` — `servers.Row` gains `is_local: boolean`; Insert and Update gain `is_local?: boolean`
- `packages/deployment/src/infra.ts` — `execSync` import added; `checkServerHealth` parameter shape adds `is_local: boolean`; local-mode early return; new `checkServerHealthLocal` private method; `getFleetHealth` passes `is_local` field
- `.gsd/milestones/M014/slices/S06/S06-PLAN.md` — added failure-path diagnostic verification step to address pre-flight observability gap
