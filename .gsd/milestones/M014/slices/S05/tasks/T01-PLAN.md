---
estimated_steps: 5
estimated_files: 2
---

# T01: Skip /go/ and legal pages from scoring loop; add SEO legend card

**Slice:** S05 — SEO Score Filter + Legend
**Milestone:** M014

## Description

Two targeted edits in two files. The scoring loop in `generate-site.ts` currently scores every `.html` in `dist/`, including `/go/` redirect stubs and legal pages. Both should be skipped entirely. Separately, `SiteDetailTabs.tsx` shows 8 score dimension columns with no explanation — a legend card above the table fixes that. No new dependencies, no migrations.

## Observability Impact

**Signals changed:**
- `[GenerateSiteJob] score_pages: N pages to score` — `N` decreases by the number of skipped paths (typically: 4 legal pages + variable number of `/go/` stubs per site).
- No new log line emitted for skipped paths; their absence from `seo_scores` is the signal.
- The legend card is static UI — no runtime signal, no log. Its presence is verified by grep and tsc.

**Inspection surfaces for future agents:**
- After adding the skip guard, `grep -n "go/\|legal\|continue" packages/agents/src/jobs/generate-site.ts` should show the guard near the top of the scoring loop.
- Post-generation DB check: `SELECT count(*) FROM seo_scores WHERE page_path LIKE '/go/%' OR page_type = 'legal'` should return 0.

**Failure state:**
- If the guard is missing or the condition is wrong, `seo_scores` will contain rows with `page_type = 'legal'` or `page_path LIKE '/go/%'`. Those are the diagnostic rows.
- If `inferPageType` changes its fallback return (currently `'legal'`), the skip guard breaks silently — watch for legal-path rows appearing in the scores table.

## Steps

1. **Read the scoring loop** in `packages/agents/src/jobs/generate-site.ts` around lines 471–515. Note the `for (const relPath of htmlFiles)` loop at line 480 and `inferPageType` at line 42.

2. **Add the skip guard** inside the scoring loop. After the `for (const relPath of htmlFiles) {` line, add a `continue` for excluded paths **before** the `try` block:
   ```ts
   // Skip redirect stubs and legal pages — they score poorly by design
   if (relPath.startsWith('go/') || inferPageType(relPath) === 'legal') continue;
   ```
   This must be the very first statement inside the loop body, before `const absPath = ...`.

3. **Read `SiteDetailTabs.tsx`** around lines 279–335 to locate the `<Card title="SEO Scores">` block (line 281).

4. **Add the legend card** immediately before `<Card title="SEO Scores">`. Use the existing local `Card` helper already defined at the bottom of the file. The legend should be a compact grid of 8 rows describing each dimension:

   | Column name | Description |
   |---|---|
   | Content | Word count, keyword density, paragraph structure |
   | Meta | Title tag, meta description presence and length |
   | Structure | H1/H2 heading hierarchy and count |
   | Links | Internal link count and anchor text quality |
   | Media | Image presence, alt text coverage |
   | Schema | JSON-LD / structured data blocks |
   | Technical | Canonical tag, noindex, page size |
   | Social | Open Graph and Twitter Card tags |

   Implementation: inside `<Card title="SEO Score Dimensions">`, render an 8-item grid (`grid grid-cols-1 sm:grid-cols-2 gap-2`), each item showing the column name in bold and a short description in muted text. Keep it compact — no extra padding.

5. **Typecheck**: run `cd apps/admin && npx tsc --noEmit`. Fix any errors before marking done (per KN016: there is no `typecheck` pnpm script — run tsc directly).

## Must-Haves

- [ ] Skip guard is inside the `for (const relPath of htmlFiles)` loop, before `inferPageType` is called for that iteration
- [ ] Skip condition covers BOTH `go/` prefix AND `inferPageType === 'legal'` (catches legal pages like `privacidad/`, `aviso-legal/`, `cookies/`, `contacto/`)
- [ ] Legend card uses the existing local `Card` component (defined at bottom of `SiteDetailTabs.tsx`) — not a new import
- [ ] Legend appears before `<Card title="SEO Scores">`, inside the `seo` TabsContent
- [ ] All 8 dimensions have a short description (Content, Meta, Structure, Links, Media, Schema, Technical, Social)
- [ ] `cd apps/admin && npx tsc --noEmit` exits 0

## Verification

```bash
# 1. Skip guard present in scoring loop
grep -n "startsWith\|go/\|legal\|continue" packages/agents/src/jobs/generate-site.ts | head -20

# 2. Legend card text present
grep -n "Content\|Meta Elements\|Structure\|Links\|Media\|Schema\|Technical\|Social\|Dimension\|legend" \
  apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx | head -30

# 3. TypeScript clean
cd apps/admin && npx tsc --noEmit
```

## Inputs

- `packages/agents/src/jobs/generate-site.ts` — existing scoring loop at lines 471–515; `inferPageType` at line 42; no changes to `inferPageType` itself
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — `<Card title="SEO Scores">` at line 281; local `Card` helper at line 353; `seo` TabsContent starts at line 230

## Expected Output

- `packages/agents/src/jobs/generate-site.ts` — scoring loop has a `continue` guard skipping `go/` and `legal` pages
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — legend card rendered above the SEO Scores table in the `seo` tab
