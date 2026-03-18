---
id: T03
parent: S01
milestone: M014
provides:
  - Logo file upload widget in site edit form Customization card
  - Favicon ZIP upload widget in site edit form Customization card
  - Hidden inputs carrying upload paths to updateSite server action
  - Upload state feedback (uploading/success/error) rendered inline
  - Pre-population of existing customization.logoUrl / customization.faviconDir on load
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
key_decisions:
  - Disabled file input during upload (disabled attribute) to prevent double-submit
  - Path pre-populated from existing site.customization values so re-editing shows current state
  - Try/catch on fetch to handle network errors separate from HTTP error responses
patterns_established:
  - Upload state pattern: { uploading, path, error } useState initialized from existing customization value
  - Hidden input carries upload path to server action: <input type="hidden" name="X" value={state.path ?? ''} />
observability_surfaces:
  - Browser DevTools Network tab — upload-logo and upload-favicon POST requests visible
  - Inline UI feedback: "Uploading…" spinner text, "✓ /uploads/sites/<id>/..." success, red error text
  - hidden inputs accessible in DOM: document.querySelector('input[name="logoUrl"]').value
duration: ~20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T03: Replace edit form upload widgets

**Replaced plain Logo URL and Favicon URL text inputs with file upload widgets in the Customization card — PNG/JPEG logo upload and ZIP favicon upload with inline feedback, hidden inputs passing paths to updateSite on submit.**

## What Happened

Three edits to `edit-form.tsx`:

1. Added two upload state variables near the top, initialized from existing `site.customization.logoUrl` and `site.customization.faviconDir` values so re-editing a site shows the current upload state.

2. Added `handleLogoUpload` and `handleFaviconUpload` async functions (inside the component, before return) that call the T02 Route Handlers, update state on success/error, and wrap with try/catch for network failures.

3. Replaced the Logo URL and Favicon URL `<Input>` fields in the 3-column Customization grid with file input widgets: `<input type="file">` with appropriate `accept` attributes, inline status text for uploading/success/error, and hidden inputs (`name="logoUrl"` / `name="faviconDir"`) carrying the uploaded paths to `updateSite` at submit time.

One dev environment complication: the running server at port 3004 was an old instance (started before T02). Needed to kill it forcibly by PID and restart the fresh dev server. First browser navigation hit stale chunks (ERR_ABORTED), second navigation worked cleanly.

## Verification

- `pnpm --filter @monster/admin build` — exit 0, `/sites/[id]/edit` route size increased from 5.75kB to 6.15kB (upload state + handlers)
- Browser: edit page loaded, Customization card shows "Logo (PNG or JPEG)" and "Favicon (favicon.io ZIP)" file inputs with "Choose File" buttons
- DOM check: `document.querySelector('input[type="hidden"][name="logoUrl"]')` → present, value ""
- DOM check: `document.querySelector('input[type="hidden"][name="faviconDir"]')` → present, value ""
- `browser_find` confirms "Logo (PNG or JPEG)" and "Favicon (favicon.io ZIP)" labels in DOM
- `input[type="file"][accept="image/png,image/jpeg"]` visible in DOM
- `input[type="file"][accept=".zip,application/zip"]` visible in DOM

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `pnpm --filter @monster/admin build` | 0 | ✅ pass | 44.5s |
| 2 | browser: file input `[accept="image/png,image/jpeg"]` visible | - | ✅ pass | - |
| 3 | browser: file input `[accept=".zip,application/zip"]` visible | - | ✅ pass | - |
| 4 | browser: text "Logo (PNG or JPEG)" present | - | ✅ pass | - |
| 5 | browser: text "Favicon (favicon.io ZIP)" present | - | ✅ pass | - |
| 6 | DOM: `input[name="logoUrl"]` hidden in DOM, value="" | - | ✅ pass | - |
| 7 | DOM: `input[name="faviconDir"]` hidden in DOM, value="" | - | ✅ pass | - |
| 8 | screenshot: Customization card shows Choose File buttons | - | ✅ pass | - |

## Diagnostics

- Browser DevTools → Network tab: filter by "upload" to see POST requests to `/api/sites/<id>/upload-logo` and `/api/sites/<id>/upload-favicon`
- After upload: check `document.querySelector('input[name="logoUrl"]').value` in DevTools console — should be `/uploads/sites/<id>/logo.webp`
- `ls apps/admin/public/uploads/sites/<id>/` — confirms files were written by Route Handlers
- Inline error text appears in red below the file input when upload fails

## Deviations

None.

## Known Issues

None. The 15 network failures in the browser assert were stale ERR_ABORTED chunks from a broken first page load (dev server restart artifact) — not from the current working page.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — replaced Logo URL and Favicon URL text inputs with file upload widgets; added upload state and handler functions
