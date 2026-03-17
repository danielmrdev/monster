# S03: CategoryForm Meta + Homepage SEO — UAT

**Milestone:** M012
**Written:** 2026-03-17

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: Both features require a running admin panel with a Supabase-backed DB to verify form save/load round-trips and AI streaming. Artifact-driven (build exit 0) covers type safety; live-runtime covers persistence and UX.

## Preconditions

1. Admin panel running (`pnpm --filter @monster/admin dev` or production build served)
2. At least one site exists in the DB with at least one category
3. `sites.homepage_seo_text` column exists (added in S01 — verify: `SELECT column_name FROM information_schema.columns WHERE table_name='sites' AND column_name='homepage_seo_text'`)
4. Anthropic API key configured in Settings (for Generate with AI tests only — persistence tests work without it)

## Smoke Test

Navigate to any category edit page (`/sites/[id]/categories/[catId]/edit`) and confirm a "Meta Description" textarea is visible below the existing fields. This confirms the slice is deployed and the form change is live.

---

## Test Cases

### 1. CategoryForm: meta_description field renders and pre-populates

1. Navigate to `/sites/[id]/categories/[catId]/edit` for any category that has an existing `description` value in the DB.
2. Observe the form.
3. **Expected:** A "Meta Description" labeled textarea is visible. Its value matches the category's current `description` column value (D057 alias — same column). Helper text reads "~150–160 characters for optimal display in search results" (or similar).

### 2. CategoryForm: meta_description saves to tsa_categories.description

1. Navigate to `/sites/[id]/categories/[catId]/edit`.
2. Clear the "Meta Description" textarea and type: `Test meta description for SEO purposes`.
3. Click Save.
4. **Expected:** Form submits without error. No red banner appears.
5. Run: `SELECT id, description FROM tsa_categories WHERE id='<catId>';`
6. **Expected:** `description` column value = `Test meta description for SEO purposes`.

### 3. CategoryForm: saved meta_description round-trips on reload

1. After Test Case 2, reload the category edit page.
2. **Expected:** The "Meta Description" textarea pre-populates with `Test meta description for SEO purposes` — confirming the edit page passes `meta_description: cat.description ?? null` correctly from the DB row.

### 4. CategoryForm: validation error on empty name

1. Navigate to `/sites/[id]/categories/[catId]/edit`.
2. Clear the "Name" field entirely.
3. Click Save.
4. **Expected:** Form returns a validation error. A red banner or inline field error appears (not a silent 500 or redirect). The page remains on the edit form.

### 5. Site edit: Homepage SEO card renders

1. Navigate to `/sites/[id]/edit` for any site.
2. Scroll to the bottom of the form.
3. **Expected:** A "Homepage SEO" card section is visible containing:
   - A "Focus Keyword" text input
   - A "Homepage SEO Text" textarea (approximately 10 rows)
   - A "✦ Generate with AI" button

### 6. Site edit: homepage_seo_text saves and persists

1. Navigate to `/sites/[id]/edit`.
2. In the "Homepage SEO Text" textarea, type: `This is a test homepage SEO text for verification.`
3. Click Save (the main site update form submit button).
4. **Expected:** Form submits without error.
5. Run: `SELECT focus_keyword, homepage_seo_text FROM sites WHERE id='<id>';`
6. **Expected:** `homepage_seo_text` = `This is a test homepage SEO text for verification.`

### 7. Site edit: focus_keyword saves and persists

1. Navigate to `/sites/[id]/edit`.
2. In the "Focus Keyword" input within the Homepage SEO card, type: `best kitchen gadgets`.
3. Click Save.
4. **Expected:** Form submits without error.
5. Run: `SELECT focus_keyword FROM sites WHERE id='<id>';`
6. **Expected:** `focus_keyword` = `best kitchen gadgets`.

### 8. Site edit: homepage_seo_text round-trips on reload

1. After Test Case 6, reload the site edit page.
2. **Expected:** The "Homepage SEO Text" textarea pre-populates with `This is a test homepage SEO text for verification.` — confirming `edit/page.tsx` passes `homepage_seo_text` from the site row to EditForm.

### 9. Site edit: Generate with AI streams into textarea (requires Anthropic API key)

1. Navigate to `/sites/[id]/edit`.
2. Ensure the site has a niche and language set.
3. In the Homepage SEO card, click "✦ Generate with AI".
4. **Expected:**
   - The button shows a loading/disabled state while generating.
   - Text appears incrementally in the "Homepage SEO Text" textarea as SSE chunks arrive.
   - After completion, the textarea contains approximately 300–500 words of homepage SEO copy in the site's language.
   - No error message appears below the textarea.
5. Click Save.
6. **Expected:** The AI-generated text persists to DB (verify with SELECT as in Test Case 6).

---

## Edge Cases

### Empty homepage_seo_text clears the DB value

1. Navigate to `/sites/[id]/edit`.
2. Clear the "Homepage SEO Text" textarea entirely.
3. Click Save.
4. Run: `SELECT homepage_seo_text FROM sites WHERE id='<id>';`
5. **Expected:** `homepage_seo_text` is `NULL` or empty string — not the previous value.

### meta_description empty clears category description

1. Navigate to a category edit page with an existing meta_description value.
2. Clear the "Meta Description" textarea.
3. Click Save.
4. Run: `SELECT description FROM tsa_categories WHERE id='<catId>';`
5. **Expected:** `description` is `NULL` — the meta_description field takes precedence and the cleared value propagates (D057: `meta_description ?? description`).

### Generate with AI failure (no API key or network error)

1. If Anthropic API key is not configured, navigate to `/sites/[id]/edit`.
2. Click "✦ Generate with AI" in the Homepage SEO card.
3. **Expected:** An error message appears below the "Homepage SEO Text" textarea (not a blank page, not a 500). The existing textarea content is preserved.

---

## Failure Signals

- No "Meta Description" textarea in CategoryForm → T01 changes not deployed
- No "Homepage SEO" card section in site edit → T02 changes not deployed
- `description` column unchanged after CategoryForm save → `updateCategory` not reading `meta_description` from FormData
- `homepage_seo_text` column unchanged after site edit save → `updateSite` not including the field in Supabase update
- TypeScript build fails → `UpdateSiteErrors` type or `CategoryFormState.errors` extension has a regression
- AI generation never streams text into textarea → `generate-seo-text` route not handling `homepage_seo_text` field case, or SSE connection failing (check server logs for `[generate-seo-text]` prefix)
- Textarea value lost after reload → edit page not passing field from site row to EditForm props

## Requirements Proved By This UAT

- R004 (partial) — Category meta_description and homepage SEO text are now editable post-generation; the full content editing pipeline is one step closer to complete

## Not Proven By This UAT

- Actual ContentGenerator round-trip (R004 full proof) — requires DataForSEO + Anthropic credentials and a full site generation run
- SEO scorer reading the newly-persisted meta_description (R005) — out of scope for this slice
- Mobile viewport behavior — covered by S06

## Notes for Tester

- The legacy "Description" textarea in CategoryForm still exists alongside the new "Meta Description" textarea. Both map to `tsa_categories.description` (D057). The Meta Description field takes precedence if both are filled — this is intentional. A future cleanup will remove the legacy field.
- Focus Keyword in the Homepage SEO card is a new surface for the `sites.focus_keyword` column. If the site already had a focus keyword saved (e.g., from the new-site form), it will pre-populate correctly.
- Generate with AI for homepage_seo_text uses the site's `name`, `niche`, `language`, and `focus_keyword` to construct its prompt. Sites with richer metadata produce better output.
