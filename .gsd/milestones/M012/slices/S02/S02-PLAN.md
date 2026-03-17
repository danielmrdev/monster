# S02: ProductForm Content Fields

**Goal:** Make all five AI-generated product content fields (`detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description`) editable in the ProductForm and saveable to DB, with Generate with AI populating them instead of a read-only preview.
**Demo:** Edit a product in the admin panel — five editable content textareas appear below the basic fields; clicking "Generate with AI" streams text into each field which the user can then edit; saving the form persists all five fields to `tsa_products`.

## Must-Haves

- `ProductFormProps.defaultValues` includes all five content fields
- All five fields render as `<Textarea>` elements (not read-only previews)
- `updateProduct` server action saves all five fields to `tsa_products`
- `pros` and `cons` textareas round-trip through `{pros: string[], cons: string[]}` JSONB without corrupting existing AI-generated data
- "Generate with AI" populates each field's textarea (not a separate preview area)
- `generate-seo-text` route handles `product_description`, `product_pros`, `product_cons`, `product_user_opinions`, `product_meta_description` field cases

## Observability / Diagnostics

**Runtime signals:**
- Server action errors: `updateProduct` returns `{ errors: { _form: [error.message] } }` on Supabase failure — visible in the form's error banner.
- TypeScript type errors from `pnpm --filter @monster/admin typecheck` catch field name mismatches between form, page, and action layers at build time.
- Supabase update errors: logged as `_form` errors, surfaced in the form UI.

**Inspection surfaces:**
- DB state: `SELECT id, detailed_description, pros_cons, user_opinions_summary, meta_description FROM tsa_products WHERE id='<id>';` confirms save round-trip.
- `pros_cons` JSONB shape: verify `{"pros":["..."],"cons":["..."]}` structure via psql or Supabase Studio.
- Form hydration: browser DevTools → Network → search for the edit page request; check `defaultValues` props in React DevTools.

**Failure visibility:**
- If `pros_cons` serialization is broken, the DB will contain `{"pros":[],"cons":[]}` even when text was entered — detectable via the DB query above.
- If `meta_description` column is missing from the Supabase select in `edit/page.tsx`, the field will render empty even when DB has data.
- TypeScript build failure (`pnpm --filter @monster/admin typecheck` non-zero exit) indicates interface/action mismatch.

**Redaction:**
- No secrets flow through these fields; all content is user-supplied or AI-generated text.

## Verification

- Edit a product → save with non-empty description → read back from DB: `SELECT detailed_description FROM tsa_products WHERE id=?` returns the saved value
- Edit a product → enter pros as line-separated text → save → read back: `SELECT pros_cons FROM tsa_products WHERE id=?` returns `{"pros":["line1"],"cons":[]}` (correct JSONB shape)
- `pnpm --filter @monster/admin build` exits 0
- TypeScript check exits 0: `pnpm --filter @monster/admin typecheck` — verifies no field name drift between interface, page, and action
- Failure path: if `updateProduct` Supabase call fails, form renders `errors._form` error banner visible in UI (inspect via browser DevTools or manual save attempt)

## Tasks

- [x] **T01: Extend ProductFormProps, actions, and updateProduct for all five content fields** `est:45m`
  - Why: The server action is the data persistence layer — must be updated before the form renders.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` (interface only)
  - Do: Add `detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description` to `ProductFormProps.defaultValues`. In `updateProduct` action: read `formData.get('detailed_description')`, `formData.get('pros')` (newline-separated → split → `{pros: string[], cons: []}`), `formData.get('cons')` (newline-separated → `{}`), merge into `pros_cons` JSONB. Save all five to `tsa_products` via Supabase update. In edit page `page.tsx`, pass the five fields from the DB row as `defaultValues`. For `pros`/`cons`, deserialize existing `pros_cons` JSONB → newline-join each array for textarea `defaultValue`.
  - Verify: Create/edit a product via form, check DB: `detailed_description` and `pros_cons` are non-null.
  - Done when: `updateProduct` includes all five fields in its Supabase update call; build exits 0.

- [x] **T02: Render five editable content textareas in ProductForm** `est:30m`
  - Why: The form currently shows a read-only AI Description Preview. Must become five editable fields.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx`
  - Do: Remove the existing `generatedDescription` state + read-only preview textarea. Add five `<Textarea>` fields: `detailed_description` (name, ~6 rows), `pros` (name, ~4 rows, placeholder "One pro per line"), `cons` (name, ~4 rows, placeholder "One con per line"), `user_opinions_summary` (name, ~3 rows), `meta_description` (name, ~2 rows, placeholder "150-160 characters"). Set `defaultValue` from `defaultValues` props. All five fields share the same section label "AI Content".
  - Verify: Open product edit page in browser or confirm HTML structure: five `<textarea>` elements with the correct `name` attributes are present.
  - Done when: All five textareas render with correct `name` attrs and `defaultValue` wired from props.

- [x] **T03: Wire "Generate with AI" to populate all five content textareas** `est:40m`
  - Why: "Generate with AI" currently streams into a now-removed preview. Must stream into the five editable textareas using React refs.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx`, `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts`
  - Do: Add refs for all five textareas. Update the generate handler to send `field: 'product_description'` for description, then separate calls or a multi-field approach for pros/cons/user-opinions/meta. Simplest: one button "Generate All" fires one API call per field sequentially or add a `product_all_content` field case to the route that returns a structured JSON blob (pros, cons, description, user_opinions, meta) in one Claude call. Update the route to handle the new field cases: for `product_pros`/`product_cons`/`product_user_opinions`/`product_meta_description`, write appropriate prompts that use language/niche/title context. Stream text into the corresponding textarea ref value.
  - Verify: Click "Generate with AI" on a product with a title — at least the description textarea populates with streamed text.
  - Done when: All five textareas receive generated content; no TypeScript errors; `pnpm --filter @monster/admin build` exits 0.

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx`
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts`
