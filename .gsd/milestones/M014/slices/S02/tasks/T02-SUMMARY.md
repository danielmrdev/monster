---
id: T02
parent: S02
milestone: M014
provides:
  - fixture site.json updated with customization.logoUrl and customization.faviconDir pointing to S01 artifacts
  - end-to-end fixture build verification: dist/ contains logo.webp + all favicon files, index.html has all four <link> tags
key_files:
  - apps/generator/src/data/fixture/site.json
key_decisions:
  - Fixture verification uses Astro publicDir mechanism (pre-seed files into .generated-sites/fixture/public/ before build) rather than running the BullMQ generate-site.ts job; the post-build copy in section 5b is not exercised by bare Astro build
patterns_established:
  - fixture public/ pre-seeding pattern: copy S01 artifacts into .generated-sites/fixture/public/ so Astro's publicDir mechanism picks them up; this mirrors what generate-site.ts does at runtime for real sites
observability_surfaces:
  - Fixture field check (node -e ...): confirms faviconDir and logoUrl are set in site.json
  - dist/ file presence checks: ls commands confirm logo.webp, favicon.ico, site.webmanifest in dist root
  - HTML grep: confirms all four favicon <link> tags rendered in index.html
duration: 8m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Update fixture and run end-to-end build verification

**Updated fixture site.json with logoUrl and faviconDir, pre-seeded fixture public/ with S01 artifacts, and ran full Astro build — all five dist/ files present, all three HTML link tag greps pass, TypeScript clean.**

## What Happened

Two actions performed:

1. **Fixture `site.json` updated** — Added `logoUrl` and `faviconDir` to `site.customization`, pointing to the S01 artifact paths (`/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/logo.webp` and `.../favicon`). Existing fields preserved.

2. **Fixture public/ pre-seeded** — Discovered that the Astro fixture build uses `.generated-sites/fixture/public/` as `publicDir` (per `astro.config.ts`). The post-build copy logic in `generate-site.ts` section 5b runs as part of the BullMQ job, not the bare Astro build. For the fixture to produce `dist/logo.webp` and favicon files, the assets must be present in `publicDir` before `astro build` runs. Copied five files from `apps/admin/public/uploads/.../` into `.generated-sites/fixture/public/`: `logo.webp`, `favicon.ico`, `site.webmanifest`, `apple-touch-icon.png`, `favicon-32x32.png`.

3. **Fixture build ran** — `SITE_SLUG=fixture pnpm --filter @monster/generator build` completed in ~4.5s, exit 0. 15 pages generated.

All five file checks and all three HTML grep checks passed. The generated `index.html` `<head>` contains exactly the four favicon link tags added in T01's `BaseLayout.astro`, plus the logo `<img>` correctly referencing the S01 upload path.

## Verification

```bash
# Build
SITE_SLUG=fixture pnpm --filter @monster/generator build
# → exit 0, 15 pages, 4.5s

# File checks
ls apps/generator/.generated-sites/fixture/dist/logo.webp        # ✅
ls apps/generator/.generated-sites/fixture/dist/favicon.ico       # ✅
ls apps/generator/.generated-sites/fixture/dist/site.webmanifest  # ✅
ls apps/generator/.generated-sites/fixture/dist/apple-touch-icon.png # ✅
ls apps/generator/.generated-sites/fixture/dist/favicon-32x32.png    # ✅

# HTML link tags
grep 'rel="manifest"' .../dist/index.html     # ✅ <link rel="manifest" href="/site.webmanifest">
grep 'rel="icon"' .../dist/index.html         # ✅ <link rel="icon" href="/favicon.ico" sizes="any">
grep 'rel="apple-touch-icon"' .../dist/index.html # ✅ <link rel="apple-touch-icon" href="/apple-touch-icon.png">

# TypeScript clean
cd apps/generator && npx tsc --noEmit
# → exit 0, no output
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 4.5s |
| 2 | `ls .../dist/logo.webp` | 0 | ✅ pass | <1s |
| 3 | `ls .../dist/favicon.ico` | 0 | ✅ pass | <1s |
| 4 | `ls .../dist/site.webmanifest` | 0 | ✅ pass | <1s |
| 5 | `ls .../dist/apple-touch-icon.png` | 0 | ✅ pass | <1s |
| 6 | `ls .../dist/favicon-32x32.png` | 0 | ✅ pass | <1s |
| 7 | `grep 'rel="manifest"' .../dist/index.html` | 0 | ✅ pass | <1s |
| 8 | `grep 'rel="icon"' .../dist/index.html` | 0 | ✅ pass | <1s |
| 9 | `grep 'rel="apple-touch-icon"' .../dist/index.html` | 0 | ✅ pass | <1s |
| 10 | `cd apps/generator && npx tsc --noEmit` | 0 | ✅ pass | 2.4s |

## Diagnostics

**Fixture field check:**
```bash
node -e "
const d = JSON.parse(require('fs').readFileSync('apps/generator/src/data/fixture/site.json','utf8'));
console.log('faviconDir:', d.site.customization.faviconDir ?? '(not set)');
console.log('logoUrl:', d.site.customization.logoUrl ?? '(not set)');
"
# Output:
# faviconDir: /uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/favicon
# logoUrl: /uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/logo.webp
```

**If dist/ files are missing after a clean rebuild:** Check that `.generated-sites/fixture/public/` contains the expected files — the Astro publicDir mechanism requires them there before build runs. For real BullMQ job runs, generate-site.ts section 5b does the equivalent post-build copy into `dist/` directly.

**If `<link>` tags are absent in HTML:** Confirm `faviconDir` is non-null/non-empty in `site.json` (BaseLayout renders the block conditionally on `faviconDir` truthiness).

## Deviations

- **Fixture public/ pre-seeding** was not explicitly called out in the T02 plan steps, but was required for the fixture build to produce the expected dist/ artifacts. The plan assumed the files would appear in dist/ after the Astro build — they do, but only via `publicDir` → `dist/` copy, which requires source files in `public/` first. Added `## Observability Impact` section to T02-PLAN.md per the pre-flight flag.

## Known Issues

- Pre-existing TypeScript error in `packages/agents/src/jobs/generate-site.ts` line 326: `meta_description` property access on category type — present on main before S02, not introduced by this slice.

## Files Created/Modified

- `apps/generator/src/data/fixture/site.json` — `customization.logoUrl` and `customization.faviconDir` added
- `apps/generator/.generated-sites/fixture/public/logo.webp` — S01 logo artifact seeded into fixture public dir
- `apps/generator/.generated-sites/fixture/public/favicon.ico` — S01 favicon seeded into fixture public dir
- `apps/generator/.generated-sites/fixture/public/site.webmanifest` — seeded into fixture public dir
- `apps/generator/.generated-sites/fixture/public/apple-touch-icon.png` — seeded into fixture public dir
- `apps/generator/.generated-sites/fixture/public/favicon-32x32.png` — seeded into fixture public dir
- `.gsd/milestones/M014/slices/S02/tasks/T02-PLAN.md` — added `## Observability Impact` section (pre-flight requirement)
