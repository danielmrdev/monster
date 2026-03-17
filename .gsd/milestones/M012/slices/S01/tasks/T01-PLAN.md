---
estimated_steps: 6
estimated_files: 4
---

# T01: Write and apply the three migration SQL files

**Slice:** S01 — DB Migrations
**Milestone:** M012

## Description

Write three additive migration SQL files and apply them to the Supabase database. These are the gating schema changes for the entire M012 milestone.

## Steps

1. Check the most recent migration timestamp in `packages/db/supabase/migrations/` and create files with `20260317000001`, `20260317000002`, `20260317000003` prefixes (or appropriate timestamps).
2. Write `_homepage_seo_text.sql`: `ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_seo_text text;`
3. Write `_product_meta_description.sql`: `ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS meta_description text;`
4. Write `_template_slug_namespace.sql`: INSERT three new rows into `site_templates` (`tsa/classic`, `tsa/modern`, `tsa/minimal`) with same names as their bare counterparts; UPDATE `sites SET template_slug = 'tsa/' || template_slug WHERE template_slug IN ('classic', 'modern', 'minimal')`. Use `ON CONFLICT (slug) DO NOTHING` for the INSERT to make it idempotent.
5. Source SUPABASE_DB_URL from root `.env` (KN002 pattern) and apply all three files via `psql` or a Node pg script.
6. Verify each migration landed: query for column existence and for the `tsa/*` rows in `site_templates`.

## Must-Haves

- [ ] `sites.homepage_seo_text` column exists (confirmed via psql \d or SELECT)
- [ ] `tsa_products.meta_description` column exists
- [ ] `site_templates` has `tsa/classic`, `tsa/modern`, `tsa/minimal` rows
- [ ] No `sites` row has bare `classic`/`modern`/`minimal` as `template_slug` (all updated to `tsa/*`)
- [ ] All three SQL files exist in `packages/db/supabase/migrations/`

## Verification

- `export $(grep SUPABASE_DB_URL /home/daniel/monster/.env | xargs) && psql $SUPABASE_DB_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='sites' AND column_name='homepage_seo_text'"` → 1 row
- `psql $SUPABASE_DB_URL -c "SELECT slug FROM site_templates WHERE slug LIKE 'tsa/%'"` → 3 rows

## Observability Impact

- **New columns visible:** After applying migrations, `information_schema.columns` returns rows for `sites.homepage_seo_text` and `tsa_products.meta_description`. Absence means the migration script did not run against this environment.
- **Template slug rows:** `SELECT slug FROM site_templates WHERE slug LIKE 'tsa/%'` returns exactly 3 rows. Zero rows means File 3 was not applied; 1–2 rows means partial failure.
- **Site slug updates:** `SELECT COUNT(*) FROM sites WHERE template_slug IN ('classic','modern','minimal')` returns 0 after migration. Non-zero means the UPDATE in File 3 did not run.
- **Failure state:** If psql exits non-zero, check: (a) SUPABASE_DB_URL exported correctly from `.env`, (b) Supabase project is not paused, (c) network/VPN connectivity. Exit code 2 = connection refused; exit code 1 = SQL error (inspect stderr for constraint violations).
- **Idempotency:** All three files are safe to re-run (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Re-application produces no rows-changed and no error.

## Inputs

- `packages/db/supabase/migrations/` — existing migration files (for timestamp precedent)
- Root `.env` — SUPABASE_DB_URL (KN002)
- `.gsd/DECISIONS.md` D159 — slug naming convention

## Expected Output

- `packages/db/supabase/migrations/20260317000001_homepage_seo_text.sql`
- `packages/db/supabase/migrations/20260317000002_product_meta_description.sql`
- `packages/db/supabase/migrations/20260317000003_template_slug_namespace.sql`
- Supabase DB has all three schema changes applied
