---
estimated_steps: 7
estimated_files: 4
---

# T02: Add Refresh Interval Field — Form, Action, DB, Deploy Tab Display

**Slice:** S03 — Edit Form & Deploy Tab Reorganization
**Milestone:** M014

## Description

`refresh_interval_hours` already exists in the DB (`int4 NOT NULL DEFAULT 48`), but it is not exposed in the edit form or displayed anywhere in the admin UI. This task wires the full data flow: edit form number input (in days) → server action conversion + DB write → Deploy tab display (in days).

Four files change. The conversion is always `hours = days * 24` in both directions. The DB column is hours; the UI speaks days. Guard against invalid input: `Math.max(1, isNaN(days) ? 2 : days)`.

## Steps

1. **`edit-form.tsx` — Add `refresh_interval_hours` to `EditFormProps.site` interface** — append `refresh_interval_hours: number` to the `site` property interface inside `EditFormProps`.

2. **`edit-form.tsx` — Add the number input** — Inside the Basic Info `<Card>`, add a new grid row (or extend the existing `sm:grid-cols-2` block) containing a single field:
   - `<Label htmlFor="refresh_interval_days">Refresh Interval (days)</Label>`
   - `<Input id="refresh_interval_days" name="refresh_interval_days" type="number" min={1} defaultValue={Math.round(site.refresh_interval_hours / 24)} />`
   - `<p className="text-xs text-muted-foreground">How often product data is refreshed (minimum 1 day)</p>`
   - Place it after the existing Affiliate Tag / Template row, as its own full-width row (1-column grid or `sm:grid-cols-1`).

3. **`edit/page.tsx` — Forward `refresh_interval_hours` in `siteForForm`** — Add `refresh_interval_hours: site.refresh_interval_hours` to the `siteForForm` object literal.

4. **`actions.ts` — Read and write `refresh_interval_hours` in `updateSite`** — After parsing `isActive`, add:
   ```ts
   const rawDays = parseInt(formData.get('refresh_interval_days') as string, 10)
   const refreshIntervalHours = Math.max(1, isNaN(rawDays) ? 2 : rawDays) * 24
   ```
   Then add `refresh_interval_hours: refreshIntervalHours` to the `.update({})` payload object.
   Also add `refresh_interval_hours?: string[]` to `UpdateSiteErrors` type.

5. **`page.tsx` deploySlot — Add refresh interval display row** — In the `deploySlot` JSX, after the pipeline status badge row (`<div className="flex items-center gap-2">` with the `statusBadge`), add:
   ```tsx
   <div className="flex items-center gap-2">
     <span className="text-xs font-medium text-muted-foreground">Refresh interval:</span>
     <span className="text-sm">{Math.round(site.refresh_interval_hours / 24)} days</span>
   </div>
   ```

6. **Typecheck** — Run `pnpm --filter @monster/admin typecheck` and fix any type errors.

7. **Verify grep checks** — Confirm all four files have the expected `refresh_interval` references.

## Must-Haves

- [ ] `EditFormProps.site` includes `refresh_interval_hours: number`
- [ ] Edit form has `<input name="refresh_interval_days" type="number" min={1}>` with `defaultValue` derived from `site.refresh_interval_hours / 24`
- [ ] `siteForForm` in `edit/page.tsx` includes `refresh_interval_hours: site.refresh_interval_hours`
- [ ] `updateSite` in `actions.ts` reads `refresh_interval_days`, guards with `Math.max(1, ...)`, multiplies by 24, writes `refresh_interval_hours` to DB
- [ ] `deploySlot` in `page.tsx` shows `refresh_interval_hours / 24` in a readable row
- [ ] TypeScript typecheck exits 0

## Verification

```bash
pnpm --filter @monster/admin typecheck

# Form has the field
rg "refresh_interval" apps/admin/src/app/\(dashboard\)/sites/\[id\]/edit/edit-form.tsx

# edit/page.tsx forwards the value
rg "refresh_interval_hours" "apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx"

# Action reads and writes it
rg "refresh_interval" apps/admin/src/app/\(dashboard\)/sites/actions.ts

# Deploy tab displays it
rg "refresh_interval" "apps/admin/src/app/(dashboard)/sites/[id]/page.tsx"
```

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — existing form; `EditFormProps.site` does not include `refresh_interval_hours`; logo/favicon upload pattern shows the controlled-input shape to follow
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — `siteForForm` object to extend; `site.refresh_interval_hours` is available from the `select('*')` query
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — `updateSite` with existing `formData` extraction pattern and `.update({})` payload
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — `deploySlot` JSX block; `site.refresh_interval_hours` is available from the top-level `select('*')` query already in scope

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — `EditFormProps.site` has `refresh_interval_hours: number`; form has number input for days
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — `siteForForm` includes `refresh_interval_hours`
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — `updateSite` reads `refresh_interval_days`, validates, writes `refresh_interval_hours` to DB
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — `deploySlot` shows "Refresh interval: N days"

## Observability Impact

**What changes at runtime:** `updateSite` now writes `refresh_interval_hours` to the DB on every save. If the write fails (Supabase error), the action throws with a structured error message: `Failed to update site ${id}: ${error.message} (code: ${error.code})` — visible in server stdout and surfaced as a Next.js error boundary in the browser.

**Failure state visibility:**
- A malformed or missing `refresh_interval_days` field is silently clamped to 48 hours (2 days default guard). No error is returned to the user — this is intentional silent correction.
- If `refresh_interval_hours` is missing from the DB row (pre-migration state), `site.refresh_interval_hours ?? 48` in `edit/page.tsx` prevents a crash and defaults to 2 days in the form.
- The Deploy tab displays the live DB value (`Math.round(site.refresh_interval_hours / 24)`) — if the value is wrong, it's visible there immediately after save + page refresh.

**Inspection:** To check the current value in the DB:
```sql
SELECT id, name, refresh_interval_hours FROM sites WHERE id = '<id>';
```
Or via Supabase REST: `GET /rest/v1/sites?select=id,name,refresh_interval_hours&id=eq.<id>`

**Agent-readable signal:** After a successful save, the Deploy tab should display the new days value. If it shows `2` when a non-default was submitted, check the `refresh_interval_hours` column — the `Math.max(1, isNaN(rawDays) ? 2 : rawDays)` guard silently coerced an invalid input.
