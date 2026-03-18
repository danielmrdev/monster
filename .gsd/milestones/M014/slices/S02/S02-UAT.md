# S02: Generator Integration — Logo Path + Favicon Install — UAT

**Milestone:** M014
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven (fixture Astro build)
- Why this mode is sufficient: the slice goal is integration proof — dist/ file presence + HTML `<link>` tags. A fixture build against controlled input data fully exercises the Astro template pipeline. The one gap (BullMQ section 5b copy path) is documented in Known Limitations and requires a live job for operational closure.

## Preconditions

1. Working directory: `/home/daniel/monster`
2. Fixture public/ files seeded (run once if `.generated-sites/fixture/` was cleaned):
   ```bash
   SITE=/home/daniel/monster/apps/admin/public/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb
   mkdir -p apps/generator/.generated-sites/fixture/public
   cp $SITE/logo.webp apps/generator/.generated-sites/fixture/public/
   cp $SITE/favicon/favicon.ico apps/generator/.generated-sites/fixture/public/
   cp $SITE/favicon/site.webmanifest apps/generator/.generated-sites/fixture/public/
   cp $SITE/favicon/apple-touch-icon.png apps/generator/.generated-sites/fixture/public/
   cp $SITE/favicon/favicon-32x32.png apps/generator/.generated-sites/fixture/public/
   ```
3. pnpm deps installed: `pnpm install`

## Smoke Test

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build 2>&1 | tail -3
```
Expected: `15 page(s) built in ...` and `Complete!` — exit 0.

## Test Cases

### 1. Logo appears in dist/ root

1. Run `SITE_SLUG=fixture pnpm --filter @monster/generator build`
2. Run `ls apps/generator/.generated-sites/fixture/dist/logo.webp`
3. **Expected:** file exists, exit 0

### 2. Favicon files appear in dist/ root

1. Run the fixture build (if not already run)
2. Run:
   ```bash
   ls apps/generator/.generated-sites/fixture/dist/favicon.ico
   ls apps/generator/.generated-sites/fixture/dist/site.webmanifest
   ls apps/generator/.generated-sites/fixture/dist/apple-touch-icon.png
   ls apps/generator/.generated-sites/fixture/dist/favicon-32x32.png
   ```
3. **Expected:** all four files exist, all exit 0

### 3. `<link rel="manifest">` tag present in generated HTML

1. Run the fixture build
2. Run:
   ```bash
   grep 'rel="manifest"' apps/generator/.generated-sites/fixture/dist/index.html
   ```
3. **Expected:** matches `<link rel="manifest" href="/site.webmanifest">` — exit 0 with output

### 4. `<link rel="icon">` tags present in generated HTML

1. Run the fixture build
2. Run:
   ```bash
   grep 'rel="icon"' apps/generator/.generated-sites/fixture/dist/index.html
   ```
3. **Expected:** matches two tags:
   - `<link rel="icon" href="/favicon.ico" sizes="any">`
   - `<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">`

### 5. `<link rel="apple-touch-icon">` tag present in generated HTML

1. Run the fixture build
2. Run:
   ```bash
   grep 'rel="apple-touch-icon"' apps/generator/.generated-sites/fixture/dist/index.html
   ```
3. **Expected:** matches `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` — exit 0 with output

### 6. TypeScript clean — generator package

1. Run:
   ```bash
   cd apps/generator && npx tsc --noEmit
   ```
2. **Expected:** exit 0, no output

### 7. Fixture site.json has both customization fields set

1. Run:
   ```bash
   node -e "
   const d = JSON.parse(require('fs').readFileSync('apps/generator/src/data/fixture/site.json','utf8'));
   console.log('faviconDir:', d.site.customization.faviconDir ?? '(not set)');
   console.log('logoUrl:', d.site.customization.logoUrl ?? '(not set)');
   "
   ```
2. **Expected:**
   ```
   faviconDir: /uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/favicon
   logoUrl: /uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/logo.webp
   ```

## Edge Cases

### faviconDir absent — no <link> tags rendered

1. Temporarily remove `faviconDir` from fixture site.json customization
2. Run the fixture build
3. Run: `grep 'rel="manifest"' apps/generator/.generated-sites/fixture/dist/index.html`
4. **Expected:** grep finds nothing (exit 1, no output) — BaseLayout renders the block only when `faviconDir` is truthy
5. Restore fixture site.json afterward

### Missing source file — skip warning, no crash

1. Rename or remove `apps/generator/.generated-sites/fixture/public/logo.webp` temporarily
2. Run `SITE_SLUG=fixture pnpm --filter @monster/generator build`
3. **Expected:** build completes exit 0 (non-fatal); `dist/logo.webp` absent from dist/
4. Note: the BullMQ job would emit `[GenerateSiteJob] logo source not found: <path> — skipping` to worker logs; the bare Astro build skips this code path entirely (the warning fires only in generate-site.ts which runs as a BullMQ job)

### <link> tags propagate to category pages, not just homepage

1. Run the fixture build
2. Run: `grep 'rel="manifest"' apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html`
3. **Expected:** manifest tag present — BaseLayout is shared across all page types via `tsa/Layout.astro`

## Failure Signals

- **`ENOENT: .../data/default/site.json`** — SITE_SLUG env var not set; always prefix with `SITE_SLUG=fixture`
- **`<link>` tags absent from HTML** — `faviconDir` is null/undefined in site.json; confirm T02's customization fields are still present
- **`logo.webp` absent from dist/** — fixture `public/` directory was cleaned; re-seed the S01 artifacts per Preconditions step 2
- **TypeScript errors in generate-site.ts line 326** — pre-existing `meta_description` error on `main`, unrelated to S02; does not affect generator build or tsc

## Requirements Proved By This UAT

- R015 (partial) — TSA generated sites now include per-site logo (WebP) and full favicon set with correct HTML `<link>` tags in every page's `<head>`. Branding pipeline from upload → generator → dist/ is wired end-to-end.
- R001 (partial) — Logo and favicon assets complete the site generation pipeline component of the TSA content loop. Full R001 proof still requires a live BullMQ job run with a real site.

## Not Proven By This UAT

- **BullMQ section 5b copy path** — `generate-site.ts` `copyFileSync`/`cpSync` logic (the runtime equivalent of publicDir seeding) is not exercised by a bare `astro build`. It runs inside the BullMQ job. Operational proof requires enqueuing a `GenerateSiteJob` for a site with S01 uploads set and checking `[GenerateSiteJob] Copied logo → dist/logo.webp` in worker logs.
- **S01 upload → S02 generator end-to-end** — this UAT uses pre-seeded fixture data. The full pipeline (upload via admin UI → customization written to DB → generate job reads DB → copies assets into dist/) is not covered.

## Notes for Tester

- The fixture site ID is `e73839d8-bf90-4abe-9e33-f53fa4cdd6bb` — used as the path component in both `logoUrl` and `faviconDir` in `site.json`.
- `.generated-sites/fixture/` is not committed to git. After a fresh clone or `rm -rf`, you must re-seed the fixture public/ directory (Preconditions step 2) and re-run the fixture build to regenerate dist/.
- The pre-existing TypeScript error in `packages/agents/src/jobs/generate-site.ts` line 326 is expected and unrelated to S02. Test case 6 (`tsc --noEmit` in `apps/generator`) passes because that file is in the agents package, not the generator package.
