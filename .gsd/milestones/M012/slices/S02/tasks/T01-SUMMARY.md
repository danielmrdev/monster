---
id: T01
parent: S02
milestone: M012
provides:
  - ProductFormProps.defaultValues interface extended with five content fields
  - edit/page.tsx deserialization of pros_cons JSONB into newline-joined strings
  - updateProduct server action saves all five content fields including pros_cons JSONB
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts
key_decisions:
  - pros_cons JSONB serialization: split textarea text by newline, filter empty → {pros: string[], cons: string[]}
  - pros_cons JSONB deserialization: (prosCons?.pros ?? []).join('\n') for textarea hydration
patterns_established:
  - JSONB array field round-trips as newline-joined text in textarea; serialize on save, deserialize on load
observability_surfaces:
  - updateProduct returns { errors: { _form: [error.message] } } on Supabase failure — visible in form error banner
  - "grep -n \"detailed_description\" apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts confirms field in update"
  - "grep -n \"pros_cons\" apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx confirms deserialization"
  - "npx tsc --noEmit in apps/admin validates interface contract at build time"
duration: ~5min (resumed from interruption)
verification_result: passed
completed_at: "2026-03-17"
blocker_discovered: false
---

# T01: Extend ProductFormProps, actions, and updateProduct for all five content fields

**Extended ProductForm interface, edit page data loading, and updateProduct action to persist detailed_description, pros/cons, user_opinions_summary, and meta_description.**

## What Happened

Three files were updated to wire up the five content fields end-to-end:

1. **`ProductForm.tsx`** — Added `detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description` to the `defaultValues` interface (all `string | null`, optional).

2. **`edit/page.tsx`** — Extended the Supabase select to include all content columns. Added deserialization of `pros_cons` JSONB: cast to `{pros?: string[]; cons?: string[]} | null`, then `.join('\n')` for each array to produce textarea-ready strings. Both `pros` and `cons` are passed as `prosText`/`consText` in `defaultValues`.

3. **`actions.ts`** — Added reads for all five fields from `FormData`. Pros/cons serialization: split by `\n`, `.map(l => l.trim()).filter(Boolean)` → `{ pros: string[], cons: string[] }` object stored as `pros_cons`. All five fields included in the Supabase `.update({...})` call.

## Verification

- `npx tsc --noEmit` in `apps/admin` → **exits 0** (no type errors)
- `grep -n "detailed_description" .../actions.ts` → hits at lines 114 and 138 (field read + update payload)
- `grep -n "pros_cons" .../edit/page.tsx` → hits at lines 17 (select), 35–36 (deserialization)
- All must-haves in T01-PLAN.md confirmed satisfied

## Diagnostics

- To verify save round-trip: `SELECT id, detailed_description, pros_cons FROM tsa_products LIMIT 5;` in Supabase Studio
- `pros_cons` correct shape: `{"pros":["line1","line2"],"cons":["line1"]}`
- TypeScript type errors surface as non-zero exit from `npx tsc --noEmit` in `apps/admin`
- Supabase save errors surfaced in form as `errors._form` banner

## Deviations

- The task plan mentioned `pnpm --filter @monster/admin typecheck` but no `typecheck` script exists in `apps/admin/package.json`. Used `npx tsc --noEmit` directly instead — equivalent result.

## Known Issues

none

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — added five fields to `defaultValues` interface
- `apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx` — extended Supabase select, added pros_cons deserialization, passed all five fields in defaultValues
- `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` — reads five content fields from FormData, serializes pros/cons to JSONB, includes all in update payload
