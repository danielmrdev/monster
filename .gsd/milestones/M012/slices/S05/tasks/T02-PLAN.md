---
estimated_steps: 4
estimated_files: 1
---

# T02: Write the 8 legal template seed migration

**Slice:** S05 — Legal Templates Seed + Markdown Pipeline
**Milestone:** M012

## Description

Write and apply a migration that seeds 8 `legal_templates` rows (4 types × ES + EN) with proper markdown content and placeholder substitution markers.

## Steps

1. Check the `legal_templates` table schema: `psql $SUPABASE_DB_URL -c "\d legal_templates"` to confirm column names (title, type, language, content, etc.).
2. Write `packages/db/supabase/migrations/20260317000004_legal_templates_seed.sql` with 8 `INSERT INTO legal_templates (...) VALUES (...) ON CONFLICT DO NOTHING` statements. Content for each row must: use valid markdown (# headings, ## subheadings, **bold**, unordered lists); include `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, and `{{site.affiliate_tag}}` where semantically appropriate; be ~150-250 words each; be in the correct language (es/en). Template types: privacy (política de privacidad / privacy policy), terms (aviso legal / legal notice), cookies (política de cookies / cookie policy), contact (contacto / contact).
3. Apply the migration: source SUPABASE_DB_URL from root .env, run via `psql` or pg script.
4. Verify: `psql $SUPABASE_DB_URL -c "SELECT type, language, title FROM legal_templates ORDER BY type, language"` returns 8 rows.

## Must-Haves

- [ ] Migration file exists in `packages/db/supabase/migrations/`
- [ ] 8 rows in `legal_templates` (privacy/es, privacy/en, terms/es, terms/en, cookies/es, cookies/en, contact/es, contact/en)
- [ ] Each row content includes at least one `{{site.name}}` placeholder
- [ ] Migration is idempotent (ON CONFLICT DO NOTHING)

## Verification

- `psql $SUPABASE_DB_URL -c "SELECT COUNT(*) FROM legal_templates"` → ≥8
- `psql $SUPABASE_DB_URL -c "SELECT content FROM legal_templates LIMIT 1" | grep "{{site.name}}"` → hit

## Inputs

- `legal_templates` schema (confirm via psql before writing migration)
- `packages/db/supabase/migrations/` — timestamp pattern for filename

## Expected Output

- `packages/db/supabase/migrations/20260317000004_legal_templates_seed.sql`
- 8 seeded rows in Supabase `legal_templates` table
