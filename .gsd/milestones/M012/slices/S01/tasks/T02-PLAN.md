---
estimated_steps: 5
estimated_files: 2
---

# T02: Update Supabase TypeScript types and rebuild @monster/db

**Slice:** S01 — DB Migrations
**Milestone:** M012

## Description

Update `packages/db/src/types/supabase.ts` to include the two new columns (`homepage_seo_text` on sites, `meta_description` on tsa_products), then rebuild `@monster/db` so all downstream consumers (admin, agents) see the types.

## Steps

1. Attempt `pnpm supabase gen types typescript --project-id <id>` from `packages/db/`. If Supabase CLI sync works, overwrite `supabase.ts` with output.
2. If CLI sync fails (D112 pattern — migration history out of sync), manually edit `supabase.ts`: find the `sites` table interface and add `homepage_seo_text: string | null` to Row, `homepage_seo_text?: string | null` to Insert and Update.
3. Find the `tsa_products` table interface and add `meta_description: string | null` to Row, `meta_description?: string | null` to Insert and Update.
4. Run `pnpm --filter @monster/db build` and confirm exit 0.
5. Verify new fields appear in `packages/db/dist/index.d.ts`.

## Must-Haves

- [ ] `supabase.ts` has `homepage_seo_text` in sites Row/Insert/Update
- [ ] `supabase.ts` has `meta_description` in tsa_products Row/Insert/Update
- [ ] `pnpm --filter @monster/db build` exits 0
- [ ] `grep homepage_seo_text packages/db/dist/index.d.ts` returns a match

## Verification

- `pnpm --filter @monster/db build` exits 0
- `grep -c "homepage_seo_text\|meta_description" packages/db/dist/index.d.ts` returns ≥2

## Inputs

- `packages/db/src/types/supabase.ts` — existing type file (read before editing)
- T01 completed — DB columns must exist before types are meaningful

## Expected Output

- `packages/db/src/types/supabase.ts` — updated with two new column types
- `packages/db/dist/` — rebuilt, contains updated type declarations
