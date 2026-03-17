---
id: S02
parent: M012
milestone: M012
provides:
  - ProductForm with five editable content textareas (detailed_description, pros, cons, user_opinions_summary, meta_description) replacing the old read-only AI preview
  - updateProduct server action saves all five content fields including pros_cons JSONB serialization
  - edit/page.tsx deserializes pros_cons JSONB into newline-joined textarea strings on load
  - generate-seo-text route handles product_all_content field case (collect-then-parse JSON strategy)
  - Generate with AI button populates all five textareas via useRef direct DOM mutation
requires:
  - slice: S01
    provides: tsa_products.meta_description column (confirmed present in DB)
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx
  - apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
key_decisions:
  - pros_cons JSONB round-trips as newline-joined text in textarea; split+filter on save, join on load
  - product_all_content uses collect-then-parse JSON strategy rather than streaming text (JSON fields cannot be streamed incrementally into separate textareas)
  - useRef approach (ref.current.value = text) chosen over React state to avoid re-render issues with uncontrolled textarea defaultValue
  - SSE route bifurcation pattern — same endpoint handles streaming (text chunks) and structured (collect+parse+emit) modes selected by the field parameter
  - fieldRefs map (Record<string, RefObject<HTMLTextAreaElement>>) dispatches SSE field events to correct textarea without a switch statement
patterns_established:
  - JSONB array field round-trips as newline-joined text in textarea — serialize on save, deserialize on load
  - When adding new form fields, also add their keys to ProductFormState.errors in actions.ts (omitting causes TS2339 type errors)
  - For generate-all patterns, prompt explicitly requests raw JSON with no markdown/code fences; client strips code fences defensively
  - Code fence stripping (.replace(/^```(?:json)?\s*/i, '')) guards against Claude wrapping JSON in markdown blocks
observability_surfaces:
  - "[generate-seo-text] siteId=... contextId=... field=product_all_content" log on every POST confirms new path
  - "[generate-seo-text] JSON parse failed siteId=..." log on invalid Claude response — includes first 200 chars of raw output
  - SSE {type:"error", error:"AI returned invalid JSON — please retry"} on parse failure — surfaced as generateError in form UI
  - updateProduct returns { errors: { _form: [error.message] } } on Supabase failure — visible in form error banner
  - SELECT id, detailed_description, pros_cons, user_opinions_summary, meta_description FROM tsa_products WHERE id='<id>' confirms save round-trip
drill_down_paths:
  - .gsd/milestones/M012/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M012/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M012/slices/S02/tasks/T03-SUMMARY.md
duration: ~30min total (T01 ~5min, T02 ~10min, T03 ~15min)
verification_result: passed
completed_at: "2026-03-17"
---

# S02: ProductForm Content Fields

**Five editable AI content textareas wired end-to-end from DB to form to Generate with AI — replacing the old read-only description preview with a fully editable, AI-populatable content section.**

## What Happened

### T01 — Data layer (actions + page + interface)

Three files were updated to wire the five content fields end-to-end at the data layer:

- **`ProductForm.tsx` interface** — Added `detailed_description`, `pros`, `cons`, `user_opinions_summary`, `meta_description` to `ProductFormProps.defaultValues` (all `string | null`, optional).
- **`edit/page.tsx`** — Extended Supabase select to include all content columns. Added `pros_cons` JSONB deserialization: cast to `{pros?: string[]; cons?: string[]} | null`, then `.join('\n')` for each array to produce textarea-ready strings (`prosText`/`consText`).
- **`actions.ts`** — Added reads for all five fields from `FormData`. Pros/cons serialization: split by `\n`, `.map(l => l.trim()).filter(Boolean)` → `{ pros: string[], cons: string[] }` object stored as `pros_cons` JSONB. All five fields included in the Supabase `.update({...})` call.

### T02 — UI rendering (five editable textareas)

Removed the existing `generatedDescription` state, `descPreviewRef`, and `setGeneratedDescription` calls. Added a new "AI Content" section — a rounded card — containing five `<Textarea>` elements in order: `detailed_description` (6 rows), `pros` (4 rows, "One pro per line"), `cons` (4 rows, "One con per line"), `user_opinions_summary` (3 rows), `meta_description` (2 rows, "150–160 characters"). Each has a `<Label>`, `defaultValue` from props, and a `<FieldError>`. Also extended `ProductFormState.errors` in `actions.ts` to include the five new field keys so `errors?.fieldName` references compile correctly.

### T03 — Generate with AI wiring

Added `useRef` + five textarea refs (`detailDescRef`, `prosRef`, `consRef`, `userOpRef`, `metaDescRef`). Updated `generateDescription` to POST `field: 'product_all_content'`. SSE reader dispatches `field` events via a `fieldRefs` map to the correct textarea ref — `ref.current.value = event.text` directly in the DOM.

In the route, added `product_all_content` as a valid field. When selected: fetches product (title, price, focus_keyword) + site (niche, language), constructs a prompt requesting raw JSON with all five fields. Collects all text chunks, strips potential markdown code fences, parses JSON, then emits `{type:"field", name:"...", text:"..."}` SSE events per field followed by `{type:"done"}`.

## Verification

- `tsa_products` DB columns confirmed: `detailed_description`, `meta_description`, `pros_cons`, `user_opinions_summary` all present via live DB query
- `npx tsc --noEmit` in `apps/admin` → **exit 0** (no type errors)
- `pnpm --filter @monster/admin build` → **exit 0** (only pre-existing BullMQ warning, no new errors)
- Five `name` attributes confirmed in ProductForm.tsx (grep count = 5)
- `product_all_content` present in route.ts (4 hits)
- `detailDescRef`, `prosRef`, `consRef` refs present in ProductForm.tsx (7 hits)

## Requirements Advanced

- R035 — Generate with AI button on ProductForm now calls the API route and streams AI-generated content with full site/niche/product context into five editable textareas. User can regenerate or edit the result.
- R001 — Pipeline completeness: AI content fields (description, pros/cons, user opinions, meta) are now editable post-generation, closing the edit loop for product content.
- R004 — AI content editable post-generation: all five product content fields are now writable by the user via the product edit form.

## Requirements Validated

- None validated by this slice alone — verification is code-level (build + typecheck + DB column check). Human UAT (edit a real product, save, check DB) would validate R035 operationally.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- **`typecheck` script absent** — The plan referenced `pnpm --filter @monster/admin typecheck` but no such script exists in `apps/admin/package.json`. Used `npx tsc --noEmit` directly in `apps/admin/` — same result. Documented in all three task summaries.
- **`ProductFormState.errors` extension** — T02 additionally needed to extend the errors type in `actions.ts` with the five new field keys to fix TS2339 compile errors. Not called out explicitly in T02 plan but required for correctness; treated as an implicit requirement of "add field with FieldError".
- **Generate button label unchanged** — T03 plan mentioned "rename to 'Generate All'" as an option; kept "Generate with AI" since the new behavior covers all fields. Cosmetic-only.

## Known Limitations

- **uncontrolled textarea re-render issue** — The `ref.current.value` setter fires after SSE events are parsed and sets DOM values directly. If the form re-renders (e.g., after a save error), React restores `defaultValues` and the generated content reverts. Users should save immediately after generating. This is acceptable behavior for Phase 1.
- **No streaming UX for product_all_content** — Claude generates all five fields and the form updates them all at once at end-of-stream (not incrementally). A "thinking…" spinner covers the wait period (`isGenerating` state).
- **single-field product_description path preserved but unused** — The legacy `product_description` SSE path still exists in the route for backward compatibility but the form no longer calls it (now uses `product_all_content`).

## Follow-ups

- Human UAT: edit a real product → save non-empty description → `SELECT detailed_description FROM tsa_products WHERE id=?` confirms value. Enter pros as newline-separated list → `SELECT pros_cons FROM tsa_products WHERE id=?` confirms `{"pros":["..."],"cons":[]}` JSONB shape.
- Consider upgrading to streaming UX for `product_all_content` (stream each field as Claude writes it) — would require streaming JSON parser. Deferred; acceptable for Phase 1.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — added five fields to defaultValues interface; removed read-only preview; added five editable Textarea fields with labels/defaultValues/FieldErrors in "AI Content" section; added useRef imports + five textarea refs; updated generateDescription to use product_all_content + wired refs to Textarea elements
- `apps/admin/src/app/(dashboard)/sites/[id]/products/[prodId]/edit/page.tsx` — extended Supabase select, added pros_cons JSONB deserialization, passed all five fields in defaultValues
- `apps/admin/src/app/(dashboard)/sites/[id]/products/actions.ts` — reads five content fields from FormData; serializes pros/cons to JSONB; includes all in update payload; extended ProductFormState.errors with five content field keys
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — added product_all_content validation + prompt construction + collect-then-parse stream handler + updated JSDoc

## Forward Intelligence

### What the next slice should know
- The `generate-seo-text` route now has three modes: `category_seo_text` (streaming text), `product_description` (streaming text, legacy), and `product_all_content` (collect+parse+emit JSON). S03 will add `homepage_seo_text` — follow the `category_seo_text` pattern (streaming text, not JSON).
- `ProductFormState.errors` in `actions.ts` must be updated whenever new form fields with `<FieldError>` references are added — TypeScript will fail with TS2339 otherwise.
- The JSONB textarea round-trip pattern (serialize on save, join on load) is established. If S03 adds any JSONB fields to CategoryForm, apply the same pattern.

### What's fragile
- **`ref.current.value` + uncontrolled textarea** — The generate handler mutates DOM directly. React doesn't track these changes. Any re-render (form error, route refresh) will reset textarea values to `defaultValues`. This is intentional but fragile if save behavior changes.
- **Code fence stripping regex** — The `.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')` guards against Claude wrapping JSON in markdown blocks. If Claude changes formatting behavior (e.g., adds extra newlines or uses different fence syntax), the strip logic may fail and trigger the JSON parse error path.

### Authoritative diagnostics
- `pm2 logs monster-admin | grep "generate-seo-text"` — confirms `field=product_all_content` on every Generate click; `JSON parse failed` indicates Claude returned non-JSON.
- `SELECT id, detailed_description, pros_cons, user_opinions_summary, meta_description FROM tsa_products WHERE id='<id>'` — authoritative round-trip check. `pros_cons` must be `{"pros":["..."],"cons":["..."]}`.
- `npx tsc --noEmit` in `apps/admin` — authoritative type check. Zero output = zero errors.

### What assumptions changed
- **Original assumption**: T03 would wire `Generate with AI` to stream text into individual fields. **Actual**: JSON cannot be streamed incrementally into separate fields. Adopted collect-then-parse strategy instead — functionally equivalent from the user's perspective (all fields appear at once at end of generation).
- **Original assumption**: `generate-seo-text` needed separate field cases for each content field. **Actual**: A single `product_all_content` case handles all five in one Claude call — fewer API calls, better coherence across fields.
