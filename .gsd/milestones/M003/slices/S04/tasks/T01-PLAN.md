---
estimated_steps: 8
estimated_files: 6
---

# T01: Implement `packages/seo-scorer` with unit tests

**Slice:** S04 — SEO Scorer
**Milestone:** M003

## Description

Build the `@monster/seo-scorer` package from scratch. The scaffold exists (empty `package.json` + `tsconfig.json`); everything else needs to be created. The output is a pure ESM library that exports `scorePage(html, focusKeyword, pageType): SeoScore` — no network calls, no Next.js, no Astro — just cheerio + text-readability + scoring logic.

This is the heaviest task of S04 but completely self-contained. Once `dist/` is produced and unit tests pass, T02 and T03 can proceed independently.

## Steps

1. **Set up `package.json`** — add `type: "module"`, scripts (`build`, `typecheck`, `test`), `exports` map pointing to `dist/index.js` / `dist/index.d.ts`, dependencies (`cheerio@^1.2.0`, `text-readability@^1.1.1`), devDependencies (`tsup`, `typescript`, `vitest`, `@types/node`). Run `pnpm install` from monorepo root to link workspace.

2. **Create `tsup.config.ts`** — follow `packages/shared/tsup.config.ts` pattern: `entry: ['src/index.ts']`, `format: ['esm']`, `dts: true`, `clean: true`. DTS is safe here — no ioredis conflict (D047 only affected `packages/agents`).

3. **Create `src/types.ts`** — define and export:
   - `PageType = 'homepage' | 'category' | 'product' | 'legal'`
   - `SeoScore` interface: `overall: number`, `grade: string` (A/B/C/D/F), `content_quality: number`, `meta_elements: number`, `structure: number`, `links: number`, `media: number`, `schema: number`, `technical: number`, `social: number`, `suggestions?: string[]`

4. **Create `src/index.ts`** — implement `scorePage()`:
   - Parse HTML with `cheerio.load(html, { xmlMode: false })`
   - Body text: `$('body').clone().find('nav, header, footer').remove().end().text().trim()`
   - Word count: split body text on whitespace
   - `fleschReadingEase()` from `text-readability` — handle null/undefined → treat as 60
   - **8 scoring functions** (each returns 0–100):
     - `scoreContentQuality(...)`: word count (page-type thresholds from research doc), keyword density (0.5–3% green; skip for legal), keyword in first paragraph (skip for legal), Flesch ≥60. Weighted sub-factors → 0–100.
     - `scoreMetaElements(...)`: `<title>` length (50–60 chars good; present with keyword = better; skip keyword check for legal), `<meta name="description">` length (120–157 chars), canonical presence (check `<link rel="canonical">`).
     - `scoreStructure(...)`: single H1, H1 contains keyword (skip for legal), heading hierarchy (no skipped levels), subheadings every ≤300 words.
     - `scoreLinks(...)`: ≥1 internal link (relative href or same-domain), affiliate links have `rel` containing `"sponsored"` (product pages specifically; check `href` contains `amazon.`).
     - `scoreMedia(...)`: ≥1 `<img>`, all imgs have `alt`, ≥1 alt contains keyword.
     - `scoreSchema(...)`: JSON-LD present (`<script type="application/ld+json">`), `@type` appropriate for pageType (product→Product, category→CollectionPage or ItemList, homepage→Organization or WebSite, legal→WebPage). Missing = 0. Malformed JSON = 0.
     - `scoreTechnical(...)`: viewport meta tag present, `<html lang>` attribute present.
     - `scoreSocial(...)`: `og:title`, `og:type`, `og:image`, `og:url` all present = 100; each missing -25.
   - Weighted sum: `overall = round(content_quality*0.30 + meta_elements*0.20 + structure*0.15 + links*0.12 + media*0.08 + schema*0.08 + technical*0.05 + social*0.02)`. Clamp to 0–100.
   - Grade: 90–100→A, 70–89→B, 50–69→C, 30–49→D, 0–29→F.
   - Collect low-scoring categories into `suggestions` array (e.g. `"Add JSON-LD structured data"` when schema_score < 30).
   - Export: `export { scorePage } from './index.js'` (re-export if needed) — main export in index.ts.

5. **Create `src/index.test.ts`** — vitest unit tests:
   - **Homepage with keyword**: full HTML with `<title>`, `<meta name="description">`, `<h1>` containing keyword, body text 300+ words with keyword. Assert `overall > 40` (schema/social/canonical will be 0 since templates don't emit them — that's expected). Assert `grade` is a valid letter.
   - **Legal page keyword exemption**: HTML with low keyword density (legal text). Assert scoring does not penalize for keyword density (content_quality_score is still reasonable).
   - **Missing title**: HTML with no `<title>`. Assert `meta_elements < 30`.
   - **Flesch null-safety**: HTML with very short body (< 10 words). Assert no exception thrown, `overall` is a number.
   - **Grade boundaries**: manually construct a score of 89 → assert grade 'B'; score 90 → assert grade 'A'.

6. **Add vitest config** — add `vitest.config.ts` or inline in `package.json` test script: `vitest run --reporter verbose`. Since the package is pure ESM, vitest works natively.

7. **Update `tsconfig.json`** — ensure `include: ["src/**/*"]` covers test files (or add `"src/**/*.test.ts"` explicitly if needed); confirm `module: NodeNext`, `moduleResolution: NodeNext` inherited from base.

8. **Run and verify**: `pnpm install` → `pnpm --filter @monster/seo-scorer build` → `pnpm --filter @monster/seo-scorer test`. Fix any type errors or test failures before marking done.

## Must-Haves

- [ ] `scorePage(html, focusKeyword, pageType)` exported from `dist/index.js` with correct signature
- [ ] `SeoScore` type exported from `dist/index.d.ts`
- [ ] All 8 category scores are integers 0–100 in the return value
- [ ] `grade` is one of A/B/C/D/F
- [ ] Legal page does NOT penalize keyword density
- [ ] `fleschReadingEase()` null return handled gracefully (no crash)
- [ ] Unit tests pass: `pnpm --filter @monster/seo-scorer test` exits 0
- [ ] Build passes: `pnpm --filter @monster/seo-scorer build` exits 0, produces `dist/index.js` + `dist/index.d.ts`

## Verification

- `pnpm --filter @monster/seo-scorer build` exits 0
- `pnpm --filter @monster/seo-scorer test` exits 0 with all test cases passing
- `ls packages/seo-scorer/dist/` shows `index.js` and `index.d.ts`
- `node --input-type=module -e "import { scorePage } from './packages/seo-scorer/dist/index.js'; const r = scorePage('<html><head><title>t</title></head><body>b</body></html>', 'kw', 'homepage'); console.log(r.overall, r.grade);"` — prints two values without error

## Observability Impact

- Signals added: none at library level — scorer is pure CPU, no logs. Logging happens in the caller (T02).
- Failure state: unit tests are the diagnostic surface for scorer correctness.

## Inputs

- `packages/seo-scorer/package.json` — scaffold exists (empty), needs full rewrite
- `packages/seo-scorer/tsconfig.json` — exists with correct base, may need test file include
- `packages/shared/tsup.config.ts` — reference for tsup config pattern
- `docs/research/seo-scoring-research.md` — authoritative factor weights and thresholds
- S04-RESEARCH.md — scoring weight table, page-type exemptions, edge case list

## Expected Output

- `packages/seo-scorer/src/types.ts` — SeoScore type + PageType
- `packages/seo-scorer/src/index.ts` — scorePage() implementation (8 scoring functions)
- `packages/seo-scorer/src/index.test.ts` — unit tests (5+ cases)
- `packages/seo-scorer/package.json` — complete with type:module, deps, scripts
- `packages/seo-scorer/tsup.config.ts` — ESM-only, dts:true
- `packages/seo-scorer/dist/index.js` + `dist/index.d.ts` — produced by build
