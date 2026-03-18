# S03: Edit Form & Deploy Tab Reorganization

**Goal:** Move Generate Site and Deploy buttons out of the page header and into the Deploy tab. Add a refresh interval field (in days) to the edit form that persists to `refresh_interval_hours` in the DB and surfaces the current value in the Deploy tab.
**Demo:** Navigate to `/sites/[id]` — header shows only Preview and Edit buttons. Deploy tab shows Generate Site button, Deploy button, and a "Refresh interval: N days" row. Navigate to `/sites/[id]/edit`, change refresh interval to 3 days, save, return to detail — Deploy tab shows "3 days". `pnpm --filter @monster/admin typecheck` exits 0.

## Must-Haves

- Header contains no `<GenerateSiteButton>` and no Deploy form/button
- Deploy tab slot contains `<GenerateSiteButton>` and the Deploy form/button (conditional on `site.domain`)
- Deploy tab slot shows current refresh interval in days
- Edit form has a `refresh_interval_days` number input (min 1, default from DB `refresh_interval_hours / 24`)
- `updateSite` action reads `refresh_interval_days`, validates it (positive integer), converts to hours, writes to DB
- `edit/page.tsx` forwards `refresh_interval_hours` to `siteForForm` so the form displays the current DB value
- TypeScript typecheck passes

## Observability / Diagnostics

**Runtime signals:**
- Deploy tab renders the current pipeline status badge (`deployCard.siteStatus`) and last deployment record (status, deployed_at, duration_ms, error string). Failure state is visible in the tab UI as a red error string in `deployCard.latestDeployment.error`.
- If `enqueueSiteDeploy` fails (e.g. queue unavailable), the server action throws — Next.js surfaces this as an error boundary in the browser and logs the stack to server stdout.
- `<GenerateSiteButton>` is a Client Component; its loading/error state is managed internally and visible via the button's UI state.

**Inspection:**
- To inspect deploy queue state: check BullMQ dashboard or `SELECT * FROM deployments ORDER BY created_at DESC LIMIT 10;` in Supabase.
- To inspect refresh interval: `SELECT id, name, refresh_interval_hours FROM sites WHERE id = '<id>';`

**Redaction:** No secrets flow through this UI layer. `site.id` and `deployCard` contain only structural data.

**Failure visibility:** A failed `enqueueSiteDeploy` call writes a row to `deployments` with `status = 'failed'` and `error` populated — visible in the Deploy tab deployment history block.

## Verification

- `pnpm --filter @monster/admin typecheck` exits 0
- Grep confirms buttons absent from header: `grep -c "GenerateSiteButton\|enqueueSiteDeploy" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` → header `<div className="flex items-center gap-2">` block contains neither
- Grep confirms buttons present in `deploySlot`: `rg "GenerateSiteButton" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` returns a match inside the `deploySlot` block
- Grep confirms `refresh_interval_days` in form and action: `rg "refresh_interval" apps/admin/src/app/\(dashboard\)/sites/\[id\]/edit/edit-form.tsx apps/admin/src/app/\(dashboard\)/sites/actions.ts`
- Grep confirms `refresh_interval_hours` forwarded in `edit/page.tsx`: `rg "refresh_interval_hours" apps/admin/src/app/\(dashboard\)/sites/\[id\]/edit/page.tsx`
- Diagnostic check: `rg "latestDeployment.error" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` returns a match confirming failure-path error display is present in the deploy slot

## Tasks

- [x] **T01: Move Generate/Deploy buttons from header to Deploy tab slot** `est:45m`
  - Why: Closes the header cleanup and Deploy tab button wiring — the primary UX change of this slice.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
  - Do: Remove `<GenerateSiteButton siteId={site.id} />` and the Deploy `<form>` block (both the enabled and disabled variants) from the header `<div className="flex items-center gap-2">`. Keep Preview and Edit buttons. Add both `<GenerateSiteButton siteId={site.id} />` and the Deploy `<form>`/disabled-button block (same conditional on `site.domain`) into the `deploySlot` JSX — append them above the `<DeployStatus>` component, inside the existing `<div className="space-y-3">`. Preserve the full conditional logic: if `site.domain` → enabled form with server action; else → disabled button with `title="Set a domain first"`.
  - Verify: `pnpm --filter @monster/admin typecheck` exits 0. `rg "GenerateSiteButton" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` shows only one match inside the `deploySlot` block (not in the header). `grep "enqueueSiteDeploy" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx` shows the inline server action present in `deploySlot` only.
  - Done when: Typecheck passes; header JSX contains no Generate or Deploy buttons; `deploySlot` contains both.

- [x] **T02: Add refresh interval field to edit form and wire through to DB and Deploy tab display** `est:1h`
  - Why: Closes the refresh interval data flow — form input → server action → DB → Deploy tab display.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx`, `apps/admin/src/app/(dashboard)/sites/actions.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
  - Do:
    1. **`edit-form.tsx`** — Add `refresh_interval_hours: number` to `EditFormProps.site`. Add a number input with `name="refresh_interval_days"`, `type="number"`, `min={1}`, `defaultValue={Math.round(site.refresh_interval_hours / 24)}` inside the Basic Info card (after the Template field, or as a new row). Label: "Refresh Interval (days)". Include helper text "How often product data is refreshed (minimum 1 day)".
    2. **`edit/page.tsx`** — Add `refresh_interval_hours: site.refresh_interval_hours` to the `siteForForm` object.
    3. **`actions.ts`** — In `updateSite`: read `refresh_interval_days` from `formData` (`parseInt(formData.get('refresh_interval_days') as string, 10)`), guard with `Math.max(1, isNaN(days) ? 2 : days)`, compute `refresh_interval_hours = days * 24`, add `refresh_interval_hours` to the `.update({})` call. Add `refresh_interval_hours?: string[]` to `UpdateSiteErrors` type (for future validation messages, even if not currently triggered).
    4. **`page.tsx` deploySlot** — Add a row showing the current interval: `Math.round(site.refresh_interval_hours / 24)` days. Display as plain text in the existing `<div className="space-y-3">`, e.g. `<div className="text-sm ..."><span className="font-medium text-muted-foreground">Refresh interval:</span> {Math.round(site.refresh_interval_hours / 24)} days</div>`. Place it after the pipeline status badge row.
  - Verify: `pnpm --filter @monster/admin typecheck` exits 0. `rg "refresh_interval" apps/admin/src/app/\(dashboard\)/sites/\[id\]/edit/edit-form.tsx` returns matches for the input. `rg "refresh_interval_hours" apps/admin/src/app/\(dashboard\)/sites/\[id\]/edit/page.tsx` returns a match in `siteForForm`. `rg "refresh_interval_hours" apps/admin/src/app/\(dashboard\)/sites/actions.ts` returns matches for the DB update call.
  - Done when: Typecheck passes; all four files contain the expected `refresh_interval` references; the data flows form → action → DB → display are complete.

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/actions.ts`
