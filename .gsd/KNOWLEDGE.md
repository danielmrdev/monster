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

## KN008 — Generator build requires SITE_SLUG env var; bare `pnpm build` fails with ENOENT

**Discovered:** M012/S05/T01

`pnpm --filter @monster/generator build` without `SITE_SLUG` set defaults to `"default"` slug and fails with `ENOENT: no such file or directory, open '.../src/data/default/site.json'`. The fixture data lives at `src/data/fixture/`. Always build with:

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
```

This was a pre-existing failure (present in main before S05 changes). The build script in `package.json` has no default guard — the `SITE_SLUG=fixture` prefix is mandatory for local fixture validation.

## KN009 — `marked` v17 returns a string synchronously from `marked()`; no await needed

**Discovered:** M012/S05/T01

`marked` v17 (installed: `^17.0.4`) returns a string synchronously when called as `marked(content)`. The v5+ async API concern in the task plan notes is a red herring for this version — `marked(str)` is synchronous. Astro's `set:html` directive accepts a plain string, so `set:html={marked(interpolateLegal(pageContent, site))}` works without `await`. If the API is later changed to async, `set:html` will render `[object Promise]` — immediately visible in page source.

## KN010 — `psql` not installed in dev environment; use `npx supabase db push` to apply migrations

**Discovered:** M012/S05/T02

`psql` is not available in the development environment (`command not found`). The canonical way to apply migrations is:

```bash
cd packages/db
npx supabase db push --db-url $SUPABASE_DB_URL
```

To inspect the DB without psql, use the Supabase REST API with the service role key:

```bash
curl -s "https://<project>.supabase.co/rest/v1/<table>?select=<cols>" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

To check migration status: `npx supabase migration list --db-url $SUPABASE_DB_URL`
To dry-run: `npx supabase db push --db-url $SUPABASE_DB_URL --dry-run`

## KN011 — Idempotent seed migrations: use fixed UUIDs when table lacks unique constraint on (type, language)

**Discovered:** M012/S05/T02

The `legal_templates` table has no unique constraint on `(type, language)` — only a primary key. `ON CONFLICT DO NOTHING` requires a conflict target (column or constraint name). Solution: use fixed, deterministic UUIDs as primary keys (e.g. `11111111-0000-0000-0000-00000000000X`) so `ON CONFLICT (id) DO NOTHING` works reliably.

This pattern is preferable to adding a UNIQUE constraint in the seed migration (which would be a schema change, not a data change) or using `ON CONFLICT ON CONSTRAINT` (which requires knowing the constraint name).

## KN012 — `supabase migration repair --status applied` needed when a migration was partially applied outside the tracking table

**Discovered:** M012/S05/T02

When a migration's SQL was partially executed manually (e.g. `ADD COLUMN IF NOT EXISTS` succeeded but a subsequent `ADD CONSTRAINT` failed because the constraint already exists), the Supabase migration tracker may not have the row in its history table. `db push` will try to re-apply the whole file and fail on the constraint.

Fix: mark as applied in the tracker, then push:

```bash
cd packages/db
npx supabase migration repair --db-url $SUPABASE_DB_URL --status applied <timestamp>
npx supabase db push --db-url $SUPABASE_DB_URL
```

## KN013 — Astro hamburger nav: use sibling dropdown div, not toggle on flex child

**Discovered:** M012/S06/T01

When adding a collapsible mobile menu to an Astro layout with a `flex` nav row, **do not** wrap the desktop category links in the same element you intend to toggle. The desktop links are a flex child inside a `flex h-14 items-center justify-between` row — toggling `hidden` on them works, but you need a **separate sibling `<div>`** for the mobile dropdown that sits below the `<nav>` row (outside the max-width container's nav element). This avoids a layout conflict where toggling `hidden` on the flex child also hides it on desktop if the `md:flex` class wins or loses order in Tailwind's cascade.

Pattern used:
```html
<!-- Inside <nav> row: desktop links -->
<div id="mobile-menu-{layout}" class="hidden md:flex gap-4">...</div>
<!-- Sibling below the nav row: mobile dropdown -->
<div id="mobile-menu-{layout}-dropdown" class="hidden border-t ...">...</div>
```

The `<script is:inline>` toggles only the `-dropdown` div; the desktop `hidden md:flex` div is always-present and never JS-toggled.

## KN014 — Generator build requires SITE_SLUG env var; `default` slug has no data

**Discovered:** M012/S06/T01

`apps/generator/astro.config.ts` defaults `SITE_SLUG` to `"default"`, but there is no `apps/generator/src/data/default/site.json`. Running `pnpm --filter @monster/generator build` without `SITE_SLUG` always fails with `ENOENT: .../data/default/site.json`. Use `SITE_SLUG=fixture` to build against the fixture data for template verification:

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
```

## KN015 — `SiteTemplate` and other pure TypeScript type aliases don't appear in `dist/index.js`; check `dist/index.d.ts` instead

**Discovered:** M013/S01/T01

`SiteTemplate` (and any `export type`) is erased at compile time — it exists only in `packages/shared/dist/index.d.ts`, not in `dist/index.js`. Verification commands that `grep 'tsa/classic' packages/shared/dist/index.js` will always return empty/exit 1 even after a successful build. The correct check is:

```bash
grep 'tsa/classic' packages/shared/dist/index.d.ts
```
