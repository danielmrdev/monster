# S05: SEO Score Filter + Legend

**Goal:** SEO scores table excludes `/go/` redirect pages and legal pages; a legend card above the table explains each of the 8 score dimensions.
**Demo:** `grep -n "go/\|startsWith\|legal" packages/agents/src/jobs/generate-site.ts` shows a skip guard in the scoring loop. `grep -n "Content Quality\|Meta Elements" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx` finds the legend card text. `cd apps/admin && npx tsc --noEmit` exits 0.

## Must-Haves

- Scoring loop in `generate-site.ts` skips entries where `relPath.startsWith('go/')` or `inferPageType(relPath) === 'legal'`
- Legend card rendered above `<Card title="SEO Scores">` in the `seo` tab of `SiteDetailTabs.tsx`
- Legend uses the existing local `Card` helper (not a new component) to match surrounding style
- Legend covers all 8 dimensions: Content, Meta, Structure, Links, Media, Schema, Technical, Social

## Verification

```bash
# 1. Skip guard is present in the scoring loop
grep -n "startsWith\|go/\|inferPageType.*legal\|skip\|continue" packages/agents/src/jobs/generate-site.ts | head -20

# 2. Legend card text is present
grep -n "Content Quality\|Meta Elements\|Structure\|legend\|score dimension" \
  apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx

# 3. TypeScript is clean
cd apps/admin && npx tsc --noEmit
```

## Tasks

- [ ] **T01: Skip /go/ and legal pages from scoring loop; add SEO legend card** `est:45m`
  - Why: Both changes are in two files with no shared state. Single task is appropriate given the size.
  - Files: `packages/agents/src/jobs/generate-site.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
  - Do: See T01-PLAN.md
  - Verify: All three commands in the Verification section above pass
  - Done when: grep finds the skip guard in generate-site.ts, grep finds legend card text in SiteDetailTabs.tsx, `npx tsc --noEmit` exits 0

## Files Likely Touched

- `packages/agents/src/jobs/generate-site.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
