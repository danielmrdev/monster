---
id: T01
parent: S03
milestone: M012
provides:
  - meta_description field in CategoryForm wired to tsa_categories.description (D057)
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/actions.ts
key_decisions:
  - meta_description takes precedence over legacy description field in updateCategory (meta_description ?? description)
patterns_established:
  - D057 column alias pattern: form field `meta_description` maps to DB column `tsa_categories.description`; both defaultValues fields set from same column in edit page
observability_surfaces:
  - updateCategory errors surfaced as errors._form[0] in form red banner
  - TypeScript type check: npx tsc --noEmit from apps/admin/
  - DB inspection: SELECT id, description FROM tsa_categories WHERE id='<catId>'
duration: 10m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Add meta_description field to CategoryForm

**Added `meta_description` textarea to CategoryForm that saves to `tsa_categories.description` (D057); edit page pre-populates from existing description column.**

## What Happened

The existing CategoryForm already had a generic `description` textarea. Per D057, `tsa_categories.description` IS the meta description field — so the task added a dedicated `meta_description` field to surface this semantically in the UI.

Three files updated:
1. **CategoryForm.tsx** — added `meta_description?: string | null` to `defaultValues` interface; added `<Textarea name="meta_description" rows={2}>` field labeled "Meta Description" after focus_keyword, with a `<FieldError>` and helper text about 150–160 character target; also added `meta_description?: string[]` to `CategoryFormState.errors` type in actions.ts.
2. **[catId]/edit/page.tsx** — added `meta_description: cat.description ?? null` to the `defaultValues` object passed to CategoryForm (the existing `select('*')` already fetches description).
3. **actions.ts** — `updateCategory` now reads `formData.get('meta_description')` and saves `description: meta_description ?? description` to Supabase, so the dedicated meta_description field takes precedence over the legacy description field.

Pre-flight observability gaps in S03-PLAN.md and T01-PLAN.md were also fixed before implementation.

## Verification

- `grep 'meta_description' CategoryForm.tsx` → 6 hits (interface, label, id, name, defaultValue, FieldError) ✓
- `npx tsc --noEmit` from apps/admin → exits 0, no errors ✓
- `pnpm --filter @monster/admin build` → exits 0 ✓ (slice-level check, partial pass for T01)

## Diagnostics

- Inspect saved value: `SELECT id, description FROM tsa_categories WHERE id='<catId>'`
- TypeScript errors: `cd apps/admin && npx tsc --noEmit`
- Form errors: rendered as red banner below fields if updateCategory returns `errors._form`

## Deviations

- `typecheck` script doesn't exist in admin's package.json; used `npx tsc --noEmit` instead. Result is equivalent.
- CategoryFormState.errors type was in actions.ts (not CategoryForm.tsx) — added `meta_description?: string[]` there.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx` — added `meta_description` to interface + rendered textarea with label/error/hint
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/edit/page.tsx` — passes `meta_description: cat.description ?? null` in defaultValues
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/actions.ts` — updateCategory reads meta_description, saves to description column; CategoryFormState.errors extended
- `.gsd/milestones/M012/slices/S03/S03-PLAN.md` — added Observability/Diagnostics section + failure-path verification (pre-flight fix)
- `.gsd/milestones/M012/slices/S03/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
