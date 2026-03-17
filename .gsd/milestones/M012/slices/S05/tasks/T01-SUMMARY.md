---
id: T01
parent: S05
milestone: M012
provides:
  - interpolateLegal() helper for placeholder substitution in legal templates
  - marked integration in generator for markdown-to-HTML rendering
  - [legal].astro updated to render HTML via set:html
key_files:
  - apps/generator/src/lib/legal.ts
  - apps/generator/src/pages/[legal].astro
  - apps/generator/src/lib/data.ts
  - apps/generator/package.json
key_decisions:
  - contact_email added as optional field on SiteInfo (not required — sites without it produce empty string)
  - marked v17 used synchronously (no await) — confirmed it returns string, not Promise
patterns_established:
  - interpolateLegal(content, site) called before marked() — substitution happens on raw markdown, before HTML rendering
  - set:html={marked(interpolateLegal(pageContent, site))} pattern applied identically across all 3 template variants
observability_surfaces:
  - grep "set:html" apps/generator/src/pages/[legal].astro — confirms pipeline wired (expect 3 hits)
  - grep -r "{{site\." apps/generator/.generated-sites/fixture/dist/ — confirms no unsubstituted placeholders in built output
  - SITE_SLUG=fixture pnpm --filter @monster/generator build — end-to-end build validation
  - Built dist/fixture/privacidad/index.html — grep for <p> confirms HTML rendering not plain text
duration: 15m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Write `interpolateLegal()`, install `marked`, update `[legal].astro`

**Added `marked` + `interpolateLegal()` to the generator and replaced all three plain-text `{pageContent}` renders in `[legal].astro` with `set:html` markdown pipeline.**

## What Happened

1. Ran `pnpm --filter @monster/generator add marked` — installed `marked@^17.0.4`.
2. Added `contact_email?: string` as an optional field to `SiteInfo` in `data.ts` (the field was missing; `affiliate_tag` and `domain` were already present).
3. Created `apps/generator/src/lib/legal.ts` — exports `interpolateLegal(content, site)` that chains `.replaceAll()` for all 5 placeholders: `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, `{{site.affiliate_tag}}`, `{{current_year}}`.
4. Updated `[legal].astro` — added imports for `marked` and `interpolateLegal`; replaced the three `<p>{pageContent}</p>` renders (one per template variant: classic, modern, minimal) with `<div set:html={marked(interpolateLegal(pageContent, site))} class="prose prose-sm max-w-none" />`.
5. Ran `pnpm --filter @monster/generator check` — 0 errors, 0 warnings.
6. Ran `SITE_SLUG=fixture pnpm --filter @monster/generator build` — exits 0, 11 pages built including all 4 legal pages.

## Verification

```
# marked in package.json
cat apps/generator/package.json | grep marked
→ "marked": "^17.0.4"

# 3 set:html hits
grep "set:html" apps/generator/src/pages/[legal].astro
→ 3 matches (classic, modern, minimal variants)

# interpolateLegal exported
grep "interpolateLegal" apps/generator/src/lib/legal.ts
→ export function interpolateLegal(content: string, site: SiteInfo): string

# HTML rendering confirmed
grep -o "<p>" apps/generator/.generated-sites/fixture/dist/privacidad/index.html
→ <p> (markdown rendered to HTML paragraphs)

# No unsubstituted placeholders
grep -r "{{site\." apps/generator/.generated-sites/fixture/dist/
→ (no output — PASS)

# Build exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator build → exit 0, 11 pages built
```

## Diagnostics

- `SITE_SLUG=fixture pnpm --filter @monster/generator build` — validates full pipeline
- `grep "set:html" apps/generator/src/pages/[legal].astro` — confirms 3 pipeline wiring points
- `grep -r "{{site\." apps/generator/.generated-sites/fixture/dist/` — detects unsubstituted placeholders post-build
- `grep "<p>" apps/generator/.generated-sites/fixture/dist/privacidad/index.html` — verifies HTML rendering
- `pnpm --filter @monster/generator check` — TypeScript validation of SiteInfo shape

## Deviations

- **`SITE_SLUG` required for build:** Bare `pnpm --filter @monster/generator build` fails with ENOENT because there is no `src/data/default/site.json`. This was a pre-existing failure (confirmed by `git stash` test against main). The task plan's verification says `pnpm --filter @monster/generator build` but must be run as `SITE_SLUG=fixture pnpm --filter @monster/generator build`. Documented in KN008.

## Known Issues

- Bare `pnpm --filter @monster/generator build` (without `SITE_SLUG=fixture`) fails — pre-existing issue, not introduced by this task. See KN008.

## Files Created/Modified

- `apps/generator/src/lib/legal.ts` — new file; exports `interpolateLegal()` with 5 placeholder substitutions
- `apps/generator/src/pages/[legal].astro` — imports added (`marked`, `interpolateLegal`); 3 plain-text renders replaced with `set:html` + markdown pipeline
- `apps/generator/src/lib/data.ts` — `contact_email?: string` added to `SiteInfo` interface
- `apps/generator/package.json` — `marked@^17.0.4` added to dependencies
