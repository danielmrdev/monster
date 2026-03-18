# S05: SEO Score Filter + Legend — Research

**Date:** 2026-03-18

## Summary

Two independent changes. No new dependencies, no migrations, no DB changes.

1. **SEO scoring filter** — `generate-site.ts` currently scores every `.html` file in `dist/`, including `/go/**` redirect pages and legal pages. The `/go/[slug].astro` page generates static HTML at `go/<slug>/index.html`. These fall through `inferPageType` to `'legal'` (the catch-all), which is also wrong — legal pages are genuinely legal, while `/go/` pages are redirect stubs. Both should be excluded from scoring entirely. The fix is a one-line skip condition inside the existing `for (const relPath of htmlFiles)` loop.

2. **SEO legend card** — `SiteDetailTabs.tsx` renders the "SEO Scores" card with 8 dimension columns (Content, Meta, Structure, Links, Media, Schema, Technical, Social) but no explanation of what they mean. Add a legend card above it inside the `seo` tab.

## Recommendation

Two targeted edits, each in one file. No shared state between them — implement in either order or in a single task.

For the filter: skip entries where `relPath.startsWith('go/')` OR `inferPageType(relPath) === 'legal'`. Skipping both conditions (not just `/go/`) matches the milestone spec ("skip `/go/` + legal pages") and avoids scoring redirect stubs that score poorly by design (no content, forced noindex).

For the legend: add a `Card` component above the existing `<Card title="SEO Scores">` using the same `Card` local helper already in the file. Eight rows, one per dimension, with a short description of what each score measures.

## Implementation Landscape

### Key Files

- `packages/agents/src/jobs/generate-site.ts` — lines 470–530, the scoring loop. `inferPageType` at line 42. The glob iterates `**/*.html` in `distDir`. The skip goes inside the `for (const relPath of htmlFiles)` loop before the `try` block, or as a pre-filter on `htmlFiles`. Pre-filter is cleaner.
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — the `seo` tab section (lines ~290–390). Uses local `Card` helper. The legend card goes between the `<Card title="Homepage SEO">` area and `<Card title="SEO Scores">`. The 8 dimension names match the `TableHead` labels already rendered.

### What the `/go/` pages look like in dist

`apps/generator/src/pages/go/[slug].astro` generates `go/<slug>/index.html`. The glob picks these up as `go/ninja-af101/index.html`. `inferPageType('go/ninja-af101/index.html')` returns `'legal'` (catch-all) — but it should just be skipped.

### Legal page paths in dist

Legal pages (`[legal].astro`) generate as `privacidad/index.html`, `aviso-legal/index.html`, `cookies/index.html`, `contacto/index.html`. These do NOT start with `go/` — they're caught by `inferPageType` returning `'legal'`. The spec says skip both.

### Build Order

No dependencies. Both changes can be in a single task (T01) or two tasks. Given the size, single task is appropriate.

### Verification Approach

**Filter:**
```bash
# Confirm inferPageType has no special handling for go/ (it returns 'legal')
grep -n "inferPageType\|go/" packages/agents/src/jobs/generate-site.ts

# After edit: confirm the skip is present
grep -n "go/\|legal\|skip\|continue" packages/agents/src/jobs/generate-site.ts | head -20
```

**Legend card:**
```bash
# Confirm legend card text is present in the component
grep -n "Content Quality\|Meta Elements\|legend" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx
```

**TypeScript:**
```bash
cd apps/admin && npx tsc --noEmit
```

No runtime test needed — the filter is a pure data operation, and the legend is static JSX.

## Constraints

- `inferPageType` is intentionally simple — do not change it. The filter belongs in the scoring loop, not in the type inference function.
- The legend card must use the existing `Card` local helper (already in the file) to match the tab's visual style.
- KN016: admin has no `typecheck` pnpm script — use `cd apps/admin && npx tsc --noEmit` directly.
