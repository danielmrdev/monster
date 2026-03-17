---
estimated_steps: 7
estimated_files: 4
---

# T02: Add Homepage SEO card to site edit page

**Slice:** S03 — CategoryForm Meta + Homepage SEO
**Milestone:** M012

## Description

Add a "Homepage SEO" card to the site edit form with `focus_keyword` (already exists on the sites table) and a new `homepage_seo_text` textarea. Wire Generate with AI and persist both fields.

## Steps

1. Read `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — check if `focus_keyword` already has an input; understand current card structure.
2. Read the site edit `page.tsx` — understand how site data is fetched and passed to the form.
3. Read `apps/admin/src/app/(dashboard)/sites/actions.ts` — find `updateSite` and its current update payload.
4. In `edit-form.tsx`: add a `homepage_seo_text?: string | null` prop; add a "Homepage SEO" `<Card>` containing: `focus_keyword` input (if not already in a dedicated section, consolidate it here), `homepage_seo_text` `<Textarea rows={6}>`, and a "Generate with AI" `<Button>` that calls the generate-seo-text route with `field: 'homepage_seo_text'`, `contextId: siteId`.
5. In `generate-seo-text/route.ts`: add the `homepage_seo_text` field case. Fetch site (name, niche, language, focus_keyword). Prompt: "Write a ~400-word SEO-optimised homepage text for an Amazon affiliate site named {{name}} about {{niche}}. Focus keyword: {{focus_keyword}}. Write in {{language}}. Output only flowing paragraphs, no headings."
6. In site edit `page.tsx`: extend Supabase select to include `homepage_seo_text`; pass to form component.
7. In `updateSite` action: read `formData.get('homepage_seo_text')` and include it in the Supabase update. Run `pnpm --filter @monster/admin build`.

## Must-Haves

- [ ] `edit-form.tsx` renders `<Textarea name="homepage_seo_text">` inside a "Homepage SEO" card
- [ ] Generate with AI streams into the `homepage_seo_text` textarea
- [ ] `updateSite` saves `homepage_seo_text` to `sites.homepage_seo_text`
- [ ] Route handles `homepage_seo_text` field without error
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `grep "homepage_seo_text" apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` returns ≥2 hits
- `grep "homepage_seo_text" apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` returns a hit
- `pnpm --filter @monster/admin build` exits 0

## Observability Impact

**New signals added:**
- `[generate-seo-text] siteId=X contextId=X field=homepage_seo_text` — server console log appears on every AI generation request for the homepage field.
- SSE stream emits `{"type":"error","error":"<message>"}` on failure; the form renders it as a red paragraph below the textarea (client-side, not a server action error).
- If `updateSite` fails (Supabase error), the error is thrown as a 500 — visible in server logs. No silent swallowing.

**Failure state visibility:**
- Generation failure: red text under the textarea with the error message.
- Save failure: form-level red banner (`errors._form[0]`).
- TypeScript mismatch: `pnpm --filter @monster/admin typecheck` or `build` — the `UpdateSiteErrors` type must include `focus_keyword` and `homepage_seo_text`; build fails otherwise.

**Inspect saved value:**
```sql
SELECT focus_keyword, homepage_seo_text FROM sites WHERE id='<siteId>';
```


- `apps/admin/src/app/(dashboard)/sites/[id]/edit/edit-form.tsx` — current form (read first)
- `apps/admin/src/app/(dashboard)/sites/[id]/edit/page.tsx` — site data fetching
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — updateSite
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` — generate route to extend
- S01/T02 completed — `sites.homepage_seo_text` column in DB types

## Expected Output

- `edit-form.tsx` — Homepage SEO card with focus_keyword + homepage_seo_text + generate button
- `edit/page.tsx` — extended site select + pass homepage_seo_text to form
- `sites/actions.ts` — updateSite saves homepage_seo_text
- `generate-seo-text/route.ts` — homepage_seo_text case added
