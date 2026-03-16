---
id: T01
parent: S01
milestone: M011
provides:
  - servers table in Supabase with RLS enabled
  - servers Row/Insert/Update types in @monster/db
  - @monster/db rebuilt and typechecked clean
key_files:
  - packages/db/supabase/migrations/20260316160000_servers.sql
  - packages/db/src/types/supabase.ts
  - packages/db/dist/index.js
  - packages/db/dist/index.d.ts
key_decisions:
  - pg installed temporarily as root workspace dep for migration script; removed after use (not in lockfile long-term)
  - SUPABASE_DB_URL read from root /home/daniel/monster/.env via env export (worktree has no .env)
patterns_established:
  - Temporary pg install pattern: pnpm add pg -w → run script → pnpm remove pg -w
  - Migration env var: source root .env via export $(cat /home/daniel/monster/.env | grep SUPABASE_DB_URL | xargs)
observability_surfaces:
  - createServiceClient().from('servers').select('id').limit(1) — no error = table accessible
  - grep -c 'servers' packages/db/dist/index.d.ts — >0 = types present in dist
  - Missing migration: downstream from('servers') calls return error.code PGRST106
duration: 15m
verification_result: passed
completed_at: 2026-03-16T17:15:00Z
blocker_discovered: false
---

# T01: Apply servers table migration + update Supabase types

**Created `servers` table in Supabase via SQL migration and added typed Row/Insert/Update blocks to `@monster/db`, rebuilding the package clean.**

## What Happened

1. Wrote `packages/db/supabase/migrations/20260316160000_servers.sql` with 12 columns + `IF NOT EXISTS` guard + `ENABLE ROW LEVEL SECURITY`.
2. Installed `pg` temporarily at workspace root (`pnpm add pg -w`), created `packages/db/apply-migration.mjs`, ran it with `SUPABASE_DB_URL` sourced from root `.env`. Printed "Migration applied". Deleted script and removed `pg` from workspace.
3. Inserted `servers` Row/Insert/Update type blocks in `packages/db/src/types/supabase.ts` between `settings` and `site_templates` (alphabetical order), following exact format of adjacent tables.
4. Ran `pnpm --filter @monster/db build` — succeeded (ESM + DTS build).
5. Ran `pnpm --filter @monster/db typecheck` — exit 0.
6. Verified table accessible via `createServiceClient().from('servers').select('id').limit(1)` — returned OK.
7. Fixed pre-flight gaps: added `## Observability Impact` to T01-PLAN.md; added step 7 (failure-path diagnostic check for HetznerApiError 401) to S01-PLAN.md verification section.

## Verification

```
✅ pnpm --filter @monster/db build         → exit 0, ESM 1.23 KB + DTS 114.75 KB
✅ pnpm --filter @monster/db typecheck     → exit 0 (no errors)
✅ createServiceClient().from('servers')… → "OK: servers table accessible"
✅ grep -c 'servers' packages/db/dist/index.d.ts → 12 (types present)
```

## Diagnostics

- `createServiceClient().from('servers').select('id').limit(1)` → empty array = healthy
- `grep -c 'servers' packages/db/dist/index.d.ts` → 12 (Row + Insert + Update blocks)
- If migration missing: Supabase returns `error.code === 'PGRST106'` (relation not found)
- If RLS misconfigured: service-role should always bypass; `42501` error = unexpected RLS block

## Deviations

- Plan referenced "D112 pattern" for pg-based migration. `pg` was not in the lockfile (not previously used in this worktree). Installed it temporarily at root workspace scope, used it, removed it. The established pattern from prior milestones was adapted: worktree has no `.env` so `SUPABASE_DB_URL` was sourced from `/home/daniel/monster/.env` directly.

## Known Issues

none

## Files Created/Modified

- `packages/db/supabase/migrations/20260316160000_servers.sql` — new migration: servers table with 12 columns + RLS
- `packages/db/src/types/supabase.ts` — added servers Row/Insert/Update blocks (alphabetically between settings and site_templates)
- `packages/db/dist/index.js` — rebuilt (includes servers table types)
- `packages/db/dist/index.d.ts` — rebuilt (includes servers type declarations)
- `.gsd/milestones/M011/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M011/slices/S01/S01-PLAN.md` — added failure-path diagnostic check to verification (pre-flight fix); marked T01 [x]
