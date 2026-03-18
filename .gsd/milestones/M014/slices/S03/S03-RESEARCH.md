# S03: Edit Form & Deploy Tab Reorganization — Research

**Date:** 2026-03-18

## Summary

S03 is a pure UI reorganization slice with no new infrastructure. Three independent changes: (1) remove `GenerateSiteButton` and the Deploy `<form>` from the page header in `page.tsx`, (2) add both buttons into the Deploy tab's `deploySlot`, and (3) wire `refresh_interval_hours` through the edit form and make it visible in the Deploy tab. The DB column already exists (`int4 NOT NULL DEFAULT 48`). No migrations needed.

The work is well-contained to four files: `page.tsx`, `SiteDetailTabs.tsx`, `edit-form.tsx`, and `sites/actions.ts`. The `edit-form.tsx` already has the logo/favicon upload pattern from S01 — the `refresh_interval_days` field follows the same controlled-input shape but uses a plain number input with a `days → hours` conversion at save time.

## Recommendation

Single task. All four changes belong together — they share the same data flow (`refresh_interval_hours` touches form, action, and deploy slot in `page.tsx`). Split into T01 (header cleanup + buttons in deploy tab) and T02 (refresh interval field) only if needed for context budget, but a single task is feasible.

Build in this order: header cleanup first (remove buttons — no new code), then wire buttons into `deploySlot` in `page.tsx`, then add the refresh interval field. No new components needed.

## Implementation Landscape

### Key Files

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Header JSX (lines ~160–230) contains `<GenerateSiteButton>` and the Deploy `<form>`. The `deploySlot` JSX (lines ~105–155) is where both buttons land. The `site` object loaded from Supabase includes `refresh_interval_hours` via `select('*')` — just needs to be forwarded to the slot.
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — `TabsProps` interface and the "Deploy" `<TabsContent>` block. `generationSlot` is already passed but only renders `JobStatus` (the generate button is not in it). Adding Generate + Deploy buttons to the Deploy tab slot is done in `page.tsx` (the `deploySlot` JSX), not in `SiteDetailTabs.tsx` itself — the component only renders whatever is in the slot.
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — `EditFormProps.site` interface and the form body. `refresh_interval_hours` is not in the interface or the form. Add it alongside existing fields. Displayed as days (integer input), converted to hours on submit: `value * 24`.
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — `updateSite` server action. Does not currently read `refresh_interval_hours` from `formData` or write it to the DB. Add `refresh_interval_hours` extraction and include it in the `.update({})` call.

### Build Order

1. **`page.tsx` header cleanup** — remove `<GenerateSiteButton siteId={site.id} />` and the Deploy `<form>` (and the disabled Deploy button variant) from the header `<div className="flex items-center gap-2">`. Keep Preview and Edit buttons — they belong in the header.
2. **`page.tsx` deploySlot** — add `<GenerateSiteButton siteId={site.id} />` and the Deploy form/button into the `deploySlot` JSX block (already server-rendered in `page.tsx`). The Deploy button's conditional on `site.domain` stays unchanged.
3. **`page.tsx` refresh_interval display** — add a row in `deploySlot` showing the current interval value in days (`Math.round(site.refresh_interval_hours / 24)`).
4. **`edit-form.tsx`** — add `refresh_interval_hours` to `EditFormProps.site`, add a number input for days with `defaultValue={Math.round(site.refresh_interval_hours / 24)}`, and a hidden field or inline conversion.
5. **`actions.ts`** — read `refresh_interval_days` from `formData`, parse to int, multiply by 24, add to `.update({})` payload. Add to `UpdateSiteErrors` type if validation needed (positive integer guard is sufficient).

### Verification Approach

- TypeScript compile: `pnpm --filter @monster/admin typecheck` must exit 0 after changes.
- Visual: start dev server, navigate to `/sites/[id]` — header must show only Preview + Edit buttons. Deploy tab must show Generate Site + Deploy buttons.
- Functional: navigate to `/sites/[id]/edit`, set refresh interval to 3 days, save, return to detail → Deploy tab shows "3 days" (or "72 hours" — pick one display format and stick to it).

## Constraints

- `refresh_interval_hours` is `int4 NOT NULL DEFAULT 48` — value must be a positive integer. Validate `> 0` in `updateSite`; parse with `parseInt(..., 10)`.
- The Deploy button form uses a Server Action inline (`action={async () => { 'use server'; ... }}`). When moved to `deploySlot`, the inline server action remains valid since `deploySlot` is still built in the RSC `page.tsx`.
- `GenerateSiteButton` is a Client Component (`'use client'`). It can be used anywhere in the tree including inside a server-rendered slot.
- `SiteDetailTabs` is `'use client'` — it cannot call server actions directly. The `deploySlot` is a `React.ReactNode` prop that is server-rendered in `page.tsx` and passed down, so the Deploy form's inline `'use server'` action works correctly.
- The edit form's `EditFormProps.site` does not currently include `refresh_interval_hours`. Must be added there AND in the `siteForForm` object constructed in `edit/page.tsx`.

## Common Pitfalls

- **Days ↔ hours rounding** — default is 48 hours = 2 days. If the user enters 0 days, the conversion would produce 0 hours, which is invalid. Guard: `Math.max(1, parseInt(days, 10)) * 24`.
- **Hidden input vs form field for interval** — use a regular number input with `name="refresh_interval_days"` in the form. The action reads it as a string and parses it. No hidden field gymnastics needed.
- **`edit/page.tsx` siteForForm** — `refresh_interval_hours` comes from `site.refresh_interval_hours` (via `select('*')`). It needs to be forwarded in the `siteForForm` object; if omitted, the form will always show the default value and never the current DB value.
