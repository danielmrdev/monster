---
id: T01
parent: S01
milestone: M012
provides:
  - sites.homepage_seo_text column in Supabase
  - tsa_products.meta_description column in Supabase
  - site_templates rows tsa/classic, tsa/modern, tsa/minimal
  - All existing sites migrated to tsa/* template slug namespace
key_files:
  - packages/db/supabase/migrations/20260317000001_homepage_seo_text.sql
  - packages/db/supabase/migrations/20260317000002_product_meta_description.sql
  - packages/db/supabase/migrations/20260317000003_template_slug_namespace.sql
key_decisions:
  - Used IF NOT EXISTS / ON CONFLICT DO NOTHING for idempotency on all three migrations
  - Applied via Node.js pg client (psql not available in this environment)
patterns_established:
  - Node pg client migration pattern: require pnpm/pg@8.20.0 from node_modules/.pnpm, use ssl: {rejectUnauthorized:false}, always call client.end()
observability_surfaces:
  - "SELECT column_name FROM information_schema.columns WHERE table_name='sites' AND column_name='homepage_seo_text'"
  - "SELECT slug FROM site_templates WHERE slug LIKE 'tsa/%'"
  - "SELECT COUNT(*) FROM sites WHERE template_slug IN ('classic','modern','minimal') -- expect 0"
duration: 15m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Write and apply the three migration SQL files

**Added homepage_seo_text to sites, meta_description to tsa_products, and namespaced template slugs to tsa/* in Supabase.**

## What Happened

Wrote three additive migration SQL files and applied them to the live Supabase database using a Node.js pg client script (psql is not available in this environment).

- **File 1** (`20260317000001_homepage_seo_text.sql`): `ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_seo_text text` — unlocks S02 homepage SEO text generation.
- **File 2** (`20260317000002_product_meta_description.sql`): `ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS meta_description text` — unlocks S02 product AI content fields.
- **File 3** (`20260317000003_template_slug_namespace.sql`): Inserted `tsa/classic`, `tsa/modern`, `tsa/minimal` rows into `site_templates` with `ON CONFLICT DO NOTHING`, then `UPDATE sites SET template_slug = 'tsa/' || template_slug WHERE template_slug IN ('classic','modern','minimal')` to migrate existing data.

All three applied successfully in a single pg client session. No existing site rows had bare slugs (the UPDATE affected 0 rows — no sites existed with bare slugs, which is correct).

## Verification

Four verification queries run after migration:

1. `sites.homepage_seo_text` column: **1 row** ✓
2. `tsa_products.meta_description` column: **1 row** ✓
3. `site_templates WHERE slug LIKE 'tsa/%'`: **3 rows** (`tsa/classic`, `tsa/minimal`, `tsa/modern`) ✓
4. `sites WHERE template_slug IN ('classic','modern','minimal')`: **0 rows** (no bare slugs remain) ✓

## Diagnostics

- Column existence: `SELECT column_name FROM information_schema.columns WHERE table_name='sites' AND column_name='homepage_seo_text'` → 1 row means applied
- Template slugs: `SELECT slug FROM site_templates WHERE slug LIKE 'tsa/%' ORDER BY slug` → 3 rows means applied
- Bare slug cleanup: `SELECT COUNT(*) FROM sites WHERE template_slug IN ('classic','modern','minimal')` → 0 means migration complete
- Re-running any migration file is safe (all use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`)

## Deviations

- Used Node.js pg client instead of psql (psql not available in this environment). Functionally equivalent — same SQL executed via the same connection string.

## Known Issues

None. T02 (type regeneration) must run next to expose the new columns in TypeScript.

## Files Created/Modified

- `packages/db/supabase/migrations/20260317000001_homepage_seo_text.sql` — adds homepage_seo_text to sites
- `packages/db/supabase/migrations/20260317000002_product_meta_description.sql` — adds meta_description to tsa_products
- `packages/db/supabase/migrations/20260317000003_template_slug_namespace.sql` — adds tsa/* template rows + migrates site slugs
