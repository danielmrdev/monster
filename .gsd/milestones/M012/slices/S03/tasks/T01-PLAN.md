---
estimated_steps: 5
estimated_files: 3
---

# T01: Add meta_description field to CategoryForm

**Slice:** S03 — CategoryForm Meta + Homepage SEO
**Milestone:** M012

## Description

Add a `meta_description` textarea to CategoryForm that saves to `tsa_categories.description` (D057). Wire the edit page to pre-populate from the existing `description` column value.

## Steps

1. Read `CategoryForm.tsx` — find current fields and `defaultValues` interface.
2. Read the category edit `page.tsx` — find how `defaultValues` is assembled.
3. Read the category `actions.ts` — find `updateCategory` and its Supabase update call.
4. In `CategoryForm.tsx`: add `meta_description?: string | null` to `defaultValues` interface; add `<Textarea name="meta_description" rows={2} defaultValue={defaultValues?.meta_description ?? ''} placeholder="150–160 characters for search engine snippets">` after the existing fields, with a `<Label>` and `<FieldError>`.
5. In edit `page.tsx`: add `description` to the Supabase select, pass as `meta_description: row.description` in defaultValues.
6. In `actions.ts` `updateCategory`: read `formData.get('meta_description')` and save to `tsa_categories.description` column.

## Observability Impact

- **What changes:** `updateCategory` now reads `formData.get('meta_description')` and writes it to `tsa_categories.description`. Previously, the `description` FormData field wrote to that column; after this task, `meta_description` takes precedence.
- **Inspect this task's effect:** `SELECT id, description FROM tsa_categories WHERE id='<catId>'` — should reflect what was typed in the Meta Description textarea.
- **TypeScript type surface:** `CategoryFormProps.defaultValues.meta_description` is the new typed property. Mismatches caught by `pnpm --filter @monster/admin typecheck`.
- **Failure visibility:** If `updateCategory` returns `errors._form`, the form banner shows the raw Supabase error. If the wrong column name is used, Supabase returns a PostgREST 400 with `"column ... does not exist"` — visible in server console and the `_form` error banner.

- [ ] `CategoryForm` renders `<Textarea name="meta_description">` 
- [ ] `defaultValues.meta_description` populated from `description` column in edit page
- [ ] `updateCategory` saves FormData `meta_description` to `tsa_categories.description`
- [ ] TypeScript build exits 0

## Verification

- `grep 'meta_description' apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx` returns ≥2 hits (interface + render)
- `pnpm --filter @monster/admin typecheck` exits 0

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx` — current form
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/[catId]/edit/page.tsx` — current edit page
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/actions.ts` — current actions

## Expected Output

- `CategoryForm.tsx` — updated with meta_description field
- `[catId]/edit/page.tsx` — passes description as meta_description defaultValue
- `actions.ts` — updateCategory saves meta_description → description
