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

## Observability Impact

**What signals change after this task:**
- `legal_templates` table gains 8 rows — any query against it (REST API, admin panel, generator) will return content instead of empty results.
- `interpolateLegal()` in the generator now has real data to substitute; fixture builds will produce properly-titled legal pages.

**How to inspect this task later:**
```bash
# Count rows — should return 8
curl -s "https://<project>.supabase.co/rest/v1/legal_templates?select=count" \
  -H "apikey: <service_role>" -H "Prefer: count=exact" -I | grep content-range

# Check placeholder presence in all rows
curl -s "https://<project>.supabase.co/rest/v1/legal_templates?select=type,language,content" \
  -H "apikey: <service_role>" | python3 -c "import sys,json; rows=json.load(sys.stdin); [print(r['type'],r['language'],'{{site.name}}' in r['content']) for r in rows]"

# Verify idempotency — dry run should show "Remote database is up to date"
cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL --dry-run
```

**Failure state visibility:**
- If seed wasn't applied: REST call returns `[]` on `legal_templates`. Generator `[legal].astro` renders empty content areas (blank `<div>` for each legal page type).
- If placeholders are missing from a row: `interpolateLegal()` leaves those blocks as-is — literal `{{site.name}}` appears in rendered HTML, detectable via `grep '{{site\.' dist/*/privacidad/index.html`.
- If `ON CONFLICT (id) DO NOTHING` triggers (re-run): row count stays at 8, no error — idempotent behaviour confirmed.
