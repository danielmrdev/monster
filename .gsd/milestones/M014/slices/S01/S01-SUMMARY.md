---
id: S01
parent: M014
milestone: M014
provides:
  - POST /api/sites/[id]/upload-logo — PNG/JPEG → WebP via sharp, writes to public/uploads/sites/[id]/logo.webp
  - POST /api/sites/[id]/upload-favicon — ZIP extraction via adm-zip, writes to public/uploads/sites/[id]/favicon/
  - SiteCustomizationSchema.faviconDir field (additive, non-breaking alongside legacy faviconUrl)
  - updateSite server action reads faviconDir from FormData
  - sharp externalized in Next.js serverExternalPackages + webpack.externals
  - Edit form Customization card: logo file input + favicon ZIP input with inline upload feedback
  - Hidden inputs carry uploaded paths to updateSite on submit
  - Pre-population of existing logoUrl/faviconDir on edit form load
requires: []
affects:
  - S02
key_files:
  - apps/admin/package.json
  - packages/shared/src/types/customization.ts
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/next.config.ts
  - apps/admin/src/app/api/sites/[id]/upload-logo/route.ts
  - apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
key_decisions:
  - D172: faviconUrl kept alongside faviconDir — legacy coexistence, non-breaking additive change
  - D173: favicon upload accepts application/octet-stream + .zip filename fallback (browsers frequently misreport ZIP MIME type)
  - D174: path traversal guard skips unsafe ZIP entries rather than rejecting entire upload
  - Native binary deps (sharp, node-ssh, ssh2) go in both serverExternalPackages and webpack.externals
patterns_established:
  - Upload state pattern: { uploading, path, error } useState initialized from existing customization value
  - Hidden input carries upload path to server action: <input type="hidden" name="X" value={state.path ?? ''} />
  - Next.js 15 async params: { params }: { params: Promise<{ id: string }> } with await params
  - Structured JSON error body { error: string, detail?: string } on all Route Handler failure paths
observability_surfaces:
  - console.error with [upload-logo] siteId=<id> / [upload-favicon] siteId=<id> prefix on all 500 paths
  - HTTP status codes: 400 (no file / no valid entries), 413 (size exceeded), 415 (wrong type), 500 (sharp/adm-zip error)
  - ls apps/admin/public/uploads/sites/<id>/ — file existence verification
  - ls apps/admin/public/uploads/sites/<id>/favicon/ — extracted entries list
  - xxd apps/admin/public/uploads/sites/<id>/logo.webp | head — verify RIFF/WEBP magic bytes
  - Browser DevTools Network tab → filter "upload" — POST requests to upload-logo and upload-favicon visible
  - DOM: document.querySelector('input[name="logoUrl"]').value — check hidden input after upload
drill_down_paths:
  - .gsd/milestones/M014/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M014/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M014/slices/S01/tasks/T03-SUMMARY.md
duration: ~53m (T01: 8m, T02: 25m, T03: 20m)
verification_result: passed
completed_at: 2026-03-18
---

# S01: Logo & Favicon Upload

**Two Route Handler upload endpoints (PNG→WebP via sharp, ZIP extraction via adm-zip) plus edit form file widgets that carry uploaded paths to the existing updateSite action — fully replacing the old plain text inputs.**

## What Happened

Three tightly scoped tasks built the full upload pipeline in under an hour.

**T01** laid the groundwork: added `sharp@^0.33.5`, `adm-zip@^0.5.16`, and `@types/adm-zip@^0.5.8` to `apps/admin/package.json`; extended `SiteCustomizationSchema` with `faviconDir: z.string().optional()`; wired `faviconDir` into `updateSite`'s `rawCustomization` read; and added `'sharp'` to `serverExternalPackages` in `next.config.ts`. Both `@monster/shared` and `@monster/admin` built clean.

**T02** implemented the two Route Handlers. `upload-logo/route.ts`: validates PNG/JPEG only (415 otherwise), enforces 5MB limit (413), converts to WebP via `sharp().webp({ quality: 80 })`, writes to `public/uploads/sites/[id]/logo.webp`, returns `{ logoUrl }`. `upload-favicon/route.ts`: accepts ZIP MIME types including `application/octet-stream` (browsers commonly misreport) plus `.zip` filename fallback, enforces 2MB limit, extracts flat entries via adm-zip, skips entries containing `/`, `\`, or `..` (path traversal guard), writes to `public/uploads/sites/[id]/favicon/`, returns `{ faviconDir }`. All rejection paths return structured `{ error, detail? }` JSON. End-to-end curl verification confirmed: logo upload returned 200 with RIFF/WEBP magic bytes on disk; favicon ZIP extracted 5 entries; GIF→logo returned 415; PNG→favicon returned 415; path traversal entry `../etc/passwd` was skipped silently.

**T03** connected the UI: replaced the Logo URL and Favicon URL `<Input>` text fields in the edit form's Customization card with file inputs (`accept="image/png,image/jpeg"` / `accept=".zip,application/zip"`). Two upload state variables (`logoUploadState`, `faviconUploadState`) are initialized from `site.customization.logoUrl` / `site.customization.faviconDir` so re-editing a site shows existing state. Handler functions call the T02 routes on `onChange`, update state, and disable the input during upload. Hidden inputs (`name="logoUrl"` / `name="faviconDir"`) carry the resulting paths to `updateSite` at submit time. Inline feedback shows "Uploading…", "✓ /uploads/sites/<id>/..." (success), or red error text.

## Verification

All slice-level checks from the plan passed:

- `pnpm --filter @monster/shared build` — exit 0 (DTS + ESM)
- `pnpm --filter @monster/admin build` — exit 0; both route handlers appear in build output (`/api/sites/[id]/upload-logo`, `/api/sites/[id]/upload-favicon`); edit route grew from 5.75kB to 6.15kB (upload state + handlers)
- Logo upload curl: 200 + `{ logoUrl: "/uploads/sites/<id>/logo.webp" }`; `xxd` confirms RIFF/WEBP bytes on disk
- Favicon upload curl: 200 + `{ faviconDir: "/uploads/sites/<id>/favicon" }`; 5 entries on disk
- GIF → upload-logo: HTTP 415 + `{ "error": "Invalid file type. PNG or JPEG required." }`
- PNG → upload-favicon: HTTP 415 + `{ "error": "Invalid file type. ZIP archive required." }`
- No file → upload-logo: HTTP 400 + structured JSON body
- Path traversal ZIP (`../etc/passwd` entry): entry skipped, `favicon.ico` extracted, response 200
- Browser: `input[accept="image/png,image/jpeg"]` and `input[accept=".zip,application/zip"]` visible in DOM
- DOM: `input[name="logoUrl"]` and `input[name="faviconDir"]` hidden inputs present, value `""`

## Requirements Advanced

- R001 (idea → live site pipeline) — logo and favicon are now uploadable assets in the admin panel, closing a gap in the site configuration UX before generation

## Requirements Validated

None newly validated by this slice. S02 (generator integration) is the proof gate.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

- **Favicon MIME acceptance broadened**: plan specified `application/zip` + `application/x-zip-compressed`. T02 also accepts `application/octet-stream` and falls back to filename `.zip` check. Real browsers commonly send `application/octet-stream` for ZIP files — the plan's restriction would have caused false 415s (D173).
- **Path traversal: skip not abort**: plan said "skip/reject entries with `/` or `..` in `entryName`". Chose skip-with-warn over abort-whole-upload: a single bad entry shouldn't discard valid favicon files (D174).

## Known Limitations

- No image dimensions or aspect-ratio check on logo upload — sharp converts whatever PNG/JPEG is provided. Cropping/resizing can be added in a later polish pass.
- Uploaded files are stored under `apps/admin/public/uploads/` — served directly by Next.js. No CDN, no access control. Fine for Phase 1 single-operator use; would need a signed URL or storage service for multi-tenant.
- `faviconUrl` (old text-input field) still exists in the schema and is read from DB. It is not written by any current flow but old sites may have it set. No migration cleans it up (D172).

## Follow-ups

- S02: generator copies `customization.logoUrl` → `dist/logo.webp` and `customization.faviconDir/` → `dist/` root; BaseLayout `<head>` gets favicon link tags. S01 output contracts must be consumed exactly as specified in the S01→S02 boundary map.
- Future: add image resize/crop option to upload-logo (e.g. resize to max 400×200 preserving aspect ratio).

## Files Created/Modified

- `apps/admin/package.json` — added sharp, adm-zip, @types/adm-zip deps
- `packages/shared/src/types/customization.ts` — added faviconDir: z.string().optional() to SiteCustomizationSchema
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — added faviconDir read in updateSite rawCustomization
- `apps/admin/next.config.ts` — added sharp to serverExternalPackages
- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` — new: POST handler, PNG/JPEG→WebP, 5MB limit, structured errors
- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` — new: POST handler, ZIP extraction, 2MB limit, path traversal guard
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — replaced Logo URL + Favicon URL text inputs with file upload widgets

## Forward Intelligence

### What the next slice should know

- `customization.logoUrl` is a local path string like `/uploads/sites/<id>/logo.webp` — the generator should copy from `apps/admin/public${customization.logoUrl}` to `dist/logo.webp`. Do NOT treat it as an external URL to download.
- `customization.faviconDir` is a local path like `/uploads/sites/<id>/favicon` — the generator should copy from `apps/admin/public${customization.faviconDir}/` (as a directory) to `dist/` root.
- The `public/uploads/` directory is created at write time (`mkdirSync({ recursive: true })`) — no pre-provisioning needed.
- `faviconDir` may be `undefined` on sites that haven't uploaded a favicon yet. The generator must treat it as optional and fall back gracefully (no favicon link tags in `<head>`).
- `logoUrl` may be `undefined` for the same reason — fall back to no logo rendering (or the placeholder behaviour from earlier templates).

### What's fragile

- `sharp` in Next.js 15: externalized in `serverExternalPackages` AND `webpack.externals` (same pattern as `node-ssh`/`ssh2`). If `next.config.ts` is regenerated or merged, verify both entries survive. The build will pass but `sharp` will throw a module-not-found error at runtime if the externalization is dropped.
- The dev server must be restarted after new Route Handlers are added — Next.js does not hot-reload new API route files, only changes to existing ones.

### Authoritative diagnostics

- `ls apps/admin/public/uploads/sites/<id>/` — most direct proof that an upload succeeded; empty directory means the route handler never wrote anything
- `xxd apps/admin/public/uploads/sites/<id>/logo.webp | head -1` — confirms WebP magic bytes (`52 49 46 46 ... 57 45 42 50`); wrong bytes means sharp conversion failed silently
- `next dev` console with `[upload-logo]` or `[upload-favicon]` grep — 500-path errors always logged here with siteId prefix
- HTTP 500 response body: `{ "error": "Upload failed", "detail": "<original error message>" }` — sharp/adm-zip failure reason always in `detail`

### What assumptions changed

- Original plan assumed only `application/zip` and `application/x-zip-compressed` MIME types needed — real browsers also send `application/octet-stream` for ZIP files; added filename fallback check (D173)
- Original plan said "reject" path-traversal entries — changed to "skip" (D174) for better UX when a valid ZIP has one malformed entry
