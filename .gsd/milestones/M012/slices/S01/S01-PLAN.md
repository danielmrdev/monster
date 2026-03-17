# S01: DB Migrations

**Goal:** Apply three additive schema changes that unlock all subsequent slices: `homepage_seo_text` on `sites`, `meta_description` on `tsa_products`, and template slug namespace migration to `tsa/*`.
**Demo:** Run SQL against Supabase and confirm: `sites` has `homepage_seo_text` column; `tsa_products` has `meta_description` column; `site_templates` rows for `tsa/classic`, `tsa/modern`, `tsa/minimal` exist; no existing site has a bare (`classic`/`modern`/`minimal`) slug.

## Must-Haves

- `sites.homepage_seo_text text` column exists (nullable)
- `tsa_products.meta_description text` column exists (nullable)
- `site_templates` has rows with slugs `tsa/classic`, `tsa/modern`, `tsa/minimal`
- All existing `sites.template_slug` values updated from bare slugs to `tsa/*` equivalents
- `packages/db/src/types/supabase.ts` regenerated (or manually updated) to include new columns
- `packages/db` builds cleanly after type update

## Observability / Diagnostics

- **Schema inspection:** `psql $SUPABASE_DB_URL -c "\d sites"` and `\d tsa_products` show new columns. If columns are missing, migration was not applied.
- **Template rows:** `psql $SUPABASE_DB_URL -c "SELECT slug FROM site_templates ORDER BY slug"` shows `tsa/classic`, `tsa/modern`, `tsa/minimal` rows. If absent, File 3 migration failed.
- **Type visibility:** `grep homepage_seo_text packages/db/dist/index.d.ts` returns a hit post-rebuild. If missing, type sync was not run.
- **Failure path:** If psql exits non-zero (e.g. SSL error, auth failure), the SUPABASE_DB_URL in `.env` is likely malformed or the session tunnel is down — check `packages/db/.env` fallback and Supabase dashboard connectivity.
- **Idempotency check:** Re-running any migration file should produce no error (all use `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`).

## Verification

- `pnpm --filter @monster/db build` exits 0
- `pnpm --filter @monster/admin typecheck` (or build) exits 0 with updated types visible
- `psql $SUPABASE_DB_URL -c "SELECT column_name FROM information_schema.columns WHERE table_name='sites' AND column_name='homepage_seo_text'"` → 1 row returned
- `psql $SUPABASE_DB_URL -c "SELECT slug FROM site_templates WHERE slug LIKE 'tsa/%'"` → 3 rows returned
- If psql is unavailable: node -e `require('@monster/db')` resolves without type errors after rebuild

## Tasks

- [x] **T01: Write and apply the three migration SQL files** `est:30m`
  - Why: Schema changes are gating — nothing else in M012 can land without these columns and slug rows in DB.
  - Files: `packages/db/supabase/migrations/20260317000001_homepage_seo_text.sql`, `packages/db/supabase/migrations/20260317000002_product_meta_description.sql`, `packages/db/supabase/migrations/20260317000003_template_slug_namespace.sql`
  - Do: Write three separate migration files following the timestamp prefix pattern. File 1: `ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_seo_text text`. File 2: `ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS meta_description text`. File 3: INSERT new `tsa/classic`, `tsa/modern`, `tsa/minimal` rows into `site_templates` + UPDATE `sites SET template_slug = 'tsa/' || template_slug WHERE template_slug IN ('classic','modern','minimal')`. Apply all three via the project's pg-based migration pattern (KN001/KN002): source SUPABASE_DB_URL from root .env, run node script or psql. Confirm columns and rows via SELECT.
  - Verify: `psql $SUPABASE_DB_URL -c "\d sites" | grep homepage_seo_text` returns a row; `psql $SUPABASE_DB_URL -c "\d tsa_products" | grep meta_description` returns a row; `psql $SUPABASE_DB_URL -c "SELECT slug FROM site_templates WHERE slug LIKE 'tsa/%'"` returns 3 rows.
  - Done when: All three SELECT checks pass without error.

- [ ] **T02: Update Supabase TypeScript types and rebuild @monster/db** `est:20m`
  - Why: Downstream packages (admin, agents) resolve types from `packages/db/dist/index.d.ts`. Without a rebuild the new columns are invisible to TypeScript (D098 pattern).
  - Files: `packages/db/src/types/supabase.ts`, `packages/db/dist/`
  - Do: Attempt `supabase gen types typescript --project-id <id> > packages/db/src/types/supabase.ts`. If CLI sync fails (D112 pattern), manually add the new columns to `supabase.ts`: add `homepage_seo_text: string | null` to the `sites` Row/Insert/Update interfaces, add `meta_description: string | null` to the `tsa_products` Row/Insert/Update interfaces. Then run `pnpm --filter @monster/db build`.
  - Verify: `pnpm --filter @monster/db build` exits 0; `grep homepage_seo_text packages/db/dist/index.d.ts` returns a hit; `grep meta_description packages/db/dist/index.d.ts` returns a hit.
  - Done when: Both grep checks pass and db build exits 0.

## Files Likely Touched

- `packages/db/supabase/migrations/20260317000001_homepage_seo_text.sql`
- `packages/db/supabase/migrations/20260317000002_product_meta_description.sql`
- `packages/db/supabase/migrations/20260317000003_template_slug_namespace.sql`
- `packages/db/src/types/supabase.ts`
