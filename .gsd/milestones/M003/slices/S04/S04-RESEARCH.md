# S04: SEO Scorer — Research

**Date:** 2026-03-14
**Scope:** `packages/seo-scorer` implementation + `score_pages` phase in `GenerateSiteJob` + SEO scores table in admin panel site detail view

## Summary

S04 is the closing slice of M003 — self-contained and lower-risk than S01–S03. The scoring logic (`scorePage()`) is pure static HTML analysis: no network calls, no external APIs, no async complexity. The three moving parts are: (1) the `packages/seo-scorer` package itself, (2) wiring a `score_pages` phase into `GenerateSiteJob` after `build`, and (3) adding an SEO scores table to the admin panel site detail page.

The `seo_scores` DB table is already schema-complete with all 8 category score columns. The scoring weights, thresholds, and factor logic are fully specified in `docs/research/seo-scoring-research.md`. Two libraries are confirmed ESM-compatible and ready to install: `cheerio@1.2.0` (HTML parsing) and `text-readability@1.1.1` (Flesch score, sentence analysis). A `seo-scorer` package scaffold already exists at `packages/seo-scorer/` with no source yet.

One structural gap: `seo_scores` has no unique constraint on `(site_id, page_path)`, so standard Supabase `.upsert()` with `onConflict` won't work. The cleanest fix is a new migration (addendum to M003/DB work) that adds a `UNIQUE` constraint — then upserts are idempotent on rebuild.

The other thing worth noting upfront: the current Astro templates emit **no JSON-LD structured data** and no canonical tags. The SEO Scorer will correctly flag these as missing — the schema_score and parts of technical_score will be red for all generated pages. That's the right behaviour: the scorer reports truth. Fixing the templates is a follow-up (scope for a later pass or a separate issue). S04 does not need to fix the templates to be complete.

## Recommendation

Implement `packages/seo-scorer` as a focused, flat module (not the multi-file architecture from the research doc — that's overengineered for 8 scoring categories). Three files: `types.ts`, `index.ts` (scoring logic), `package.json`. Use `text-readability` for Flesch score and sentence analysis; use `cheerio` for HTML parsing. Use Node 22's native `fs/promises.glob` to walk `dist/` HTML files — no extra glob package needed. Add a migration for the unique constraint before S04/T01 to enable idempotent upserts.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| HTML parsing | `cheerio@1.2.0` | Pure ESM, jQuery-style API, handles malformed HTML, already researched in `docs/research/seo-scoring-research.md` |
| Flesch Reading Ease + sentence analysis | `text-readability@1.1.1` | Pure ESM (`"type": "module"`), exports singleton `readability` instance with `fleschReadingEase()`, `sentenceCount()`, `averageSentenceLength()`; deps: `syllable@5`, `pluralize@8` |
| HTML file walking in dist/ | `node:fs/promises` `glob()` | Node 22 has native `glob()` — zero extra dependency; confirmed working in this runtime |
| Score persistence | Supabase `.upsert()` with `onConflict: 'site_id,page_path'` | Standard pattern already used for categories/products in `generate-site.ts` — but requires a unique constraint migration first |
| Score display table | shadcn `Table`, `Badge` components | Already installed in `apps/admin` — matches `sites/page.tsx` pattern exactly |

## Existing Code and Patterns

- `packages/seo-scorer/package.json` — scaffold exists, empty (no `src/`, no deps, no scripts). Must add `type: "module"`, scripts, deps, tsup config, tsconfig.
- `packages/db/src/types/supabase.ts` — `seo_scores` Row type has all 8 category score columns + `factors: Json | null`, `suggestions: Json | null`, `grade: string | null`, `build_id: string | null`. These are the exact columns to write.
- `packages/db/supabase/migrations/20260313000004_seo.sql` — table created with indexes on `site_id` and `(site_id, page_path)`, but **no UNIQUE constraint** on `(site_id, page_path)`. Need an addendum migration `20260314000001_seo_unique.sql` or similar timestamp.
- `packages/agents/src/jobs/generate-site.ts` — `score_pages` phase goes **after** the Astro `build()` call (line ~520+) and before `ai_jobs` 'completed' update. Follow the exact same phase update pattern: `.update({ payload: { phase: 'score_pages', done: N, total: M } })`.
- `packages/agents/tsup.config.ts` — DTS disabled (D047, ioredis conflict). `packages/seo-scorer` has no such conflict — **DTS can be enabled** (`dts: true`). Follow `packages/shared/tsup.config.ts` pattern (entry, format ESM, dts true, clean).
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Server component pattern. SEO scores section goes below the "Site Generation" card. Query `seo_scores` from Supabase at page load (server-side fetch, no client polling needed — scores are static post-build). Use the same `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableHead` pattern as `apps/admin/src/app/(dashboard)/sites/page.tsx`.
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — Shows the exact import pattern for shadcn `Table` and `Badge` components. Copy this pattern for the scores table.
- `packages/agents/src/jobs/generate-site.ts` — upsert pattern: `.upsert([...], { onConflict: 'site_id,slug', ignoreDuplicates: false })`. Mirror this with `onConflict: 'site_id,page_path'` for seo_scores once the unique constraint exists.

## Constraints

- **`packages/seo-scorer` must be pure ESM** — `"type": "module"` in package.json, tsup outputs ESM. Both `cheerio` and `text-readability` are pure ESM, so no `createRequire` bridge needed.
- **`packages/seo-scorer` must NOT import Next.js** — same isolation rule as `packages/db` (D019). The package is consumed by both `packages/agents` (worker) and `apps/admin` (server component). Must be clean.
- **`packages/seo-scorer` tsconfig**: inherit from `../../tsconfig.base.json` with `module: NodeNext`, `moduleResolution: NodeNext` — same as `packages/db` and `packages/shared`.
- **`scorePage()` receives HTML as string + focusKeyword + pageType** — exact signature from S04→milestone boundary in M003-ROADMAP.md: `scorePage(html: string, focusKeyword: string, pageType: 'homepage' | 'category' | 'product' | 'legal'): SeoScore`. The `url` field in the research doc's `SeoScorerInput` interface is optional — not needed for static HTML scoring of already-built pages.
- **DB grade field** — research uses 'excellent'/'good'/'needs_work'/'poor'/'critical'. Migration SQL shows `grade text` with comment `'A'|'B'|'C'|'D'|'F'`. Use A/B/C/D/F (letter grades) — that's what the DB schema was designed for (see migration comment). Map: 90-100→A, 70-89→B, 50-69→C, 30-49→D, 0-29→F.
- **`SeoScore` type must be exported from `packages/seo-scorer`** — consumed by `packages/agents` worker and by `apps/admin` for display types.
- **Affiliate link compliance check**: templates use `rel="nofollow sponsored"` (confirmed). Scorer should accept any `rel` containing `"sponsored"` as compliant — don't require exact string match or specific ordering.
- **No JSON-LD in current templates** — `schema_score` will be 0 (red) for all pages. This is correct behaviour; don't adjust thresholds to hide it. The SEO Scorer reports truth.
- **No canonical tags in current templates** — `technical_score` will lose points for missing canonical. Same policy: report truth.
- **Cheerio parsing**: use `load(html, { xmlMode: false })` — browser-like HTML parsing. Scope word count to `<main>` or `<body>` (exclude `<nav>`, `<footer>` to avoid counting nav/footer in word counts).
- **Legal pages exempt from keyword density** — `pageType === 'legal'` should skip keyword density checks (D039). Legal pages don't target focus keywords. Focus_keyword for legal pages will be null in site.json anyway.
- **Product schema validation** — check for `@type: "Product"` in JSON-LD (not "Offer" or "MerchantListing"). If wrong type present, score as orange; if missing entirely, score as red.
- **`lockDuration: 300000`** on BullMQ Worker already set in S03 — `score_pages` adds minimal time (pure CPU, no API calls), so no change needed.
- **pnpm workspace** — add `@monster/seo-scorer: workspace:*` to `packages/agents/dependencies` and to `apps/admin/dependencies`.

## Page-Type → Path Inference

The `score_pages` phase must infer `pageType` from the file path within `dist/`:

```
dist/index.html                           → homepage
dist/categories/<slug>/index.html         → category
dist/products/<slug>/index.html           → product
dist/privacidad/index.html                → legal
dist/aviso-legal/index.html               → legal
dist/cookies/index.html                   → legal
dist/contacto/index.html                  → legal
```

The page_path stored in `seo_scores` is the URL path (e.g. `/`, `/categories/freidoras/`, `/products/ninja-af100/`, `/privacidad/`). Derive from file path: strip `dist/` prefix, strip `index.html` suffix, ensure leading slash.

Legal page detection: path segments not starting with `categories/` or `products/`, and not the root — i.e. `privacidad`, `aviso-legal`, `cookies`, `contacto`. Can hardcode or use a "not category/product" heuristic.

## Focus Keyword → Page Mapping

`scorePage()` needs a `focusKeyword` per page. The worker must build a map before scoring:
- **Homepage**: `site.focus_keyword` (from site.json, populated by ContentGenerator in S03)
- **Category pages**: `categories.find(c => c.slug === slug).focus_keyword`
- **Product pages**: `products.find(p => p.slug === slug).focus_keyword`
- **Legal pages**: `null` or `''` (legal pages have no keyword, scoring skips keyword-dependent factors)

The `site.json` file is written before `build()` and contains all `focus_keyword` fields. The worker should load `site.json` after build to assemble the keyword map (it's already in-memory as `siteData` — no re-read needed).

## Common Pitfalls

- **`seo_scores` has no unique constraint** — without a migration adding `UNIQUE(site_id, page_path)`, `.upsert()` with `onConflict` will throw a Postgres error. A migration is required before writing the `score_pages` phase. Alternative (riskier): delete all scores for the site before inserting — but this is non-idempotent if the job crashes mid-scoring. The migration is the right fix.
- **`text-readability` `fleschReadingEase()` returns null for short text** — check for null/undefined return and treat as a neutral score (e.g. 60) rather than crashing. Short legal pages (< 100 words) may trigger this.
- **`cheerio` word count must exclude navigation** — if you count all text in `<body>`, nav and footer inflate the word count and category/product pages will incorrectly hit the content length thresholds. Use `$('main').text()` or fall back to `$('body').text()` if `<main>` is absent. Current templates don't use `<main>` explicitly — check the template layouts.
- **Astro trailing slashes** — Astro 6 with `output: 'static'` and no `trailingSlash` config defaults to directory-style URLs (`/categories/foo/index.html`). When computing `page_path` from file path, strip `index.html` but keep the trailing slash: `/categories/foo/` not `/categories/foo`.
- **`glob()` pattern** — `fs/promises.glob('**/*.html', { cwd: distDir })` returns relative paths. Prepend `distDir + '/'` to get absolute paths for `readFileSync`.
- **Cheerio and `<head>` title** — `$('title').first().text()` is correct; `$('title').text()` also works but `first()` is defensive for malformed HTML.
- **JSON-LD parsing** — `$('script[type="application/ld+json"]').each()` then `JSON.parse(el.children[0].data)`. Wrap in try/catch — malformed JSON-LD should score as "missing" not crash the scorer.
- **Template body structure** — current templates don't use `<main>` tags. Product and category page content is in `<div class="max-w-3xl mx-auto">` or similar. The word count heuristic must handle this. Use `$('body').clone().find('nav, header, footer').remove().end().text()` as a reasonable nav-free word count approximation.
- **`text-readability` and Spanish content** — `fleschReadingEase()` targets English. Spanish tends to score lower on Flesch (more syllables per word). Consider applying a more lenient threshold for non-English pages, or simply use Flesch as a relative signal rather than an absolute gate. Document the language caveat in the scorer output.
- **D047 and `packages/agents` DTS** — `packages/agents` has DTS disabled (D047). When importing `@monster/seo-scorer` in the worker, the type import resolves through `packages/seo-scorer/dist/index.d.ts` (generated by tsup with dts:true). This chain works — no issue.

## Open Risks

- **`text-readability` syllable counting in Spanish** — `syllable` is English-optimized. May over- or under-count syllables in Spanish text, making Flesch score unreliable for ES-language sites. Acceptable for Phase 1 — Flesch is used as a relative signal and its weight is not dominant. Document in scorer output.
- **Cheerio and Tailwind's large CSS** — Astro/Tailwind inlines no large CSS blocks, but if future templates add large `<style>` blocks, `$('body').text()` might include style text. Current templates use `@import "tailwindcss"` (not inline CSS). No issue for now.
- **`seo_scores` unique constraint migration** — If the migration is applied to Supabase Cloud but the local types aren't regenerated, TypeScript won't reflect the constraint. This is fine — the constraint is DB-enforced; the application code doesn't need to know about it. The upsert will work correctly regardless.
- **Score instability on re-run** — Flesch scores and keyword density can shift slightly if ContentGenerator regenerates content (e.g. on retry after a crash that purged content). The SEO Scorer always scores the _built_ HTML, so it's deterministic for a given build. Scores only change when content changes.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| cheerio | none found | none |
| text-readability | none found | none |
| SEO scoring | none found | none |

## Implementation Notes

### `packages/seo-scorer` structure (flat, not the research doc's multi-file layout)

```
packages/seo-scorer/
  src/
    types.ts     — SeoScore, FactorScore, CategoryScore, PageType
    index.ts     — scorePage() + all 8 scoring functions
  package.json
  tsconfig.json
  tsup.config.ts
```

The research doc proposed a `factors/` subdirectory per category. That's premature abstraction for 8 categories in a single-consumer package. Flat `index.ts` is readable and avoids import indirection. If the scorer grows to 15+ categories, split then.

### 8 scoring categories and their weights (from research doc §3.3)

| Category | Weight | Key factors |
|----------|--------|-------------|
| content_quality | 30% | Word count (page-type-aware), keyword density (0.5-3%), keyword in first paragraph, Flesch ≥60 |
| meta_elements | 20% | `<title>` (length 50-60 chars + keyword), `<meta name="description">` (120-157 chars + keyword), canonical |
| structure | 15% | Single H1 with keyword, heading hierarchy (no skipped levels), subheading distribution ≤300 words |
| links | 12% | ≥1 internal dofollow link, affiliate links have `rel` containing "sponsored" |
| media | 8% | ≥1 image, all images have alt text, ≥1 alt contains keyword |
| schema | 8% | JSON-LD present, correct `@type` for page type, required properties present |
| technical | 5% | Viewport meta tag, optional: canonical, robots |
| social | 2% | `og:title`, `og:type`, `og:image`, `og:url` all present |

**Page-type exemptions (D039):**
- `legal`: skip keyword density, keyword in title/H1/first paragraph, schema type validation (use generic WebPage). No minimum content length penalty.
- `product`: flag if schema `@type` is not "Product". Check for `rel="sponsored"` on Amazon links specifically.

### DB grade mapping

```
90-100 → 'A'
70-89  → 'B'  (milestone target: ≥70 = B or better)
50-69  → 'C'
30-49  → 'D'
0-29   → 'F'
```

### `score_pages` phase in `GenerateSiteJob`

Insert between the Astro `build()` finally block and the `ai_jobs` 'completed' update:

```
build() → score_pages → mark ai_jobs completed
```

Steps:
1. Glob `distDir/**/*.html` using `node:fs/promises`
2. For each HTML file: infer `pageType` and `pagePath` from file path
3. Look up `focusKeyword` from `siteData` (already in memory)
4. Call `scorePage(html, focusKeyword ?? '', pageType)` 
5. Upsert to `seo_scores` with `onConflict: 'site_id,page_path'`
6. Update `ai_jobs.payload` with `{ phase: 'score_pages', done: N, total: M }`

### Admin panel SEO scores table

New section in `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` below the "Site Generation" card. Server-side fetch (no client component needed — scores don't change after build). Show columns: Page Path, Type, Score (numeric + colour band), Grade, and a tooltip/expandable for category breakdown. Keep it compact — a table with badge colouring is sufficient. Grade badge colours: A→green, B→light-green, C→amber, D→orange, F→red.

### Idempotency

The `score_pages` phase is naturally idempotent once the unique constraint exists: re-running scores the same HTML and upserts the same values. If the job crashes mid-scoring, retrying will re-score all pages (no partial state to track — scores are cheap to compute).

## Sources

- Factor weights, thresholds, scoring model: `docs/research/seo-scoring-research.md` (complete, authoritative — read before implementing)
- `seo_scores` table schema: `packages/db/supabase/migrations/20260313000004_seo.sql`
- `seo_scores` TypeScript types: `packages/db/src/types/supabase.ts`
- `generate-site.ts` phase pattern: `packages/agents/src/jobs/generate-site.ts` lines 80-547
- `scorePage()` API contract: M003-ROADMAP.md "S04 → milestone complete" section
- `text-readability@1.1.1` source inspection: `/tmp/package/main.js` (exports singleton `readability` instance, pure ESM)
- `cheerio@1.2.0` exports: `npm view cheerio exports` (ESM + CJS + browser)
- Node 22 `fs/promises.glob`: confirmed available in this runtime
- D039 (page-type awareness), D038 (focus_keyword in DB), D056 (siteData assembled from DB) — all relevant decisions
- Admin panel table pattern: `apps/admin/src/app/(dashboard)/sites/page.tsx`
