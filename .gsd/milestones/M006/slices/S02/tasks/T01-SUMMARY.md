---
id: T01
parent: S02
milestone: M006
provides:
  - Migration 20260314000004_alerts_severity.sql applied — product_alerts.severity column (NOT NULL DEFAULT 'warning', check IN ('warning','critical'))
  - Migration 20260314000005_product_source_image.sql applied — tsa_products.source_image_url column (nullable text)
  - supabase.ts types updated — severity in product_alerts Row/Insert/Update; source_image_url in tsa_products Row/Insert/Update
  - diffProducts() pure function in packages/agents/src/diff-engine.ts — zero external imports
  - 10 unit tests in diff-engine.test.ts — all passing
  - vitest ^3.0.0 added to packages/agents devDependencies with test script
key_files:
  - packages/db/supabase/migrations/20260314000004_alerts_severity.sql
  - packages/db/supabase/migrations/20260314000005_product_source_image.sql
  - packages/db/src/types/supabase.ts
  - packages/agents/package.json
  - packages/agents/src/diff-engine.ts
  - packages/agents/src/diff-engine.test.ts
key_decisions:
  - diffProducts() does not emit a ProductChange for SERP-absent products — they go into serpAbsentAsins only; availability change semantics are handled entirely by the job handler (T02/T03)
  - shouldRebuild uses an explicit Set of triggers ('price','availability','image') defined locally — avoids importing REBUILD_TRIGGERS from @monster/shared (which uses 'images' plural, not matching 'image' singular)
  - Image diff skipped when source_image_url is null in DB — prevents false positives for products that haven't yet been through the download/optimize pipeline
patterns_established:
  - Migrations applied to Supabase Cloud via postgres npm package installed in /tmp (same pattern as M006/S01/T02) — no Supabase CLI auth needed, just SUPABASE_DB_URL from .env
  - supabase.ts types updated manually after migration apply; fields added in alphabetical order within each block (Row/Insert/Update) for consistency
observability_surfaces:
  - none (pure functions, no runtime logging; test output is the inspection surface)
duration: ~20min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Migrations + Diff Engine + Unit Tests

**Two schema migrations applied to Supabase Cloud, `diffProducts()` pure function implemented with zero external imports, and 10 unit tests covering all categorization rules pass.**

## What Happened

Wrote both migrations first, then applied them directly to Supabase Cloud using the postgres npm package installed in /tmp (established pattern from S01/T02). The DROP CONSTRAINT IF EXISTS in migration 004 produced a NOTICE (constraint didn't exist yet) — harmless, column and constraint both applied successfully.

Updated supabase.ts manually: added `severity` field to `product_alerts` Row/Insert/Update (required, so Insert/Update have optional `?` variant), and `source_image_url` to `tsa_products` Row/Insert/Update (nullable text, optional in Insert/Update).

Implemented `diffProducts()` with no external imports. Key decision: SERP-absent products don't produce a `ProductChange` entry — the handler is responsible for translating absence into availability changes and alerts. This keeps the diff engine's responsibility narrow (classify changes for products we have data for) and avoids the engine needing to know what DB write to perform.

Added vitest to packages/agents following the exact seo-scorer pattern. All 10 tests written and passing on first run.

## Verification

```
pnpm --filter @monster/agents test
# → 10/10 tests pass (verbose reporter shows each test name)

pnpm --filter @monster/agents typecheck
# → exit 0, no errors
```

Migrations confirmed applied by exit 0 on the postgres client calls and no error output from Supabase.

## Diagnostics

- Test output: `pnpm --filter @monster/agents test` — verbose reporter shows all 10 test names + timing
- Migration state: confirmed by exit-0 apply + supabase.ts type alignment (typecheck would fail if columns missing)

## Deviations

None — plan executed as written.

## Known Issues

None.

## Files Created/Modified

- `packages/db/supabase/migrations/20260314000004_alerts_severity.sql` — new migration, severity column + check constraint
- `packages/db/supabase/migrations/20260314000005_product_source_image.sql` — new migration, source_image_url column
- `packages/db/src/types/supabase.ts` — severity added to product_alerts; source_image_url added to tsa_products
- `packages/agents/package.json` — vitest devDep + test script added
- `packages/agents/src/diff-engine.ts` — new: pure diff engine, exported types
- `packages/agents/src/diff-engine.test.ts` — new: 10 unit tests, all passing
