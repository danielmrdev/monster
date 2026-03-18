---
id: T01
parent: S01
milestone: M013
provides:
  - CategoryData.description field in generator data.ts
  - ProductData.original_price field in generator data.ts
  - Complete fixture site.json with all SiteInfo, CategoryData, ProductData fields
  - SiteTemplate type updated with 'tsa/classic' in packages/shared
  - Rebuilt packages/shared dist with updated type declarations
key_files:
  - apps/generator/src/lib/data.ts
  - apps/generator/src/data/fixture/site.json
  - packages/shared/src/types/index.ts
  - packages/shared/dist/index.d.ts
key_decisions:
  - fixture template_slug changed to 'tsa/classic' (aligns with D159/D169, unblocks T03 layout work)
patterns_established:
  - Pure TypeScript type aliases (export type) are erased at compile time; verify in dist/index.d.ts not dist/index.js
observability_surfaces:
  - grep -n "description\|original_price" apps/generator/src/lib/data.ts — confirms interface fields present
  - grep 'tsa/classic' packages/shared/dist/index.d.ts — confirms SiteTemplate update in dist
  - SITE_SLUG=fixture pnpm --filter @monster/generator check — 8 errors remaining are dispatch-only (T03 target), zero data-gap errors
duration: 8m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Add description and original_price to data interfaces and fixture

**Added `CategoryData.description` and `ProductData.original_price` to generator interfaces, completed fixture site.json with all missing fields, and added `'tsa/classic'` to the shared `SiteTemplate` type.**

## What Happened

The generator's `data.ts` interfaces and fixture JSON were both incomplete relative to what the milestone spec requires. Three targeted edits closed all gaps:

1. **`apps/generator/src/lib/data.ts`**: Added `description: string | null` to `CategoryData` (after `keywords`) and `original_price: number | null` to `ProductData` (after `current_price`).

2. **`apps/generator/src/data/fixture/site.json`**: Added missing `SiteInfo` fields (`id`, `focus_keyword`, `supabase_url`, `supabase_anon_key`, `contact_email`) to the site object; added `description`, `focus_keyword`, and `meta_description` to both category objects; added `original_price`, `focus_keyword`, `user_opinions_summary`, and `meta_description` to all four product objects. Also updated `template_slug` from `"classic"` to `"tsa/classic"` to align with the new unified slug.

3. **`packages/shared/src/types/index.ts`**: Added `'tsa/classic'` to the `SiteTemplate` union. Rebuilt shared with `pnpm --filter @monster/shared build` — dist emitted in 20ms.

## Verification

```bash
# Interface fields confirmed
grep -n "description\|original_price" apps/generator/src/lib/data.ts
# line 41: description: string | null
# line 57: original_price: number | null

# Shared build exited 0
pnpm --filter @monster/shared build
# ESM dist/index.js 3.55 KB — Build success

# SiteTemplate update in declaration file
grep 'tsa/classic' packages/shared/dist/index.d.ts
# type SiteTemplate = 'classic' | 'modern' | 'minimal' | 'tsa/classic';

# astro check: 8 errors remain, all are pre-existing triple-dispatch errors (T03 target)
# Zero data-gap errors — all missing fields are now present
SITE_SLUG=fixture pnpm --filter @monster/generator check
# Result (11 files): 8 errors, 0 warnings, 0 hints
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `grep -n "description\|original_price" apps/generator/src/lib/data.ts` | 0 | ✅ pass | <1s |
| 2 | `pnpm --filter @monster/shared build` | 0 | ✅ pass | 3.0s |
| 3 | `grep 'tsa/classic' packages/shared/dist/index.d.ts` | 0 | ✅ pass | <1s |
| 4 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 1 | ✅ pass (8 dispatch errors, 0 data-gap errors — expected) | 6.5s |

## Diagnostics

- `grep -n "description\|original_price" apps/generator/src/lib/data.ts` — confirms both interface fields are present
- `grep '"id": "fixture-site-001"' apps/generator/src/data/fixture/site.json` — confirms site object updated
- `grep '"original_price": null' apps/generator/src/data/fixture/site.json | wc -l` — must print `4`
- `grep '"description":' apps/generator/src/data/fixture/site.json | wc -l` — must print `2`
- `grep 'tsa/classic' packages/shared/dist/index.d.ts` — confirms SiteTemplate type is in dist (NOT dist/index.js — pure type aliases are erased at compile time)
- `SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -40` — shows remaining errors (should all be dispatch comparisons, not data-gap errors)

## Deviations

- The task plan's verification step `grep 'tsa/classic' packages/shared/dist/index.js` is incorrect — `SiteTemplate` is a pure type alias and is erased at compile time. It only exists in `dist/index.d.ts`. Ran the correct command against the declaration file instead. Documented in KN015.
- fixture `template_slug` updated from `"classic"` to `"tsa/classic"` — this is required for T03's layout dispatch removal to work correctly at runtime.

## Known Issues

None. The 8 remaining `astro check` errors are the pre-existing triple-dispatch comparisons (`tsa/modern`, `tsa/minimal`) that T03 will eliminate by removing the dispatch logic entirely.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — Added `description: string | null` to `CategoryData`, `original_price: number | null` to `ProductData`
- `apps/generator/src/data/fixture/site.json` — Added all missing `SiteInfo`, `CategoryData`, and `ProductData` fields; updated `template_slug` to `'tsa/classic'`
- `packages/shared/src/types/index.ts` — Added `'tsa/classic'` to `SiteTemplate` union
- `packages/shared/dist/index.d.ts` — Rebuilt (automated by shared build step)
- `.gsd/milestones/M013/slices/S01/S01-PLAN.md` — Added `## Observability / Diagnostics` section and diagnostic check in Verification (pre-flight fix)
- `.gsd/milestones/M013/slices/S01/tasks/T01-PLAN.md` — Added `## Observability Impact` section (pre-flight fix)
- `.gsd/KNOWLEDGE.md` — Added KN015 (type aliases in dist/index.d.ts not index.js)
