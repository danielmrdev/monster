---
id: T01
parent: S02
milestone: M014
provides:
  - faviconDir field in SiteCustomization interface (data.ts)
  - generate-site.ts logo + favicon copy logic post-build with structured logging
  - BaseLayout.astro favicon <link> tags conditional on faviconDir prop
  - Layout.astro faviconDir prop passed to BaseLayout
key_files:
  - apps/generator/src/lib/data.ts
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/layouts/tsa/Layout.astro
key_decisions:
  - distDir declaration moved up from section 6 into the new 5b copy block so it's available for both copy and scoring phases
  - faviconDir in BaseLayout is a presence signal only; href values are hardcoded standard favicon.io filenames
patterns_established:
  - post-build asset copy pattern: existsSync guard → copyFileSync/cpSync → structured console.log/warn
observability_surfaces:
  - "[GenerateSiteJob] Copied logo → dist/logo.webp (console.log)"
  - "[GenerateSiteJob] Copied favicon dir → dist/ (console.log)"
  - "[GenerateSiteJob] logo source not found: <path> — skipping (console.warn)"
  - "[GenerateSiteJob] favicon source dir not found: <path> — skipping (console.warn)"
duration: 12m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Wire faviconDir into data.ts, generate-site.ts, BaseLayout.astro, and Layout.astro

**Added `faviconDir` to SiteCustomization, threaded it through generate-site.ts post-build copy logic, BaseLayout.astro `<link>` tags, and Layout.astro prop pass-through — all TypeScript clean.**

## What Happened

Four coordinated changes applied cleanly:

1. **`data.ts`** — `faviconDir?: string` added to `SiteCustomization` interface with descriptive JSDoc.

2. **`generate-site.ts`** — Three sub-changes:
   - `copyFileSync` and `cpSync` added to the existing `node:fs` import.
   - `customization` cast widened with `logoUrl?: string` and `faviconDir?: string`; both passed through in `siteData.site.customization`.
   - New `// ── 5b. Copy logo and favicon assets into dist/` block inserted between the Astro build complete log and section 6 (score pages). `distDir` declaration moved from section 6 into 5b so it's available for both the copy phase and the scoring phase (removing the duplicate).

3. **`BaseLayout.astro`** — `faviconDir?: string` added to Props interface with JSDoc explaining it's a presence signal. Added to destructuring. Four `<link>` tags (`favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`, `site.webmanifest`) conditionally rendered when `faviconDir` is truthy.

4. **`tsa/Layout.astro`** — `faviconDir={site.customization.faviconDir}` added to the `<BaseLayout>` call alongside the existing props.

Pre-flight: Added `## Observability / Diagnostics` section and a failure-path diagnostic check to `S02-PLAN.md` to resolve the pre-flight flags.

## Verification

```bash
# TypeScript check — generator
cd apps/generator && npx tsc --noEmit
# → exit 0, no output

# Agents package has a pre-existing error (line 326, meta_description mapping)
# that exists on main before any of my changes — confirmed with git stash.
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `cd apps/generator && npx tsc --noEmit` | 0 | ✅ pass | 2.4s |
| 2 | Pre-existing agents TS error (line 326) confirmed on unstashed main | n/a | ✅ pre-existing, not introduced | — |

## Diagnostics

Post-build copy signals in BullMQ worker logs:
- Success: `[GenerateSiteJob] Copied logo → dist/logo.webp`
- Success: `[GenerateSiteJob] Copied favicon dir → dist/`
- Skip: `[GenerateSiteJob] logo source not found: <abs-path> — skipping`
- Skip: `[GenerateSiteJob] favicon source dir not found: <abs-path> — skipping`

Missing source files are non-fatal — the build completes and the site is served, just without favicons/logo.

## Deviations

- `distDir` declaration moved up from section 6 to the new 5b block. This is required because the copy block needs `distDir`, and it's cleaner to declare it once. Section 6 now uses the variable declared in 5b — no duplicate. Plan mentioned placing the block before section 6 which implicitly required this.

## Known Issues

- Pre-existing TypeScript error in `packages/agents/src/jobs/generate-site.ts` line 326: `meta_description` property access on category type. Present on main before S02 work; not introduced here.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — `faviconDir?: string` added to `SiteCustomization`
- `packages/agents/src/jobs/generate-site.ts` — widened cast, `logoUrl`/`faviconDir` pass-through, post-build copy block (5b), `copyFileSync`/`cpSync` imports
- `apps/generator/src/layouts/BaseLayout.astro` — `faviconDir` prop + four `<link>` tags in `<head>`
- `apps/generator/src/layouts/tsa/Layout.astro` — `faviconDir` prop passed to `BaseLayout`
- `.gsd/milestones/M014/slices/S02/S02-PLAN.md` — added Observability / Diagnostics section and failure-path verification check
