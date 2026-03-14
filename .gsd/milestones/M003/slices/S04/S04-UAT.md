# S04: SEO Scorer — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The slice plan explicitly states "Real runtime required: no — verified by typecheck + unit tests + build exit codes." Contract and operational verification via build exits + unit tests + CLI smoke tests is sufficient. Operational end-to-end (real seo_scores rows in Supabase after a live job run) is M003 milestone-level validation, not S04 UAT scope.

## Preconditions

- Working directory: `/home/daniel/monster` (monorepo root)
- `packages/seo-scorer/dist/index.js` exists (run `pnpm --filter @monster/seo-scorer build` if not)
- Node.js ≥ 22 (required for `node:fs/promises` glob API used in agents worker)
- All workspace deps installed (`pnpm install`)

## Smoke Test

```bash
pnpm --filter @monster/seo-scorer test
```

Expected: `8 passed (8)` — all scorer unit tests green. If any fail, the scorer is broken.

## Test Cases

### 1. Scorer unit tests — all 8 pass

```bash
pnpm --filter @monster/seo-scorer test --reporter verbose
```

Expected output includes all 8 named tests passing:
- `homepage with keyword: overall > 40 and grade is valid`
- `legal page: content_quality is reasonable despite low keyword density`
- `missing title: meta_elements < 30`
- `Flesch null-safety: very short HTML does not throw`
- `Flesch null-safety: empty HTML does not throw`
- `grade boundaries: score 89 → B, score 90 → A`
- `product page: affiliate link compliance tracked`
- `schema scoring: correct type gets 100, wrong type gets partial, missing gets 0`

**Expected:** Test Files: 1 passed (1), Tests: 8 passed (8), exit 0.

---

### 2. Build exits — all three affected packages

```bash
pnpm --filter @monster/seo-scorer build
pnpm --filter @monster/agents typecheck
pnpm --filter @monster/admin build
```

**Expected per command:**
1. `@monster/seo-scorer build` → `dist/index.js` (~9.5 KB) + `dist/index.d.ts` (~503 B) produced, exit 0
2. `@monster/agents typecheck` → `tsc --noEmit` exits 0, no type errors
3. `@monster/admin build` → 13 pages generated including `/sites/[id]`, exit 0

---

### 3. Integration smoke test — realistic HTML input

```bash
node --input-type=module <<'EOF'
import { scorePage } from './packages/seo-scorer/dist/index.js'
const html = '<html><head><title>Test freidoras de aire</title><meta name="description" content="Las mejores freidoras de aire para tu cocina en 2024. Compara precios, opiniones y encuentra la freidora perfecta para ti."><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body><h1>Freidoras de Aire</h1><p>Las freidoras de aire freidoras de aire son perfectas para cocinar sano. Las freidoras de aire te permiten cocinar con poco aceite.</p><a href="/categorias/freidoras/">Ver categorías</a></body></html>'
const result = scorePage(html, 'freidoras de aire', 'homepage')
console.log('score:', result.overall, 'grade:', result.grade)
console.assert(typeof result.overall === 'number')
console.assert(result.overall >= 0 && result.overall <= 100)
console.assert(['A','B','C','D','F'].includes(result.grade))
console.assert(typeof result.content_quality === 'number')
console.log('PASS')
EOF
```

**Expected:** `score: 51 grade: C` and `PASS` on last line.

---

### 4. Failure-path: malformed and empty HTML inputs never throw

```bash
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
const cases = [
  ['', 'kw', 'homepage'],
  ['<not valid html>', '', 'legal'],
  ['<html></html>', null, 'product'],
];
for (const [html, kw, pt] of cases) {
  try {
    const r = scorePage(html, kw ?? '', pt);
    console.assert(typeof r.overall === 'number', 'overall must be number');
    console.assert(['A','B','C','D','F'].includes(r.grade), 'grade must be letter');
    console.log('FAIL-PATH PASS:', pt, '→', r.overall, r.grade);
  } catch (e) {
    console.error('FAIL-PATH FAIL: scorePage threw for', pt, e.message);
    process.exit(1);
  }
}
"
```

**Expected:** Three `FAIL-PATH PASS:` lines (homepage, legal, product) with numeric scores and valid grades. No throws, no `process.exit(1)`.

---

### 5. Failure-path: empty HTML returns structured SeoScore with valid fields

```bash
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
const r = scorePage('', 'kw', 'homepage');
console.assert(typeof r.overall === 'number', 'overall must be a number even for empty HTML');
console.assert(['A','B','C','D','F'].includes(r.grade), 'grade must be valid letter');
console.assert(Array.isArray(r.suggestions), 'suggestions must be an array');
console.log('FAIL-PATH PASS: empty HTML returns score', r.overall, 'grade', r.grade);
"
```

**Expected:** `FAIL-PATH PASS: empty HTML returns score 19 grade F`.

---

### 6. Legal page — keyword density exempted (does not produce F)

```bash
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
// Legal page with no keyword mentions — should score reasonably, not F
const html = \`<html><head><title>Aviso Legal</title><meta name=\"description\" content=\"Aviso legal de nuestro sitio\"><meta name=\"viewport\" content=\"width=device-width\"></head><body><h1>Aviso Legal</h1><p>Esta página contiene información legal importante sobre el uso de este sitio web. El usuario acepta las condiciones de uso al navegar por este sitio. Toda la información publicada es de carácter informativo.</p></body></html>\`;
const r = scorePage(html, 'freidoras de aire', 'legal');
console.log('legal score:', r.overall, 'grade:', r.grade, 'content_quality:', r.content_quality);
console.assert(r.overall > 20, 'legal page with good structure should score above 20');
console.assert(r.content_quality > 20, 'content_quality should not be 0 for legal page');
console.log('PASS');
"
```

**Expected:** `legal score: N grade: D-or-better` where `content_quality > 20`. Legal pages are not penalized for missing keyword density.

---

### 7. score_pages phase present in GenerateSiteJob

```bash
grep -n "score_pages\|scorePage\|inferPageType\|filePathToPagePath" packages/agents/src/jobs/generate-site.ts | head -20
```

**Expected:** Lines containing `score_pages`, `scorePage`, `inferPageType`, and `filePathToPagePath` all present. If any are missing, the phase was not wired in.

---

### 8. Unique constraint migration file exists

```bash
ls -la packages/db/supabase/migrations/20260314000001_seo_unique.sql
cat packages/db/supabase/migrations/20260314000001_seo_unique.sql
```

**Expected:** File exists and contains `ADD CONSTRAINT seo_scores_site_page_unique UNIQUE (site_id, page_path)`.

---

### 9. Admin panel site detail page — SEO scores section present

```bash
grep -n "seo_scores\|SEO Scores\|gradeBadgeVariant\|scoreColor" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx | head -10
```

**Expected:** Lines containing `seo_scores` (query), `SEO Scores` (card heading), `gradeBadgeVariant`, and `scoreColor` all present. Confirms the table and helper functions were added.

---

### 10. @monster/seo-scorer wired as workspace dep in agents

```bash
grep "@monster/seo-scorer" packages/agents/package.json
```

**Expected:** `"@monster/seo-scorer": "workspace:*"` present in dependencies.

## Edge Cases

### Empty dist/ directory — score_pages continues gracefully

If Astro build fails and `dist/` contains no HTML files, the `score_pages` phase should:
- Log "0 pages to score"
- Update `ai_jobs.payload` with `{ phase: 'score_pages', done: 0, total: 0 }`
- Not throw — job reaches 'completed' state

**How to verify (diagnostic):** After a real job run where build fails, check `ai_jobs.payload` for `done: 0, total: 0` in the score_pages entry.

---

### Malformed JSON-LD in page HTML — schema scorer returns 0, not throw

```bash
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
const html = '<html><head><title>Product</title><script type=\"application/ld+json\">{invalid json}</script></head><body><h1>Product</h1></body></html>';
const r = scorePage(html, 'product', 'product');
console.assert(typeof r.schema === 'number', 'schema score must be a number');
console.assert(r.schema === 0 || r.schema < 100, 'malformed JSON-LD should not give perfect schema score');
console.log('malformed JSON-LD: schema score =', r.schema, '(no throw)');
console.log('PASS');
"
```

**Expected:** `schema score = 0 (no throw)` and `PASS`.

---

### Grade boundary — score 89 maps to B, score 90 maps to A

```bash
node --input-type=module -e "
import { scorePage } from './packages/seo-scorer/dist/index.js';
// Covered by unit test — quick CLI confirmation:
// Test constructs SeoScore directly to hit boundary
console.log('Grade boundary test: covered by unit test grade boundaries: score 89 → B, score 90 → A');
console.log('Run: pnpm --filter @monster/seo-scorer test to verify');
"
```

This is covered by the unit test suite. Run `pnpm --filter @monster/seo-scorer test` to confirm.

## Failure Signals

- `scorePage threw` in fail-path diagnostic → scorer is not handling malformed HTML gracefully; check the try/catch wrapping in `src/index.ts`
- `pnpm --filter @monster/agents typecheck` exits non-zero → TypeScript error in `generate-site.ts`; likely a type mismatch in the `score_pages` phase or a missing import
- `pnpm --filter @monster/admin build` exits non-zero → type error in `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`; check seo_scores query shape vs DB types
- Admin panel `/sites/[id]` shows empty SEO scores after a real job run → check `ai_jobs.payload` for `score_pages` error; check `seo_scores` table directly via Supabase SQL editor
- Supabase upsert throws `duplicate key value violates unique constraint` → unique constraint migration was not applied; re-run `20260314000001_seo_unique.sql` in Supabase SQL editor
- All pages score 0 for keyword-dependent categories → `keywordMap` in `score_pages` phase is empty; check that `siteData` has `focus_keyword` populated (depends on S03 ContentGenerator completing successfully)

## Requirements Proved By This UAT

- R005 — SEO Scorer: automated on-page validation — `scorePage()` implemented with 8 categories, legal exemption correct, builds and tests pass, admin UI renders scores table. Contract verification complete. Operational verification (real seo_scores rows) proved on first end-to-end M003 run.

## Not Proven By This UAT

- Real `seo_scores` rows in Supabase after a live GenerateSiteJob run — requires DataForSEO + Anthropic credentials and a real site in DB. This is M003 milestone-level operational verification.
- ≥80% of pages scoring ≥70 on a real site — depends on actual AI-generated content quality; the M003 milestone gate, not S04 scope.
- Score visibility in admin panel with real data — UI renders correctly but needs real job run to populate rows.
- `pm2 reload monster-admin` after deployment — operational step, not S04 scope (S04 adds no runtime server changes beyond the existing pattern).

## Notes for Tester

- The scorer is calibrated for real AI-generated HTML, not minimal test fixtures. Short HTML snippets will score 30–55 (C/D range) — this is expected. Real Astro-built pages with AI content should score 55–80+ (B/C range).
- The `suggestions` array in SeoScore contains actionable improvement messages for any category scoring < 50 (< 30 for schema). On real pages, this array helps diagnose why a page scored poorly.
- The unique constraint on `seo_scores(site_id, page_path)` is required before any real job run. Confirm it's applied by checking Supabase dashboard → Table Editor → seo_scores → Constraints.
- Legal pages (aviso-legal, privacidad, cookies, contacto) should score in the 35–65 range — they have good technical signals (viewport, lang) but missing keyword, schema, and OG tags by design.
