# S02: Supabase Schema — UAT

**Milestone:** M001
**Written:** 2026-03-13

## UAT Type

- UAT mode: artifact-driven + live-runtime
- Why this mode is sufficient: Schema correctness is verifiable by inspecting the generated types file and querying the live Supabase project. The extensibility proof (sites table free of TSA columns) is a structural artifact check. RLS enforcement is verified via the policy definition in the migration file + live DB inspection.

## Preconditions

- `.env` contains all 4 Supabase credentials: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- `SUPABASE_DB_URL` uses port 5432 (direct connection), not 6543 (pooler)
- All 7 migrations were applied via `npx supabase db push --db-url`
- `packages/db/src/types/supabase.ts` exists and is committed to `gsd/M001/S02`
- Working directory: `/home/daniel/monster` on branch `gsd/M001/S02`

## Smoke Test

```bash
wc -l packages/db/src/types/supabase.ts
```
**Expected:** output `> 100` (actual: 1218). If this returns 0 or file not found, nothing else will pass.

---

## Test Cases

### 1. All 7 migration files exist

```bash
ls packages/db/supabase/migrations/*.sql | sort
```
**Expected:** Exactly 7 files:
```
packages/db/supabase/migrations/20260313000001_core.sql
packages/db/supabase/migrations/20260313000002_tsa.sql
packages/db/supabase/migrations/20260313000003_analytics.sql
packages/db/supabase/migrations/20260313000004_seo.sql
packages/db/supabase/migrations/20260313000005_ai.sql
packages/db/supabase/migrations/20260313000006_finances.sql
packages/db/supabase/migrations/20260313000007_alerts.sql
```

### 2. All 7 concern areas present in generated types

```bash
grep -c "tsa_categories\|tsa_products\|analytics_events\|seo_scores\|ai_jobs\|costs\|product_alerts" \
  packages/db/src/types/supabase.ts
```
**Expected:** A number greater than 0 (actual: 19). This confirms all 7 concern areas are represented.

### 3. sites table is TSA-free (extensibility proof)

```bash
grep -i "asin\|product_id" packages/db/supabase/migrations/20260313000001_core.sql
```
**Expected:** No output. The `sites` table must have zero TSA-specific columns. If any match appears, R002 is violated.

### 4. analytics_events has anon INSERT policy

```bash
grep "WITH CHECK (true)" packages/db/supabase/migrations/20260313000003_analytics.sql
```
**Expected:** One matching line containing `WITH CHECK (true)`. This is the INSERT-only policy for the `anon` role — required for the tracking script to write events without authentication.

### 5. analytics_events has RLS enabled

```bash
grep "ENABLE ROW LEVEL SECURITY" packages/db/supabase/migrations/20260313000003_analytics.sql
```
**Expected:** One matching line. RLS must be enabled before any policy can take effect.

### 6. SUPABASE_DB_URL documented in .env.example

```bash
grep "SUPABASE_DB_URL" .env.example
```
**Expected:** `SUPABASE_DB_URL=` (line exists with empty value as placeholder documentation).

### 7. Types file committed to current branch

```bash
git show HEAD --stat | grep "supabase.ts"
```
**Expected:** A line like `packages/db/src/types/supabase.ts | 1218 +++...`. If no output, the file wasn't committed.

### 8. Direct DB connection (port 5432, not pooler)

```bash
grep "SUPABASE_DB_URL" .env | grep -c ":5432"
```
**Expected:** `1`. Port 5432 is the direct connection. Port 6543 is the pooler and will fail with `supabase gen types`.

### 9. Key table columns present in generated types

```bash
# focus_keyword fields (required per D006)
grep "focus_keyword" packages/db/src/types/supabase.ts | head -5

# bull_job_id for BullMQ correlation
grep "bull_job_id" packages/db/src/types/supabase.ts | head -3

# cf_zone_id and spaceship_id on domains (per D004)
grep "cf_zone_id\|spaceship_id" packages/db/src/types/supabase.ts | head -3

# visitor_hash on analytics_events (no raw IP stored)
grep "visitor_hash" packages/db/src/types/supabase.ts | head -3
```
**Expected:** Each grep returns at least one match. If `focus_keyword` is missing, SEO Scorer (R005) will have no DB field to read.

### 10. Supabase dashboard visual verification (optional, human)

1. Open https://supabase.com/dashboard → select the Monster project
2. Navigate to **Table Editor**
3. **Expected:** All 21 tables visible: `sites`, `site_types`, `site_templates`, `settings`, `domains`, `deployments`, `tsa_categories`, `tsa_products`, `category_products`, `analytics_events`, `analytics_daily`, `seo_scores`, `research_sessions`, `research_results`, `chat_conversations`, `chat_messages`, `ai_jobs`, `cost_categories`, `costs`, `revenue_amazon`, `revenue_adsense`, `revenue_manual`, `revenue_daily`, `product_alerts`
4. Navigate to **Authentication → Policies**
5. **Expected:** `analytics_events` shows one policy (`anon_insert`, INSERT). All other tables show RLS enabled with no anon grants.

---

## Edge Cases

### SUPABASE_DB_URL placeholder not replaced

```bash
grep "SUPABASE_DB_URL" .env | grep -c "YOUR-PASSWORD"
```
**Expected:** `0` (exit 1 means grep found no match, which is correct). If this returns `1`, the DB URL still has the placeholder and T03 never completed — no migrations were pushed and the types file is either missing or empty.

### Migration re-run is safe (idempotency check)

```bash
cd packages/db && source ../../.env && npx supabase db push --db-url "$SUPABASE_DB_URL" 2>&1
```
**Expected:** Output contains `No migrations to apply` (all 7 already applied). If any migration fails on re-run, the SQL is not idempotent — check for missing `IF NOT EXISTS` guards or duplicate seed inserts.

### Types file content sanity

```bash
head -20 packages/db/src/types/supabase.ts
```
**Expected:** TypeScript type definitions, starting with `export type Json = ...` and `export type Database = {`. If the file starts with an error message or connection refused text, the `gen types` command failed silently.

---

## Failure Signals

- `packages/db/src/types/supabase.ts` is empty or < 100 lines → `supabase gen types` failed; re-run with explicit DB URL
- `grep "YOUR-PASSWORD" .env` returns a match → SUPABASE_DB_URL never updated; T03 never executed
- `grep "asin" packages/db/supabase/migrations/20260313000001_core.sql` returns a match → sites table has TSA columns; R002 violated
- `grep "WITH CHECK (true)" packages/db/supabase/migrations/20260313000003_analytics.sql` empty → anon INSERT policy missing; tracking script will fail with 403
- Supabase dashboard shows < 21 tables → one or more migrations didn't apply; check `npx supabase db push` output for ERROR lines

---

## Requirements Proved By This UAT

- **R002** (extensible site type architecture) — advanced (not yet fully validated): `sites` table has zero TSA-specific columns; TSA data is isolated in type-specific tables. Test Case 3 is the concrete proof.

## Not Proven By This UAT

- R002 fully validated — requires a second site type to be added and query across both without schema changes. Deferred to Phase 2.
- RLS enforcement at runtime — test cases verify policy *definitions* exist in migration SQL, not that the policies actually block/allow the right requests at runtime. Full runtime RLS verification requires sending real Supabase API requests as `anon` role.
- `analytics_events` spam resistance — the anon INSERT policy allows unrestricted inserts. No rate limiting or input validation is tested here.

## Notes for Tester

- `SUPABASE_DB_URL` contains the real DB password — never paste it into chat or logs. The commands above use it via `source .env` so the shell interpolates it without echoing.
- The Supabase dashboard visual check (Test Case 10) is the most comprehensive human verification — scroll through all tables and confirm the column shapes match expectations from the PRD.
- If you need to reset and re-apply migrations (e.g., after a schema fix), you must drop the tables manually in Supabase dashboard or delete rows from `supabase_migrations` table — `supabase db push` only applies forward, never rolls back.
- The `supabase gen types` command requires `npx supabase` (Supabase CLI) to be available via npx. No global install needed.
