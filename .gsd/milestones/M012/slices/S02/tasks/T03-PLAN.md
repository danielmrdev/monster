---
estimated_steps: 6
estimated_files: 2
---

# T03: Wire "Generate with AI" to populate all five content textareas

**Slice:** S02 — ProductForm Content Fields
**Milestone:** M012

## Description

Update the "Generate with AI" button to stream AI-generated content into all five editable textareas. Add new field cases to the `generate-seo-text` route for product content fields.

## Steps

1. Read the current generate handler in `ProductForm.tsx` — understand how the stream is consumed and how `descPreviewRef` was used (now removed).
2. Add refs for all five textareas: `detailDescRef`, `prosRef`, `consRef`, `userOpRef`, `metaDescRef`.
3. Add a new field `product_all_content` to the `generate-seo-text` route. When this field is sent, fetch the product (title, current_price, focus_keyword, site language, niche) and generate a structured response with one Claude call. Return each field as a separate SSE event: `{type: "field", name: "detailed_description", text: "..."}`, `{type: "field", name: "pros", text: "line1\nline2\nline3"}`, etc. End with `{type: "done"}`.
4. Update the `ProductForm.tsx` generate handler: send `field: 'product_all_content'` + `contextId: productId`. In the SSE stream reader, dispatch each `field` event to the appropriate textarea ref's `.value` setter.
5. Add a "Generate All" button (or rename existing) that fires the new generate call. Show a single `isGenerating` spinner while all five stream.
6. Run `pnpm --filter @monster/admin build` and fix any errors.

## Must-Haves

- [ ] Generate button fires one API call and populates all five textareas with streamed AI content
- [ ] Route handles `product_all_content` field case without error
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `grep "product_all_content" apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` returns a hit
- `grep "detailDescRef\|prosRef\|consRef" apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` returns hits
- `pnpm --filter @monster/admin build` exits 0

## Observability Impact

- Signals added/changed: existing `[generate-seo-text] siteId=... contextId=...` log is preserved; new `field=product_all_content` case adds same structured log
- How a future agent inspects this: pm2 logs `monster-admin` for `[generate-seo-text]` prefix
- Failure state exposed: SSE `{type:"error", error:"..."}` returned to client; shown as `generateError` in form

## Inputs

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — current generate handler (T02 removed preview, T03 adds refs)
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — current route with `product_description` case
- T02 completed — five textarea refs are the target

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — updated generate handler + refs
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — `product_all_content` case added
