# S03: Edit Form & Deploy Tab Reorganization — UAT

**Milestone:** M014
**Written:** 2026-03-18

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: all changes are UI reorganization + form wiring. TypeScript typecheck and grep verification confirm button placement, field presence, and data flow. The deployment and edit flows themselves are exercised by existing server action logic — no new backend logic was introduced.

## Preconditions

- Admin panel running (pm2 `monster-admin` online on port 3004, or local `pnpm dev`)
- At least one site exists in Supabase with a domain set (for the enabled Deploy button path)
- At least one site exists without a domain (for the disabled Deploy button path)
- `apps/admin` TypeScript compiles clean: `cd apps/admin && npx tsc --noEmit` exits 0

## Smoke Test

Navigate to `/sites/[any-site-id]`. The page header should contain only "Preview" and "Edit" buttons — no "Generate Site" button, no "Deploy" button. The Deploy tab should be visible and contain the Generate Site button.

## Test Cases

### 1. Header contains only Preview and Edit

1. Navigate to `/sites/[id]` for any site.
2. Inspect the top-right header area.
3. **Expected:** Only two controls visible — "Preview" (or greyed-out if no build) and "Edit" link. No "Generate Site" button. No "Deploy" button or form.

### 2. Deploy tab contains Generate Site button (site with domain)

1. Navigate to `/sites/[id]` for a site that has `domain` set.
2. Click the "Deploy" tab.
3. **Expected:** "Generate Site" button is visible. A "Deploy" button (or deploy form) is visible and enabled. Both appear above the DeployStatus component.

### 3. Deploy tab deploy button disabled without domain

1. Navigate to `/sites/[id]` for a site that has no domain set.
2. Click the "Deploy" tab.
3. **Expected:** "Generate Site" button is visible. The Deploy button is present but disabled, with title "Set a domain first".

### 4. Deploy tab shows current refresh interval

1. Navigate to `/sites/[id]` for any site.
2. Click the "Deploy" tab.
3. **Expected:** A row displaying "Refresh interval: N days" is visible (where N = `site.refresh_interval_hours / 24`, minimum 1 day). For a freshly created site with default `refresh_interval_hours = 48`, this should read "Refresh interval: 2 days".

### 5. Edit form shows Refresh Interval field

1. Navigate to `/sites/[id]/edit`.
2. Scroll to the Basic Info card (or look in the form body).
3. **Expected:** A number input labelled "Refresh Interval (days)" is present with `min={1}`. Its value is `Math.round(site.refresh_interval_hours / 24)` — e.g., 2 for a default 48h site.

### 6. Refresh interval persists through edit form

1. Navigate to `/sites/[id]/edit`.
2. Change the "Refresh Interval (days)" field to `3`.
3. Save the form.
4. Navigate back to `/sites/[id]` and open the Deploy tab.
5. **Expected:** "Refresh interval: 3 days" is displayed. The DB now has `refresh_interval_hours = 72` for this site.

### 7. Failure-path error visible in Deploy tab

1. Navigate to `/sites/[id]` for a site that has a deployment history with a failed record.
2. Click the "Deploy" tab.
3. **Expected:** The error string from the latest failed deployment is displayed in red/destructive styling within the deploy slot (sourced from `deployCard.latestDeployment.error`).

## Edge Cases

### Refresh interval input: value 1 (minimum)

1. In the edit form, set Refresh Interval to `1`.
2. Save.
3. **Expected:** Deploy tab shows "Refresh interval: 1 days". DB has `refresh_interval_hours = 24`.

### Refresh interval input: fractional or invalid value

1. In the edit form, clear the Refresh Interval field and submit (or enter a non-integer).
2. **Expected:** Silent coercion — the server action will write `refresh_interval_hours = 48` (2 days default). Deploy tab shows "Refresh interval: 2 days". No user-visible error is shown (known limitation).

### Site with no deployment history

1. Navigate to Deploy tab for a brand-new site with no deployments.
2. **Expected:** DeployStatus shows empty/no-deployment state. No error string rendered (the `latestDeployment.error` conditional is falsy). Generate + Deploy buttons are still present.

## Failure Signals

- "Generate Site" or "Deploy" button visible in the page header → T01 change was not applied or was reverted
- No Generate/Deploy buttons in the Deploy tab → buttons were removed but not re-added to `deploySlot`
- "Refresh Interval (days)" input missing from edit form → T02 edit-form.tsx change not applied
- Deploy tab shows no "Refresh interval" row → T02 page.tsx change not applied
- `cd apps/admin && npx tsc --noEmit` exits non-zero → type error introduced

## Requirements Proved By This UAT

- none (UX reorganization only — no capability requirements map to this slice)

## Not Proven By This UAT

- That a real deploy job completes successfully after clicking the relocated Deploy button (end-to-end deploy is tested in M004 human UAT)
- That `refresh_interval_hours` drives an actual product refresh (that's M006 logic, unaffected by this slice)
- That the DB `refresh_interval_hours` column exists and is writable (pre-condition: column was present before this slice; `updateSite` already wrote other columns)

## Notes for Tester

- The "Refresh Interval" field accepts integers only (`type="number"` `min={1}`). Browser validation may enforce this in most cases, but the server-side coercion handles invalid values silently.
- If the Deploy tab shows "Refresh interval: 2 days" for a site you never explicitly set, that's expected — 2 days (48h) is the silent coercion default.
- The `pnpm --filter @monster/admin typecheck` command does NOT work in this project — the admin package has no `typecheck` script. Use `cd apps/admin && npx tsc --noEmit` instead (KN016).
