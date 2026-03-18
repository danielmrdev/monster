# S05: SEO Score Filter + Legend

**Goal:** SEO scores table excludes `/go/` redirect pages and legal pages; a legend card above the table explains each of the 8 score dimensions.
**Demo:** `grep -n "go/\|startsWith\|legal" packages/agents/src/jobs/generate-site.ts` shows a skip guard in the scoring loop. `grep -n "Content Quality\|Meta Elements" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx` finds the legend card text. `cd apps/admin && npx tsc --noEmit` exits 0.

## Must-Haves

- Scoring loop in `generate-site.ts` skips entries where `relPath.startsWith('go/')` or `inferPageType(relPath) === 'legal'`
- Legend card rendered above `<Card title="SEO Scores">` in the `seo` tab of `SiteDetailTabs.tsx`
- Legend uses the existing local `Card` helper (not a new component) to match surrounding style
- Legend covers all 8 dimensions: Content, Meta, Structure, Links, Media, Schema, Technical, Social

## Observability / Diagnostics

**Runtime signals changed by this slice:**
- The `[GenerateSiteJob] score_pages: N pages to score` log now reflects a smaller N when a site has `/go/` stubs or legal pages — the skipped paths are never scored or upserted.
- Skipped pages produce no `seo_scores` row, so querying `seo_scores` for a path like `/go/product-slug` will return 0 rows (expected, not a bug).
- No new log lines are emitted for skipped pages; absence from the scores table is the observable signal.

**Inspection surfaces:**
- To verify skipping is active post-deploy: `SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal';` should return 0 after a fresh site generation.
- The legend card is purely presentational — its presence is confirmed by the grep checks below.

**Failure visibility:**
- If `inferPageType` is ever changed to return something other than `'legal'` for legal paths, the skip guard silently stops working. The `seo_scores` table accumulating rows with `page_type = 'legal'` is the diagnostic signal.
- TypeScript (`npx tsc --noEmit`) is the failure gate for the UI change.

**Redaction:** No secrets are logged or surfaced by these changes.

## Verification

```bash
# 1. Skip guard is present in the scoring loop
grep -n "startsWith\|go/\|inferPageType.*legal\|skip\|continue" packages/agents/src/jobs/generate-site.ts | head -20

# 2. Legend card text is present
grep -n "Content Quality\|Meta Elements\|Structure\|legend\|score dimension" \
  apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx

# 3. TypeScript is clean
cd apps/admin && npx tsc --noEmit

# 4. Diagnostic: no legal or go/ rows in seo_scores (post-generation check — run after a site is generated)
# SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal';
# Expected: 0 rows
```

## Tasks

- [x] **T01: Skip /go/ and legal pages from scoring loop; add SEO legend card** `est:45m`
  - Why: Both changes are in two files with no shared state. Single task is appropriate given the size.
  - Files: `packages/agents/src/jobs/generate-site.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
  - Do: See T01-PLAN.md
  - Verify: All three commands in the Verification section above pass
  - Done when: grep finds the skip guard in generate-site.ts, grep finds legend card text in SiteDetailTabs.tsx, `npx tsc --noEmit` exits 0

## Files Likely Touched

- `packages/agents/src/jobs/generate-site.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
