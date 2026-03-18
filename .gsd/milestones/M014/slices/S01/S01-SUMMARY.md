---
id: S01
milestone: M014
status: complete
completed_at: 2026-03-18
tasks_completed: 3/3
verification_result: passed
---

# S01: Logo & Favicon Upload — Summary

## What Was Built

Full logo and favicon upload pipeline for the site edit form:

- **`POST /api/sites/[id]/upload-logo`** — accepts PNG/JPEG (max 5MB), converts to WebP at quality 80 via sharp, writes `public/uploads/sites/[id]/logo.webp`, returns `{ logoUrl }`. Rejects non-image types with 415, oversized files with 413, missing file with 400.
- **`POST /api/sites/[id]/upload-favicon`** — accepts ZIP (max 2MB, MIME type or `.zip` extension), extracts flat entries via adm-zip to `public/uploads/sites/[id]/favicon/`, guards against path traversal (skips entries with `/`, `\`, `..`), returns `{ faviconDir }`.
- **`SiteCustomizationSchema`** extended with `faviconDir: z.string().optional()` (additive, non-breaking alongside existing `faviconUrl`).
- **`updateSite` action** reads `faviconDir` from FormData.
- **`next.config.ts`** adds `'sharp'` to `serverExternalPackages` (required for `.node` binary).
- **Edit form Customization card** — plain Logo URL and Favicon URL text inputs replaced with file upload widgets: `<input type="file">` with `accept` constraints, inline uploading/success/error feedback, hidden inputs passing paths to `updateSite` at submit time.

## Verification Evidence (Slice Level)

| # | Check | Result |
|---|-------|--------|
| 1 | `pnpm --filter @monster/shared build` | ✅ exit 0 |
| 2 | `pnpm --filter @monster/admin build` | ✅ exit 0 (×3, once per task) |
| 3 | Logo upload curl → 200 `{ logoUrl }` | ✅ |
| 4 | `logo.webp` on disk, WebP magic bytes confirmed | ✅ |
| 5 | Favicon upload curl → 200 `{ faviconDir }` | ✅ |
| 6 | 5 entries extracted to `favicon/` directory | ✅ |
| 7 | GIF → upload-logo → HTTP 415 + `{ error }` | ✅ |
| 8 | PNG → upload-favicon → HTTP 415 + `{ error }` | ✅ |
| 9 | No file → upload-logo → HTTP 400 | ✅ |
| 10 | Path traversal ZIP (`../etc/passwd`) → entry skipped, valid entries written | ✅ |
| 11 | Structured 415 error body diagnostic | ✅ |
| 12 | Browser: file upload widgets visible in Customization card | ✅ |
| 13 | DOM: `input[name="logoUrl"]` and `input[name="faviconDir"]` present | ✅ |

## Key Decisions

- **favicon MIME type fallback** — route also accepts `application/octet-stream` + `.zip` filename because browsers commonly report this for ZIP files in multipart uploads.
- **Path traversal: skip, not abort** — a single bad entry in a ZIP doesn't kill the whole upload; it's logged and skipped.
- **`faviconDir` alongside `faviconUrl`** — both coexist in schema; `faviconUrl` left for backward compat with any old sites.
- **`process.cwd()`** — Next.js Route Handlers in `apps/admin` resolve cwd to `apps/admin/`, so `public/` is the correct relative path.

## Files Changed

- `apps/admin/package.json` — sharp, adm-zip, @types/adm-zip added
- `packages/shared/src/types/customization.ts` — faviconDir field added
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — faviconDir read in updateSite
- `apps/admin/next.config.ts` — sharp in serverExternalPackages
- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` — new
- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` — new
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — upload widgets

## What Remains (Next Slice)

S02 (per Integration Closure in S01-PLAN): the Astro generator needs to read `customization.logoUrl` and `customization.faviconDir`, copy the files into the static build output, and wire the BaseLayout `<head>` tags to reference them.
