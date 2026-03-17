# S02: ProductForm Content Fields — UAT

**Milestone:** M012
**Written:** 2026-03-17

## UAT Type

- UAT mode: artifact-driven (build + typecheck + DB column verification) + live-runtime (browser + DB round-trip)
- Why this mode is sufficient: The slice is a form UI change with a data persistence layer. Build/typecheck catches interface drift. DB round-trip confirms serialization correctness. Browser smoke test confirms the form renders as expected.

## Preconditions

1. Admin panel running: `pm2 status` shows `monster-admin` online
2. At least one site with at least one product exists in the admin panel
3. Supabase DB accessible (for round-trip queries)
4. `pnpm --filter @monster/admin build` exits 0 (confirmed in slice verification)
5. `npx tsc --noEmit` in `apps/admin` exits 0 (confirmed in slice verification)

## Smoke Test

Navigate to `/sites/<id>/products/<prodId>/edit`. Scroll down past the basic fields. A card labelled **"AI Content"** should be visible containing five labelled textareas: "Detailed Description", "Pros", "Cons", "User Opinions Summary", and "Meta Description". The "Generate with AI" button should appear inside this card.

---

## Test Cases

### 1. AI Content section renders with correct fields

1. Log in to the admin panel.
2. Navigate to any site → Products tab → click Edit on any product.
3. Scroll past the basic fields (ASIN, Title, Price, etc.).
4. **Expected:** A card labelled "AI Content" is visible.
5. **Expected:** Five labelled textareas are present inside the card, in order: "Detailed Description" (6 rows), "Pros" (4 rows, placeholder "One pro per line"), "Cons" (4 rows, placeholder "One con per line"), "User Opinions Summary" (3 rows), "Meta Description" (2 rows, placeholder "150–160 characters").
6. **Expected:** No read-only "AI Description Preview" textarea is visible anywhere on the page.

---

### 2. Save detailed_description and verify DB round-trip

1. On the product edit page, clear the "Detailed Description" textarea and type: `This is a test description for round-trip verification.`
2. Click **Save**.
3. Confirm the page redirects to the site's products list (or shows a success state).
4. In Supabase Studio (or via psql): `SELECT detailed_description FROM tsa_products WHERE id='<prodId>';`
5. **Expected:** Returns `This is a test description for round-trip verification.`

---

### 3. Save pros/cons and verify JSONB shape

1. On the product edit page, in the **Pros** textarea, type:
   ```
   Easy to use
   Great value
   Fast delivery
   ```
2. In the **Cons** textarea, type:
   ```
   Fragile packaging
   ```
3. Click **Save**.
4. Query DB: `SELECT pros_cons FROM tsa_products WHERE id='<prodId>';`
5. **Expected:** `{"pros":["Easy to use","Great value","Fast delivery"],"cons":["Fragile packaging"]}`
6. **Expected:** No empty strings in either array.

---

### 4. JSONB round-trip — existing data hydrated on edit page load

1. If step 3 was completed, navigate away and return to the product edit page.
2. Inspect the **Pros** textarea.
3. **Expected:** It shows three lines: `Easy to use`, `Great value`, `Fast delivery` — one per line (newline-joined from JSONB array).
4. Inspect the **Cons** textarea.
5. **Expected:** It shows one line: `Fragile packaging`.

---

### 5. Save user_opinions_summary and meta_description

1. On the product edit page, enter text in **User Opinions Summary**: `Most buyers appreciate the build quality and competitive price.`
2. Enter text in **Meta Description**: `Buy the best product for your needs — fast shipping and great reviews.`
3. Click **Save**.
4. Query DB:
   ```sql
   SELECT user_opinions_summary, meta_description FROM tsa_products WHERE id='<prodId>';
   ```
5. **Expected:** Both columns return the entered text.

---

### 6. Generate with AI populates all five textareas

1. Open a product edit page for a product that has a **title** set.
2. Click **"Generate with AI"** inside the AI Content card.
3. Wait for generation to complete (spinner stops).
4. **Expected:** The "Detailed Description" textarea now contains a multi-paragraph product description (~300–400 words).
5. **Expected:** The "Pros" textarea contains 4–6 lines (one pro per line, no bullet characters).
6. **Expected:** The "Cons" textarea contains 2–4 lines (one con per line).
7. **Expected:** The "User Opinions Summary" textarea contains 2–3 sentences.
8. **Expected:** The "Meta Description" textarea contains a single line of 150–160 characters.
9. **Expected:** No error banner appears below the Generate button.

---

### 7. Save AI-generated content persists correctly

1. After step 6, click **Save** without modifying the generated content.
2. Query DB:
   ```sql
   SELECT detailed_description, pros_cons, user_opinions_summary, meta_description FROM tsa_products WHERE id='<prodId>';
   ```
3. **Expected:** `detailed_description` contains the AI-generated description text.
4. **Expected:** `pros_cons` contains `{"pros":["...","..."],"cons":["...","..."]}` — valid JSONB, not null or empty.
5. **Expected:** `user_opinions_summary` and `meta_description` are non-null.

---

### 8. Save failure surfaces error banner

1. To simulate a save failure, temporarily disable your network (or block Supabase connections).
2. Submit the product edit form.
3. **Expected:** An error banner appears at the top of the form (not a page crash) showing the Supabase error message.
4. Re-enable network — form should still be visible for retry.
   > Note: This test is optional and may be skipped if network simulation is not feasible.

---

## Edge Cases

### Empty pros textarea saves correctly

1. On the product edit page, clear the **Pros** textarea (leave it empty) while entering a cons value.
2. Click **Save**.
3. Query DB: `SELECT pros_cons FROM tsa_products WHERE id='<prodId>';`
4. **Expected:** `{"pros":[],"cons":["<the cons line>"]}` — pros array is empty, not null.

---

### Blank lines in pros/cons are filtered

1. Enter pros with blank lines between items:
   ```
   Great build quality

   Value for money

   ```
2. Click **Save**.
3. Query DB.
4. **Expected:** `{"pros":["Great build quality","Value for money"],"cons":[]}` — blank lines are stripped.

---

### Generate with AI when product has no title

1. Navigate to a product edit page for a product with an empty title field.
2. Click **Generate with AI**.
3. **Expected:** Either (a) a 404 error banner appears (product not found in DB), or (b) Claude generates generic content. Either is acceptable; no JavaScript crash should occur.

---

### Re-render after failed save resets generated content

1. Generate content via "Generate with AI" so all five textareas are populated.
2. Without saving, trigger a form validation error (e.g., clear the ASIN field and submit).
3. **Expected:** The form shows a validation error. The AI Content textareas may reset to their `defaultValues` (empty or previously-saved content). This is a **known limitation** — document if observed. User should always save immediately after generating.

---

## Failure Signals

- **Five textareas NOT visible**: The "AI Content" section is absent — check that T02 changes were applied to `ProductForm.tsx`.
- **Save does not persist**: Reload edit page and check if values are empty. Query DB to confirm. Check pm2 logs for `updateProduct` errors.
- **JSONB shape wrong** (`{"pros":"line1\nline2"}` instead of `{"pros":["line1","line2"]}`): The serialization logic in `actions.ts` is broken — check the split+filter logic.
- **Generate with AI shows "AI returned invalid JSON — please retry"**: Claude returned a markdown-wrapped JSON block that failed stripping. Check pm2 logs: `pm2 logs monster-admin | grep "JSON parse failed"`. Retry usually succeeds.
- **Generate with AI shows no content change**: Check browser DevTools → Network for the SSE request to `/api/sites/[id]/generate-seo-text`. If `field=product_all_content` is missing from the request, T03 changes were not applied.
- **TypeScript build fails**: Run `npx tsc --noEmit` in `apps/admin`. Fix any TS2339 errors by ensuring field names are present in both `ProductFormProps.defaultValues` and `ProductFormState.errors`.

---

## Requirements Proved By This UAT

- R035 — "Generate with AI" button on ProductForm calls the API route with full site/product context, streams AI-generated content into five editable textareas. User can regenerate or edit the result.
- R001 (partial) — Product content fields (description, pros/cons, user opinions, meta) are now editable and persist to DB, advancing pipeline completeness.
- R004 — AI content fields editable post-generation: all five product content fields are writable by the user via the product edit form.

---

## Not Proven By This UAT

- Live AI generation quality (requires real Anthropic API key configured in Settings)
- Performance under load (multiple simultaneous Generate calls)
- SEO scorer reading the saved `meta_description` from DB (R005 — scorer currently reads from built HTML, not DB directly)
- Operational validation of `pros_cons` round-trip with AI-generated content from a full site generation job (ContentGenerator writes `pros_cons` as JSONB; this UAT only proves the form serialization path)

## Notes for Tester

- All five textareas start empty if the product was created before S02 (no prior content). After clicking "Generate with AI", all five populate at once — there is no progressive streaming UX. A spinner indicates generation is in progress.
- The "Generate with AI" button only works in **edit mode** (not new product form) because it needs a `productId` to pass as `contextId` to the API route.
- If you see a pre-existing BullMQ warning in the build output, that is a known pre-existing issue unrelated to S02.
- After generating content, **save immediately**. If the form re-renders for any reason (validation error, navigation), textarea values set by the generator may reset to the previously-saved `defaultValues`.
