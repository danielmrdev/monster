---
id: T02
parent: S03
milestone: M012
provides:
  - Homepage SEO card in site edit form with focus_keyword input, homepage_seo_text textarea, and Generate with AI button
  - generate-seo-text route extended to handle homepage_seo_text field
  - updateSite server action saves focus_keyword and homepage_seo_text to sites table
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
key_decisions:
  - UpdateSiteState is now its own type (not an alias of CreateSiteState) so it can carry UpdateSiteErrors with the new focus_keyword and homepage_seo_text fields
  - homepage_seo_text uses controlled textarea (useState) so AI-streamed text renders incrementally during SSE streaming
  - generate-seo-text route fetches focus_keyword from sites table (select now includes it) for use in the AI prompt
patterns_established:
  - AI-generate button pattern for site-level fields: POST to /api/sites/[id]/generate-seo-text with {field, contextId: siteId}, stream SSE text events into controlled state
  - UpdateSiteErrors extends CreateSiteErrors intersection type to add site-edit-specific fields without breaking shared types
observability_surfaces:
  - Server log: "[generate-seo-text] siteId=X contextId=X field=homepage_seo_text" on every AI generation call
  - SSE stream emits {"type":"error","error":"..."} on generation failure; rendered as red paragraph under textarea
  - updateSite failure throws (not swallowed); visible in server logs as unhandled error
  - "SELECT focus_keyword, homepage_seo_text FROM sites WHERE id='<id>'" to verify persistence
duration: 15min
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T02: Add Homepage SEO card to site edit page

**Added Homepage SEO card to site edit form with focus_keyword + homepage_seo_text textarea + Generate with AI button; updateSite now persists both fields to the sites table.**

## What Happened

Read all four target files to understand the existing form structure. The form used a plain `useActionState` with no AI generation state — added `useState`/`useRef` for the controlled `homepageSeoText` value and streaming logic. Added the "Homepage SEO" `<Card>` after the Customization card containing: a `focus_keyword` text input, a controlled `<Textarea name="homepage_seo_text" rows={10}>`, and a "✦ Generate with AI" button that streams from the SSE route.

Extended `generate-seo-text/route.ts` to accept `homepage_seo_text` as a valid field value; added its prompt branch (fetches site `focus_keyword` now included in the select). The `homepage_seo_text` field streams like `category_seo_text` — text chunks directly (not JSON).

Updated `updateSite` in `actions.ts` to read `focus_keyword` and `homepage_seo_text` from `formData` and include them in the Supabase `.update()` call. Also broke `UpdateSiteState` out as its own type (was aliased to `CreateSiteState`) so it carries `UpdateSiteErrors` which adds `focus_keyword?` and `homepage_seo_text?` — required for TypeScript to accept `errors?.focus_keyword` in the form.

Updated `edit/page.tsx` to pass `focus_keyword` and `homepage_seo_text` from the site record (already `select('*')`) to the `EditForm` component.

## Verification

```
grep "homepage_seo_text" "apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx"
# → 8 hits (≥2 required)

grep "homepage_seo_text" "apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts"
# → 3 hits

pnpm --filter @monster/admin build
# → exit 0, all routes compiled successfully
```

First build attempt failed: `Property 'focus_keyword' does not exist on type 'CreateSiteErrors'` — fixed by making `UpdateSiteState` a distinct type with `UpdateSiteErrors`. Second build passed.

## Diagnostics

- **AI generation failures:** Red paragraph below textarea (`homepageSeoError` state). Server log: `[generate-seo-text] siteId=X contextId=X field=homepage_seo_text`.
- **Save failures:** `updateSite` throws on Supabase error (visible in server logs); no `errors._form` path for this field since validation doesn't cover it.
- **Inspect persistence:** `SELECT focus_keyword, homepage_seo_text FROM sites WHERE id='<id>';`
- **TypeScript check:** `pnpm --filter @monster/admin typecheck`

## Deviations

- `UpdateSiteState` is now a distinct type instead of an alias for `CreateSiteState`. This was needed to type `errors?.focus_keyword` — the plan didn't anticipate this type system constraint.
- `textarea rows={10}` instead of plan's `rows={6}` — homepage SEO text is ~400 words, 10 rows is more usable.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — added focus_keyword + homepage_seo_text + Generate with AI; extended EditFormProps; added AI streaming state
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — pass focus_keyword and homepage_seo_text to EditForm
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — updateSite reads/saves focus_keyword + homepage_seo_text; UpdateSiteState/UpdateSiteErrors are now distinct types
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — homepage_seo_text field case added; site select now includes focus_keyword
