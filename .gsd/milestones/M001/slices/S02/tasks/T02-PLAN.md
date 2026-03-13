---
estimated_steps: 9
estimated_files: 7
---

# T02: Write 7 SQL migration files

**Slice:** S02 — Supabase Schema
**Milestone:** M001

## Description

Write all 7 migration files covering the full Phase 1 schema. This is the highest-risk deliverable in M001 — getting the extensibility boundary wrong requires rework across every downstream milestone. The guiding constraint: `sites` has zero TSA-specific columns; TSA data lives in `tsa_*` tables joined by `site_id`. A future `blog_posts` table would join the same way.

All 7 files must be syntactically valid SQL with correct Postgres 15 features. Migration ordering is enforced by lexicographic sort on the timestamp prefix — ensure FK references only point to tables created in earlier files.

## Steps

1. **`20260313000001_core.sql`** — `site_types`, `site_templates`, `sites`, `settings`, `domains`, `deployments`. Seed `site_types` with `('tsa', 'TSA (Amazon Affiliate)', 'Amazon affiliate catalog sites')`. Sites table: `id, site_type_slug, template_slug, name, domain (UNIQUE), niche, market, language, currency, affiliate_tag, customization (jsonb), status, focus_keyword, company_name, contact_email, created_at, updated_at`. Status values per D005: `draft|generating|deploying|dns_pending|ssl_pending|live|paused|error`. Domains table includes `cf_zone_id, spaceship_id, dns_status` per D004.

2. **`20260313000002_tsa.sql`** — `tsa_categories`, `tsa_products`, `category_products`. Categories: `id, site_id (FK→sites), name, slug, description, seo_text, focus_keyword, keywords (text[]), category_image (text), created_at, updated_at`. Products: `id, site_id (FK→sites), asin (text, not null), title, slug, current_price (numeric), original_price (numeric), images (text[]), rating (numeric), review_count (int), availability, is_prime (bool), condition (text), detailed_description, pros_cons (jsonb), user_opinions_summary, focus_keyword, last_checked_at (timestamptz), price_history (jsonb), created_at, updated_at`. Add `UNIQUE(site_id, asin)` constraint. `category_products`: `category_id, product_id, position (int), PRIMARY KEY(category_id, product_id)`.

3. **`20260313000003_analytics.sql`** — `analytics_events`, `analytics_daily`. Events: `id, site_id (FK→sites), event_type (text, not null), page_path (text), referrer (text), country (text), language (text), visitor_hash (text), created_at (timestamptz default now())`. Daily: `id, site_id (FK→sites), date (date), page_path (text), pageviews (int default 0), unique_visitors (int default 0), affiliate_clicks (int default 0), top_countries (jsonb), top_referrers (jsonb), PRIMARY KEY(site_id, date, page_path)`. RLS on `analytics_events`: enable + INSERT-only for anon. RLS on `analytics_daily`: enable only (no anon grant).

4. **`20260313000004_seo.sql`** — `seo_scores`. Fields: `id, site_id (FK→sites), page_path (text), page_type (text), overall_score (int), grade (text), content_quality_score (int), meta_elements_score (int), structure_score (int), links_score (int), media_score (int), schema_score (int), technical_score (int), social_score (int), factors (jsonb), suggestions (jsonb), build_id (text), created_at`. Add index on `(site_id, page_path)`. Enable RLS (no anon grant).

5. **`20260313000005_ai.sql`** — `research_sessions`, `research_results`, `chat_conversations`, `chat_messages`, `ai_jobs`. Research sessions: `id, user_id (uuid nullable), niche_idea (text), market (text), status (text), report (jsonb), created_at, updated_at`. Research results: `id, session_id (FK→research_sessions), result_type (text), content (jsonb), created_at`. Chat conversations: `id, user_id (uuid nullable), title (text), site_id (uuid nullable FK→sites), created_at, updated_at`. Chat messages: `id, conversation_id (FK→chat_conversations), role (text), content (text), created_at`. `ai_jobs`: `id, job_type (text), status (text default 'pending'), site_id (uuid nullable FK→sites), payload (jsonb), result (jsonb), error (text), bull_job_id (text), started_at (timestamptz), completed_at (timestamptz), created_at`. Enable RLS on all (no anon grants).

6. **`20260313000006_finances.sql`** — `cost_categories`, `costs`, `revenue_amazon`, `revenue_adsense`, `revenue_manual`, `revenue_daily`. Seed `cost_categories` with: `('hosting', 'Hosting')`, `('domains', 'Domains')`, `('ai', 'AI / LLM')`, `('tools', 'Tools & Services')`, `('other', 'Other')`. Costs: `id, category_slug (FK→cost_categories.slug), description (text), amount (numeric), currency (text default 'EUR'), period (text), site_id (uuid nullable FK→sites), date (date), created_at`. Revenue amazon: `id, site_id (FK→sites), date (date), clicks (int), items_ordered (int), earnings (numeric), currency (text), market (text), created_at`. Revenue adsense: `id, site_id (FK→sites), date (date), earnings (numeric), clicks (int), impressions (int), rpm (numeric), currency (text), created_at`. Revenue manual: `id, site_id (uuid nullable FK→sites), source (text), amount (numeric), currency (text default 'EUR'), date (date), notes (text), created_at`. Revenue daily: `id, site_id (FK→sites), date (date), total_revenue (numeric default 0), breakdown (jsonb), created_at, PRIMARY KEY(site_id, date)`. Enable RLS on all (no anon grants).

7. **`20260313000007_alerts.sql`** — `product_alerts`. Fields: `id, site_id (FK→sites), product_id (uuid nullable FK→tsa_products), alert_type (text not null), status (text default 'open'), details (jsonb), created_at, resolved_at (timestamptz)`. Alert types: `unavailable|category_empty|site_degraded`. Enable RLS (no anon grant).

8. Cross-check all 7 files: verify no FK references a table created in a later-numbered file; verify `sites` has no `asin`, `product_id`, or TSA-specific columns; verify `analytics_events` has both `ENABLE ROW LEVEL SECURITY` and the INSERT policy with `WITH CHECK (true)` not `USING (true)`.

9. Add a brief SQL comment block at the top of each file: `-- Migration NNN: <concern area>. Applies: <table names>.`

## Must-Haves

- [ ] 7 files exist in `packages/db/supabase/migrations/`
- [ ] `sites` table has zero TSA-specific columns
- [ ] `analytics_events` has RLS enabled + `FOR INSERT TO anon WITH CHECK (true)` policy
- [ ] All other tables have RLS enabled, no anon grants
- [ ] `site_types` seeded with `tsa` row; `cost_categories` seeded with 5 rows
- [ ] `focus_keyword` column present in `sites`, `tsa_categories`, `tsa_products`
- [ ] `domains` has `cf_zone_id`, `spaceship_id` columns
- [ ] `ai_jobs` has `bull_job_id` column
- [ ] No FK references a table created in a later migration file

## Verification

- `find packages/db/supabase/migrations -name "*.sql" | sort | wc -l` → `7`
- `grep -l "CREATE TABLE" packages/db/supabase/migrations/*.sql | wc -l` → `7` (each file has at least one CREATE TABLE)
- `grep "asin\|product_id" packages/db/supabase/migrations/20260313000001_core.sql` → empty (sites table clean)
- `grep "WITH CHECK (true)" packages/db/supabase/migrations/20260313000003_analytics.sql` → match found
- `grep "focus_keyword" packages/db/supabase/migrations/20260313000001_core.sql packages/db/supabase/migrations/20260313000002_tsa.sql` → matches in both

## Observability Impact

- Signals added/changed: `supabase_migrations` tracking table populated after push (T03 verifies this)
- How a future agent inspects this: `psql $SUPABASE_DB_URL -c "SELECT name FROM supabase_migrations ORDER BY name;"` shows which migrations applied
- Failure state exposed: if a migration fails in T03, the error message names the failing file and statement

## Inputs

- `packages/db/supabase/migrations/` — empty directory from S01 scaffold
- `docs/PRD.md` § "Modelo de Datos" — authoritative table/field specification
- `.gsd/DECISIONS.md` — D001, D004, D005, D006, D009, D011 all affect schema shape
- S02-RESEARCH.md § "Schema Design" — key field decisions and rationale

## Expected Output

- 7 `.sql` files in `packages/db/supabase/migrations/`, each with correct SQL, comments, RLS policies, and seed data where applicable
