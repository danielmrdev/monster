---
estimated_steps: 5
estimated_files: 1
---

# T03: Push migrations to Supabase Cloud and generate committed types

**Slice:** S02 — Supabase Schema
**Milestone:** M001

## Description

Apply the 7 migration files to the live Supabase Cloud database, then generate and commit the TypeScript types file that S03 will import. This task is the integration checkpoint for the entire slice — it validates that all SQL is syntactically correct and compatible with Postgres 15, and produces the committed `supabase.ts` artifact that makes S03 possible.

If any migration fails: the error message from `supabase db push` will identify the failing migration and statement. Fix the SQL in T02's output files and rerun `db push` — the migration tracker skips already-applied migrations, so only the failing one re-runs.

## Steps

1. Load `SUPABASE_DB_URL` from `.env`: `source .env || export $(cat .env | grep -v '#' | xargs)`. Confirm the URL is set and contains port 5432.
2. Push all migrations: `cd packages/db && npx supabase db push --db-url "$SUPABASE_DB_URL"`. Monitor output — each migration should print "Applying migration <name>... OK". If any fail, fix the SQL file and retry.
3. Verify the push succeeded: `npx supabase db push --db-url "$SUPABASE_DB_URL"` a second time should print "No migrations to apply" (all 7 already tracked).
4. Create the types output directory and generate types: `mkdir -p src/types && npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" > src/types/supabase.ts`. Check the file is non-empty and contains expected table names.
5. Commit everything: `git add packages/db/src/types/supabase.ts packages/db/supabase/migrations/ .env.example && git commit -m "feat(S02): apply Phase 1 schema and generate Supabase types"`.

## Must-Haves

- [ ] `npx supabase db push` exits 0 with all 7 migrations applied
- [ ] Second `db push` run prints "No migrations to apply" (idempotency confirmed)
- [ ] `packages/db/src/types/supabase.ts` exists and is > 100 lines
- [ ] Types file contains: `tsa_categories`, `tsa_products`, `analytics_events`, `seo_scores`, `ai_jobs`, `costs`, `product_alerts`
- [ ] `supabase.ts` is committed to `gsd/M001/S02` branch

## Verification

- `wc -l packages/db/src/types/supabase.ts` → > 100 lines
- `grep -c "tsa_categories\|analytics_events\|seo_scores\|ai_jobs\|product_alerts" packages/db/src/types/supabase.ts` → ≥ 5 (one match per key table)
- `git log --oneline -1` → commit message contains "S02"
- `git show HEAD --stat | grep "supabase.ts"` → types file in commit

## Observability Impact

- Signals added/changed: `supabase_migrations` tracking table populated in Supabase Cloud — inspectable via `psql $SUPABASE_DB_URL -c "SELECT name, executed_at FROM supabase_migrations ORDER BY executed_at;"`
- How a future agent inspects this: check `supabase_migrations` table or simply diff `supabase.ts` against the list of expected tables
- Failure state exposed: `supabase db push` prints the failing migration name + SQL statement + Postgres error; rerunning after fix resumes from the failed point

## Inputs

- `packages/db/supabase/migrations/*.sql` — 7 migration files from T02
- `.env` — `SUPABASE_DB_URL` from T01

## Expected Output

- `packages/db/src/types/supabase.ts` — generated TypeScript types, committed to git
- `supabase_migrations` table in Supabase Cloud — 7 rows, all migrations tracked
