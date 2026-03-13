# S02: Supabase Schema

**Goal:** Full Phase 1 schema applied to Supabase Cloud, with TypeScript types generated and committed.
**Demo:** `supabase gen types --db-url $SUPABASE_DB_URL` produces a non-empty `packages/db/src/types/supabase.ts` covering all 7 migration concern areas; `tsa_categories`, `tsa_products`, `analytics_events`, `seo_scores`, `ai_jobs`, `costs`, `product_alerts` all appear in the generated types file.

## Must-Haves

- `packages/db/supabase/migrations/` contains 7 timestamped `.sql` files
- All migrations pushed to Supabase Cloud via `npx supabase db push --db-url`
- `packages/db/src/types/supabase.ts` exists, is non-empty, and is committed to git
- `analytics_events` has RLS enabled with an INSERT-only policy for the `anon` role
- `sites` table has zero TSA-specific columns (extensibility proof)
- `SUPABASE_DB_URL` added to `.env.example`

## Proof Level

- This slice proves: contract (schema shape + type generation)
- Real runtime required: yes — actual Supabase Cloud connection for `db push` and `gen types`
- Human/UAT required: yes — user must create the Supabase Cloud project and provide credentials

## Verification

- `grep -c "tsa_categories\|tsa_products\|analytics_events\|seo_scores\|ai_jobs\|costs\|product_alerts" packages/db/src/types/supabase.ts | grep -v "^0$"` — all 7 concern areas present in generated types
- `grep "SUPABASE_DB_URL" .env.example` — env var documented
- `ls packages/db/supabase/migrations/ | wc -l` — outputs `7`
- `git show HEAD --stat | grep "supabase.ts"` — types file committed
- **Failure diagnostics:** `psql $SUPABASE_DB_URL -c "SELECT name, executed_at FROM supabase_migrations ORDER BY executed_at;" 2>&1` — lists applied migrations or shows connection error; migration push failures print the failing SQL statement to stdout — check `npx supabase db push` exit code and stderr for `ERROR:` lines

## Observability / Diagnostics

- Runtime signals: Supabase migration tracking in `supabase_migrations` table (inspectable via `psql $SUPABASE_DB_URL -c "SELECT * FROM supabase_migrations;"`)
- Inspection surfaces: Supabase dashboard → Table Editor (all tables visible after push); `supabase.ts` file size/content
- Failure visibility: `npx supabase db push --db-url $URL` prints per-migration success/failure with statement context
- Redaction constraints: `SUPABASE_DB_URL` contains password — never log or echo it

## Integration Closure

- Upstream surfaces consumed: `packages/db/` scaffold from S01 (package.json, tsconfig.json, `supabase/migrations/` dir)
- New wiring introduced: `packages/db/src/types/supabase.ts` — the generated types file that S03 imports directly
- What remains before milestone is usable end-to-end: S03 (typed client wrapping the generated types), S04 (admin panel using those types)

## Tasks

- [x] **T01: Collect Supabase credentials and document env vars** `est:15m`
  - Why: CLI commands (`db push`, `gen types`) require a live Supabase Cloud project and a direct DB URL. Nothing else in this slice can proceed without this.
  - Files: `.env.example`
  - Do: Use `secure_env_collect` to gather `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DB_URL` (direct postgres URL — format: `postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres`). Then add `SUPABASE_DB_URL=` to `.env.example` so it's documented for future devs. Verify the DB URL uses port 5432 (direct connection, not pooler at 6543).
  - Verify: `grep "SUPABASE_DB_URL" .env.example` succeeds; `.env` file exists with all four vars populated.
  - Done when: `.env` has `SUPABASE_DB_URL` pointing to a real Supabase project, and `.env.example` documents it.

- [x] **T02: Write 7 SQL migration files** `est:2h`
  - Why: These are the schema definition for the entire Phase 1 data model. All downstream code (types, typed client, admin panel, generator) depends on this schema being complete and correct.
  - Files: `packages/db/supabase/migrations/20260313000001_core.sql`, `packages/db/supabase/migrations/20260313000002_tsa.sql`, `packages/db/supabase/migrations/20260313000003_analytics.sql`, `packages/db/supabase/migrations/20260313000004_seo.sql`, `packages/db/supabase/migrations/20260313000005_ai.sql`, `packages/db/supabase/migrations/20260313000006_finances.sql`, `packages/db/supabase/migrations/20260313000007_alerts.sql`
  - Do: Write all 7 migration files as plain SQL per the schema design in S02-RESEARCH.md and PRD.md data model section. Key constraints: (1) use `uuid` PKs with `gen_random_uuid()` default; (2) use `timestamptz` for all timestamps; (3) use `text` not `varchar(n)`; (4) `text[]` for simple arrays (images, keywords), `jsonb` for nested structured data; (5) `sites` must have zero TSA-specific columns — extensibility proof; (6) seed `site_types` with `('tsa', 'TSA (Amazon Affiliate)', '...')` and `cost_categories` with their fixed values in the same migration that creates the table; (7) RLS policies belong in the same file as the table they guard; (8) `analytics_events` needs `ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "anon_insert" ON analytics_events FOR INSERT TO anon WITH CHECK (true)` — this is the only anon-accessible table; (9) all other tables: enable RLS but no anon grants; (10) `domains` needs `cf_zone_id text` and `spaceship_id text` per D004; (11) `sites.status` enum values: `draft|generating|deploying|dns_pending|ssl_pending|live|paused|error` per D005; (12) `focus_keyword text` in `sites`, `tsa_categories`, `tsa_products` per D006; (13) `ai_jobs` needs `bull_job_id text` for BullMQ correlation; (14) `analytics_events.visitor_hash` is the hashed identifier — raw IP never stored.
  - Verify: `find packages/db/supabase/migrations -name "*.sql" | wc -l` outputs `7`; spot-check each file has at least one `CREATE TABLE` statement; confirm `sites` has no column named `asin`, `product_id`, or any TSA-specific field.
  - Done when: 7 `.sql` files exist, each syntactically valid SQL with correct RLS policy on `analytics_events`.

- [x] **T03: Push migrations to Supabase Cloud and generate committed types** `est:30m`
  - Why: Migrations must actually be applied to the live DB for the types to reflect the real schema. The generated `supabase.ts` is what S03 consumes — it must be committed.
  - Files: `packages/db/src/types/supabase.ts`
  - Do: (1) `cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL` — apply all 7 migrations. If any migration fails, fix the SQL and retry. (2) `mkdir -p src/types && npx supabase gen types typescript --db-url $SUPABASE_DB_URL > src/types/supabase.ts` — generate types. (3) Verify the output is non-empty and contains expected table names. (4) `git add packages/db/src/types/supabase.ts packages/db/supabase/migrations/ .env.example && git commit -m "feat(S02): apply Phase 1 schema + generate types"` — commit everything.
  - Verify: `wc -l packages/db/src/types/supabase.ts` returns > 100 lines; `grep -c "tsa_categories\|analytics_events\|seo_scores\|ai_jobs" packages/db/src/types/supabase.ts | grep -v "^0$"` passes; `git show HEAD --stat | grep supabase.ts` confirms committed.
  - Done when: `supabase.ts` exists, is > 100 lines, contains all major table names, and is committed to the `gsd/M001/S02` branch.

## Files Likely Touched

- `packages/db/supabase/migrations/20260313000001_core.sql`
- `packages/db/supabase/migrations/20260313000002_tsa.sql`
- `packages/db/supabase/migrations/20260313000003_analytics.sql`
- `packages/db/supabase/migrations/20260313000004_seo.sql`
- `packages/db/supabase/migrations/20260313000005_ai.sql`
- `packages/db/supabase/migrations/20260313000006_finances.sql`
- `packages/db/supabase/migrations/20260313000007_alerts.sql`
- `packages/db/src/types/supabase.ts`
- `.env.example`
