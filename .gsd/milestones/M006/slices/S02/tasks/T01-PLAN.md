---
estimated_steps: 8
estimated_files: 6
---

# T01: Migrations + Diff Engine + Unit Tests

**Slice:** S02 — Diff Engine + Conditional Rebuild + Alert Creation
**Milestone:** M006

## Description

Write two schema migrations, add vitest to `packages/agents`, implement the diff engine as pure functions with no external dependencies, and write unit tests covering all categorization rules. This is the foundation T02 and T03 build on — getting the logic right here before wiring saves debugging in the live job.

Zero external imports in `diff-engine.ts` (no `@monster/*`, no `bullmq`, no `ioredis`) — the diff engine takes plain data in and returns typed results out. All Supabase and queue interactions stay in the handler.

## Steps

1. **Write migration `20260314000004_alerts_severity.sql`**: `ALTER TABLE product_alerts ADD COLUMN IF NOT EXISTS severity text NOT NULL DEFAULT 'warning'; ALTER TABLE product_alerts ADD CONSTRAINT product_alerts_severity_check CHECK (severity IN ('warning', 'critical'));`

2. **Write migration `20260314000005_product_source_image.sql`**: `ALTER TABLE tsa_products ADD COLUMN IF NOT EXISTS source_image_url text;`

3. **Apply both migrations** to Supabase Cloud via `postgres` npm package using `SUPABASE_DB_URL` (same pattern as S01/T02):
   ```
   node -e "
   import('postgres').then(async ({default: sql_factory}) => {
     const sql = sql_factory(process.env.SUPABASE_DB_URL);
     await sql.file('packages/db/supabase/migrations/20260314000004_alerts_severity.sql');
     await sql.file('packages/db/supabase/migrations/20260314000005_product_source_image.sql');
     await sql.end();
     console.log('done');
   })
   "
   ```

4. **Update `packages/db/src/types/supabase.ts` manually**: Add `severity: string` to `product_alerts` Row/Insert/Update. Add `source_image_url: string | null` to `tsa_products` Row, `source_image_url?: string | null` to Insert/Update.

5. **Add vitest** to `packages/agents/package.json`: add `"vitest": "^3.0.0"` to devDependencies, add `"test": "vitest run --reporter verbose"` to scripts. Follow seo-scorer's exact pattern.

6. **Implement `packages/agents/src/diff-engine.ts`**:

   Zero external imports — no `@monster/*`, no `bullmq`, no `ioredis`. All types are self-contained.

   Types:
   ```ts
   export type ChangeType = 'price' | 'availability' | 'image' | 'rating';
   
   export interface ProductChange {
     type: ChangeType;
     asin: string;
     old: unknown;
     new: unknown;
   }
   
   export interface DbProduct {
     asin: string;
     current_price: number | null;
     availability: string | null;
     source_image_url: string | null;
     rating: number | null;
   }
   
   export interface DfsProduct {
     asin: string;
     price: number | null;
     imageUrl: string | null;
     rating: number;
   }
   
   export interface DiffResult {
     changes: ProductChange[];
     serpAbsentAsins: string[];   // ASINs in DB but not in DFS result
     shouldRebuild: boolean;
     rebuildReason: string;
   }
   ```

   `diffProducts(dbProducts: DbProduct[], dfsProducts: DfsProduct[]): DiffResult`:
   - Build a map of DFS products by ASIN
   - For each DB product: if not in DFS map → add to `serpAbsentAsins` (treated as availability='limited', no ProductChange)
   - For each DB product present in DFS map:
     - Price change: `Math.abs((dfsPrice ?? 0) - (dbPrice ?? 0)) > 0.01` OR `(dfsPrice === null) !== (dbPrice === null)` → `type: 'price'` change (rebuild-triggering)
     - Image change: `source_image_url !== null && dfsImageUrl !== null && dfsImageUrl !== source_image_url` → `type: 'image'` change (rebuild-triggering)
     - Rating change: `Math.abs((dfsRating) - (dbRating ?? 0)) > 0.01` → `type: 'rating'` change (NOT rebuild-triggering)
   - `shouldRebuild`: `changes.some(c => c.type === 'price' || c.type === 'availability' || c.type === 'image')` — explicit set, no `@monster/shared` import (avoids external dep; `REBUILD_TRIGGERS` uses `'images'` plural which doesn't match `'image'` singular anyway)
   - `rebuildReason`: first rebuild-triggering change type or `'none'`

7. **Write `packages/agents/src/diff-engine.test.ts`** with vitest:
   - Price change triggers rebuild (old=9.99, new=12.99)
   - Price within epsilon does NOT trigger rebuild (old=9.99, new=9.991)
   - null→number price change triggers rebuild
   - Rating change does NOT trigger rebuild
   - SERP-absent ASIN lands in `serpAbsentAsins`, not in `changes`
   - Image URL change triggers rebuild (when source_image_url is set)
   - Image diff skipped when `source_image_url` is null
   - `shouldRebuild === false` when only rating changes
   - `shouldRebuild === true` when price changes + rating changes (mixed)
   - Empty DFS result → all DB products in serpAbsentAsins, no changes

8. **Run `pnpm install`** from monorepo root (to install vitest in packages/agents), then `pnpm --filter @monster/agents test`.

## Must-Haves

- [ ] Migration 004 applied: `product_alerts.severity` column exists in Supabase Cloud
- [ ] Migration 005 applied: `tsa_products.source_image_url` column exists in Supabase Cloud
- [ ] `supabase.ts` types updated (typecheck will fail in T02 without this)
- [ ] `diffProducts()` is a pure function — zero Supabase/BullMQ/ioredis imports
- [ ] `serpAbsentAsins` populated correctly for products in DB but absent from DFS result
- [ ] Float epsilon check (`> 0.01`) used for price comparison, not strict equality
- [ ] All 10 unit tests pass via `pnpm --filter @monster/agents test`
- [ ] `ChangeType` exported (T02 imports it)

## Verification

- `pnpm --filter @monster/agents test` → all tests pass, reporter shows each test name
- Check Supabase Cloud has `severity` column: migration apply step exits 0 without error
- `pnpm --filter @monster/agents typecheck` → exit 0 (diff-engine.ts has no external type errors)

## Observability Impact

- No runtime signals (pure functions, no logging)
- Test output is the inspection surface — `vitest run --reporter verbose` shows each test pass/fail

## Inputs

- `packages/db/supabase/migrations/20260313000007_alerts.sql` — existing alert_type constraint (`'unavailable','category_empty','site_degraded'`) — no change needed
- `packages/db/supabase/migrations/20260313000002_tsa.sql` — tsa_products schema baseline
- `packages/shared/src/constants/index.ts` — `REBUILD_TRIGGERS` constant
- `packages/seo-scorer/package.json` — exact vitest devDep + test script pattern to copy

## Expected Output

- `packages/db/supabase/migrations/20260314000004_alerts_severity.sql` — new migration
- `packages/db/supabase/migrations/20260314000005_product_source_image.sql` — new migration
- `packages/db/src/types/supabase.ts` — severity + source_image_url fields added
- `packages/agents/package.json` — vitest devDep + test script
- `packages/agents/src/diff-engine.ts` — pure diff engine with exported types
- `packages/agents/src/diff-engine.test.ts` — 10 unit tests, all passing
