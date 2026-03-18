---
estimated_steps: 8
estimated_files: 4
---

# T01: Wire faviconDir into data.ts, generate-site.ts, BaseLayout.astro, and Layout.astro

**Slice:** S02 — Generator Integration — Logo Path + Favicon Install
**Milestone:** M014

## Description

Four coordinated changes to thread `faviconDir` (and `logoUrl` copy) from the DB customization JSON through to the generated site's `dist/` output and `<head>` HTML. All changes are purely in TypeScript/Astro code — no builds required until T02 verifies them.

The four files are independent of each other in terms of editing (no compile-time cross-dependencies that block editing), but logically they form a single pipeline: `data.ts` defines the type → `generate-site.ts` copies the files → `BaseLayout.astro` emits the tags → `Layout.astro` passes the prop.

## Steps

1. **`apps/generator/src/lib/data.ts`** — Add `faviconDir?: string` to the `SiteCustomization` interface, immediately after the existing `logoUrl?: string` line. No other changes needed in this file.

2. **`packages/agents/src/jobs/generate-site.ts`** — Two changes:

   a. **Widen the `customization` cast** at line ~277 (the `const customization = site.customization as {...}` block). Add `logoUrl?: string` and `faviconDir?: string` to the type cast, and pass them through in the `siteData.site.customization` object:
   ```ts
   const customization = site.customization as {
     primaryColor?: string;
     accentColor?: string;
     fontFamily?: string;
     logoUrl?: string;
     faviconDir?: string;
   } | null;
   // ...
   customization: {
     primaryColor: customization?.primaryColor ?? '#4f46e5',
     accentColor: customization?.accentColor ?? '#7c3aed',
     fontFamily: customization?.fontFamily ?? 'sans-serif',
     logoUrl: customization?.logoUrl,
     faviconDir: customization?.faviconDir,
   },
   ```

   b. **Add post-build file copies** after `process.chdir(prevCwd)` (after the `finally { process.chdir(prevCwd); }` block, before the `// ── 6. Score pages` comment). Import `copyFileSync` and `cpSync` from `node:fs` — check if they're already in the existing import; if not, add them to the existing `import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'` line.

   The admin public root is: `resolve(__dirname, '../../../apps/admin/public')` (same pattern as `GENERATOR_ROOT = resolve(__dirname, '../../../apps/generator')`).

   ```ts
   // ── 5b. Copy logo and favicon assets into dist/ ───────────────────
   const adminPublicRoot = resolve(__dirname, '../../../apps/admin/public');
   const { logoUrl: logoSrc, faviconDir: faviconSrc } = siteData.site.customization;

   if (logoSrc) {
     const srcPath = join(adminPublicRoot, logoSrc);
     const destPath = join(distDir, 'logo.webp');
     if (existsSync(srcPath)) {
       copyFileSync(srcPath, destPath);
       console.log(`[GenerateSiteJob] Copied logo → dist/logo.webp`);
     } else {
       console.warn(`[GenerateSiteJob] logo source not found: ${srcPath} — skipping`);
     }
   }

   if (faviconSrc) {
     const srcDir = join(adminPublicRoot, faviconSrc);
     if (existsSync(srcDir)) {
       cpSync(srcDir, distDir, { recursive: true });
       console.log(`[GenerateSiteJob] Copied favicon dir → dist/`);
     } else {
       console.warn(`[GenerateSiteJob] favicon source dir not found: ${srcDir} — skipping`);
     }
   }
   ```

   **Important constraint:** `distDir` is declared at `join(GENERATOR_ROOT, '.generated-sites', slug, 'dist')` (line ~440, after the build completes). The copy block must be placed after `distDir` is declared, not before. Check the actual line numbers by reading the file around line 420–445.

   **Import addition:** `cpSync` is not in the existing import. Change:
   ```ts
   import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
   ```
   to:
   ```ts
   import { mkdirSync, writeFileSync, existsSync, readFileSync, copyFileSync, cpSync } from 'node:fs';
   ```

3. **`apps/generator/src/layouts/BaseLayout.astro`** — Two changes:

   a. Add `faviconDir?: string` to the Props interface:
   ```ts
   interface Props {
     title: string;
     lang?: string;
     metaDescription?: string;
     customization?: {
       primaryColor?: string;
       accentColor?: string;
       fontFamily?: string;
     };
     faviconDir?: string;  // ADD THIS
     siteId?: string;
     supabaseUrl?: string;
     supabaseAnonKey?: string;
   }
   ```

   b. Destructure `faviconDir` from `Astro.props` (add to the existing destructuring line).

   c. Add favicon `<link>` tags in `<head>`, after the `{metaDescription && ...}` line and before the `<style>` blocks:
   ```astro
   {faviconDir && (
     <>
       <link rel="icon" href="/favicon.ico" sizes="any" />
       <link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32" />
       <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
       <link rel="manifest" href="/site.webmanifest" />
     </>
   )}
   ```
   
   Note: the `faviconDir` prop is a presence signal only — the actual `href` values are the standard filenames that favicon.io generates (hardcoded). Do NOT use `faviconDir` as a path prefix in the hrefs.

4. **`apps/generator/src/layouts/tsa/Layout.astro`** — Pass `faviconDir` to `BaseLayout`. In the `<BaseLayout ...>` call, add:
   ```astro
   faviconDir={site.customization.faviconDir}
   ```
   alongside the existing `customization={site.customization}` prop.

5. **TypeScript check** — Run `pnpm --filter @monster/generator tsc --noEmit`. If any type errors appear in the modified files, fix them before declaring done.

## Must-Haves

- [ ] `SiteCustomization` in `data.ts` has `faviconDir?: string`
- [ ] `generate-site.ts` customization cast includes `logoUrl` and `faviconDir`; both passed through to `siteData.site.customization`
- [ ] `generate-site.ts` copies logo file post-build (guarded by `existsSync`, non-fatal)
- [ ] `generate-site.ts` copies favicon directory post-build (guarded by `existsSync`, non-fatal)
- [ ] `BaseLayout.astro` Props has `faviconDir?: string`; four `<link>` tags rendered when prop is set
- [ ] `Layout.astro` passes `faviconDir={site.customization.faviconDir}` to `BaseLayout`
- [ ] `pnpm --filter @monster/generator tsc --noEmit` exits 0

## Verification

```bash
pnpm --filter @monster/generator tsc --noEmit 2>&1 | tail -10
```
Must exit 0 with no errors.

## Observability Impact

- Signals added: `[GenerateSiteJob] Copied logo → dist/logo.webp` and `[GenerateSiteJob] Copied favicon dir → dist/` console logs on success; `[GenerateSiteJob] logo source not found` / `favicon source dir not found` warnings on skip
- Failure state exposed: missing source files produce `console.warn` with full path — greppable in BullMQ worker logs

## Inputs

- `apps/generator/src/lib/data.ts` — current `SiteCustomization` has `logoUrl?: string` but no `faviconDir`
- `packages/agents/src/jobs/generate-site.ts` — line ~4: existing `node:fs` import; line ~277: customization cast; line ~420: post-build section; line ~440: `distDir` declaration. Read lines 415–450 to confirm exact positions before editing.
- `apps/generator/src/layouts/BaseLayout.astro` — current Props interface at lines 5–19; destructuring at line 22; `<head>` starts at line 43
- `apps/generator/src/layouts/tsa/Layout.astro` — `<BaseLayout>` call at line ~34; `customization` prop already passed at line ~36
- S01 summary: `customization.logoUrl` = `/uploads/sites/<id>/logo.webp` (local path, not external URL); `customization.faviconDir` = `/uploads/sites/<id>/favicon`

## Expected Output

- `apps/generator/src/lib/data.ts` — `faviconDir?: string` added to `SiteCustomization`
- `packages/agents/src/jobs/generate-site.ts` — widened cast, two new fields in `siteData.site.customization`, two new file copy blocks after build, `copyFileSync`/`cpSync` in imports
- `apps/generator/src/layouts/BaseLayout.astro` — `faviconDir` in Props + destructuring + four `<link>` tags in `<head>`
- `apps/generator/src/layouts/tsa/Layout.astro` — `faviconDir` prop passed to `BaseLayout`
- `pnpm --filter @monster/generator tsc --noEmit` exits 0
