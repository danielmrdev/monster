---
id: T02
parent: S01
milestone: M012
provides:
  - packages/db/src/types/supabase.ts with homepage_seo_text on sites and meta_description on tsa_products
  - packages/db/dist/ rebuilt with updated type declarations
key_files:
  - packages/db/src/types/supabase.ts
  - packages/db/dist/index.d.ts
key_decisions:
  - Supabase CLI not available in this environment; manual type edits used (matches D112 pattern documented in T01)
patterns_established:
  - Manual supabase.ts edit pattern: add new nullable column alphabetically within Row (required), Insert (optional), Update (optional) for each affected table
observability_surfaces:
  - "grep -c 'homepage_seo_text|meta_description' packages/db/dist/index.d.ts — returns 18 (≥2 threshold) confirming both fields compiled"
  - "grep 'homepage_seo_text|meta_description' packages/db/src/types/supabase.ts — returns 6 lines (Row+Insert+Update for both tables)"
duration: ~3min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Update Supabase TypeScript types and rebuild @monster/db

**Manually added `homepage_seo_text` to sites and `meta_description` to tsa_products in supabase.ts, then rebuilt @monster/db — dist/index.d.ts now contains 18 matches across Row/Insert/Update for both fields.**

## What Happened

Supabase CLI (`pnpm supabase`) was not available in this environment, consistent with the D112 fallback path documented in the plan. Manual edits were made directly to `packages/db/src/types/supabase.ts`:

1. **sites table** — added `homepage_seo_text: string | null` to Row, `homepage_seo_text?: string | null` to Insert and Update (alphabetical placement between `focus_keyword` and `id`)
2. **tsa_products table** — added `meta_description: string | null` to Row, `meta_description?: string | null` to Insert and Update (alphabetical placement between `last_checked_at` and `original_price`)

Then ran `pnpm --filter @monster/db build` which completed in ~2.9s (tsup, ESM + DTS), producing `dist/index.js` (1.23 KB) and `dist/index.d.ts` (115.66 KB).

## Verification

```
# Source file has 6 occurrences (Row+Insert+Update × 2 tables)
grep -n "homepage_seo_text\|meta_description" packages/db/src/types/supabase.ts
→ lines 907, 930, 953 (sites), 1047, 1072, 1097 (tsa_products)

# Build exits 0
pnpm --filter @monster/db build → ESM ⚡️ Build success in 16ms, DTS ⚡️ Build success in 1517ms

# Dist has 18 occurrences (type aliases multiply each declaration ~3x)
grep -c "homepage_seo_text\|meta_description" packages/db/dist/index.d.ts → 18
```

All must-haves confirmed:
- [x] `supabase.ts` has `homepage_seo_text` in sites Row/Insert/Update
- [x] `supabase.ts` has `meta_description` in tsa_products Row/Insert/Update
- [x] `pnpm --filter @monster/db build` exits 0
- [x] `grep homepage_seo_text packages/db/dist/index.d.ts` returns matches

## Diagnostics

- **Type presence:** `grep -c "homepage_seo_text\|meta_description" packages/db/dist/index.d.ts` → ≥2 (actual: 18)
- **Source vs dist comparison:** `grep -r "homepage_seo_text" packages/db/src packages/db/dist` — both should have matches; missing from dist means build not run
- **Downstream exposure check:** `grep -r "homepage_seo_text" apps/admin/` — will show zero until T03+ wires it into admin components

## Deviations

- Supabase CLI unavailable → used manual edit path (expected fallback per plan step 2)

## Known Issues

None.

## Files Created/Modified

- `packages/db/src/types/supabase.ts` — added `homepage_seo_text` to sites Row/Insert/Update; added `meta_description` to tsa_products Row/Insert/Update
- `packages/db/dist/index.d.ts` — rebuilt, now contains both new field declarations (18 grep matches)
- `packages/db/dist/index.js` — rebuilt (1.23 KB, ESM)
- `.gsd/milestones/M012/slices/S01/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
