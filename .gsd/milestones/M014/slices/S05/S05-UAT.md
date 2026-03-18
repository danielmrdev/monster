# S05: SEO Score Filter + Legend — UAT

**Milestone:** M014
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: Both changes are static code edits. The skip guard is verified by grep + post-generation DB query; the legend card is verified by grep + TypeScript. No server or runtime is needed to confirm correctness of the implementation.

## Preconditions

- `packages/agents/src/jobs/generate-site.ts` is the version edited in S05 (has skip guard at line ~482)
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` is the version edited in S05 (has legend card at line ~281)
- Node.js + pnpm available; `cd apps/admin && npx tsc --noEmit` can run

## Smoke Test

```bash
grep -n "go/" packages/agents/src/jobs/generate-site.ts | grep continue
```
Expected: one line showing `if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;`

## Test Cases

### 1. Skip guard is present and correctly positioned

1. Open `packages/agents/src/jobs/generate-site.ts`
2. Find the `for (const relPath of htmlFiles)` scoring loop
3. Verify the first statement inside the loop body (before any `try` block) is:
   `if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;`
4. **Expected:** Skip guard exists at the very top of the loop body, conditions cover both `/go/` prefix and legal page type

```bash
grep -n "startsWith\|go/\|legal\|continue" packages/agents/src/jobs/generate-site.ts | head -20
```
**Expected output includes:** line ~482 with both `startsWith('go/')` and `inferPageType(relPath) === 'legal'`

### 2. Legend card is present with all 8 dimensions

1. Open `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
2. Locate the `seo` tab content
3. Verify a `<Card title="SEO Score Dimensions">` block appears before `<Card title="SEO Scores">`
4. **Expected:** Card contains all 8 dimensions: Content, Meta Elements, Structure, Links, Media, Schema, Technical, Social

```bash
grep -n "Content\|Meta Elements\|Structure\|Links\|Media\|Schema\|Technical\|Social\|SEO Score Dimensions" \
  apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx
```
**Expected:** Lines for all 8 dimension names plus "SEO Score Dimensions" title

### 3. TypeScript compiles without errors

```bash
cd apps/admin && npx tsc --noEmit
```
**Expected:** Zero output, exit code 0

### 4. Runtime diagnostic — no /go/ or legal rows after site generation (post-deploy)

After generating any TSA site with affiliate links and legal pages:
```sql
SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal';
```
**Expected:** 0 rows. Any non-zero count indicates the skip guard is not active in the deployed version.

## Edge Cases

### Legal pages with non-standard paths

- `inferPageType` returns `'legal'` as the default for any path not matching `categories/` or `products/`
- A path like `impressum/index.html` or `datenschutz/index.html` will be correctly skipped via the `'legal'` type match
- **Expected:** No `seo_scores` row for any path that `inferPageType` classifies as `'legal'`

### Site with no /go/ pages (no products yet)

- Skip guard `relPath.startsWith('go/')` will simply never match
- All non-legal pages (homepage, categories) are still scored normally
- **Expected:** Normal scoring behavior; no regressions for sites without affiliate links

### Existing historical /go/ or legal rows in seo_scores

- The skip guard prevents future inserts but does NOT clean up existing rows from prior generations
- **Expected:** Old rows remain until manually deleted; new generation runs add no new rows
- **Cleanup (manual):** `DELETE FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal';`

## Failure Signals

- `grep` for skip guard returns no matches → edit was not applied or was reverted
- `grep` for "SEO Score Dimensions" returns no match → legend card missing
- `npx tsc --noEmit` produces errors → TypeScript regression in SiteDetailTabs.tsx
- DB query returns non-zero count after generation → skip guard not running in deployed build
- Legend card appears AFTER the scores table instead of before → insertion point was wrong

## Not Proven By This UAT

- Actual runtime behavior of the skip guard during a real site generation run (requires a live generation job)
- Visual appearance of the legend card in the browser (requires the admin app to be running)
- Performance impact of the skip guard (negligible — it's an O(1) string prefix check)
- That all 8 legend descriptions are accurate and helpful to the user (content quality, not correctness)

## Notes for Tester

- The skip guard is a one-line `continue` — it produces no log output for skipped paths. The observable signal is absence of rows in `seo_scores`, not a new log message.
- The legend card uses the existing local `Card` helper with inline JSX — no new imports or components were introduced. If the legend card looks unstyled, check that the `Card` helper is still exported from the same location.
- TypeScript check (`npx tsc --noEmit`) takes ~4 seconds on first run due to cold cache.
