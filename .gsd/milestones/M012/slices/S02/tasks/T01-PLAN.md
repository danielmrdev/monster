---
estimated_steps: 6
estimated_files: 4
---

# T01: Extend ProductFormProps, actions, and updateProduct for all five content fields

**Slice:** S02 — ProductForm Content Fields
**Milestone:** M012

## Description

Extend the `ProductFormProps.defaultValues` interface, the edit page that passes DB values, and the `updateProduct` server action to include all five content fields. This is the data layer — the form renders come in T02.

## Steps

1. Read `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` — understand current `updateProduct` implementation and `ProductFormState` type.
2. Read `apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx` — understand how `defaultValues` is assembled from the DB row.
3. In `ProductForm.tsx`: add `detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description` to the `defaultValues` interface (all optional strings/null).
4. In `edit/page.tsx`: extend the Supabase select to include `detailed_description`, `pros_cons`, `user_opinions_summary`, `meta_description`. Deserialize `pros_cons` JSONB: `const prosArr = (row.pros_cons as {pros?: string[]} | null)?.pros ?? []; const consArr = ...`. Pass as `pros: prosArr.join('\n'), cons: consArr.join('\n')` in `defaultValues`.
5. In `actions.ts`: read all five fields from `FormData`. Serialize `pros` + `cons`: split by newline, filter empty → `pros_cons = { pros: ..., cons: ... }`. Include all in the Supabase update call: `{ detailed_description: ..., pros_cons: ..., user_opinions_summary: ..., meta_description: ... }`.
6. Run `pnpm --filter @monster/admin typecheck` and fix any type errors.

## Must-Haves

- [ ] `ProductFormProps.defaultValues` has `detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description` (all optional `string | null`)
- [ ] `edit/page.tsx` passes deserialized `pros` and `cons` (newline-joined) from `pros_cons` JSONB
- [ ] `updateProduct` saves all five fields (including `pros_cons` as serialized JSONB object)
- [ ] TypeScript build exits 0

## Observability Impact

**Signals that change after this task:**
- `updateProduct` server action now persists five additional fields to `tsa_products`; any Supabase error on those columns surfaces in `errors._form` (visible in the form error banner).
- TypeScript build (`pnpm --filter @monster/admin typecheck`) validates the interface contract between `ProductFormProps.defaultValues`, `edit/page.tsx` defaultValues assembly, and the `updateProduct` FormData reads — a mismatch exits non-zero.

**How a future agent inspects this task:**
- `grep -n "detailed_description" apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` confirms the field is in the update call.
- `grep -n "pros_cons" apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx` confirms deserialization is present.
- DB: `SELECT id, detailed_description, pros_cons FROM tsa_products LIMIT 5;` shows whether data is being saved.

**Failure state visibility:**
- If `pros_cons` is not correctly serialized, the DB column will contain `null` or `{}` even after a save — detectable via direct DB query.
- If the TS interface is wrong, `typecheck` will fail with an explicit property error message.
- If the Supabase column names differ from code, `typecheck` will flag the `.update({...})` call at the type level (Supabase typed client).

## Verification

- `pnpm --filter @monster/admin typecheck` exits 0
- Grep: `grep -n "detailed_description" apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` returns a hit in the update logic

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` — current `updateProduct` logic
- `apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx` — current defaultValues assembly
- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — current interface definition
- S01/T02 completed — `tsa_products.meta_description` column exists in DB types

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — updated interface
- `apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx` — extended select + defaultValues
- `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` — updated updateProduct
