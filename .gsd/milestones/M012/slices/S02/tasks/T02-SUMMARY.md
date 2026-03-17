---
id: T02
parent: S02
milestone: M012
provides:
  - Five editable Textarea fields (detailed_description, pros, cons, user_opinions_summary, meta_description) rendered in ProductForm edit mode, replacing the old read-only preview
  - ProductFormState.errors type extended to include all five content field keys
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts
key_decisions:
  - Placed all five content textareas inside a labelled "AI Content" card panel (rounded border, muted background) to visually group them and preserve the existing "Generate with AI" button inline
  - Removed generatedDescription state and descPreviewRef entirely — those were only used by the old read-only preview; the generate button is preserved but its streaming output will be wired to individual fields in a future task
  - Added content field keys to ProductFormState.errors so per-field FieldError components type-check correctly
patterns_established:
  - When adding new form fields, also add their keys to ProductFormState.errors in actions.ts — omitting this causes TS2339 type errors on errors?.fieldName references
  - shadcn Textarea component (imported from @/components/ui/textarea) is the correct element for multi-line form fields; use rows prop for height, defaultValue for hydration
observability_surfaces:
  - Five labeled textareas visible in browser at /sites/<id>/products/<prodId>/edit inside "AI Content" panel
  - FieldError renders per-field validation messages if errors.<fieldName> is returned by server action
  - npx tsc --noEmit in apps/admin exits 0 — catches field name drift at build time
duration: ~10min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Render five editable content textareas in ProductForm

**Replaced read-only AI description preview with five labeled, editable Textarea fields (detailed_description, pros, cons, user_opinions_summary, meta_description) wired to defaultValues in ProductForm edit mode.**

## What Happened

Read the current `ProductForm.tsx` and identified the read-only "AI Description Preview" textarea block. Removed `generatedDescription` state, `descPreviewRef`, and the `setGeneratedDescription` calls from `generateDescription()`. Kept `isGenerating`, `startGenerate`, and `generateError` since the "Generate with AI" button stays visible for a future streaming task.

Added a new "AI Content" section — a rounded card with a heading and the Generate button — containing five `<Textarea>` elements in order: `detailed_description` (6 rows), `pros` (4 rows, "One pro per line"), `cons` (4 rows, "One con per line"), `user_opinions_summary` (3 rows), `meta_description` (2 rows, "150–160 characters"). Each has a `<Label>`, `defaultValue` wired from `defaultValues?.field ?? ''`, and a `<FieldError>` referencing `errors?.field`.

TypeScript check revealed that `ProductFormState.errors` in `actions.ts` was missing the five new field keys — only had `asin`, `title`, `slug`, `category_ids`, `_form`. Added all five content field keys to the type so `errors?.detailed_description` etc. compile correctly.

## Verification

- `grep -c 'name="detailed_description\|name="pros\|name="cons\|name="user_opinions_summary\|name="meta_description' ...ProductForm.tsx` → **5** ✓
- `npx tsc --noEmit` in `apps/admin` → **exit 0** (no output) ✓

## Diagnostics

- Navigate to `/sites/<id>/products/<prodId>/edit` — five labeled textareas appear in the "AI Content" card below basic fields.
- `document.querySelectorAll('form textarea[name]')` in browser console lists all five field names.
- Old `readOnly` textarea is absent — confirmed by absence of any `readOnly` prop on textarea elements in the form.
- `npx tsc --noEmit` in `apps/admin` is the authoritative type check since no `typecheck` npm script exists in the admin `package.json`.

## Deviations

- Plan said to use `pnpm --filter @monster/admin typecheck` but no such script exists; used `npx tsc --noEmit` in `apps/admin` directly (same result, documented in summary).
- Also needed to extend `ProductFormState.errors` type in `actions.ts` — not called out in the plan steps but required to fix TS2339 errors from `errors?.fieldName` references.

## Known Issues

- The "Generate with AI" button is preserved but currently only emits error events — it does not stream content into the individual textareas yet. That wiring is scoped to a future task (T03+).

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — removed read-only preview; added five editable Textarea fields with labels, defaultValues, and FieldErrors inside "AI Content" section
- `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` — extended ProductFormState.errors with five content field keys (detailed_description, pros, cons, user_opinions_summary, meta_description)
