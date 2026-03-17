---
estimated_steps: 5
estimated_files: 3
---

# T01: Write `interpolateLegal()`, install `marked`, update `[legal].astro`

**Slice:** S05 — Legal Templates Seed + Markdown Pipeline
**Milestone:** M012

## Description

Add `marked` to the generator, implement `interpolateLegal()` helper, and update `[legal].astro` to render legal content as HTML with placeholders substituted.

## Steps

1. Run `pnpm --filter @monster/generator add marked` to add marked as a runtime dependency.
2. Read `apps/generator/src/lib/data.ts` — confirm `SiteInfo` type shape (domain, contact_email, affiliate_tag fields present or to be added in S06).
3. Create `apps/generator/src/lib/legal.ts`: export `interpolateLegal(content: string, site: SiteInfo): string` using `replaceAll` for each placeholder: `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, `{{site.affiliate_tag}}`, `{{current_year}}`.
4. Read `apps/generator/src/pages/[legal].astro` — locate all three `{pageContent}` render sites (one per Layout variant).
5. Add imports at top of `[legal].astro`: `import { marked } from 'marked'` and `import { interpolateLegal } from '../lib/legal'`. Replace each `{pageContent}` text render with `<div set:html={marked(interpolateLegal(pageContent, site))} class="prose prose-sm max-w-none" />`.
6. Run `pnpm --filter @monster/generator check` then `pnpm --filter @monster/generator build` — fix type errors. `SiteInfo` may need `contact_email` and `affiliate_tag` fields (if not present, add as optional).

## Must-Haves

- [ ] `marked` in `apps/generator/package.json` dependencies
- [ ] `apps/generator/src/lib/legal.ts` exports `interpolateLegal`
- [ ] All three `{pageContent}` text renders replaced with `set:html` + marked + interpolate
- [ ] `pnpm --filter @monster/generator build` exits 0

## Verification

- `cat apps/generator/package.json | grep marked` → hit
- `grep "set:html" apps/generator/src/pages/[legal].astro` → ≥3 hits  
- `pnpm --filter @monster/generator build` exits 0

## Inputs

- `apps/generator/src/lib/data.ts` — SiteInfo type (check contact_email, affiliate_tag fields)
- `apps/generator/src/pages/[legal].astro` — current plain-text render (read first!)

## Expected Output

- `apps/generator/package.json` — marked dependency added
- `apps/generator/src/lib/legal.ts` — interpolateLegal function
- `apps/generator/src/pages/[legal].astro` — updated to use set:html
