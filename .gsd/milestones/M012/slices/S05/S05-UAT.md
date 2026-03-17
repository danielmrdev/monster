# S05: Legal Templates Seed + Markdown Pipeline — UAT

**Milestone:** M012
**Written:** 2026-03-17

## UAT Mode

- UAT mode: artifact-driven
- Why this mode is sufficient: All outputs are inspectable without a running admin server — generator builds produce static HTML files, DB seed rows are queryable via REST API, and the TemplateForm changes are verified by build output + code inspection. A running admin server is needed only for the preview toggle visual test (Case 5), which is a stretch verification.

## Preconditions

1. Environment: `/home/daniel/monster` is the working directory
2. `SUPABASE_SERVICE_ROLE_KEY` available (`.env` sourced)
3. Generator fixture data at `apps/generator/src/data/fixture/site.json` exists
4. 8 `legal_templates` rows seeded in Supabase (verified in T02)
5. Admin build has been run at least once (verifies TemplateForm compiles cleanly)

## Smoke Test

Run the generator build and confirm legal pages are built as HTML:

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
```

**Expected:** Exit 0. Output includes `/privacidad/index.html`, `/aviso-legal/index.html`, `/cookies/index.html`, `/contacto/index.html`. No TypeScript errors.

---

## Test Cases

### 1. Generator build exits 0 with legal pages

**Goal:** Confirm `marked` + `interpolateLegal` pipeline doesn't break the build.

1. Run: `SITE_SLUG=fixture pnpm --filter @monster/generator build`
2. Observe exit code and page list in output.
3. **Expected:** Exit 0. Output shows 11 pages built, including all 4 legal pages (`/privacidad/`, `/aviso-legal/`, `/cookies/`, `/contacto/`). No "Error" or "failed" lines.

---

### 2. `set:html` wired for all three template variants

**Goal:** Confirm the markdown pipeline replaces the old plain-text render in all three template branches.

1. Run: `grep "set:html" apps/generator/src/pages/[legal].astro`
2. **Expected:** 3 lines returned — one for each of the Classic, Modern, and Minimal template branches. Each line contains `set:html={marked(interpolateLegal(pageContent, site))}`.

---

### 3. No unsubstituted placeholders in built output

**Goal:** Confirm `interpolateLegal()` consumed all `{{site.*}}` markers before markdown rendering.

1. Run: `grep -r "{{site\." apps/generator/.generated-sites/fixture/dist/`
2. **Expected:** No output (empty result). Any output indicates a placeholder that escaped substitution — this is a failure.

---

### 4. HTML rendering confirmed in built legal pages

**Goal:** Confirm markdown was converted to HTML tags (not plain text) in the static output.

1. Run: `cat apps/generator/.generated-sites/fixture/dist/privacidad/index.html | grep 'class="prose'`
2. Look for the presence of `<p>`, `<h2>`, `<ul>`, or `<li>` inside the prose div.
3. **Expected:** A `<div class="prose prose-sm max-w-none">` element containing HTML-formatted content (at minimum `<p>` tags). The content must NOT be raw markdown text (e.g. no `# ` heading syntax, no `**bold**` syntax visible in the HTML source).

Alternative check:
```bash
grep -o "<h2>\|<ul>\|<li>\|<p>" apps/generator/.generated-sites/fixture/dist/aviso-legal/index.html | head -5
```
**Expected:** At least `<p>` or `<h2>` returned (confirms markdown-to-HTML conversion happened).

---

### 5. 8 legal template rows confirmed in Supabase

**Goal:** Confirm the seed migration produced exactly 8 rows with correct types and languages.

1. Run (with sourced env):
   ```bash
   source /home/daniel/monster/.env && \
   curl -s "https://iygjgkproeuhcvbrwloo.supabase.co/rest/v1/legal_templates?select=type,language,title&order=type,language" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "import sys,json; rows=json.load(sys.stdin); print(len(rows), 'rows'); [print(r['type'],r['language']) for r in rows]"
   ```
2. **Expected:** `8 rows` printed. Types: `contact`, `cookies`, `privacy`, `terms`. Languages: `en` and `es` for each type. All 8 combinations present.

---

### 6. All 4 placeholder types present in every row

**Goal:** Confirm each seeded template can substitute site name, domain, email, and affiliate tag.

1. Run:
   ```bash
   source /home/daniel/monster/.env && \
   curl -s "https://iygjgkproeuhcvbrwloo.supabase.co/rest/v1/legal_templates?select=type,language,content" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -c "
   import sys,json
   rows = json.load(sys.stdin)
   for r in rows:
       c = r['content']
       ok = all(['{{site.name}}' in c, '{{site.domain}}' in c, '{{site.contact_email}}' in c, '{{site.affiliate_tag}}' in c])
       print(r['type']+'/'+ r['language'], '[OK]' if ok else '[MISSING]')
   "
   ```
2. **Expected:** All 8 lines print `[OK]`. Any `[MISSING]` is a failure.

---

### 7. `interpolateLegal` exported from legal.ts

**Goal:** Confirm the helper function exists and is exported.

1. Run: `grep "export function interpolateLegal" apps/generator/src/lib/legal.ts`
2. **Expected:** One line returned: `export function interpolateLegal(content: string, site: SiteInfo): string {`

---

### 8. All 5 placeholder substitutions present in legal.ts

**Goal:** Confirm all documented placeholders are handled.

1. Run: `cat apps/generator/src/lib/legal.ts`
2. **Expected:** The function body contains `.replaceAll` calls for all five: `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, `{{site.affiliate_tag}}`, `{{current_year}}`.

---

### 9. Admin build exits 0 (TemplateForm compiles)

**Goal:** Confirm T03's TemplateForm changes don't break the admin build.

1. Run: `pnpm --filter @monster/admin build 2>&1 | tail -5`
2. **Expected:** Exit 0. Output includes route table showing `/templates`, `/templates/[id]/edit`, `/templates/new` routes. No TypeScript errors.

---

### 10. TemplateForm Preview toggle and placeholder panel present in source

**Goal:** Confirm T03's UI additions are in the compiled component.

1. Run: `grep -E "isPreview|dangerouslySetInnerHTML|Available placeholders" apps/admin/src/app/\(dashboard\)/templates/TemplateForm.tsx`
2. **Expected:** At least 3 lines returned:
   - One or more lines with `isPreview`
   - One line with `dangerouslySetInnerHTML`
   - One line with `Available placeholders`

---

## Edge Cases

### E1. Seed migration idempotency

**Goal:** Re-running the seed migration should not duplicate rows.

1. Check current count: `curl ... legal_templates?select=id` — expect 8 rows.
2. Run: `cd packages/db && npx supabase db push --dry-run --db-url $SUPABASE_DB_URL`
3. **Expected:** "Remote database is up to date" — confirms the migration tracking sees the seed as already applied and would not re-run it.

---

### E2. Fixture build with `{{current_year}}` placeholder

**Goal:** The `{{current_year}}` placeholder substitutes correctly in the fixture (even though fixture uses fallback content).

The fallback content in `[legal].astro` doesn't contain `{{current_year}}`, but if it did, it would be substituted. This edge case is verified indirectly:

1. Run: `grep -r "{{current_year}}" apps/generator/.generated-sites/fixture/dist/`
2. **Expected:** No output (placeholder was either substituted or wasn't present in fallback content).

---

### E3. contact_email absent from fixture site.json

**Goal:** `interpolateLegal` handles absent `contact_email` gracefully (uses empty string, not undefined/error).

1. Confirm fixture has no contact_email: `cat apps/generator/src/data/fixture/site.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('contact_email:', d['site'].get('contact_email','NOT SET'))"`
2. **Expected:** `contact_email: NOT SET`
3. Run the build: `SITE_SLUG=fixture pnpm --filter @monster/generator build`
4. **Expected:** Exit 0 — `contact_email ?? ""` in `interpolateLegal` handles the absent field without TypeScript error or runtime exception.

---

## Failure Signals

- **Generator build fails with ENOENT**: `SITE_SLUG` env var is missing. Always run with `SITE_SLUG=fixture` prefix.
- **`grep "set:html"` returns < 3 hits**: One or more template variants still use plain-text render — check `[legal].astro` line numbers.
- **`grep -r "{{site\."` in dist returns any output**: A placeholder escaped substitution — check `interpolateLegal()` in `legal.ts` for missing `.replaceAll()` calls.
- **Legal page HTML contains raw `#` or `**` markdown syntax**: `marked()` is not being called or is returning the input unchanged — check `marked` import and v17 API compatibility.
- **DB returns < 8 rows**: Seed migration wasn't applied or was rolled back. Re-run `cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL`.
- **Admin build fails with "Cannot find module 'marked'"**: `marked` is not in `apps/admin/package.json`. Run `pnpm --filter @monster/admin add marked`.
- **TemplateForm shows blank preview on Preview click**: `await import('marked')` failed — check browser Network tab for the chunk request. DevTools console will show the import error.

---

## Requirements Proved By This UAT

- R001 (partial) — Legal pages now render as properly formatted HTML with site-specific values substituted. The static site generation pipeline is complete for legal page content. End-to-end proof (real site with assigned templates, live deployment) deferred to operator UAT.

## Not Proven By This UAT

- Live placeholder substitution with a real site (requires `GenerateSiteJob` to populate `legalTemplates` from `legal_template_assignments` table — this wiring is not yet implemented).
- TemplateForm Preview toggle visual behavior — requires a running admin server at `/templates/new` or `/templates/[id]/edit` in a browser.
- `{{current_year}}` substitution in an actual seeded template (fixture uses fallback content without this placeholder).

---

## Notes for Tester

- The fixture site uses **hardcoded fallback content** for legal pages — not the seeded DB templates. This is intentional and correct. The DB templates are consumed by `GenerateSiteJob` via `legal_template_assignments`. The pipeline is wired; the job-side wiring is deferred.
- The `privacidad` fixture page shows Spanish default text as a single `<p>` — this is the fallback content. It confirms the `set:html` + `marked` pipeline works (the fallback is plain text, which `marked` renders as `<p>` tags). A seeded template with markdown headings would produce `<h2>` etc.
- All generator builds in this environment require `SITE_SLUG=fixture` prefix — bare `pnpm --filter @monster/generator build` fails with ENOENT (KN008).
- `psql` is not installed. All DB verification uses the REST API with `$SUPABASE_SERVICE_ROLE_KEY` (KN010).
