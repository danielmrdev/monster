---
estimated_steps: 5
estimated_files: 5
---

# T02: Build `packages/shared` — domain types and constants

**Slice:** S03 — Shared Packages
**Milestone:** M001

## Description

Create the `packages/shared/src/` directory structure and write domain TypeScript types and constants. This package has zero runtime dependencies — it is pure TypeScript types and `as const` constant objects. Update `package.json` identically to `packages/db` (type:module, exports map, tsup build). The types here are the canonical domain model used across admin components and future packages.

## Steps

1. Create directory structure: `packages/shared/src/types/` and `packages/shared/src/constants/`
2. Write `packages/shared/src/types/index.ts` with string-literal union types and domain interfaces:
   - `SiteStatus = 'draft' | 'generating' | 'deploying' | 'dns_pending' | 'ssl_pending' | 'live' | 'paused' | 'error'`
   - `AmazonMarket = 'ES' | 'US' | 'UK' | 'DE' | 'FR' | 'IT' | 'MX' | 'CA' | 'JP' | 'AU'`
   - `Language = 'es' | 'en' | 'de' | 'fr' | 'it' | 'ja'`
   - `SiteTemplate = 'classic' | 'modern' | 'minimal'`
   - `Site` interface matching `sites` table shape with narrowed string-literal fields (use these types, not raw string)
   - `TsaCategory` interface matching `tsa_categories` table shape
   - `TsaProduct` interface matching `tsa_products` table shape
3. Write `packages/shared/src/constants/index.ts` with `as const` objects:
   - `AMAZON_MARKETS` — array of `{ slug: AmazonMarket; label: string; domain: string; currency: string }` for all 10 markets
   - `SUPPORTED_LANGUAGES` — array of `{ code: Language; label: string }` for all 6 languages
   - `SITE_STATUS_FLOW` — `Record<SiteStatus, SiteStatus[]>` defining valid next states per status
   - `REBUILD_TRIGGERS` — `readonly ['price', 'availability', 'images']` (per D008)
4. Write `packages/shared/src/index.ts` barrel re-exporting all from `./types/index.js` and `./constants/index.js`
5. Update `packages/shared/package.json`: set `"type": "module"`, exports map `{ ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" } }`, scripts `"build": "tsup"` and `"typecheck": "tsc --noEmit"`, devDependencies with `tsup` and `typescript`. NO runtime dependencies.
6. Write `packages/shared/tsup.config.ts`: entry `["src/index.ts"]`, format `["esm"]`, dts `true`, clean `true`, sourcemap `false`
7. Run `pnpm install` at root, then `pnpm --filter @monster/shared build` and `pnpm --filter @monster/shared typecheck`

## Must-Haves

- [ ] `packages/shared/package.json` has `"type": "module"`, correct exports map, and zero entries in `dependencies` (devDeps only)
- [ ] `tsup.config.ts` exists with ESM format and dts enabled
- [ ] `SiteStatus`, `AmazonMarket`, `Language`, `SiteTemplate` are string-literal union types (not plain `string`)
- [ ] `Site`, `TsaCategory`, `TsaProduct` are interfaces using the narrowed union types for their string fields
- [ ] All four constants are exported as `as const` objects with explicit type annotations
- [ ] `SITE_STATUS_FLOW` covers all 8 `SiteStatus` values with valid transition arrays
- [ ] `pnpm --filter @monster/shared build` exits 0 and produces `dist/index.js` + `dist/index.d.ts`
- [ ] `pnpm --filter @monster/shared typecheck` exits 0
- [ ] Zero runtime dependencies (node_modules check)

## Verification

```bash
# Build passes
pnpm --filter @monster/shared build

# Artifacts
ls packages/shared/dist/index.js packages/shared/dist/index.d.ts

# Zero runtime deps
node -e "const p=JSON.parse(require('fs').readFileSync('packages/shared/package.json','utf8')); const d=Object.keys(p.dependencies||{}); console.assert(d.length===0,'FAIL: runtime deps: '+d); console.log('OK')"

# Typecheck
pnpm --filter @monster/shared typecheck
```

## Observability Impact

This task produces purely static artifacts (types + constants). There is no runtime behavior to observe. What becomes inspectable after this task:

- **Build health:** `pnpm --filter @monster/shared build 2>&1 | tail -5` — exit 0 + tsup summary lines confirm ESM + DTS built cleanly.
- **Dist presence:** `ls -la packages/shared/dist/index.{js,d.ts}` — non-zero size confirms build produced valid output.
- **Type-coverage check:** `pnpm --filter @monster/shared typecheck 2>&1` — exit 0 means all interfaces and `SITE_STATUS_FLOW` Record keys are exhaustive.
- **Zero runtime deps:** `node -e "const p=JSON.parse(require('fs').readFileSync('packages/shared/package.json','utf8')); console.log(Object.keys(p.dependencies||{}))"` — must print `[]`.
- **Failure state — missing SiteStatus key in SITE_STATUS_FLOW:** `tsc --noEmit` emits a type error pointing to the exact property missing from the `Record<SiteStatus, SiteStatus[]>`. This is the only failure mode that doesn't surface in the tsup step.
- **Failure state — incorrect export:** if barrel `src/index.ts` re-exports from `.js` extensions rather than `.js`, `tsc --noEmit` in admin (T03) will report `Module not found`. Verifiable early via `cat packages/shared/src/index.ts | grep 'from'`.

## Inputs

- `packages/shared/package.json` — currently has empty `exports: {}` and empty `scripts: {}`; must be updated
- `packages/shared/tsconfig.json` — already correct (`module: NodeNext, moduleResolution: NodeNext`); used for typecheck only
- S02 schema migrations — reference for column names/types in `tsa_categories`, `tsa_products`, `sites` tables when writing interfaces
- T01 output — `packages/db/tsup.config.ts` as a reference pattern (same build config)

## Expected Output

- `packages/shared/src/types/index.ts` — string-literal types + domain interfaces
- `packages/shared/src/constants/index.ts` — `as const` constant objects
- `packages/shared/src/index.ts` — barrel re-export
- `packages/shared/tsup.config.ts` — ESM + dts build config
- `packages/shared/package.json` — updated with type:module, exports map, zero deps, scripts
- `packages/shared/dist/index.js` + `packages/shared/dist/index.d.ts` — compiled ESM output
