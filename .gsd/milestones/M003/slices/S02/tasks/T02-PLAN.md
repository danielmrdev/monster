---
estimated_steps: 4
estimated_files: 2
---

# T02: Image pipeline — Sharp WebP download + conversion

**Slice:** S02 — DataForSEO Product Fetch + Image Pipeline
**Milestone:** M003

## Description

Build the image download and WebP conversion pipeline, and add the `publicDir` fix to `astro.config.ts` so images land in the right place during Astro build. This is pure utility code with no new external dependencies (Sharp and p-limit were installed in T01). The only design concern is idempotency (skip already-downloaded files) and the `publicDir` isolation per site.

## Steps

1. Create `packages/agents/src/pipeline/images.ts`. Implement:

   ```ts
   export async function downloadAndConvertImage(
     imageUrl: string,
     destPath: string,
   ): Promise<boolean>
   ```
   - Check `existsSync(destPath)` → return `true` immediately if file exists (idempotent). Log `[ImagePipeline] skipped (exists): ${basename(destPath)}`.
   - `const response = await fetch(imageUrl)` — if `!response.ok`, log `[ImagePipeline] fetch failed (${response.status}): ${imageUrl}` and return `false`.
   - `const { Readable } = await import('node:stream')` — `Readable.fromWeb(response.body as ReadableStream)`.
   - Import `sharp` from `'sharp'`. Pipe: `readable.pipe(sharp().webp({ quality: 80 }))` then `.toFile(destPath)`.
   - On any error: log `[ImagePipeline] conversion failed: ${err.message}` and return `false`. Never throw — caller decides whether to skip or fail.
   - On success: log `[ImagePipeline] downloaded: ${basename(destPath)}` and return `true`.

2. Implement `processImages` helper in the same file:
   ```ts
   export async function processImages(
     products: Array<{ asin: string; imageUrl: string | null }>,
     publicDir: string,
   ): Promise<Map<string, string[]>>
   ```
   - `const imagesDir = join(publicDir, 'images', 'products')`. `mkdirSync(imagesDir, { recursive: true })`.
   - Use `pLimit(5)` from `p-limit`. For each product with a non-null `imageUrl`: enqueue `downloadAndConvertImage(imageUrl, join(imagesDir, \`${product.asin}-0.webp\`))`.
   - `await Promise.all(limitedTasks)`.
   - Return `Map<asin, string[]>` where value is `['/images/products/<asin>-0.webp']` if download succeeded, or `[]` if failed.

3. Add `publicDir` to `apps/generator/astro.config.ts`:
   ```ts
   publicDir: `.generated-sites/${slug}/public`,
   ```
   Add it directly after `outDir` on its own line. This is a one-liner — the `slug` variable is already defined at the top of the config file.

4. Run `npx tsc --noEmit` in `packages/agents`. Run `npx astro check` in `apps/generator`. Fix any type errors.

## Must-Haves

- [ ] `downloadAndConvertImage` is idempotent — skips if file already exists at `destPath`
- [ ] Fetch errors and Sharp errors return `false`, never throw — pipeline continues for other images
- [ ] `processImages` uses `p-limit(5)` — max 5 concurrent Sharp operations
- [ ] Returned map uses local WebP path format `/images/products/<asin>-0.webp` (web-root-relative)
- [ ] `astro.config.ts` has `publicDir` configured with `SITE_SLUG` isolation
- [ ] Both files type-check cleanly

## Verification

- `cd packages/agents && npx tsc --noEmit` → exit 0
- `cd apps/generator && npx astro check` → 0 errors
- Smoke test for image download (no DataForSEO creds needed — use a public image URL):
  ```bash
  pnpm --filter @monster/agents build
  node --input-type=module <<'EOF'
  import { downloadAndConvertImage } from './packages/agents/dist/pipeline/images.js';
  import { existsSync } from 'node:fs';
  const ok = await downloadAndConvertImage(
    'https://m.media-amazon.com/images/I/71YQMV0bAeL._AC_SL1500_.jpg',
    '/tmp/test-webp-s02.webp'
  );
  console.log('download ok:', ok);
  console.log('file exists:', existsSync('/tmp/test-webp-s02.webp'));
  EOF
  ```
  → `download ok: true`, `file exists: true`
- Run again → `[ImagePipeline] skipped (exists)` logged, still returns `true`

## Inputs

- `packages/agents/package.json` — `sharp` and `p-limit` already installed (T01)
- `apps/generator/astro.config.ts` — existing `outDir` pattern to mirror for `publicDir`
- `DataForSEOProduct` type from T01's `packages/agents/src/clients/dataforseo.ts` — `asin` and `imageUrl` fields used in `processImages` signature

## Observability Impact

- **New log prefix:** `[ImagePipeline]` — one line per image: `downloaded`, `skipped (exists)`, `fetch failed (<status>): <url>`, or `conversion failed: <message>`
- **Inspecting progress:** Worker stdout filtered by `[ImagePipeline]` shows live download progress; count of lines with `downloaded` vs `skipped` vs failed gives pipeline health at a glance.
- **Failure state:** Individual image failures are non-fatal and logged with URL; `processImages` returns empty `[]` for failed ASINs so callers can detect which products have no local image. Job-level failure (zero downloads on a full run) surfaces through `ai_jobs.error` set in T03.
- **Idempotency signal:** `skipped (exists)` lines on re-run confirm the pipeline correctly short-circuits already-processed images — useful when debugging partial runs.
- **Disk verification:** `ls .generated-sites/<slug>/public/images/products/*.webp` confirms files land in the right location; `file <path>.webp` confirms format is actually Web/P.

## Expected Output

- `packages/agents/src/pipeline/images.ts` — `downloadAndConvertImage` and `processImages` exports
- `apps/generator/astro.config.ts` — `publicDir` added (one line)
- Both type-check cleanly; image smoke test produces a real WebP file
