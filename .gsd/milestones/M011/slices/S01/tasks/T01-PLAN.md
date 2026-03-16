# T01: Apply servers table migration + update Supabase types

## Why

The `servers` table is the foundational schema artifact for M011. All downstream code — `ProvisioningService`, `HetznerClient` inserts, `InfraService.getFleetHealth()` — depends on this table existing in Supabase and having correct TypeScript types available via `@monster/db`. This task must complete before any other T-task in S01.

## Description

Write a Supabase SQL migration that creates the `servers` table with all required columns and RLS enabled. Apply it directly to the remote Supabase DB using the `pg` package (established pattern — D112). Then manually add the `servers` Row/Insert/Update type blocks to `packages/db/src/types/supabase.ts` following the exact format of existing tables. Finally, rebuild `@monster/db` so all downstream consumers resolve the updated types.

## Steps

1. **Write the migration file** at `packages/db/supabase/migrations/20260316160000_servers.sql`:

```sql
CREATE TABLE IF NOT EXISTS servers (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  provider          text        NOT NULL DEFAULT 'hetzner',
  external_id       bigint,
  status            text        NOT NULL DEFAULT 'provisioning',
  public_ip         text,
  tailscale_ip      text,
  datacenter        text,
  server_type       text,
  ssh_user          text        NOT NULL DEFAULT 'root',
  created_at        timestamptz NOT NULL DEFAULT now(),
  last_health_check timestamptz
);

ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
```

2. **Apply the migration** using the D112 pattern. Create a temporary script `packages/db/apply-migration.mjs`:

```js
import { readFileSync } from 'fs';
import pg from 'pg';

const { Client } = pg;
const sql = readFileSync('packages/db/supabase/migrations/20260316160000_servers.sql', 'utf8');
const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();
await client.query(sql);
await client.end();
console.log('Migration applied');
```

Run: `node packages/db/apply-migration.mjs` (requires `SUPABASE_DB_URL` in `.env`). Delete the script after successful apply.

3. **Add `servers` table types** to `packages/db/src/types/supabase.ts`. Insert the following block inside the `public` schema `Tables` section, in alphabetical order (between `settings` and `site_templates`):

```typescript
      servers: {
        Row: {
          id: string
          name: string
          provider: string
          external_id: number | null
          status: string
          public_ip: string | null
          tailscale_ip: string | null
          datacenter: string | null
          server_type: string | null
          ssh_user: string
          created_at: string
          last_health_check: string | null
        }
        Insert: {
          id?: string
          name: string
          provider?: string
          external_id?: number | null
          status?: string
          public_ip?: string | null
          tailscale_ip?: string | null
          datacenter?: string | null
          server_type?: string | null
          ssh_user?: string
          created_at?: string
          last_health_check?: string | null
        }
        Update: {
          id?: string
          name?: string
          provider?: string
          external_id?: number | null
          status?: string
          public_ip?: string | null
          tailscale_ip?: string | null
          datacenter?: string | null
          server_type?: string | null
          ssh_user?: string
          created_at?: string
          last_health_check?: string | null
        }
        Relationships: []
      }
```

4. **Rebuild `@monster/db`**: `pnpm --filter @monster/db build`

5. **Verify types resolve**: `pnpm --filter @monster/db typecheck`

## Must-Haves

- Migration SQL exists at `packages/db/supabase/migrations/20260316160000_servers.sql`
- `servers` table exists in the remote Supabase database
- `packages/db/src/types/supabase.ts` contains `servers` Row/Insert/Update blocks with exactly the columns listed above
- `pnpm --filter @monster/db build` exits 0
- Temporary `apply-migration.mjs` script is deleted after use

## Inputs

- `SUPABASE_DB_URL` environment variable (from `.env` in worktree root)
- Existing migration format in `packages/db/supabase/migrations/` for filename pattern
- Existing table blocks in `packages/db/src/types/supabase.ts` for format reference (e.g. `settings`, `sites`)

## Expected Output

- `packages/db/supabase/migrations/20260316160000_servers.sql` — committed migration file
- `packages/db/src/types/supabase.ts` — updated with `servers` table types (Row/Insert/Update)
- `packages/db/dist/` — rebuilt with new types (for downstream consumer resolution)

## Verification

```bash
# DB table exists
node --input-type=module <<'EOF'
import { createServiceClient } from './packages/db/dist/index.js';
const sb = createServiceClient();
const { data, error } = await sb.from('servers').select('id').limit(1);
if (error) { console.error('FAIL:', error.message); process.exit(1); }
console.log('OK: servers table accessible');
EOF

# Types build clean
pnpm --filter @monster/db build
pnpm --filter @monster/db typecheck
```

## Done When

- `servers` table is accessible via `createServiceClient().from('servers').select(...)` with no error
- `@monster/db` builds and typechecks clean
- `supabase.ts` contains the `servers` block

## Observability Impact

- **What changes:** `servers` table becomes queryable in Supabase. Downstream tasks (`ProvisioningService`, `HetznerClient` insert) rely on this table existing — if it's absent, they get a Supabase `relation "servers" does not exist` error, which is now the diagnostic signal for a missing migration.
- **How to inspect:** `createServiceClient().from('servers').select('id').limit(1)` — returns `[]` (not an error) when table exists and is empty. Any error response means migration was not applied or RLS is blocking.
- **Failure state:** If migration was not applied, all downstream Supabase `.from('servers')` calls return `error.code === 'PGRST106'` (relation not found). If RLS blocks a service-role query (should never happen), the error code is `42501`.
- **Rebuild status:** `packages/db/dist/index.d.ts` contains `servers` type block after successful rebuild. Check with `grep -c 'servers' packages/db/dist/index.d.ts` — should return > 0.
