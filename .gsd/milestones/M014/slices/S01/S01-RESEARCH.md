# S01: Logo & Favicon Upload — Research

**Date:** 2026-03-18

## Summary

S01 replaces the two plain `Input` fields in the edit form (`logoUrl`, `faviconUrl`) with real file upload widgets backed by dedicated Route Handler API endpoints. Logo uploads are processed through sharp (PNG → WebP), favicon uploads are extracted from a ZIP (favicon.io format) via adm-zip. Both outputs land in `apps/admin/public/uploads/sites/[id]/` and are served statically by Next.js. The resulting paths are stored in `customization.logoUrl` and the new `customization.faviconDir` fields.

The work has three natural layers: (1) schema + dependency additions, (2) two Route Handlers that do the actual I/O, (3) client-side UI in `edit-form.tsx` that triggers the uploads and passes the resulting paths into the form state. All three are independent and fast to implement — the only real risk is sharp's native module needing an explicit `serverExternalPackages` entry in `next.config.ts`.

## Recommendation

Implement as two Route Handlers (`upload-logo/route.ts`, `upload-favicon/route.ts`) called from the client component via `fetch()`. On success, store the returned path in React state, display a preview/confirmation, and persist via a hidden form field so the existing `updateSite` server action receives the path at submit time. This keeps the existing server action pattern intact and avoids converting file upload to a streaming server action.

## Implementation Landscape

### Key Files

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — `'use client'`; currently has plain `Input` for `logoUrl` and `faviconUrl` inside the Customization card (lines ~274–300). Replace both with file upload widgets. The component already uses `useState`/`useRef` for homepage SEO text generation — the same pattern works here.

- `apps/admin/src/app/(dashboard)/sites/actions.ts` — `updateSite` action reads `logoUrl` and `faviconUrl` from `FormData` and passes them into `SiteCustomizationSchema`. Two changes needed: (1) add `faviconDir` to the form read; (2) ensure `faviconUrl` is kept for backward compat or removed cleanly. The `rawCustomization` object currently maps `faviconUrl` — swap it for `faviconDir`.

- `packages/shared/src/types/customization.ts` — `SiteCustomizationSchema` has `faviconUrl: z.string().optional()`. Add `faviconDir: z.string().optional()`. Keep `faviconUrl` if existing sites reference it, or remove it if S01 fully replaces the concept. Decision D096 says `faviconDir` is the new field. Safe to add alongside `faviconUrl` (existing sites with a URL-based faviconUrl keep working; S02 reads `faviconDir` for generation).

- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` — **new file**. `POST` handler: reads `request.formData()`, gets `File` from key `"file"`, validates type (`image/png`, `image/jpeg`), converts via `sharp(buffer).webp({ quality: 80 })`, writes to `apps/admin/public/uploads/sites/[siteId]/logo.webp`, returns `{ logoUrl: '/uploads/sites/[siteId]/logo.webp' }`.

- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` — **new file**. `POST` handler: reads `request.formData()`, gets `File` from key `"file"`, validates type (`application/zip` or `application/x-zip-compressed`), extracts all entries with adm-zip into `apps/admin/public/uploads/sites/[siteId]/favicon/`, guards against path traversal (reject entries whose name contains `/` or `..`), returns `{ faviconDir: '/uploads/sites/[siteId]/favicon' }`.

- `apps/admin/next.config.ts` — add `'sharp'` to `serverExternalPackages`. Sharp uses `@img/sharp-linux-x64` which contains a `.node` binary (`sharp-linux-x64.node`) — webpack cannot bundle it. Pattern is identical to `node-ssh`/`ssh2`/`cpu-features` already in the config. `adm-zip` is pure JavaScript — no entry needed.

- `apps/admin/package.json` — add `"sharp": "^0.33.5"` and `"adm-zip": "^0.5.16"` to `dependencies`. Also add `"@types/adm-zip": "^0.5.8"` to `devDependencies` (adm-zip has no built-in types).

### Build Order

1. **Schema + deps first** (T01): Add `sharp`, `adm-zip`, `@types/adm-zip` to `apps/admin/package.json`. Add `faviconDir` to `SiteCustomizationSchema`. Update `updateSite` action to read `faviconDir` instead of `faviconUrl` from FormData. Rebuild `packages/shared`. This unblocks everything else and has zero runtime risk.

2. **Route Handlers** (T02): Implement both upload Route Handlers (logo + favicon) in the same task — they're small and parallel. Create `apps/admin/public/` directory. Verify with a `curl -F "file=@test.png" http://localhost:3004/api/sites/[id]/upload-logo` call.

3. **Edit form UI** (T03): Replace the two Input fields in `edit-form.tsx` with file input widgets that call the routes and store results in hidden fields.

### Verification Approach

```bash
# 1. Deps install
pnpm install

# 2. Package build after schema change
pnpm --filter @monster/shared build
pnpm --filter @monster/admin build   # confirms next.config + serverExternalPackages correct

# 3. Run dev server and hit upload endpoints manually:
# curl -F "file=@any.png" http://localhost:3004/api/sites/<id>/upload-logo
# Expected: 200 { logoUrl: '/uploads/sites/<id>/logo.webp' }
# File exists: apps/admin/public/uploads/sites/<id>/logo.webp

# 4. Upload a favicon.io ZIP:
# curl -F "file=@favicon_package.zip" http://localhost:3004/api/sites/<id>/upload-favicon
# Expected: 200 { faviconDir: '/uploads/sites/<id>/favicon' }
# Files exist: apps/admin/public/uploads/sites/<id>/favicon/favicon.ico
#              apps/admin/public/uploads/sites/<id>/favicon/site.webmanifest

# 5. Submit the edit form after uploads → verify customization.logoUrl and customization.faviconDir
#    stored in DB (Supabase REST or dev server page reload)
```

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| PNG → WebP conversion | `sharp` (already in `packages/agents` at `^0.33.5`) | Pre-built binaries for Node 22 on Linux x64 confirmed present. `sharp(buffer).webp({ quality: 80 }).toBuffer()` tested and working in this environment. |
| ZIP extraction from Buffer | `adm-zip` v0.5.16 (new dep) | Pure JS, no native bindings. `new AdmZip(buffer).getEntries()` works from a `Buffer` returned by `file.arrayBuffer()`. Type defs via `@types/adm-zip`. |

## Constraints

- `apps/admin/public/` directory does not exist yet — must be created before Route Handlers write to it (or use `mkdirSync({ recursive: true })` at write time).
- `sharp` **must** be added to `serverExternalPackages` in `next.config.ts` — it has a `.node` binary in `@img/sharp-linux-x64` that webpack cannot process.
- `adm-zip` is pure JS — no `serverExternalPackages` entry needed.
- The `SiteCustomization` type is in `packages/shared` and consumed by both admin and generator. Adding `faviconDir` is additive and non-breaking. The `faviconUrl` field can remain for now (unused after S01, consumed by S02 which will read `faviconDir`).
- The `updateSite` action currently reads `faviconUrl` from `FormData`. After S01, the form will submit `faviconDir` instead. Update `rawCustomization` in the action accordingly.
- Route Handlers must validate file type (reject non-PNG for logo, non-ZIP for favicon) and enforce a size limit (e.g. 5MB logo, 2MB favicon ZIP) to prevent abuse.
- adm-zip `getEntries()` returns entries with `entryName` — reject any entry whose `entryName` contains `/` or `..` to prevent path traversal (per D096, favicon.io ZIPs are always flat, but defensive check is cheap).

## Common Pitfalls

- **sharp version mismatch** — `apps/admin` adding `^0.33.5` matches what `packages/agents` uses. Do not use `^0.34.x` — the prebuilt binary at `.pnpm/sharp@0.33.5` is already present; `^0.34.x` would install a second version and require `pnpm install` with network access.
- **`public/` not created** — `fs.writeFileSync` to a non-existent directory throws `ENOENT`. Use `fs.mkdirSync(dir, { recursive: true })` before writing.
- **File object in FormData from Route Handler** — `request.formData()` in Next.js 15 Route Handlers returns `File` objects. Call `file.arrayBuffer()` then `Buffer.from(...)` to get a Node.js `Buffer` for sharp.
- **`faviconDir` vs `faviconUrl`** — the DB stores `faviconDir` (new field) not `faviconUrl` for the favicon directory path. The `updateSite` action and `SiteCustomizationSchema` must use `faviconDir`. Don't mix them up.
