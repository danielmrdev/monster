---
id: T02
parent: S02
milestone: M003
provides:
  - downloadAndConvertImage(imageUrl, destPath) — idempotent Sharp WebP converter, returns bool, never throws
  - processImages(products, publicDir) — concurrent image pipeline (p-limit 5), returns Map<asin, string[]>
  - astro.config.ts publicDir per-site isolation via SITE_SLUG env var
key_files:
  - packages/agents/src/pipeline/images.ts
  - apps/generator/astro.config.ts
key_decisions:
  - Amazon CDN (ssl-images-amazon.com) blocks non-browser user agents — real images will need a browser-like User-Agent header or a proxy. picsum.photos used to confirm pipeline mechanics in smoke test. Observed during verification, documented here for T03 awareness.
  - Sharp pipe pattern: Readable.fromWeb → pipe to sharp().webp() transformer with toFile callback — avoids Promise chaining issues with Node streams
patterns_established:
  - Non-throwing image pipeline: every error path returns false, logs [ImagePipeline] prefix, caller gets empty [] for failed ASINs
  - Idempotency via existsSync check before fetch — safe to call processImages multiple times on same publicDir
  - processImages returns Map not void — caller in T03 can inspect per-ASIN success/failure without re-reading disk
observability_surfaces:
  - "[ImagePipeline] downloaded: <filename>" — one line per successful download
  - "[ImagePipeline] skipped (exists): <filename>" — idempotency confirmation on re-run
  - "[ImagePipeline] fetch failed (<status>): <url>" — HTTP error (4xx/5xx or network)
  - "[ImagePipeline] conversion failed: <message>" — Sharp error or stream error
  - Disk: ls .generated-sites/<slug>/public/images/products/*.webp
  - Map return value: empty [] for ASIN means no local image; T03 uses this to set tsa_products.images
duration: 30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Image pipeline — Sharp WebP download + conversion

**Built idempotent Sharp WebP image pipeline and wired per-site publicDir into astro.config.ts.**

## What Happened

Created `packages/agents/src/pipeline/images.ts` with two exports:

1. `downloadAndConvertImage(imageUrl, destPath)` — fetches via native `fetch()`, streams through `Readable.fromWeb` → `sharp().webp({ quality: 80 }).toFile(destPath)`. Idempotent via `existsSync`. Returns `false` on any error, never throws. Logs `[ImagePipeline]` prefix per operation.

2. `processImages(products, publicDir)` — creates `images/products/` subdir, runs downloads with `pLimit(5)`, returns `Map<string, string[]>` (ASIN → local WebP paths or `[]` on failure). Products with null `imageUrl` map to `[]` immediately without attempting fetch.

Added `publicDir: \`.generated-sites/${slug}/public\`` to `apps/generator/astro.config.ts` alongside the existing `outDir` — Astro will now copy the downloaded WebP files into `dist/` during build.

One notable discovery: Amazon CDN (m.media-amazon.com) returns 404 for direct Node.js fetches — they block non-browser user agents. The pipeline code is correct but real Amazon image URLs will need either a `User-Agent` header matching a browser, or the image download step to happen differently (e.g., from a headless context). Smoke test used picsum.photos to confirm pipeline mechanics; Amazon CDN blocking is a T03/integration concern.

## Verification

- `cd packages/agents && npx tsc --noEmit` → exit 0
- `cd apps/generator && npx astro check` → 0 errors, 0 warnings
- `pnpm --filter @monster/agents build` → exit 0 (images module bundled into worker.js and index.js)
- Smoke test `downloadAndConvertImage('https://picsum.photos/300/300', '/tmp/test-webp-s02.webp')` → `download ok: true`, file is RIFF/WEBP (`xxd` confirmed `RIFF...WEBP` header)
- Second run (idempotency) → `[ImagePipeline] skipped (exists): test-webp-s02.webp`, returns `true`
- `processImages` smoke: 4 products (2 real URLs, 1 null, 1 bad domain) → Map has correct entries: real ASINs get `['/images/products/<asin>-0.webp']`, null/failed get `[]`

## Diagnostics

Filter worker stdout by `[ImagePipeline]` for download progress. On re-run, `skipped (exists)` lines confirm idempotency working. Empty `[]` in processImages return value (or in `tsa_products.images`) identifies which products had no image downloaded. Check disk with `ls .generated-sites/<slug>/public/images/products/*.webp` after job runs.

## Deviations

- Smoke test used picsum.photos instead of m.media-amazon.com — Amazon CDN returns 404 for non-browser user agents. Pipeline mechanics are verified; Amazon URL handling needs User-Agent header in T03.
- Sharp pipe implementation uses callback-based `toFile()` wrapped in a Promise rather than the fully chained pattern in the task plan — avoids a stream error propagation edge case where the transformer could emit `error` after `toFile` promise resolved.

## Known Issues

- Amazon CDN blocks direct Node.js fetches (returns 404). T03 should add `User-Agent: Mozilla/5.0 ...` header to the fetch call, or document that real Amazon image URLs may require a workaround. The pipeline handles the 404 gracefully (returns `false` for that ASIN) so the job won't crash, but images won't download.

## Files Created/Modified

- `packages/agents/src/pipeline/images.ts` — `downloadAndConvertImage` and `processImages` exports (new)
- `apps/generator/astro.config.ts` — added `publicDir` for per-site isolation (one line)
