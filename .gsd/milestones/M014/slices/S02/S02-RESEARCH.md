# S02 — Research

**Date:** 2026-03-18

## Summary

S02 is a targeted integration slice: consume the `logoUrl` and `faviconDir` paths written by S01 in two places — `generate-site.ts` (copy files into `dist/`) and `BaseLayout.astro` (emit `<link>` tags in `<head>`). No new libraries, no schema changes. The work divides cleanly into three files with no interdependencies.

The S01 verification artifacts are already on disk (`apps/admin/public/uploads/sites/<uuid>/logo.webp`, `favicon/favicon.ico`, `favicon/site.webmanifest`, etc.), so integration can be tested immediately against a fixture that includes `customization.logoUrl` and `customization.faviconDir`.

## Recommendation

Two independent tasks:

1. **`generate-site.ts` + `data.ts` + `SiteCustomization` type** — add `logoUrl` and `faviconDir` to the customization block in `generate-site.ts`; add `faviconDir` to `SiteCustomization` in `apps/generator/src/lib/data.ts`; add the two `copyFileSync`/`cpSync` calls after the Astro build completes (copy before SEO scoring so the files appear in the dist snapshot).

2. **`BaseLayout.astro`** — add `faviconDir?: string` to the Props interface and emit the four `<link>` tags (`favicon.ico`, `favicon-32x32.png`, `apple-touch-icon.png`, `site.webmanifest`) conditionally when `faviconDir` is set. `Layout.astro` passes `site.customization.faviconDir` down to `BaseLayout`.

Verification: update the fixture `site.json` to include both fields, then run `SITE_SLUG=fixture pnpm --filter @monster/generator build` and grep `dist/` for the expected files and `<head>` tags.

## Implementation Landscape

### Key Files

- `packages/agents/src/jobs/generate-site.ts` — The main orchestrator. `customization` is assembled at line 277–295 but **only reads `primaryColor`, `accentColor`, `fontFamily`**. `logoUrl` and `faviconDir` are present in the DB `customization` JSON (via S01) but are currently dropped. Need to pass them through to `siteData.site.customization`. File copy happens **after the Astro build** (step 5, line 414), before SEO scoring (step 6, line 428). The `distDir` variable (`join(GENERATOR_ROOT, '.generated-sites', slug, 'dist')`) is already declared at line 440 — the copy can reuse it.

- `apps/generator/src/lib/data.ts` — `SiteCustomization` interface at line 12. Currently has `logoUrl?: string` but **no `faviconDir`**. Add `faviconDir?: string`. This is the type consumed by all Astro pages and layouts.

- `apps/generator/src/layouts/BaseLayout.astro` — Props interface at the top. Currently accepts `customization?: { primaryColor, accentColor, fontFamily }` — no logo, no favicon. Needs `faviconDir?: string` added to Props, and the four favicon `<link>` tags in `<head>`. No prop is needed for `logoUrl` here — logo rendering is already handled in `Layout.astro` (reads from `site.customization.logoUrl`).

- `apps/generator/src/layouts/tsa/Layout.astro` — Already reads `site.customization.logoUrl` (line 23) and passes `customization={site.customization}` to `BaseLayout`. Needs to also pass `faviconDir={site.customization.faviconDir}` to `BaseLayout`.

- `apps/generator/src/data/fixture/site.json` — Fixture used for local build verification. Add `customization.logoUrl` and `customization.faviconDir` fields pointing to the actual S01-written paths on disk. For the fixture to work with the copy step, the paths must resolve from `apps/admin/public/`.

### Build Order

1. **`data.ts` first** — Add `faviconDir` to `SiteCustomization`. This type is imported by `Layout.astro` and all page components. Without it, TypeScript will warn about unknown property.

2. **`generate-site.ts`** — Add `logoUrl` and `faviconDir` to the customization pass-through, then add the two copy operations (logo file, favicon directory) immediately after the `await build(...)` call (after `process.chdir(prevCwd)`). Both copies are guarded: skip when the path is absent or the source file doesn't exist (`existsSync`). `existsSync` is already imported.

3. **`BaseLayout.astro` + `Layout.astro`** — Add `faviconDir` to `BaseLayout` Props, emit `<link>` tags, pass the prop from `Layout.astro`. These two files are edited together; `Layout.astro` is the only caller of `BaseLayout`.

4. **Fixture `site.json`** — Add the two customization fields so the `SITE_SLUG=fixture` build exercises the new code paths.

### Verification Approach

```bash
# 1. Build @monster/shared (SiteCustomization type change)
pnpm --filter @monster/shared build

# 2. Build the generator against the fixture
SITE_SLUG=fixture pnpm --filter @monster/generator build

# 3. Verify logo file in dist/
ls apps/generator/.generated-sites/fixture/dist/logo.webp

# 4. Verify favicon files in dist/ root
ls apps/generator/.generated-sites/fixture/dist/favicon.ico
ls apps/generator/.generated-sites/fixture/dist/site.webmanifest

# 5. Verify <head> links in BaseLayout output
grep -l "rel=\"manifest\"" apps/generator/.generated-sites/fixture/dist/**/*.html | head -3
grep "rel=\"icon\"\|rel=\"apple-touch-icon\"\|rel=\"manifest\"" apps/generator/.generated-sites/fixture/dist/index.html

# 6. TypeScript clean
pnpm --filter @monster/admin tsc --noEmit 2>&1 | tail -5
```

## Constraints

- `generate-site.ts` must resolve the source path from `apps/admin/public/` (the Next.js public directory). The path stored in `customization.logoUrl` is a URL-relative path like `/uploads/sites/<id>/logo.webp`. The file on disk is at `apps/admin/public${customization.logoUrl}`. The admin root relative to `GENERATOR_ROOT` is `join(GENERATOR_ROOT, '..', '..', 'apps', 'admin', 'public')` — or better, use `resolve(__dirname, '../../../apps/admin/public')` following the existing `GENERATOR_ROOT` pattern.

- `faviconDir` is stored as `/uploads/sites/<id>/favicon` (URL path). The on-disk source directory is `apps/admin/public${customization.faviconDir}/`. Use Node's `cpSync` with `{ recursive: true }` to copy the entire directory to `distDir/`.

- Both copies must be **non-fatal**: if the file/dir doesn't exist (e.g. site hasn't uploaded a logo yet), skip with `console.warn` and continue. `existsSync` is already imported in `generate-site.ts`.

- `faviconDir` on `SiteCustomization` in `apps/generator/src/lib/data.ts` is purely additive — no downstream templates or pages reference it directly, only `Layout.astro` does.

- The fixture `site.json` must use a `faviconDir` path that actually exists on disk relative to the local dev environment — use the S01 verification artifact path: `/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/favicon`. For `logoUrl`, use `/uploads/sites/e73839d8-bf90-4abe-9e33-f53fa4cdd6bb/logo.webp`.

## Common Pitfalls

- **`customization` type cast in `generate-site.ts` line 277** — The current cast only includes `{ primaryColor, accentColor, fontFamily }`. Widen it to also include `logoUrl?: string` and `faviconDir?: string` otherwise the new fields will be typed as `unknown` and stripped from the siteData object.

- **`cpSync` destination is `distDir/` not `distDir/favicon/`** — favicon.io ZIPs contain flat files (`favicon.ico`, `site.webmanifest`, etc.) that must land at the **root** of dist/, not in a subdirectory. Use `cpSync(srcFaviconDir, distDir, { recursive: true })` — this copies directory *contents* into `distDir` when the target already exists.

- **BaseLayout `faviconDir` prop is a directory path, not a URL** — The `<link>` tag `href` values are not `/uploads/...` paths — they are standard favicon filenames at the site root: `href="/favicon.ico"`, `href="/favicon-32x32.png"`, etc. The `faviconDir` prop is only a boolean presence signal for `BaseLayout`; the actual hrefs are hardcoded to the standard filenames favicon.io generates.

- **`@monster/shared` build not needed for `generate-site.ts` changes** — `SiteCustomization` in `data.ts` is internal to the generator and not exported from `@monster/shared`. The `packages/shared/src/types/customization.ts` `SiteCustomizationSchema` (Zod) is separate from the generator's `SiteCustomization` TypeScript interface. Both need updating but they're independent.
