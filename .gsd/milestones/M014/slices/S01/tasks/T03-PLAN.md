---
estimated_steps: 6
estimated_files: 1
---

# T03: Replace edit form upload widgets

**Slice:** S01 — Logo & Favicon Upload
**Milestone:** M014

## Description

Replaces the two plain `<Input>` fields for `logoUrl` and `faviconUrl` in the site edit form with real file upload widgets. Each widget has a `<input type="file">` that triggers a `fetch()` call to the upload Route Handler on change, stores the returned path in React state, shows a confirmation (filename/path), and passes the path via a hidden `<input>` so the existing `updateSite` server action receives it at submit time. No changes to the server action interface — it already reads `logoUrl` and `faviconDir` from FormData after T01.

The component is already `'use client'` with `useState` in use — this is a natural fit.

## Steps

1. Read `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` fully before editing — identify where `logoUrl` and `faviconUrl` inputs are (research says ~lines 274–300 in the Customization card).

2. Add state variables near the top of the component (after existing `useState` declarations):
   ```tsx
   const [logoUploadState, setLogoUploadState] = useState<{
     uploading: boolean; path: string | null; error: string | null
   }>({ uploading: false, path: null, error: null })
   
   const [faviconUploadState, setFaviconUploadState] = useState<{
     uploading: boolean; path: string | null; error: string | null
   }>({ uploading: false, path: null, error: null })
   ```
   Initialize `path` from existing `site.customization.logoUrl` and `site.customization.faviconDir` (if any) so current values are shown on load.

3. Add upload handler functions (inside the component):
   ```tsx
   async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
     const file = e.target.files?.[0]
     if (!file) return
     setLogoUploadState({ uploading: true, path: null, error: null })
     const fd = new FormData()
     fd.append('file', file)
     const res = await fetch(`/api/sites/${siteId}/upload-logo`, { method: 'POST', body: fd })
     const json = await res.json()
     if (!res.ok) {
       setLogoUploadState({ uploading: false, path: null, error: json.error ?? 'Upload failed' })
     } else {
       setLogoUploadState({ uploading: false, path: json.logoUrl, error: null })
     }
   }
   
   async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
     // same pattern with /api/sites/${siteId}/upload-favicon and json.faviconDir
   }
   ```
   The `siteId` is available as a prop in the component.

4. Replace the logo `<Input>` in the Customization card with:
   ```tsx
   <div className="space-y-2">
     <Label>Logo</Label>
     <input type="file" accept="image/png,image/jpeg" onChange={handleLogoUpload}
       className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90" />
     {logoUploadState.uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
     {logoUploadState.path && <p className="text-sm text-green-600">✓ {logoUploadState.path}</p>}
     {logoUploadState.error && <p className="text-sm text-destructive">{logoUploadState.error}</p>}
     <input type="hidden" name="logoUrl" value={logoUploadState.path ?? ''} />
   </div>
   ```

5. Replace the favicon `<Input>` with:
   ```tsx
   <div className="space-y-2">
     <Label>Favicon (favicon.io ZIP)</Label>
     <input type="file" accept=".zip,application/zip" onChange={handleFaviconUpload}
       className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90" />
     {faviconUploadState.uploading && <p className="text-sm text-muted-foreground">Uploading…</p>}
     {faviconUploadState.path && <p className="text-sm text-green-600">✓ {faviconUploadState.path}</p>}
     {faviconUploadState.error && <p className="text-sm text-destructive">{faviconUploadState.error}</p>}
     <input type="hidden" name="faviconDir" value={faviconUploadState.path ?? ''} />
   </div>
   ```
   Note: the hidden input name is `faviconDir`, not `faviconUrl`. This matches what `updateSite` now reads after T01.

6. Remove the old `<Input name="faviconUrl" ...>` field entirely. The `faviconUrl` field in the action can remain as-is (it reads from FormData; if the field isn't present, it's null — harmless).

## Must-Haves

- [ ] Logo file input with `accept="image/png,image/jpeg"` in the Customization card
- [ ] Favicon file input with `accept=".zip,application/zip"` in the Customization card
- [ ] Upload handlers call the correct Route Handler endpoints on file change
- [ ] Hidden `<input name="logoUrl">` carries the uploaded path
- [ ] Hidden `<input name="faviconDir">` carries the uploaded path
- [ ] Upload state (uploading/success/error) shown in UI
- [ ] Existing `customization.logoUrl` / `customization.faviconDir` values pre-populated as initial state
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `pnpm --filter @monster/admin build` → exit 0 with no TypeScript errors
- Visual: dev server running → navigate to a site edit page → Customization card has file inputs for Logo and Favicon (no longer plain text inputs)

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — current component (has plain `<Input>` for logoUrl and faviconUrl in Customization card; component is `'use client'` with existing `useState`)
- T01 output: `faviconDir` field in schema + action
- T02 output: both Route Handler endpoints operational

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — updated with file upload widgets replacing the two plain text inputs; build passes clean
