---
id: T01
parent: S05
milestone: M014
provides:
  - Skip guard for /go/ redirect stubs and legal pages in the SEO scoring loop
  - Legend card explaining all 8 SEO score dimensions above the scores table
key_files:
  - packages/agents/src/jobs/generate-site.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx
key_decisions:
  - Skip guard placed as the very first statement inside the for loop, before `inferPageType` is called, to avoid redundant work
  - Legend rendered as an inline array map inside the existing local Card helper — no new component or import needed
patterns_established:
  - none
observability_surfaces:
  - "Log: [GenerateSiteJob] score_pages: N pages to score — N is now lower by the count of skipped paths"
  - "DB diagnostic: SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal' should return 0 after generation"
duration: 5m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Skip /go/ and legal pages from scoring loop; add SEO legend card

**Added skip guard for go/ and legal pages in the scoring loop, and a legend card explaining all 8 SEO score dimensions above the scores table.**

## What Happened

Two targeted edits, exactly as planned:

1. **`generate-site.ts`** — inserted `if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;` as the first statement inside the `for (const relPath of htmlFiles)` loop body (line 482). This is before the `try` block and before any `absPath` read, so skipped paths produce zero work and zero `seo_scores` rows.

2. **`SiteDetailTabs.tsx`** — inserted a `<Card title="SEO Score Dimensions">` block immediately before `<Card title="SEO Scores">` (line 281). The card renders an 8-item `grid grid-cols-1 sm:grid-cols-2 gap-2` using the existing local `Card` helper. Each item shows the dimension name in bold and a short description in muted text.

## Verification

- `grep` confirms skip guard at line 482 with both conditions (`go/` startsWith and `inferPageType === 'legal'`).
- `grep` confirms legend card at line 281 with all 8 dimensions visible.
- `cd apps/admin && npx tsc --noEmit` exits 0 with no output.

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `grep -n "startsWith\|go/\|legal\|continue" packages/agents/src/jobs/generate-site.ts \| head -20` | 0 | ✅ pass | <1s |
| 2 | `grep -n "Content\|Dimension\|Schema\|Technical\|Social" apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx \| head -30` | 0 | ✅ pass | <1s |
| 3 | `cd apps/admin && npx tsc --noEmit` | 0 | ✅ pass | 3.7s |

## Diagnostics

- **Skip signal:** After a site generation, query `SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal'` — should return 0.
- **Log signal:** `[GenerateSiteJob] score_pages: N pages to score` — N will be smaller than before for any site with legal pages or affiliate redirect stubs.
- **Breakage detection:** If `inferPageType` fallback changes from `'legal'`, legal pages re-appear in `seo_scores`. The DB query above is the canary.

## Deviations

None. Both edits match the plan exactly.

## Known Issues

None.

## Files Created/Modified

- `packages/agents/src/jobs/generate-site.ts` — skip guard added at top of scoring loop
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — SEO Score Dimensions legend card added before SEO Scores card
