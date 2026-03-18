# S01: Logo & Favicon Upload

**Goal:** Replace plain text inputs for logo/favicon in the site edit form with real file upload widgets backed by Route Handler API endpoints. Logo uploads convert PNG→WebP via sharp; favicon uploads extract a favicon.io ZIP via adm-zip. Outputs land in `apps/admin/public/uploads/sites/[id]/` and are served statically. Resulting paths stored in `customization.logoUrl` and `customization.faviconDir`.
**Demo:** After editing a site, upload a PNG logo and a favicon.io ZIP. Both files appear on disk under `apps/admin/public/uploads/sites/[id]/`. The edit form submits successfully and `customization.logoUrl` + `customization.faviconDir` appear in the site's DB record.

## Must-Haves

- `POST /api/sites/[id]/upload-logo` converts PNG/JPEG → WebP via sharp, writes to `public/uploads/sites/[id]/logo.webp`, returns `{ logoUrl: '/uploads/sites/[id]/logo.webp' }`
- `POST /api/sites/[id]/upload-favicon` extracts ZIP entries to `public/uploads/sites/[id]/favicon/`, returns `{ faviconDir: '/uploads/sites/[id]/favicon' }`
- Both routes validate file type and enforce size limits (5MB logo, 2MB favicon)
- ZIP extraction guards against path traversal (reject entries with `/` or `..` in `entryName`)
- `SiteCustomizationSchema` has `faviconDir: z.string().optional()` (additive, non-breaking)
- `updateSite` action reads `faviconDir` from FormData (not `faviconUrl`)
- `sharp` added to `serverExternalPackages` in `next.config.ts`
- Edit form has file input widgets for logo and favicon that call the routes on change, store resulting paths in hidden fields, and show a confirmation (filename or preview)

## Proof Level

- This slice proves: integration
- Real runtime required: yes (Route Handlers need the running dev server + real file writes)
- Human/UAT required: no (curl-based verification is sufficient)

## Verification

```bash
# 1. Builds clean after schema + dep changes
pnpm --filter @monster/shared build
pnpm --filter @monster/admin build   # must exit 0; confirms serverExternalPackages + sharp wiring

# 2. Start dev server, then verify logo upload
# curl -F "file=@/tmp/test.png" http://localhost:3004/api/sites/<real-site-id>/upload-logo
# Expected: 200 { "logoUrl": "/uploads/sites/<id>/logo.webp" }
# File check: ls apps/admin/public/uploads/sites/<id>/logo.webp  → exists

# 3. Verify favicon upload
# curl -F "file=@/tmp/favicon_package.zip" http://localhost:3004/api/sites/<real-site-id>/upload-favicon
# Expected: 200 { "faviconDir": "/uploads/sites/<id>/favicon" }
# File check: ls apps/admin/public/uploads/sites/<id>/favicon/  → contains favicon.ico or similar

# 4. Type-only validation (rejection tests — no dev server needed)
# curl -F "file=@/tmp/test.png" …/upload-favicon → 415 Unsupported Media Type
# curl -F "file=@/tmp/test.gif" …/upload-logo    → 415 Unsupported Media Type
```

## Observability / Diagnostics

- Runtime signals: Route Handlers log `[upload-logo]` / `[upload-favicon]` prefix with siteId on error paths
- Inspection surfaces: `ls apps/admin/public/uploads/` for file existence; `next dev` console for Route Handler errors
- Failure visibility: HTTP status codes (400 type mismatch, 413 size exceeded, 500 sharp/adm-zip error); structured JSON error body `{ error: "..." }`
- Redaction constraints: none (no secrets or PII in upload paths)

## Integration Closure

- Upstream surfaces consumed: `packages/shared/src/types/customization.ts` (SiteCustomizationSchema), `apps/admin/src/app/(dashboard)/sites/actions.ts` (updateSite), `apps/admin/next.config.ts` (serverExternalPackages)
- New wiring introduced: two new Route Handlers (`upload-logo/route.ts`, `upload-favicon/route.ts`); `apps/admin/public/` directory created at write time; `sharp` + `adm-zip` added as deps to admin
- What remains before the milestone is truly usable end-to-end: S02 (generator reads `customization.logoUrl` + `faviconDir` to copy files into dist/ and wire BaseLayout `<head>` tags)

## Tasks

- [ ] **T01: Add deps, extend schema, update action** `est:30m`
  - Why: Every downstream task depends on `faviconDir` existing in the schema and deps being installable. Zero runtime risk — pure config/type changes.
  - Files: `apps/admin/package.json`, `packages/shared/src/types/customization.ts`, `apps/admin/src/app/(dashboard)/sites/actions.ts`, `apps/admin/next.config.ts`
  - Do: Add `"sharp": "^0.33.5"` and `"adm-zip": "^0.5.16"` to `apps/admin/package.json` dependencies; add `"@types/adm-zip": "^0.5.8"` to devDependencies. Run `pnpm install`. Add `faviconDir: z.string().optional()` to `SiteCustomizationSchema` in `customization.ts`. In `updateSite` action, add `faviconDir: formData.get('faviconDir') as string | null` to the `rawCustomization` object (alongside existing `faviconUrl` — both can coexist). Add `'sharp'` to `serverExternalPackages` array in `next.config.ts`.
  - Verify: `pnpm --filter @monster/shared build` exits 0; `pnpm --filter @monster/admin build` exits 0
  - Done when: Both builds pass clean with no type errors

- [ ] **T02: Implement upload Route Handlers** `est:1h`
  - Why: The core I/O logic. Two small, parallel Route Handlers — logo converts PNG→WebP via sharp, favicon extracts ZIP via adm-zip.
  - Files: `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` (new), `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` (new)
  - Do: See T02-PLAN.md for full implementation steps.
  - Verify: Dev server curl tests (logo + favicon) as described in slice Verification section
  - Done when: Both curl tests return 200 with correct JSON bodies and output files exist on disk

- [ ] **T03: Replace edit form upload widgets** `est:45m`
  - Why: Closes the slice — connects the Route Handlers to the UI so users can actually upload files and have them persisted via the existing `updateSite` action.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx`
  - Do: See T03-PLAN.md for full implementation steps.
  - Verify: `pnpm --filter @monster/admin build` exits 0; visual check that logo/favicon upload widgets appear in the Customization card
  - Done when: Build passes; edit form has file inputs for logo and favicon; hidden fields carry uploaded paths to `updateSite` on submit

## Files Likely Touched

- `apps/admin/package.json`
- `packages/shared/src/types/customization.ts`
- `apps/admin/src/app/(dashboard)/sites/actions.ts`
- `apps/admin/next.config.ts`
- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` (new)
- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx`
