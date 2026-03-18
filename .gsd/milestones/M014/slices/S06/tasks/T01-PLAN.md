---
estimated_steps: 5
estimated_files: 3
---

# T01: Add is_local migration and wire local-mode execSync in InfraService

**Slice:** S06 — VPS Local Mode + Domain Management Relocation
**Milestone:** M014

## Description

The hel1 server (admin VPS) is the same machine running the admin panel. Connecting to it via SSH to collect metrics is both unnecessary overhead and fragile (depends on SSH agent socket). Adding an `is_local` flag lets `InfraService` detect this case and run `execSync` shell commands directly — identical commands to what SSH would run, parsed with the same logic, but without any SSH setup.

This task covers: the SQL migration, the TypeScript type update in `supabase.ts`, and the `infra.ts` local branch implementation.

## Steps

1. **Create migration file** `packages/db/supabase/migrations/20260318120000_servers_is_local.sql`:
   ```sql
   ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_local boolean NOT NULL DEFAULT false;
   ```

2. **Update `packages/db/src/types/supabase.ts`** — add `is_local: boolean` to `servers.Row`, `is_local?: boolean` to `servers.Insert`, `is_local?: boolean` to `servers.Update`. The `servers` block starts around line 816. Follow the exact same pattern as other boolean columns (`is_active`, etc.).

3. **Update `packages/deployment/src/infra.ts`**:
   - Add `import { execSync } from 'node:child_process'` at the top (use `node:` prefix — consistent with `rsync.ts` which uses `import { spawn } from 'node:child_process'`).
   - Add `is_local: boolean` to the inline server type shape in `checkServerHealth`'s parameter (around line 150).
   - Add a local-mode early return at the top of `checkServerHealth`, before the SSH code. Structure:
     ```ts
     if (server.is_local) {
       return this.checkServerHealthLocal(server);
     }
     ```
   - Add a new private method `checkServerHealthLocal` (or inline the logic — either works, but a private method is cleaner). The method runs the same three commands via `execSync` and returns the same `ServerHealth` shape. Wrap **each** `execSync` call in its own try/catch — `systemctl is-active caddy` exits non-zero (exit code 3) when Caddy is inactive, which causes `execSync` to throw. Catch and use the stdout from the error object.

4. **Update `InfraService.getFleetHealth()`** — the call to `this.checkServerHealth(server)` passes an inline object. Add `is_local: server.is_local ?? false` to that object so the new field is forwarded.

5. **Apply migration**:
   ```bash
   cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL
   ```

6. **Build to verify**:
   ```bash
   pnpm --filter @monster/deployment build
   ```

## Must-Haves

- [ ] Migration file exists at `packages/db/supabase/migrations/20260318120000_servers_is_local.sql` with `ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_local boolean NOT NULL DEFAULT false;`
- [ ] `servers.Row` in `supabase.ts` has `is_local: boolean`; `Insert` and `Update` have `is_local?: boolean`
- [ ] `checkServerHealth` accepts `is_local: boolean` in its server parameter shape
- [ ] When `server.is_local === true`, method short-circuits to local `execSync` execution — SSH path (`new NodeSSH()`) is never reached
- [ ] Each `execSync` call is individually wrapped in try/catch; non-zero exits (e.g. inactive Caddy) are handled gracefully, not thrown
- [ ] `[InfraService] local-mode metrics for "<name>"` logged on success; `[InfraService] local-mode error for "<name>": <msg>` logged on failure
- [ ] `pnpm --filter @monster/deployment build` exits 0

## Verification

```bash
# Migration file exists
ls packages/db/supabase/migrations/20260318120000_servers_is_local.sql

# Type updated
grep "is_local" packages/db/src/types/supabase.ts

# Migration applied to DB
cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL

# Package builds clean
pnpm --filter @monster/deployment build

# Manual operational check (after setting is_local=true on hel1 via Supabase REST):
# curl -X PATCH "https://<project>.supabase.co/rest/v1/servers?name=eq.hel1" \
#   -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
#   -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
#   -H "Content-Type: application/json" \
#   -d '{"is_local": true}'
# Then open /infra in admin — hel1 should show reachable:true + real disk/memory values
```

## Observability Impact

- Signals added/changed: `[InfraService] local-mode metrics for "<name>"` on success; `[InfraService] local-mode error for "<name>": <msg>` on failure — both logged to server console at the same level as existing SSH log lines
- How a future agent inspects this: check admin server logs (stdout) during a fleet health poll; `/infra` page shows `reachable: true` + numeric disk/memory values for local server
- Failure state exposed: if `execSync` fails (e.g. permission denied for `systemctl`), error message surfaced in `ServerHealth.error` field and shown in the UI — same path as SSH errors

## Inputs

- `packages/deployment/src/infra.ts` — existing `checkServerHealth` private method (lines ~150–228); uses `NodeSSH`, three SSH commands; parse logic for caddy/disk/mem is the reference for the local implementation
- `packages/db/src/types/supabase.ts` — `servers` block around line 816 — shows existing Row/Insert/Update pattern to follow
- `packages/db/supabase/migrations/` — latest migration timestamp is `20260318000001`; new file must use a later timestamp (`20260318120000` is safe)
- KN007: use Node `pg` client for migrations if `supabase db push` fails
- KN010: `npx supabase db push --db-url $SUPABASE_DB_URL` is the canonical migration command

## Expected Output

- `packages/db/supabase/migrations/20260318120000_servers_is_local.sql` — new file, single ALTER TABLE statement
- `packages/db/src/types/supabase.ts` — `servers.Row` has `is_local: boolean`; Insert/Update have `is_local?: boolean`
- `packages/deployment/src/infra.ts` — local-mode branch in `checkServerHealth`; `execSync` import at top; `checkServerHealthLocal` private method (or equivalent inline); `getFleetHealth` passes `is_local` field
- `packages/deployment/dist/` — rebuilt with no errors
