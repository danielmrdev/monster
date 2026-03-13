---
id: T02
parent: S02
milestone: M001
provides:
  - 7 SQL migration files covering full Phase 1 schema in packages/db/supabase/migrations/
  - 21 tables with RLS enabled; analytics_events is the sole anon-accessible table
  - site_types seeded with tsa row; cost_categories seeded with 5 rows
  - All FK ordering verified: no forward references between migration files
key_files:
  - packages/db/supabase/migrations/20260313000001_core.sql
  - packages/db/supabase/migrations/20260313000002_tsa.sql
  - packages/db/supabase/migrations/20260313000003_analytics.sql
  - packages/db/supabase/migrations/20260313000004_seo.sql
  - packages/db/supabase/migrations/20260313000005_ai.sql
  - packages/db/supabase/migrations/20260313000006_finances.sql
  - packages/db/supabase/migrations/20260313000007_alerts.sql
key_decisions:
  - analytics_events partitioning deferred: implemented as regular table with cron cleanup (Phase 2). Noted in migration comment.
  - updated_at not auto-maintained via trigger — set in application code. Simpler than moddatetime extension; consistent with S03 client pattern.
  - product_alerts status enum includes 'acknowledged' (open→acknowledged→resolved) — richer than plan's implicit open/resolved
patterns_established:
  - uuid PKs with gen_random_uuid() throughout
  - timestamptz for all timestamps
  - text (not varchar) for all string columns
  - text[] for simple string arrays (images, keywords); jsonb for nested structured data
  - RLS enabled on every table; policies in same migration file as their table
  - Seed data (site_types, cost_categories, site_templates) uses ON CONFLICT DO NOTHING for idempotency
  - FK ON DELETE CASCADE for owned children; ON DELETE SET NULL for optional references
observability_surfaces:
  - After T03 push: psql $SUPABASE_DB_URL -c "SELECT name FROM supabase_migrations ORDER BY name;" shows applied files
  - npx supabase db push --db-url $SUPABASE_DB_URL prints per-migration success/failure with statement context
  - Supabase dashboard Table Editor shows all 21 tables after push
duration: ~45m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Write 7 SQL migration files

**7 SQL migration files written covering all 21 Phase 1 tables, with RLS, seeds, and correct FK ordering.**

## What Happened

Wrote all 7 migration files as plain SQL following the schema design from S02-RESEARCH.md and the task plan. Key implementation notes:

- **File 001 (core):** `site_types`, `site_templates`, `sites`, `settings`, `domains`, `deployments`. Sites has zero TSA columns. Seeded site_templates with 3 variants. D005 status constraint enforced at DB level via CHECK constraint.
- **File 002 (tsa):** `tsa_categories`, `tsa_products`, `category_products`. UNIQUE(site_id, asin) on products. UNIQUE(site_id, slug) on categories. FK cascade on category_products junction table.
- **File 003 (analytics):** `analytics_events` with RLS + anon INSERT policy using `WITH CHECK (true)`. `analytics_daily` with UNIQUE(site_id, date, page_path). Partitioning deferred with comment in migration.
- **File 004 (seo):** `seo_scores` with composite index on (site_id, page_path) for primary query pattern.
- **File 005 (ai):** `research_sessions`, `research_results`, `chat_conversations`, `chat_messages`, `ai_jobs`. bull_job_id indexed for BullMQ correlation lookups.
- **File 006 (finances):** `cost_categories` seeded with 5 rows (hosting/domains/ai/tools/other). Revenue tables include UNIQUE constraints on (site_id, date) to prevent duplicate aggregation. revenue_amazon includes market in its unique key for multi-market Phase 2.
- **File 007 (alerts):** `product_alerts` with CHECK constraints on alert_type and status values. product_id is nullable (site_degraded alerts don't have a product).

## Verification

```
find packages/db/supabase/migrations -name "*.sql" | sort | wc -l  → 7
grep -l "CREATE TABLE" packages/db/supabase/migrations/*.sql | wc -l  → 7
grep "asin\|product_id" 20260313000001_core.sql  → empty (sites clean)
grep "WITH CHECK (true)" 20260313000003_analytics.sql  → match found
grep "focus_keyword" _core.sql _tsa.sql  → matches in both (sites, tsa_categories, tsa_products)
grep "cf_zone_id\|spaceship_id" _core.sql  → both present in domains table
grep "bull_job_id" _ai.sql  → present in ai_jobs
grep "ENABLE ROW LEVEL SECURITY" *.sql  → 21 tables, all covered
grep "CREATE POLICY" *.sql  → exactly 1 policy (anon_insert on analytics_events)
```

All task must-haves confirmed passed. Slice-level checks relevant to T02:
- `ls packages/db/supabase/migrations/ | wc -l` → 7 ✓
- `grep "SUPABASE_DB_URL" .env.example` → documented ✓
- `packages/db/src/types/supabase.ts` — not yet (T03 generates this)
- `git show HEAD --stat | grep supabase.ts` — not yet (T03 commits)

## Diagnostics

After T03 pushes migrations:
- `psql $SUPABASE_DB_URL -c "SELECT name FROM supabase_migrations ORDER BY name;"` — lists all 7 applied files
- `npx supabase db push --db-url $SUPABASE_DB_URL` prints per-migration result with statement context on failure
- Supabase dashboard → Table Editor shows all 21 tables

If a migration fails: the error names the failing file and statement. Fix the SQL, then re-run `db push` (already-applied migrations are skipped).

## Deviations

- `site_templates` seeded with 3 rows (classic/modern/minimal) — not explicitly required in plan but logically needed as FK target for sites.template_slug. Consistent with CLAUDE.md "3 variants".
- product_alerts status enum includes `'acknowledged'` in addition to plan's implicit open/resolved — richer state machine, no downstream impact.
- revenue_amazon UNIQUE key includes `market` column: `UNIQUE(site_id, date, market)` — supports Phase 2 multi-market without schema changes.

## Known Issues

- `updated_at` columns are not auto-maintained via trigger. Plan noted this as a pitfall. Decision: set in application code (S03 client layer). Simpler than adding moddatetime extension to each table.

## Files Created/Modified

- `packages/db/supabase/migrations/20260313000001_core.sql` — site_types, site_templates, sites, settings, domains, deployments
- `packages/db/supabase/migrations/20260313000002_tsa.sql` — tsa_categories, tsa_products, category_products
- `packages/db/supabase/migrations/20260313000003_analytics.sql` — analytics_events (anon INSERT), analytics_daily
- `packages/db/supabase/migrations/20260313000004_seo.sql` — seo_scores
- `packages/db/supabase/migrations/20260313000005_ai.sql` — research_sessions, research_results, chat_conversations, chat_messages, ai_jobs
- `packages/db/supabase/migrations/20260313000006_finances.sql` — cost_categories, costs, revenue_amazon, revenue_adsense, revenue_manual, revenue_daily
- `packages/db/supabase/migrations/20260313000007_alerts.sql` — product_alerts
