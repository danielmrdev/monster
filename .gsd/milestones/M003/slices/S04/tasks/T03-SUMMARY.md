---
id: T03
parent: S04
milestone: M003
provides:
  - "SEO scores table rendered server-side on site detail page (/sites/[id]) with 8 category columns, grade Badge, and score colour-coding"
  - "Empty state: 'No SEO scores yet — generate the site first.' when seo_scores is empty for a site"
  - "scoreColor() and gradeBadgeVariant() helper functions at module scope for colour-coded score display"
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - "Skipped adding @monster/seo-scorer workspace dep to apps/admin — no type import from scorer package needed; seo_scores Row type flows from Supabase typed client (@monster/db) alone."
  - "Wrapped Table in overflow-x-auto div — 12-column table would overflow on narrow viewports without horizontal scroll."
patterns_established:
  - "Server-side optional query pattern: const { data: seoScores } = await supabase.from('seo_scores').select(...).eq('site_id', id).order(...) — no notFound() on error, scores are optional"
  - "Pure module-scope helper functions in server component file (scoreColor, gradeBadgeVariant) — no 'use server' conflict, no client bundle impact"
observability_surfaces:
  - "Admin panel: site detail page /sites/[id] — SEO Scores card visible after a job run; empty state visible before first generation"
  - "Failure inspection: if seo_scores query fails silently, card shows empty state ('No SEO scores yet'); no error thrown (non-fatal query)"
  - "Diagnostic: SELECT page_path, overall_score, grade FROM seo_scores WHERE site_id = '<id>' ORDER BY page_path — matches what the UI renders"
duration: 20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Add SEO scores table to admin panel site detail page

**Added server-side `seo_scores` query and 12-column SEO Scores card to site detail page; `pnpm --filter @monster/admin build` exits 0.**

## What Happened

Imported `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, and `Badge` from the existing shadcn components (same pattern as `sites/page.tsx`). Added `scoreColor()` and `gradeBadgeVariant()` as pure module-scope functions. Added a Supabase server-side query for `seo_scores` filtered by `site_id`, ordered by `page_path`. Rendered the SEO Scores card after the Site Generation card with 12 columns (page path, type, score, grade, and the 8 category subscores). Added `overflow-x-auto` wrapper to handle the wide table on narrow viewports.

Decided against adding `@monster/seo-scorer` as a dep to `apps/admin` — no type import from the scorer package is needed. The Supabase typed client already provides the `seo_scores` Row shape via `@monster/db`.

## Verification

```
pnpm --filter @monster/admin build → EXIT:0 (13 pages generated, /sites/[id] compiled)
grep -n "seo_scores|SEO Scores" page.tsx → lines 52, 242, 245 ✓
grep -n "gradeBadgeVariant|scoreColor" page.tsx → lines 17, 24, 274, 279 ✓
```

## Observability Impact

- **Inspection surface:** `/sites/[id]` in the admin panel — SEO Scores card appears after the Site Generation section. Empty state renders "No SEO scores yet — generate the site first." when no rows exist for the site.
- **Failure state:** Supabase query uses destructuring with no error throw — if the query fails, `seoScores` is `null` and the empty state renders. Silent failure; diagnosable by checking Supabase logs or running the SQL query directly.
- **Diagnostic command:** `SELECT page_path, overall_score, grade, content_quality_score, meta_elements_score, structure_score, links_score, media_score, schema_score, technical_score, social_score FROM seo_scores WHERE site_id = '<id>' ORDER BY page_path` — output directly mirrors what the table renders.

## Diagnostics

- If the SEO Scores card shows empty state unexpectedly: run the SELECT above to verify rows exist in Supabase. If rows exist but UI shows empty, check the Supabase service client env vars (SUPABASE_SERVICE_ROLE_KEY) in the admin's `.env.local`.
- If the table renders but columns show `—` everywhere: the `GenerateSiteJob` score_pages phase may have completed with errors — check `ai_jobs.payload` for `{phase: 'score_pages', done: 0, total: N}`.

## Deviations

- `@monster/seo-scorer` dep NOT added to `apps/admin/package.json` — task plan listed it as optional and the DB types are sufficient. No type import from scorer package needed.
- Added `overflow-x-auto` wrapper div around the Table — not in the plan's snippet but necessary for 12-column layout on narrow viewports.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — added Table/Badge imports, scoreColor/gradeBadgeVariant helpers, seo_scores query, SEO Scores card with 12-column table and empty state
