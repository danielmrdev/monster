---
id: T01
parent: S04
milestone: M003
provides:
  - "@monster/seo-scorer package: scorePage(html, focusKeyword, pageType): SeoScore with 8 category subscores"
  - "SeoScore and PageType types exported from dist/index.d.ts"
  - "Unit tests (8 cases) covering homepage, legal exemption, missing title, Flesch null-safety, grade boundaries, product page, schema scoring"
key_files:
  - packages/seo-scorer/src/index.ts
  - packages/seo-scorer/src/types.ts
  - packages/seo-scorer/src/index.test.ts
  - packages/seo-scorer/src/text-readability.d.ts
  - packages/seo-scorer/package.json
  - packages/seo-scorer/tsup.config.ts
  - packages/seo-scorer/vitest.config.ts
  - packages/seo-scorer/dist/index.js
  - packages/seo-scorer/dist/index.d.ts
key_decisions:
  - "text-readability exports a default instance (not named exports) — import as default and call .fleschReadingEase(). Hand-wrote a .d.ts declaration since no @types package exists."
  - "cheerio 1.2.0 does not re-export Element type from domhandler — used duck-typed 'name' property access instead of cheerio.Element cast."
  - "Legal page content_quality: keyword density and first-paragraph checks are fully exempted (score as full marks) rather than skipped-and-zero — correctly rewards legal content that is well-written but not keyword-targeted."
patterns_established:
  - "text-readability interop: import readability from 'text-readability'; readability.fleschReadingEase(text) — wrapped in try/catch with fallback 60"
  - "cheerio element tag access: ('name' in el ? (el as { name: string }).name : '') — safe duck-typing for DOM elements"
observability_surfaces:
  - "Unit tests are the diagnostic surface for scorer correctness — run pnpm --filter @monster/seo-scorer test"
  - "CLI smoke test: node --input-type=module -e \"import { scorePage } from './packages/seo-scorer/dist/index.js'; ...\""
  - "Failure-path: scorePage('', 'kw', 'homepage') returns numeric score + valid grade without throwing"
duration: ~60m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Implement `packages/seo-scorer` with unit tests

**Built pure-ESM `@monster/seo-scorer` package from scratch: `scorePage()` with 8 weighted category scorers, legal exemption logic, Flesch null-safety, and 8 passing unit tests.**

## What Happened

Started from an empty scaffold (package.json + tsconfig.json only). Built the full package:

1. **package.json** — added `type: "module"`, `exports` map, scripts (build/test/typecheck), and deps: `cheerio@^1.0.0`, `text-readability@^1.1.1`, `vitest` as devDep.

2. **tsup.config.ts** — ESM-only, `dts: true`, entry `src/index.ts`. Followed `packages/shared` pattern.

3. **src/types.ts** — `PageType` union and `SeoScore` interface with all 8 category subscores + overall + grade + suggestions?.

4. **src/index.ts** — implemented `scorePage()` with all 8 scoring functions:
   - `scoreContentQuality`: word count (page-type-aware thresholds), keyword density (0.5–3%), first-paragraph keyword, Flesch reading ease — all skipped/exempted for legal
   - `scoreMetaElements`: title length (50–60 ideal) + keyword in title, meta description length, canonical presence
   - `scoreStructure`: single H1, keyword in H1, heading hierarchy (no skipped levels), subheading density
   - `scoreLinks`: internal link count, affiliate link compliance (rel="sponsored" on amazon. hrefs for product pages)
   - `scoreMedia`: image presence, all-alts coverage, keyword in at least one alt
   - `scoreSchema`: JSON-LD type matching per page type (Product/CollectionPage/Organization/WebPage), malformed JSON → 0
   - `scoreTechnical`: viewport meta, `<html lang>` attribute
   - `scoreSocial`: og:title, og:type, og:image, og:url (25pts each)
   - Weighted sum (30/20/15/12/8/8/5/2), clamped to 0–100, grade A/B/C/D/F
   - `buildSuggestions`: generates actionable messages for any category scoring < 50 (< 30 for schema)

5. **src/text-readability.d.ts** — hand-authored type declaration (no @types package exists).

6. **vitest.config.ts** — minimal node environment config.

Two issues resolved during implementation:
- `text-readability` exports a default class instance, not named exports → switched to default import + method call.
- `cheerio.Element` not exported from cheerio 1.2.0 → duck-typed element name access.

## Verification

All checks passed:

```
pnpm --filter @monster/seo-scorer build   → exit 0, dist/index.js (9.58 KB) + dist/index.d.ts (503 B)
pnpm --filter @monster/seo-scorer test    → 8/8 tests passed

Tests:
✓ homepage with keyword: overall > 40 and grade is valid
✓ legal page: content_quality is reasonable despite low keyword density
✓ missing title: meta_elements < 30
✓ Flesch null-safety: very short HTML does not throw
✓ Flesch null-safety: empty HTML does not throw
✓ grade boundaries: score 89 → B, score 90 → A
✓ product page: affiliate link compliance tracked
✓ schema scoring: correct type gets 100, wrong type gets partial, missing gets 0
```

CLI smoke test (from slice plan):
```
score: 51 grade: C
PASS
```

Failure-path diagnostic:
```
FAIL-PATH PASS: empty HTML returns score 19 grade F
```

## Diagnostics

- Run tests: `pnpm --filter @monster/seo-scorer test`
- CLI smoke: `node --input-type=module -e "import { scorePage } from './packages/seo-scorer/dist/index.js'; ..."`
- Failure path: `scorePage('', 'kw', 'homepage')` → returns structured SeoScore without throwing
- Type verification: `cat packages/seo-scorer/dist/index.d.ts` — shows exported types

## Deviations

- **cheerio version**: plan specified `^1.2.0` but `package.json` was written as `^1.0.0` — resolved to `1.2.0` at install time. No functional difference.
- **text-readability.d.ts**: not mentioned in plan — required because the library has no TypeScript declarations and strict tsup DTS build fails without it.
- **vitest.config.ts**: added as a separate file (plan mentioned inline config) — cleaner and avoids package.json noise.

## Known Issues

None. All must-haves verified.

## Files Created/Modified

- `packages/seo-scorer/src/types.ts` — SeoScore interface + PageType union
- `packages/seo-scorer/src/index.ts` — scorePage() with 8 scoring functions
- `packages/seo-scorer/src/index.test.ts` — 8 unit test cases
- `packages/seo-scorer/src/text-readability.d.ts` — hand-authored type declaration for untyped library
- `packages/seo-scorer/package.json` — complete with type:module, deps, exports, scripts
- `packages/seo-scorer/tsup.config.ts` — ESM-only build, dts:true
- `packages/seo-scorer/vitest.config.ts` — vitest node environment config
- `packages/seo-scorer/dist/index.js` — built output (9.58 KB)
- `packages/seo-scorer/dist/index.d.ts` — type declarations (503 B)
- `.gsd/milestones/M003/slices/S04/S04-PLAN.md` — added failure-path diagnostic verification step (pre-flight fix)
