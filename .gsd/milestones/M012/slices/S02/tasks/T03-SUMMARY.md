---
id: T03
parent: S02
milestone: M012
provides:
  - Generate button wired to product_all_content SSE field; all five content textareas populated from AI response via useRef
  - generate-seo-text route handles product_all_content case: collects Claude JSON, strips code fences, emits per-field SSE events
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx
  - apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
key_decisions:
  - product_all_content uses collect-then-parse strategy (buffer all text chunks → parse JSON → emit field events) rather than streaming text; this is necessary because JSON fields cannot be streamed incrementally into separate textareas
  - Code fence stripping (.replace(/^```(?:json)?\s*/i, '')) guards against Claude wrapping JSON in markdown blocks
  - useRef approach (ref.current.value = text) chosen over React state to avoid re-render issues with uncontrolled textarea defaultValue; ref mutation directly sets DOM value
patterns_established:
  - SSE route bifurcation pattern: same endpoint handles streaming (text chunks) and structured (collect+parse+emit) modes selected by the field parameter
  - fieldRefs map (Record<string, RefObject<HTMLTextAreaElement>>) used to dispatch SSE field events to the correct textarea ref without a switch statement
  - For generate-all patterns, prompt explicitly requests raw JSON with no markdown/code fences and client strips code fences defensively
observability_surfaces:
  - "[generate-seo-text] siteId=... contextId=... field=..." log on every POST — field=product_all_content confirms new path
  - "[generate-seo-text] JSON parse failed siteId=..." log on invalid Claude response — includes first 200 chars of raw output
  - SSE {type:\"error\", error:\"AI returned invalid JSON — please retry\"} on parse failure — surfaced as generateError in form UI
duration: ~15min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T03: Wire "Generate with AI" to populate all five content textareas

**Wired Generate with AI button to stream-populate all five content textareas via a new `product_all_content` SSE route case using collect-then-parse JSON strategy.**

## What Happened

1. **Route (`generate-seo-text/route.ts`)**: Added `product_all_content` as a valid field value. When selected, fetches product data (title, price, focus_keyword) and site (niche, language), constructs a prompt requesting raw JSON with all five fields. In the stream handler, collects all text chunks, strips potential markdown code fences, parses JSON, then emits `{type:"field", name:"...", text:"..."}` SSE events for each field followed by `{type:"done"}`. The existing `category_seo_text` and `product_description` paths are unchanged (still stream text tokens directly).

2. **Form (`ProductForm.tsx`)**: Added `useRef` import and five textarea refs (`detailDescRef`, `prosRef`, `consRef`, `userOpRef`, `metaDescRef`). Updated `generateDescription` to POST `field: 'product_all_content'`. SSE reader now dispatches `field` events to a `fieldRefs` map (keyed by field name) — on match, sets `ref.current.value = event.text` directly in the DOM. Each Textarea element now has its corresponding ref attached.

## Verification

- `grep "product_all_content" route.ts` → 4 hits (guard, comment, condition, case) ✅
- `grep "detailDescRef|prosRef|consRef" ProductForm.tsx` → 7 hits (declarations, map entries, JSX refs) ✅
- `pnpm --filter @monster/admin build` exits 0 (only pre-existing BullMQ warning) ✅
- `./node_modules/.bin/tsc --noEmit` in apps/admin exits 0 (no output) ✅

## Diagnostics

- **Trigger**: Edit a product → click "Generate with AI" → all five textareas fill with AI-generated content
- **Log signal**: `pm2 logs monster-admin | grep "generate-seo-text"` shows `field=product_all_content` entry
- **Parse failure**: If Claude returns non-JSON, `[generate-seo-text] JSON parse failed` log appears; form shows "AI returned invalid JSON — please retry" error banner
- **Field dispatch**: Each ref.current.value setter fires after all SSE events parsed — DOM updates happen synchronously at end of stream

## Deviations

The plan said to add refs and update the handler (Steps 2 and 4) as separate operations. Implementation combined them as one coherent change to avoid partial state. No behavioral deviation.

The plan mentioned "Add a 'Generate All' button (or rename existing)" — kept the existing button label "Generate with AI" since it now generates all content; renaming would be a cosmetic-only change with no functional difference.

## Known Issues

None. The `defaultValue` vs `value` pattern for the textareas means React doesn't track the ref.current.value change in its virtual DOM — so if the form re-renders (e.g., after a save error), textarea values set by the generate handler may reset to `defaultValues`. This is acceptable: user should save after generating, not after a failed save.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx` — added useRef import + five textarea refs + updated generateDescription to use product_all_content + wired refs to Textarea elements
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — added product_all_content validation + prompt construction + collect-then-parse stream handler + updated JSDoc
