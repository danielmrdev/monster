---
id: T02
parent: S01
milestone: M014
provides:
  - POST /api/sites/[id]/upload-logo Route Handler (PNG/JPEG → WebP via sharp)
  - POST /api/sites/[id]/upload-favicon Route Handler (ZIP extraction via adm-zip)
  - Structured JSON error responses on all failure paths
  - Path traversal guard on ZIP extraction
key_files:
  - apps/admin/src/app/api/sites/[id]/upload-logo/route.ts
  - apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts
key_decisions:
  - favicon route also accepts application/octet-stream MIME type (browsers sometimes report this for .zip) and falls back to filename .zip extension check
  - path traversal guard skips entries containing / or \ or .. (not rejecting the whole upload — partial extraction is acceptable)
  - 400 on empty/missing FormData rather than 415 — "no file" is a client error, not a type error
patterns_established:
  - Next.js 15 async params pattern: `{ params }: { params: Promise<{ id: string }> }` with `await params`
  - console.error with `[upload-logo] siteId=<id>` / `[upload-favicon] siteId=<id>` prefix on all error paths
observability_surfaces:
  - console.error with [upload-logo]/[upload-favicon] prefix + siteId on 500 paths
  - HTTP status codes (400/413/415/500) + JSON error body `{ error: string, detail?: string }`
  - `ls apps/admin/public/uploads/sites/<id>/` — file existence check
  - `curl -s -w "HTTP %{http_code}" -F "file=@/tmp/test.gif" /upload-logo` → structured 415 body
duration: ~25m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Implement upload Route Handlers

**Implemented `upload-logo` (PNG/JPEG→WebP via sharp) and `upload-favicon` (flat ZIP extraction via adm-zip) Route Handlers — both compile, write files to disk, return structured JSON, and reject invalid types with 415.**

## What Happened

Created two new Route Handlers following the existing `products/route.ts` async-params pattern. Both are ~50 lines each, structurally parallel:

1. **`upload-logo/route.ts`** — validates file type (PNG/JPEG only → 415), enforces 5MB limit (→ 413), converts to WebP via `sharp(buffer).webp({ quality: 80 }).toBuffer()`, writes to `public/uploads/sites/[id]/logo.webp`, returns `{ logoUrl }`.

2. **`upload-favicon/route.ts`** — validates file type (zip MIME types + `.zip` filename fallback, others → 415), enforces 2MB limit (→ 413), extracts flat entries via `adm-zip`, skips any entry with `/`, `\`, or `..` in the name (path traversal guard), writes to `public/uploads/sites/[id]/favicon/`, returns `{ faviconDir }`. Returns 400 if zip contained no valid flat entries.

One minor implementation issue: the dev server at port 3004 was an old instance from a prior session (pre-T02 build). Had to kill it and start a fresh dev server to get the new routes. The build correctly includes both routes; this is a dev environment nuance not a code problem.

## Verification

- `pnpm --filter @monster/admin build` — exit 0, both routes appear in build output (`/api/sites/[id]/upload-favicon` and `/api/sites/[id]/upload-logo`)
- Logo upload: `curl -F "file=@/tmp/test_logo.png" .../upload-logo` → 200 `{"logoUrl":"/uploads/sites/<id>/logo.webp"}`, file on disk verified WebP via `xxd` magic bytes (`RIFF....WEBP`)
- Favicon upload: `curl -F "file=@/tmp/favicon_test.zip" .../upload-favicon` → 200 `{"faviconDir":"/uploads/sites/<id>/favicon"}`, all 5 entries extracted to disk
- Rejection (GIF → logo): 415 + `{"error":"Invalid file type. PNG or JPEG required."}`
- Rejection (PNG → favicon): 415 + `{"error":"Invalid file type. ZIP archive required."}`
- No-file → logo: 400 + `{"error":"Invalid multipart request"}`
- Path traversal: ZIP with `../etc/passwd` entry — entry skipped, `favicon.ico` extracted, response 200 (partial extraction)
- Structured error diagnostic: `curl -s -o /dev/null -w "%{http_code}"` → 415, error field non-null

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `pnpm --filter @monster/admin build` | 0 | ✅ pass | 44.3s |
| 2 | `curl -F "file=@test.png" .../upload-logo` | 0 | ✅ pass | <1s |
| 3 | `ls public/uploads/sites/<id>/logo.webp` | 0 | ✅ pass | <1s |
| 4 | `xxd logo.webp \| head` → RIFF/WEBP header | 0 | ✅ pass | <1s |
| 5 | `curl -F "file=@favicon.zip" .../upload-favicon` | 0 | ✅ pass | <1s |
| 6 | `ls public/uploads/sites/<id>/favicon/` → 5 files | 0 | ✅ pass | <1s |
| 7 | GIF → upload-logo → HTTP 415 | 0 | ✅ pass | <1s |
| 8 | PNG → upload-favicon → HTTP 415 | 0 | ✅ pass | <1s |
| 9 | No file → upload-logo → HTTP 400 | 0 | ✅ pass | <1s |
| 10 | Path traversal ZIP → `../etc/passwd` skipped | 0 | ✅ pass | <1s |
| 11 | Structured 415 error body has non-null `error` field | 0 | ✅ pass | <1s |

## Diagnostics

- `ls apps/admin/public/uploads/sites/<id>/` — verifies logo.webp exists
- `ls apps/admin/public/uploads/sites/<id>/favicon/` — verifies extracted files
- `curl -s -w "\nHTTP %{http_code}" -F "file=@/tmp/test.gif" http://localhost:3004/api/sites/<id>/upload-logo` — triggers 415 with JSON body
- `next dev` console: errors logged with `[upload-logo] siteId=<id>` / `[upload-favicon] siteId=<id>` prefix
- HTTP 500 responses include `{ error: "Upload failed", detail: "<original error message>" }` for sharp/adm-zip failures

## Deviations

- Favicon route also accepts `application/octet-stream` MIME type and falls back to `.zip` filename check. This was added because browsers commonly report `application/octet-stream` for ZIP files in multipart uploads — the plan only specified `application/zip` and `application/x-zip-compressed`, which would cause false 415s from some browsers.
- Path traversal guard uses "skip entry" rather than "abort entire upload". The plan said "skip/reject entries" — chose skip with a warning log so a single bad entry doesn't waste a valid upload.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` — new: POST handler, PNG/JPEG → WebP conversion, 5MB limit, structured error responses
- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` — new: POST handler, ZIP extraction, 2MB limit, path traversal guard, structured error responses
