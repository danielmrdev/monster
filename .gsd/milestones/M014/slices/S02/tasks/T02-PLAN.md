---
estimated_steps: 4
estimated_files: 1
---

# T02: Update fixture and run end-to-end build verification

**Slice:** S02 — Generator Integration — Logo Path + Favicon Install
**Milestone:** M014

## Description

Update the fixture `site.json` with the two new customization fields (`logoUrl`, `faviconDir`) pointing to the S01 on-disk artifacts, then run a full Astro fixture build and verify every expected output.

This task is the proof gate for the slice. T01 wrote the code; T02 confirms it works end-to-end by exercising the real build path.

## Steps

1. **Update fixture `site.json`** — In `apps/generator/src/data/fixture/site.json`, locate the `customization` object and add:
   ```json
   "logoUrl": "/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/logo.webp",
   "faviconDir": "/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/favicon"
   ```
   The existing fields (`primaryColor`, `accentColor`, `fontFamily`) must be preserved. The fixture `site.json` has a top-level `site` key wrapping the site object — confirm the structure by reading the file before editing. The `customization` object is nested inside `site`.

   These paths must resolve from `apps/admin/public/`. The on-disk files exist at:
   - `apps/admin/public/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/logo.webp`
   - `apps/admin/public/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/favicon/favicon.ico` (and others)

2. **Run the fixture build**:
   ```bash
   SITE_SLUG=fixture pnpm --filter @monster/generator build
   ```
   The build must exit 0. If it fails, read the error output carefully — common causes: TypeScript error in modified files (fix in the relevant file), missing `cpSync` import in `generate-site.ts` (add it), or `distDir` not yet declared when the copy block runs (move the copy block to after `distDir` is declared).

3. **Verify dist/ file artifacts**:
   ```bash
   ls apps/generator/.generated-sites/fixture/dist/logo.webp
   ls apps/generator/.generated-sites/fixture/dist/favicon.ico
   ls apps/generator/.generated-sites/fixture/dist/site.webmanifest
   ls apps/generator/.generated-sites/fixture/dist/apple-touch-icon.png
   ls apps/generator/.generated-sites/fixture/dist/favicon-32x32.png
   ```
   All five `ls` commands must succeed.

4. **Verify `<head>` tags in generated HTML**:
   ```bash
   grep 'rel="manifest"' apps/generator/.generated-sites/fixture/dist/index.html
   grep 'rel="icon"' apps/generator/.generated-sites/fixture/dist/index.html
   grep 'rel="apple-touch-icon"' apps/generator/.generated-sites/fixture/dist/index.html
   ```
   Each grep must return at least one matching line.

## Must-Haves

- [ ] `apps/generator/src/data/fixture/site.json` has `customization.logoUrl` and `customization.faviconDir` set to the S01 artifact paths
- [ ] `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- [ ] `dist/logo.webp` exists in the fixture dist output
- [ ] `dist/favicon.ico` and `dist/site.webmanifest` exist in the fixture dist output
- [ ] `dist/index.html` contains `rel="manifest"`, `rel="icon"`, and `rel="apple-touch-icon"` links

## Verification

```bash
# Build
SITE_SLUG=fixture pnpm --filter @monster/generator build

# File checks
ls apps/generator/.generated-sites/fixture/dist/logo.webp
ls apps/generator/.generated-sites/fixture/dist/favicon.ico
ls apps/generator/.generated-sites/fixture/dist/site.webmanifest

# HTML checks
grep 'rel="manifest"' apps/generator/.generated-sites/fixture/dist/index.html
grep 'rel="icon"' apps/generator/.generated-sites/fixture/dist/index.html
grep 'rel="apple-touch-icon"' apps/generator/.generated-sites/fixture/dist/index.html

# TypeScript clean
pnpm --filter @monster/generator tsc --noEmit 2>&1 | tail -5
```

## Inputs

- T01 output: all four code files modified (`data.ts`, `generate-site.ts`, `BaseLayout.astro`, `Layout.astro`)
- S01 on-disk artifacts at `apps/admin/public/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/` — confirmed present (`logo.webp`, `favicon/favicon.ico`, `favicon/site.webmanifest`, `favicon/apple-touch-icon.png`, `favicon/favicon-16x16.png`, `favicon/favicon-32x32.png`)
- `apps/generator/src/data/fixture/site.json` — has `site.customization` with `primaryColor`, `accentColor`, `fontFamily`; needs `logoUrl` and `faviconDir` added

## Expected Output

- `apps/generator/src/data/fixture/site.json` — `customization` block includes `logoUrl` and `faviconDir`
- `apps/generator/.generated-sites/fixture/dist/logo.webp` — exists
- `apps/generator/.generated-sites/fixture/dist/favicon.ico` — exists
- `apps/generator/.generated-sites/fixture/dist/site.webmanifest` — exists
- `apps/generator/.generated-sites/fixture/dist/index.html` — contains all three favicon `<link>` tag types
- Build and typecheck both exit 0
