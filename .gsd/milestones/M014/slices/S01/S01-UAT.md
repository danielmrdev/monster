# S01: Logo & Favicon Upload — UAT

**Milestone:** M014
**Written:** 2026-03-18

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Upload routes require a running Next.js dev server and real file writes. curl-based testing covers all paths without needing a human at the browser. Browser DOM checks confirm the UI widgets are wired correctly.

## Preconditions

1. Dev server running: `pnpm --filter @monster/admin dev` (port 3004)
2. At least one site exists in the DB — obtain a real UUID from Supabase or the admin panel
3. Test assets prepared:
   - `/tmp/test_logo.png` — any PNG file (create with `convert -size 200x100 xc:white /tmp/test_logo.png` or use any image)
   - `/tmp/test_favicon.zip` — any ZIP with at least `favicon.ico` inside (download from favicon.io or create: `cd /tmp && zip test_favicon.zip favicon.ico`)
   - `/tmp/test.gif` — any GIF file for rejection tests
   - `/tmp/test_traversal.zip` — ZIP with a path-traversal entry (create: `zip test_traversal.zip ../etc/passwd 2>/dev/null || true`)
4. `SITE_ID=<your-real-site-uuid>` — set this env var for all curl commands below

## Smoke Test

```bash
curl -s -w "\nHTTP %{http_code}" \
  -F "file=@/tmp/test_logo.png" \
  http://localhost:3004/api/sites/$SITE_ID/upload-logo
```

**Expected:** `{"logoUrl":"/uploads/sites/<SITE_ID>/logo.webp"}` followed by `HTTP 200`

If this passes, the upload infrastructure is working end-to-end.

## Test Cases

### 1. Logo upload — PNG → WebP conversion

```bash
curl -s -F "file=@/tmp/test_logo.png" \
  http://localhost:3004/api/sites/$SITE_ID/upload-logo
```

1. **Expected response:** `{"logoUrl":"/uploads/sites/<SITE_ID>/logo.webp"}` with HTTP 200
2. Verify file on disk:
   ```bash
   ls -la apps/admin/public/uploads/sites/$SITE_ID/logo.webp
   xxd apps/admin/public/uploads/sites/$SITE_ID/logo.webp | head -1
   ```
3. **Expected:** file exists; `xxd` first line contains `52 49 46 46` (RIFF) and `57 45 42 50` (WEBP) magic bytes

### 2. Favicon upload — ZIP extraction

```bash
curl -s -F "file=@/tmp/test_favicon.zip" \
  http://localhost:3004/api/sites/$SITE_ID/upload-favicon
```

1. **Expected response:** `{"faviconDir":"/uploads/sites/<SITE_ID>/favicon"}` with HTTP 200
2. Verify extracted files:
   ```bash
   ls apps/admin/public/uploads/sites/$SITE_ID/favicon/
   ```
3. **Expected:** directory contains at least one file (e.g. `favicon.ico`, `favicon-32x32.png`, etc.)

### 3. Logo upload rejection — wrong MIME type (GIF)

```bash
curl -s -w "\nHTTP %{http_code}" \
  -F "file=@/tmp/test.gif" \
  http://localhost:3004/api/sites/$SITE_ID/upload-logo
```

1. **Expected:** HTTP 415
2. **Expected body:** `{"error":"Invalid file type. PNG or JPEG required."}`

### 4. Favicon upload rejection — wrong type (PNG sent to favicon route)

```bash
curl -s -w "\nHTTP %{http_code}" \
  -F "file=@/tmp/test_logo.png" \
  http://localhost:3004/api/sites/$SITE_ID/upload-favicon
```

1. **Expected:** HTTP 415
2. **Expected body:** `{"error":"Invalid file type. ZIP archive required."}`

### 5. Missing file — 400 error

```bash
curl -s -w "\nHTTP %{http_code}" \
  -X POST http://localhost:3004/api/sites/$SITE_ID/upload-logo
```

1. **Expected:** HTTP 400
2. **Expected body:** JSON with non-null `error` field (either "Invalid multipart request" or "No file provided")

### 6. Edit form — upload widgets present in browser

1. Navigate to `http://localhost:3004/sites/$SITE_ID/edit` in a browser
2. Scroll to the Customization card
3. **Expected:** Two file input widgets visible:
   - Label "Logo (PNG or JPEG)" with a "Choose File" button (accept: image/png, image/jpeg)
   - Label "Favicon (favicon.io ZIP)" with a "Choose File" button (accept: .zip, application/zip)
4. Verify hidden inputs in browser DevTools console:
   ```js
   document.querySelector('input[name="logoUrl"]').value
   document.querySelector('input[name="faviconDir"]').value
   ```
5. **Expected:** Both return `""` (empty string on a site with no uploads yet)

### 7. Upload via browser UI — success feedback

1. Navigate to `http://localhost:3004/sites/$SITE_ID/edit`
2. Click "Choose File" for Logo, select a PNG file
3. **Expected (while uploading):** "Uploading…" text appears below the input; input is disabled
4. **Expected (after upload):** "✓ /uploads/sites/<SITE_ID>/logo.webp" appears in green below the input
5. Check hidden input: `document.querySelector('input[name="logoUrl"]').value`
6. **Expected:** `/uploads/sites/<SITE_ID>/logo.webp`

### 8. Path stored in customization on save

1. After a successful logo upload (test case 7), click Save in the edit form
2. Navigate back to the site detail page or re-open the edit page
3. **Expected on re-edit:** Logo field shows "✓ /uploads/sites/<SITE_ID>/logo.webp" pre-populated (initialized from `site.customization.logoUrl`)
4. Verify in Supabase (or via curl to REST API):
   ```bash
   curl -s "https://<project>.supabase.co/rest/v1/sites?id=eq.$SITE_ID&select=customization" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
   ```
5. **Expected:** `customization.logoUrl` = `"/uploads/sites/<SITE_ID>/logo.webp"`

## Edge Cases

### GIF file sent to logo endpoint

```bash
curl -s -F "file=@/tmp/test.gif" \
  http://localhost:3004/api/sites/$SITE_ID/upload-logo | jq .error
```

1. **Expected:** non-null string (not null, not empty)
2. HTTP status 415

### Path traversal ZIP entry

Create a ZIP with a traversal entry and a safe entry:
```bash
echo "test" > /tmp/safe_file.ico
echo "bad" > /tmp/test_bad_file.txt  
cd /tmp && zip traversal_test.zip safe_file.ico
# Manually craft a bad entry is complex; test the existing path traversal ZIP if available
```

1. Upload the ZIP: `curl -F "file=@/tmp/traversal_test.zip" .../upload-favicon`
2. **Expected:** HTTP 200 if at least one safe flat entry exists; `../etc/passwd` or any entry with `/` in the name should be silently skipped (check server console for `[upload-favicon] siteId=<id> skipping unsafe entry:` warning)

### Upload with existing file (overwrite)

1. Upload a logo PNG (creates `logo.webp` on disk)
2. Upload a different PNG to the same site
3. **Expected:** HTTP 200; file on disk is overwritten with the new WebP; no error about existing file

## Failure Signals

- HTTP 500 with `{ "error": "Upload failed", "detail": "..." }` — sharp or adm-zip threw; check `detail` field and dev server console for `[upload-logo]` / `[upload-favicon]` error log
- HTTP 500 with HTML body — uncaught error in Route Handler; check Next.js dev server console
- `logo.webp` on disk with wrong magic bytes — sharp conversion failed silently; verify `sharp` is in `serverExternalPackages` in `next.config.ts`
- Upload widget not visible in edit form — component did not rebuild; check `pnpm --filter @monster/admin build` passes clean
- Hidden input `name="logoUrl"` missing from DOM — edit form component error; check browser console for React errors
- After save, `customization.logoUrl` not in DB — `faviconDir` / `logoUrl` not being read from FormData in `updateSite`; check `actions.ts` grep for `faviconDir`

## Requirements Proved By This UAT

- R001 (partially) — logo and favicon now uploadable via admin panel; asset pipeline for site generation is now populated. Full validation requires S02 (generator consuming these paths).

## Not Proven By This UAT

- Generator uses uploaded logo/favicon: that's S02's proof obligation
- `<link rel="manifest">` in BaseLayout `<head>`: S02
- Size limit enforcement at exactly 5MB/2MB boundary: not tested (large file tests omitted for brevity; the size check is a trivial `file.size > MAX_SIZE` guard)

## Notes for Tester

- The dev server must be restarted after `pnpm --filter @monster/admin build` — new Route Handler files are not hot-reloaded
- Port 3004 is the admin dev server default; check `apps/admin/package.json` if it differs
- `public/uploads/` is created at first write; the directory may not exist before the first upload
- `faviconUrl` (old plain-text field) still exists in `SiteCustomizationSchema` but is no longer written by any current flow. If you see `customization.faviconUrl` on an old site, that's expected legacy data — it will not be used by the generator after S02
