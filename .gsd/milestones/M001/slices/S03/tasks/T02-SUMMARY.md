---
id: T02
parent: S03
milestone: M001
provides:
  - packages/shared typed domain types (SiteStatus, AmazonMarket, Language, SiteTemplate, Site, TsaCategory, TsaProduct)
  - packages/shared constants (AMAZON_MARKETS, SUPPORTED_LANGUAGES, SITE_STATUS_FLOW, REBUILD_TRIGGERS)
  - packages/shared dist artifacts (ESM + .d.ts)
key_files:
  - packages/shared/src/types/index.ts
  - packages/shared/src/constants/index.ts
  - packages/shared/src/index.ts
  - packages/shared/tsup.config.ts
  - packages/shared/package.json
key_decisions:
  - SITE_STATUS_FLOW typed as Record<SiteStatus, SiteStatus[]> — tsc enforces exhaustiveness at typecheck time, not runtime
  - REBUILD_TRIGGERS uses `as const` tuple so downstream code gets the literal type ('price' | 'availability' | 'images') via RebuildTrigger export
  - AMAZON_MARKETS and SUPPORTED_LANGUAGES use `as const satisfies` to preserve literal types while validating against the AmazonMarket/Language union types
  - Site.customization typed as Record<string, unknown> | null (not Json) — more ergonomic in components without pulling in the Supabase Json type
patterns_established:
  - Same tsup config as packages/db (esm, dts:true, clean:true, no sourcemap) — established as the package build pattern for this monorepo
  - Barrel re-exports use .js extension in from paths (NodeNext resolution requires the JS extension in ESM source)
observability_surfaces:
  - "Build health: pnpm --filter @monster/shared build 2>&1 | tail -5 → exit 0 + tsup summary"
  - "Dist presence: ls -la packages/shared/dist/index.{js,d.ts}"
  - "Zero runtime deps: node -e \"const p=JSON.parse(require('fs').readFileSync('packages/shared/package.json','utf8')); console.log(Object.keys(p.dependencies||{}))\""
  - "Missing SiteStatus key: pnpm --filter @monster/shared typecheck 2>&1 — surfaces as Record<SiteStatus, ...> exhaustiveness error"
duration: ~20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Build `packages/shared` — domain types and constants

**Pure-TS zero-dep package delivering canonical domain types (7 string-literal unions + 3 interfaces) and 4 `as const` constants, building cleanly to ESM + .d.ts.**

## What Happened

Pre-flight applied: added Observability Impact section to T02-PLAN.md and failure-path diagnostic block to S03-PLAN.md's Verification section.

Implementation was straightforward — no surprises. Created the `src/types/` and `src/constants/` directory structure, wrote types from the supabase.ts Row shapes (narrowing raw `string` fields to the defined union types), wrote the four constants with explicit type annotations, wired the barrel, and matched the packages/db build config exactly.

One small decision on `AMAZON_MARKETS` and `SUPPORTED_LANGUAGES`: used `as const satisfies ReadonlyArray<...>` so the array items retain their literal string types (e.g., `slug: 'ES'`) while TypeScript validates all slugs are valid `AmazonMarket` values. This is more useful for downstream switch-exhaustiveness than `as const` alone.

`SITE_STATUS_FLOW` covers all 8 `SiteStatus` values. Because it's typed as `Record<SiteStatus, SiteStatus[]>`, adding or removing a status from the union type will cause a typecheck failure pointing directly to the missing/extra key.

## Verification

```
pnpm --filter @monster/shared build   → ESM 1.48 KB + DTS 4.73 KB, exit 0
pnpm --filter @monster/shared typecheck → exit 0, no output
ls packages/shared/dist/index.{js,d.ts} → both present
node -e "...zero deps check..."       → OK: zero runtime deps
```

SITE_STATUS_FLOW: all 8 keys (draft, generating, deploying, dns_pending, ssl_pending, live, paused, error) present — verified by reading dist/index.js output.

Slice-level checks run at this point:
- ✅ Both packages build: `pnpm --filter @monster/db build && pnpm --filter @monster/shared build` → exit 0
- ✅ All four dist artifacts present
- ✅ No Next.js leak in packages/db
- ✅ Zero runtime deps in packages/shared
- ⏳ Admin typecheck — T03 scope (admin workspace deps not yet wired)
- ⏳ Failure-path diagnostic (createServiceClient) — T03 scope

## Diagnostics

- **Build failure:** `pnpm --filter @monster/shared build 2>&1` → tsup exits non-zero with structured error pointing to file + line
- **Missing status key in SITE_STATUS_FLOW:** `pnpm --filter @monster/shared typecheck 2>&1` → tsc emits `Property 'X' is missing in type ...` pointing to the Record assignment
- **Dist inspection:** `ls -la packages/shared/dist/index.{js,d.ts}` — both non-zero size means build was not a no-op
- **Runtime deps check:** `node -e "const p=JSON.parse(require('fs').readFileSync('packages/shared/package.json','utf8')); console.log(Object.keys(p.dependencies||{}))"` → must print `[]`

## Deviations

1. **`as const satisfies` for AMAZON_MARKETS / SUPPORTED_LANGUAGES (minor):** Plan said `as const` objects. Used `as const satisfies ReadonlyArray<{...}>` instead, which is strictly more type-safe — validates all entries against the union types while preserving literal types. No downstream impact.
2. **`RebuildTrigger` type exported (unplanned):** Derived `type RebuildTrigger = (typeof REBUILD_TRIGGERS)[number]` and exported it alongside the array. Convenience type for consumers — zero cost.

## Known Issues

None.

## Files Created/Modified

- `packages/shared/src/types/index.ts` — new; 4 string-literal union types + 3 domain interfaces (Site, TsaCategory, TsaProduct)
- `packages/shared/src/constants/index.ts` — new; AMAZON_MARKETS (10 markets), SUPPORTED_LANGUAGES (6), SITE_STATUS_FLOW (8 states), REBUILD_TRIGGERS + RebuildTrigger type
- `packages/shared/src/index.ts` — new; barrel re-exporting everything from types and constants
- `packages/shared/tsup.config.ts` — new; ESM + dts, clean, no sourcemap
- `packages/shared/package.json` — updated; type:module, exports map, zero deps, build/typecheck/dev scripts
- `.gsd/milestones/M001/slices/S03/S03-PLAN.md` — pre-flight: added failure-path diagnostic block to Verification section
- `.gsd/milestones/M001/slices/S03/tasks/T02-PLAN.md` — pre-flight: added Observability Impact section
