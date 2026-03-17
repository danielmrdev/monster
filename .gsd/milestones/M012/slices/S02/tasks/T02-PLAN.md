---
estimated_steps: 4
estimated_files: 1
---

# T02: Render five editable content textareas in ProductForm

**Slice:** S02 — ProductForm Content Fields
**Milestone:** M012

## Description

Replace the existing read-only "AI Description Preview" with five properly labeled, editable `<Textarea>` fields for all content fields. Wire `defaultValue` from props so edit mode pre-populates them.

## Steps

1. Read current `ProductForm.tsx` to locate the "AI Description Preview" section.
2. Remove the `generatedDescription` state, `descPreviewRef`, and the read-only preview textarea.
3. Add an "AI Content" section below the basic fields with five `<Textarea>` elements: `detailed_description` (~6 rows), `pros` (~4 rows, placeholder "One pro per line"), `cons` (~4 rows, placeholder "One con per line"), `user_opinions_summary` (~3 rows), `meta_description` (~2 rows, placeholder "150–160 characters"). Each has a `<Label>` and `FieldError`.
4. Wire `defaultValue` from `defaultValues?.detailed_description`, etc. (`?? ''` for null-safety).
5. Confirm `pnpm --filter @monster/admin typecheck` exits 0.

## Must-Haves

- [ ] Five `<Textarea>` elements with correct `name` attributes rendered in the form
- [ ] Read-only preview textarea removed
- [ ] `defaultValue` wired from props for all five fields
- [ ] No TypeScript errors

## Verification

- `grep -c 'name="detailed_description\|name="pros\|name="cons\|name="user_opinions_summary\|name="meta_description' apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` → ≥5
- `pnpm --filter @monster/admin typecheck` exits 0

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — current form with read-only preview (read first!)
- T01 completed — `defaultValues` interface already has the five fields

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — updated with five editable textareas, no read-only preview

## Observability Impact

**Signals introduced by this task:**
- Five `<Textarea>` elements with `name` attributes (`detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description`) become visible in the form DOM; inspect via browser DevTools → Elements.
- `FieldError` components conditionally render per-field validation messages under each textarea when `errors.<fieldName>` is populated by the server action — visible in the form UI without needing DevTools.
- `errors._form` banner unchanged — Supabase save failures still surface there.
- `ProductFormState.errors` type now explicitly includes all five content field keys; TypeScript build (`npx tsc --noEmit` in `apps/admin`) catches any future field name drift.

**How a future agent inspects this task:**
- Visual: navigate to `/sites/<id>/products/<prodId>/edit` and confirm five labeled textareas appear below basic fields inside the "AI Content" panel.
- DOM: `document.querySelectorAll('textarea[name]')` in browser console should list `detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description` (plus any others).
- Read-only preview: confirm the old `<textarea readOnly>` is absent — searching for `readOnly` in the rendered HTML should return nothing in the product form area.
- TypeScript: `npx tsc --noEmit` in `apps/admin` exits 0.

**Failure visibility:**
- If `defaultValues` are not passed by the edit page, textareas render empty even when DB has data — check `edit/page.tsx` deserialization (T01 concern).
- If `ProductFormState.errors` type is missing a field key, TypeScript build fails with TS2339 "Property does not exist" error pointing to the `errors?.fieldName` reference.
- If `Textarea` import is missing, Next.js build fails with "Cannot find module" error at build time.
