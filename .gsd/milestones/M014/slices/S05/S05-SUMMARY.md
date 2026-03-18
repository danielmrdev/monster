---
id: S05
parent: M014
milestone: M014
provides:
  - Skip guard in generate-site.ts scoring loop — /go/ redirect stubs and legal pages are never scored or upserted
  - SEO Score Dimensions legend card above the SEO Scores table in SiteDetailTabs.tsx
requires: []
affects:
  - M014 milestone completion (independent leaf slice)
key_files:
  - packages/agents/src/jobs/generate-site.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx
key_decisions:
  - Skip guard placed as the very first statement inside the for loop (line 482), before inferPageType is called — avoids redundant work on paths that should be excluded
  - Legend rendered using the existing local Card helper with an inline array map — no new component or import needed
patterns_established:
  - none
observability_surfaces:
  - "Log: [GenerateSiteJob] score_pages: N pages to score — N is now smaller for any site with /go/ stubs or legal pages"
  - "DB diagnostic: SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal' should return 0 after generation"
drill_down_paths:
  - .gsd/milestones/M014/slices/S05/tasks/T01-SUMMARY.md
duration: 5m
verification_result: passed
completed_at: 2026-03-18
---

# S05: SEO Score Filter + Legend

**Skip guard added to the scoring loop to exclude /go/ redirect stubs and legal pages; legend card added above the SEO Scores table explaining all 8 score dimensions.**

## What Happened

Two targeted edits across two files, completing in a single task (T01):

1. **`generate-site.ts` — skip guard (line 482):** `if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;` is inserted as the very first statement in the scoring `for` loop, before the `try` block and before any file I/O. Paths matching either condition are silently skipped — no `seo_scores` row is upserted, no computation is done. The fix is correct by design: `/go/` pages are meta-refresh redirect stubs that score poorly on every dimension, and legal pages are mandatory prose whose SEO metrics are irrelevant to ranking.

2. **`SiteDetailTabs.tsx` — legend card (line 281):** A `<Card title="SEO Score Dimensions">` block is inserted immediately before the `<Card title="SEO Scores">` card in the `seo` tab. The card renders an 8-item `grid grid-cols-1 sm:grid-cols-2 gap-2` using the existing local `Card` helper. Each item shows the dimension name in bold and a short description. Dimensions covered: Content, Meta Elements, Structure, Links, Media, Schema, Technical, Social.

## Verification

| # | Command | Exit Code | Result |
|---|---------|-----------|--------|
| 1 | `grep -n "startsWith\|go/\|legal\|continue" generate-site.ts \| head -20` | 0 | skip guard visible at line 482 |
| 2 | `grep -n "Content\|Dimension\|Schema\|Technical\|Social" SiteDetailTabs.tsx \| head -30` | 0 | legend card at line 281 with all 8 dimensions |
| 3 | `cd apps/admin && npx tsc --noEmit` | 0 | no TypeScript errors |

## New Requirements Surfaced

- none

## Deviations

None. Both edits match the slice plan exactly.

## Known Limitations

- The skip guard removes rows from future scoring runs but does NOT retroactively delete existing `/go/` or `legal` rows already in `seo_scores`. A one-time `DELETE FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal'` would clean historical data — this is a manual cleanup step, not automated.

## Follow-ups

- Consider adding the cleanup query as a migration or admin action if historical noise in `seo_scores` is a problem.

## Files Created/Modified

- `packages/agents/src/jobs/generate-site.ts` — skip guard added at top of scoring loop (line 482)
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — SEO Score Dimensions legend card added before SEO Scores card (line 281)

## Forward Intelligence

### What the next slice should know
- S06 is independent of S05. No files or patterns from S05 are consumed by S06.
- The skip guard relies on `inferPageType(relPath) === 'legal'` — the function is defined at the top of `generate-site.ts` and currently returns `'legal'` for any path not matching `categories/` or `products/`. If that default is changed, legal pages will re-appear in `seo_scores`.

### What's fragile
- `inferPageType` fallback returns `'legal'` by convention — if a new page type is added without updating the function, it may accidentally be treated as legal and skipped from scoring.

### Authoritative diagnostics
- `SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal'` — should return 0 after any site generation post-S05. Non-zero means the skip guard is not running (build not deployed, or inferPageType changed).
- `[GenerateSiteJob] score_pages: N pages to score` in logs — N should be smaller than before for any site with affiliate links (which generate /go/ stubs) or legal pages.
