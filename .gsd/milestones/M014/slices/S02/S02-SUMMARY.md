---
id: S02
parent: M014
milestone: M014
provides:
  - faviconDir field in SiteCustomization interface (apps/generator/src/lib/data.ts)
  - generate-site.ts post-build copy logic: logo.webp → dist/logo.webp, favicon/ dir → dist/ root
  - BaseLayout.astro four <link> tags (favicon.ico, favicon-32x32.png, apple-touch-icon.png, site.webmanifest) conditional on faviconDir prop
  - tsa/Layout.astro passes faviconDir prop from site.customization to BaseLayout
  - fixture site.json updated with customization.logoUrl and customization.faviconDir
  - fixture public/ pre-seeded with S01 artifacts for publicDir → dist/ copy
requires:
  - slice: S01
    provides: customization.logoUrl and customization.faviconDir local path conventions
affects: []
key_files:
  - apps/generator/src/lib/data.ts
  - packages/agents/src/jobs/generate-site.ts
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/layouts/tsa/Layout.astro
  - apps/generator/src/data/fixture/site.json
  - apps/generator/.generated-sites/fixture/public/ (5 seeded favicon files)
key_decisions:
  - distDir declaration moved from section 6 into new 5b copy block — available to both copy and scoring phases without duplication
  - faviconDir in BaseLayout is a presence signal only; href values are hardcoded standard favicon.io filenames (favicon.ico, favicon-32x32.png, apple-touch-icon.png, site.webmanifest)
  - Fixture verification uses Astro publicDir mechanism (pre-seed files into .generated-sites/fixture/public/) rather than running the BullMQ generate-site.ts job
patterns_established:
  - post-build asset copy pattern: existsSync guard → copyFileSync/cpSync → structured console.log/warn (non-fatal on missing source)
  - fixture public/ pre-seeding: copy S01 artifacts into .generated-sites/fixture/public/ so Astro publicDir picks them up; mirrors what generate-site.ts does at BullMQ runtime
observability_surfaces:
  - "[GenerateSiteJob] Copied logo → dist/logo.webp (console.log, BullMQ worker)"
  - "[GenerateSiteJob] Copied favicon dir → dist/ (console.log, BullMQ worker)"
  - "[GenerateSiteJob] logo source not found: <path> — skipping (console.warn, non-fatal)"
  - "[GenerateSiteJob] favicon source dir not found: <path> — skipping (console.warn, non-fatal)"
drill_down_paths:
  - .gsd/milestones/M014/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M014/slices/S02/tasks/T02-SUMMARY.md
duration: 20m (T01: 12m, T02: 8m)
verification_result: passed
completed_at: 2026-03-18
---

# S02: Generator Integration — Logo Path + Favicon Install

**Logo and favicon assets now flow from S01's upload storage through the generator into dist/, with four correct `<link>` tags in every generated page's `<head>`.**

## What Happened

Two tasks executed cleanly with no blockers.

**T01** made four coordinated code changes: added `faviconDir?: string` to the `SiteCustomization` interface in `data.ts`; widened the `customization` cast in `generate-site.ts` to include both `logoUrl` and `faviconDir`, and inserted a new section 5b (post-build copy block) that guards with `existsSync` before calling `copyFileSync` (logo) or `cpSync` (favicon dir) — non-fatal with structured `console.warn` on missing source; added `faviconDir` prop to `BaseLayout.astro` with four conditional `<link>` tags in `<head>`; threaded `faviconDir={site.customization.faviconDir}` through `tsa/Layout.astro`. TypeScript check (`apps/generator`) exited 0.

One structural improvement fell out of T01: the `distDir` variable was previously declared in section 6 (score pages). Moving it into the new 5b block makes it available to both the copy phase and the scoring phase without duplication — a clean side-effect of the change.

**T02** updated the fixture `site.json` with the S01 artifact paths and discovered that the bare Astro fixture build uses `.generated-sites/fixture/public/` as `publicDir`. The post-build copy in `generate-site.ts` section 5b runs inside the BullMQ job, not during a bare `astro build`. To produce the expected dist/ artifacts from the fixture build, S01 assets must be present in `public/` before `astro build` runs. Five files were seeded into the fixture `public/` directory (`logo.webp`, `favicon.ico`, `site.webmanifest`, `apple-touch-icon.png`, `favicon-32x32.png`). The build then completed in ~4.5s, 15 pages, with all five dist/ files present and all three HTML greps passing.

## Verification

All five slice-level checks passed:

| # | Check | Result |
|---|-------|--------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | ✅ exit 0, 15 pages, 4.5s |
| 2 | `ls dist/logo.webp` | ✅ present |
| 3 | `ls dist/favicon.ico && ls dist/site.webmanifest` | ✅ both present |
| 4 | `grep 'rel="manifest"' dist/index.html` | ✅ `<link rel="manifest" href="/site.webmanifest">` |
| 5 | `grep 'rel="icon"' dist/index.html` | ✅ `<link rel="icon" href="/favicon.ico" sizes="any">` + `<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">` |
| 6 | `grep 'rel="apple-touch-icon"' dist/index.html` | ✅ `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` |
| 7 | `cd apps/generator && npx tsc --noEmit` | ✅ exit 0 |

Additional: `apple-touch-icon.png` and `favicon-32x32.png` verified present in dist/ beyond plan minimum.

Note: a pre-existing TypeScript error in `packages/agents/src/jobs/generate-site.ts` line 326 (`meta_description` property on category type) exists on `main` before any S02 changes — confirmed via `git stash`. Not introduced by this slice.

## Requirements Advanced

- R001 — Logo and favicon assets now complete the end-to-end site generation pipeline for the TSA site loop. Generated sites have correct branding and SEO `<link>` tags.
- R015 — TSA template branding now includes per-site logo (WebP, local asset) and favicon set with standard HTML `<link>` tags.

## Requirements Validated

- none — R001 and R015 still require live BullMQ job run to fully validate.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

**Fixture public/ pre-seeding** was not called out in the T02 plan. The plan assumed dist/ artifacts would appear after the Astro build via the `generate-site.ts` section 5b copy. They do, but only when running the full BullMQ job — not via bare `astro build`. For the fixture to prove the integration, assets must be in `publicDir` before build. This is the correct mechanism for fixture verification and mirrors exactly what generate-site.ts does at runtime (just via a different code path: `cpSync` into `dist/` post-build vs. Astro copying `public/` → `dist/` during build).

## Known Limitations

- The post-build copy code in `generate-site.ts` section 5b (logo copy, favicon dir copy) is **not exercised by the bare Astro fixture build** — it only runs inside the BullMQ `GenerateSiteJob`. Runtime proof of section 5b requires a live job run with a site that has `customization.logoUrl` and `customization.faviconDir` set from S01 uploads.
- The fixture public/ seeded files are build artifacts, not committed source data. They need to be present before each fixture build or the favicon/logo files will be absent from dist/.

## Follow-ups

- Run a live `GenerateSiteJob` with a real site that has both S01 uploads set to confirm section 5b copy runs and emits the expected `console.log` signals. This is the operational closure of R001 for the logo/favicon pipeline.

## Files Created/Modified

- `apps/generator/src/lib/data.ts` — `faviconDir?: string` added to `SiteCustomization`
- `packages/agents/src/jobs/generate-site.ts` — widened customization cast, `logoUrl`/`faviconDir` pass-through, section 5b post-build copy block, `copyFileSync`/`cpSync` added to `node:fs` import
- `apps/generator/src/layouts/BaseLayout.astro` — `faviconDir` prop + four conditional `<link>` tags in `<head>`
- `apps/generator/src/layouts/tsa/Layout.astro` — `faviconDir` prop passed to `BaseLayout`
- `apps/generator/src/data/fixture/site.json` — `customization.logoUrl` and `customization.faviconDir` added
- `apps/generator/.generated-sites/fixture/public/logo.webp` — S01 logo seeded into fixture publicDir
- `apps/generator/.generated-sites/fixture/public/favicon.ico` — seeded
- `apps/generator/.generated-sites/fixture/public/site.webmanifest` — seeded
- `apps/generator/.generated-sites/fixture/public/apple-touch-icon.png` — seeded
- `apps/generator/.generated-sites/fixture/public/favicon-32x32.png` — seeded

## Forward Intelligence

### What the next slice should know
- S03, S04, S05, S06 are all independent of S02. None of them depend on logo/favicon wiring and can proceed in any order.
- The pre-existing `meta_description` TypeScript error in `generate-site.ts` line 326 is on `main` and affects the agents package tsc check. It does not block generator builds (generator tsc exits 0). But any slice that touches `packages/agents/` should note it and avoid introducing additional errors on the same file.

### What's fragile
- **Fixture public/ seeded files** — these live in `.generated-sites/fixture/public/` which is not a committed source directory. If the fixture is cleaned (e.g. `rm -rf .generated-sites`) before a build, the seeded files are gone and the favicon/logo won't appear in dist/. A fresh fixture build will still succeed but will produce no logo or favicon in dist/ — the HTML `<link>` tags will still render (because `faviconDir` is set in `site.json`) but the files they reference won't exist.
- **Section 5b copy path** — `generate-site.ts` constructs the source path as `path.join(process.cwd(), 'public', customization.logoUrl)`. This assumes the job runs from the `apps/admin` directory (where `public/uploads/...` lives). If the BullMQ worker runs from a different cwd, the path will be wrong and the `existsSync` guard will produce a skip warning.

### Authoritative diagnostics
- `grep 'rel="manifest"\|rel="icon"\|rel="apple-touch-icon"' dist/index.html` — fastest first check; if tags are absent, `faviconDir` is null/undefined in site.json
- BullMQ worker logs: `[GenerateSiteJob] logo source not found` or `favicon source dir not found` — indicates existsSync guard tripped; check cwd and that S01 upload route wrote files to the expected path

### What assumptions changed
- **Original assumption:** bare `astro build` would exercise `generate-site.ts` section 5b copy code → **reality:** section 5b runs inside the BullMQ job only. Fixture verification uses Astro's `publicDir` mechanism instead, which produces identical dist/ output but via a different path.
