---
estimated_steps: 8
estimated_files: 2
---

# T02: Implement upload Route Handlers

**Slice:** S01 — Logo & Favicon Upload
**Milestone:** M014

## Description

Two new Next.js App Router Route Handlers that handle file uploads. The logo handler accepts PNG/JPEG, converts to WebP via sharp, writes to `apps/admin/public/uploads/sites/[id]/logo.webp`. The favicon handler accepts ZIP, extracts all flat entries to `apps/admin/public/uploads/sites/[id]/favicon/` via adm-zip. Both validate file type and size, guard against path traversal, and return structured JSON with the resulting path(s).

Both routes are small and parallel in shape — implement them in the same task.

## Steps

1. Create `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts`:
   - Export `export async function POST(req: Request, { params }: { params: Promise<{ id: string }> })` (Next.js 15 async params pattern — D120)
   - Read `const { id: siteId } = await params`
   - Read FormData: `const formData = await req.formData(); const file = formData.get('file') as File | null`
   - Validate: if no file → 400 `{ error: 'No file provided' }`
   - Validate type: accept `image/png` and `image/jpeg` only → 415 `{ error: 'Invalid file type. PNG or JPEG required.' }`
   - Validate size: max 5MB (5 * 1024 * 1024 bytes) → 413 `{ error: 'File too large. Maximum 5MB.' }`
   - Convert: `const buffer = Buffer.from(await file.arrayBuffer()); const webpBuffer = await sharp(buffer).webp({ quality: 80 }).toBuffer()`
   - Write: `const dir = path.join(process.cwd(), 'public', 'uploads', 'sites', siteId); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'logo.webp'), webpBuffer)`
   - Return: `Response.json({ logoUrl: \`/uploads/sites/${siteId}/logo.webp\` })`
   - Wrap in try/catch → 500 `{ error: 'Upload failed', detail: err.message }`
   - Log prefix: `[upload-logo]` with siteId on error

2. Create `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts`:
   - Same async params pattern for `siteId`
   - Validate file exists; validate type is `application/zip` or `application/x-zip-compressed` → 415
   - Validate size: max 2MB → 413
   - Extract: `const buffer = Buffer.from(await file.arrayBuffer()); const zip = new AdmZip(buffer); const entries = zip.getEntries()`
   - Path traversal guard: for each entry, if `entry.entryName.includes('/') || entry.entryName.includes('..')` → skip (log a warning)
   - Write output dir: `const outDir = path.join(process.cwd(), 'public', 'uploads', 'sites', siteId, 'favicon'); fs.mkdirSync(outDir, { recursive: true })`
   - Write each entry: `fs.writeFileSync(path.join(outDir, entry.entryName), entry.getData())`
   - Return: `Response.json({ faviconDir: \`/uploads/sites/${siteId}/favicon\` })`
   - Wrap in try/catch → 500

3. Imports needed in both files: `import sharp from 'sharp'` (logo only), `import AdmZip from 'adm-zip'` (favicon only), `import * as fs from 'fs'`, `import * as path from 'path'`

4. Note on `process.cwd()`: Next.js Route Handlers run from `apps/admin/` as cwd when started with `next start` or `next dev` from that directory. Since pm2 starts the admin app from `apps/admin/`, `process.cwd()` resolves correctly to `apps/admin/`. If started differently, confirm `process.cwd()` is `apps/admin` not monorepo root. The `public/` directory is relative to the Next.js app root.

5. Verify both routes compile: `pnpm --filter @monster/admin build` must exit 0.

6. Start dev server (`pnpm --filter @monster/admin dev` — it runs on port 3004 per existing config).

7. Test logo upload:
   ```bash
   # Create a minimal PNG test file
   node -e "require('fs').writeFileSync('/tmp/test.png', require('fs').readFileSync(require('path').join(process.cwd(), 'apps/admin/public/placeholder.png') || '/dev/null'))"
   # Or use any real PNG. If no PNG handy, create one via sharp:
   node -e "
   const sharp = require('/home/daniel/monster/node_modules/.pnpm/sharp@0.33.5/node_modules/sharp');
   sharp({ create: { width: 100, height: 100, channels: 4, background: '#ff0000' } }).png().toFile('/tmp/test.png', () => console.log('done'));
   "
   # Then hit the endpoint (replace <id> with a real site UUID from DB)
   SITE_ID=$(node -e "
   const { createServiceClient } = require('./packages/db/dist/index.js');
   createServiceClient().from('sites').select('id').limit(1).single().then(({data}) => console.log(data.id));
   ")
   curl -s -F "file=@/tmp/test.png" http://localhost:3004/api/sites/$SITE_ID/upload-logo | jq .
   # Expected: { "logoUrl": "/uploads/sites/<id>/logo.webp" }
   ls apps/admin/public/uploads/sites/$SITE_ID/logo.webp
   ```

8. Test favicon upload: need a ZIP file. Create a minimal one:
   ```bash
   node -e "
   const AdmZip = require('/home/daniel/monster/node_modules/.pnpm/adm-zip@0.5.16/node_modules/adm-zip');
   const zip = new AdmZip();
   zip.addFile('favicon.ico', Buffer.from('fake-ico'));
   zip.addFile('site.webmanifest', Buffer.from(JSON.stringify({ name: 'Test' })));
   zip.writeZip('/tmp/favicon_test.zip');
   console.log('done');
   "
   curl -s -F "file=@/tmp/favicon_test.zip;type=application/zip" http://localhost:3004/api/sites/$SITE_ID/upload-favicon | jq .
   # Expected: { "faviconDir": "/uploads/sites/<id>/favicon" }
   ls apps/admin/public/uploads/sites/$SITE_ID/favicon/
   ```

## Must-Haves

- [ ] `upload-logo/route.ts` exists and compiles
- [ ] `upload-favicon/route.ts` exists and compiles
- [ ] Logo route: accepts PNG/JPEG, rejects other types with 415
- [ ] Logo route: enforces 5MB limit with 413
- [ ] Logo route: writes `logo.webp` to `public/uploads/sites/[id]/`
- [ ] Logo route: returns `{ logoUrl: '/uploads/sites/[id]/logo.webp' }`
- [ ] Favicon route: accepts ZIP, rejects other types with 415
- [ ] Favicon route: enforces 2MB limit with 413
- [ ] Favicon route: extracts flat entries to `public/uploads/sites/[id]/favicon/`
- [ ] Favicon route: skips/rejects entries with `/` or `..` in `entryName`
- [ ] Favicon route: returns `{ faviconDir: '/uploads/sites/[id]/favicon' }`
- [ ] Both routes use `mkdirSync({ recursive: true })` before writing
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- Build: `pnpm --filter @monster/admin build` → exit 0
- Logo upload curl → 200 + `logoUrl` in response + `logo.webp` on disk
- Favicon upload curl → 200 + `faviconDir` in response + extracted files on disk
- Rejection test: upload a `.gif` to logo route → 415
- Rejection test: upload `.png` to favicon route → 415

## Observability Impact

- Signals added/changed: console.error with `[upload-logo] siteId=<id>` / `[upload-favicon] siteId=<id>` prefix on all error paths
- How a future agent inspects this: `next dev` console output; `ls apps/admin/public/uploads/` for file existence; HTTP response body contains `{ error: "..." }` with descriptive message
- Failure state exposed: HTTP status codes (400/413/415/500) + JSON error body; sharp/adm-zip error messages forwarded in 500 `detail` field

## Inputs

- `apps/admin/package.json` — must have `sharp@^0.33.5` and `adm-zip@^0.5.16` (T01 output)
- `apps/admin/next.config.ts` — must have `sharp` in `serverExternalPackages` (T01 output)
- No existing route files to read — both are new

## Expected Output

- `apps/admin/src/app/api/sites/[id]/upload-logo/route.ts` — new file, POST handler
- `apps/admin/src/app/api/sites/[id]/upload-favicon/route.ts` — new file, POST handler
- `apps/admin/public/uploads/sites/<test-id>/logo.webp` — created during verification
- `apps/admin/public/uploads/sites/<test-id>/favicon/` — created during verification
