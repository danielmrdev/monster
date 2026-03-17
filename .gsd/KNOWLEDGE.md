# Knowledge Register

<!-- Append-only. Add entries that would save a future agent from repeating your investigation. Skip obvious things. -->

## KN001 — `pg` is not in the monorepo lockfile; install temporarily for migration scripts

**Discovered:** M011/S01/T01

`pg` (node-postgres) is referenced in plan comments as "D112 pattern" but is not in `pnpm-lock.yaml`. To run a one-off migration script:

```bash
# In the worktree root:
pnpm add pg -w                          # temporary root workspace dep
node packages/db/apply-migration.mjs   # run with SUPABASE_DB_URL
pnpm remove pg -w                       # clean up
```

## KN002 — Worktree has no `.env`; source SUPABASE_DB_URL from monorepo root

**Discovered:** M011/S01/T01

The worktree at `/home/daniel/monster/.gsd/worktrees/M011` has no `.env` file (only `.env.example`). The real secrets are at `/home/daniel/monster/.env`. To run Node scripts that need env vars:

```bash
export $(cat /home/daniel/monster/.env | grep SUPABASE_DB_URL | xargs)
node my-script.mjs
```

The admin app uses a symlink (`apps/admin/.env.local → ../../.env`) per D023, but scripts run from the worktree root must source vars explicitly.

## KN003 — S01 slice check #7 uses `new HetznerClient('invalid-token')` but constructor takes no args — FIXED in T03

**Discovered:** M011/S01/T02  
**Fixed:** M011/S01/T03

The original S01-PLAN check #7 passed a token directly to the constructor (which doesn't support it). Fixed in T03 by replacing with a dist-bundle observability check: scans `packages/deployment/dist/index.js` for all failure-path log prefix strings (`[ProvisioningService] DB insert failed`, `SSH connect failed after`, etc.). This verifies structured error visibility without needing a live API call with a bad token.

## KN004 — Admin build fails in worktree: `@monster/agents`, `@monster/shared`, `@monster/domains` have no dist/

**Discovered:** M011/S01/T02  
**Resolved:** M011/S01/T04

`pnpm --filter @monster/admin build` fails in the M011 worktree because sibling packages (`agents`, `shared`, `domains`) were never built (no `dist/` directories). This is a pre-existing state, not caused by any T02 changes. Build order that works:

```bash
pnpm --filter @monster/shared build        # no internal deps
pnpm --filter @monster/domains build       # no internal deps  
pnpm --filter @monster/seo-scorer build    # no internal deps
pnpm --filter @monster/agents build        # depends on @monster/domains, @monster/seo-scorer
pnpm --filter @monster/deployment build    # depends on @monster/db
pnpm --filter @monster/admin build         # depends on all of the above
```

Building `domains` and `agents` in parallel fails because agents needs domains' dist. Build them sequentially or build domains first, then agents.

## KN005 — `hetzner_api_token not found in settings` is expected before Hetzner token is configured

**Discovered:** M011/S01/T04

`HetznerClient.listDatacenters()` (and all other methods) throw `"[HetznerClient] hetzner_api_token not found in settings"` when the token has not yet been inserted into Supabase settings. This is the structured failure path — it's not a code error. The integration test should treat this specific message as a documented skip, not a failure requiring investigation.

## KN006 — Task marked `[x]` in slice plan may have no summary and unmodified files

**Discovered:** M011/S02/T03

A task can be marked `[x]` in the slice plan without a corresponding `T0N-SUMMARY.md` and without any file changes. When the final task of a slice runs slice-level verification, always check that prior tasks' expected file state is actually present — don't trust the `[x]` marker alone. If a task is marked done but its files are unchanged, apply the missing work within the current task and note the deviation in the summary.

## KN007 — psql not available; use Node pg client for migrations

**Discovered:** M012/S01/T01

`psql` is not installed in this environment. Apply SQL migrations using Node.js with the `pg` package available at `/home/daniel/monster/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js`. Always use `ssl: { rejectUnauthorized: false }` for Supabase connections and call `client.end()` to prevent the process from hanging. Pattern:
```js
const { Client } = require('/home/daniel/monster/node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js');
const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect(); /* ... queries ... */ await client.end();
```
