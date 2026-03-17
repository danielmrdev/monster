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

## Observability Impact

### Signals Changed by This Task
- `pnpm --filter @monster/generator build` — previously may have succeeded with plain-text renders; after this task, a failing `marked()` call (e.g., async API misuse) will produce a build error visible in stdout.
- TypeScript check (`pnpm --filter @monster/generator check`) — adding `contact_email?: string` to `SiteInfo` makes the field visible/typed; if omitted, `legal.ts` will produce a TS2339 error pinpointing the gap.

### How a Future Agent Inspects This Task
- `grep "set:html" apps/generator/src/pages/[legal].astro` — confirms pipeline is wired (expect ≥3 hits)
- `grep "interpolateLegal" apps/generator/src/lib/legal.ts` — confirms helper exported
- `cat apps/generator/package.json | grep marked` — confirms dependency present
- Built `dist/default/privacidad/index.html` — if it exists, grep for `<h2>` to verify markdown-to-HTML conversion

### Failure State Visibility
- If `marked()` returns a Promise (v5+ async API) instead of a string, Astro's `set:html` will render `[object Promise]` — immediately visible in the page source
- If `SiteInfo.contact_email` is missing, TypeScript surfaces TS2339 during `check` step; build will fail with a clear type error
- Unsubstituted placeholders (`{{site.name}}` in final HTML) indicate `interpolateLegal()` key mismatch — greppable in built output

## Inputs

- `apps/generator/src/lib/data.ts` — SiteInfo type (check contact_email, affiliate_tag fields)
- `apps/generator/src/pages/[legal].astro` — current plain-text render (read first!)

## Expected Output

- `apps/generator/package.json` — marked dependency added
- `apps/generator/src/lib/legal.ts` — interpolateLegal function
- `apps/generator/src/pages/[legal].astro` — updated to use set:html
