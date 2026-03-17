# S05: Legal Templates Seed + Markdown Pipeline

**Goal:** Seed 8 legal template rows (4 types × ES + EN) with placeholder substitution markers, add `interpolateLegal()` helper and `marked` to the generator, update `[legal].astro` to render HTML with substituted placeholders, and add a Preview toggle + placeholder hint panel to `TemplateForm`.
**Demo:** Open the generator's fixture build — legal pages render `<h2>` headings and `<ul>` lists (not plain text). The legal page for a fixture site shows the actual site name instead of `{{site.name}}`. In the admin panel, the template editor shows a "Preview" button that toggles rendered HTML, and a hint panel listing all available placeholders.

## Must-Haves

- 8 `legal_templates` rows seeded: `privacy`, `terms`, `cookies`, `contact` × `es` and `en`, each with at least one `{{site.name}}` placeholder
- `apps/generator/src/lib/legal.ts` exports `interpolateLegal(content: string, site: SiteInfo): string`
- `marked` added to `apps/generator` package.json dependencies
- `[legal].astro` uses `set:html={marked(interpolateLegal(pageContent, site))}` (not plain text render)
- `TemplateForm` has a Preview toggle button (client-side `marked` dynamic import) showing rendered HTML
- `TemplateForm` has a placeholder hint panel listing the 5 available placeholders
- `pnpm --filter @monster/generator build` exits 0

## Verification

- `pnpm --filter @monster/generator build` exits 0
- Grep: `grep "set:html" apps/generator/src/pages/[legal].astro` returns a hit
- `grep "interpolateLegal" apps/generator/src/lib/legal.ts` returns a hit
- Failure path: `grep -r '{{site\.' apps/generator/dist` returns no hits (confirms all placeholders substituted at build time)
- Failure path: `grep "<h2\|<ul\|<p>" apps/generator/dist/default/privacidad/index.html` returns hits (confirms HTML rendering, not plain text)

## Tasks

- [x] **T01: Write `interpolateLegal()`, install `marked`, update `[legal].astro`** `est:45m`
  - Why: The generator currently renders legal content as plain text — D130 specifies markdown-to-HTML conversion at build time.
  - Files: `apps/generator/src/lib/legal.ts` (new), `apps/generator/src/pages/[legal].astro`, `apps/generator/package.json`
  - Do: Run `pnpm --filter @monster/generator add marked`. Create `apps/generator/src/lib/legal.ts`: export `interpolateLegal(content: string, site: SiteInfo): string` that calls `String.prototype.replaceAll` for each placeholder: `{{site.name}}` → `site.name`, `{{site.domain}}` → `site.domain`, `{{site.contact_email}}` → `site.contact_email ?? ''`, `{{site.affiliate_tag}}` → `site.affiliate_tag`, `{{current_year}}` → `new Date().getFullYear().toString()`. In `[legal].astro`: import `{ marked }` from `'marked'` and `{ interpolateLegal }` from `'../lib/legal'`. Replace the three `<p class="...">{ pageContent }</p>` render lines (one per template) with `<div set:html={marked(interpolateLegal(pageContent, site))} class="prose prose-sm max-w-none" />`. Run `pnpm --filter @monster/generator check` and `build` — fix any type errors.
  - Verify: `pnpm --filter @monster/generator build` exits 0; `grep "set:html" apps/generator/src/pages/[legal].astro` returns 3+ hits.
  - Done when: Generator build exits 0; `[legal].astro` uses `set:html` for all three template variants.

- [x] **T02: Write the 8 legal template seed migration** `est:30m`
  - Why: The `legal_templates` table is empty — no seed rows exist yet. The admin panel's "assign template" flow has no templates to assign.
  - Files: `packages/db/supabase/migrations/20260317000004_legal_templates_seed.sql`
  - Do: Write a migration that inserts 8 rows into `legal_templates`: `privacy/es`, `privacy/en`, `terms/es`, `terms/en`, `cookies/es`, `cookies/en`, `contact/es`, `contact/en`. Each row must include: `title` (e.g. "Política de Privacidad"), `type` (e.g. `privacy`), `language` (`es`/`en`), `content` (markdown text ~200 words per template with at least `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}` placeholders). Use `ON CONFLICT DO NOTHING` so the migration is idempotent. Apply via the project's pg-based migration pattern (KN001/KN002).
  - Verify: `psql $SUPABASE_DB_URL -c "SELECT type, language FROM legal_templates"` returns 8 rows.
  - Done when: 8 rows confirmed in DB.

- [ ] **T03: Add Preview toggle and placeholder hint panel to TemplateForm** `est:30m`
  - Why: D130 specifies the template editor hints markdown support; the admin user needs to see the rendered output and know which placeholders are available.
  - Files: `apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx`
  - Do: Add `isPreview: boolean` state. Add a "Preview" / "Edit" toggle `<Button>` near the content textarea. When `isPreview=true`: dynamically import `marked` (`await import('marked')`) on first toggle, render the substituted markdown as HTML in a `<div dangerouslySetInnerHTML={{ __html: ... }} className="prose prose-sm max-w-none border rounded p-4" />` — use a minimal `{ site: { name: 'Your Site Name', domain: 'yoursite.com', contact_email: 'contact@yoursite.com', affiliate_tag: 'yourtag-21' } }` mock for placeholder substitution in preview. Add a collapsible/always-visible hint panel below the textarea listing all 5 placeholders with descriptions: `{{site.name}}`, `{{site.domain}}`, `{{site.contact_email}}`, `{{site.affiliate_tag}}`, `{{current_year}}`.
  - Verify: `grep "isPreview\|Preview\|dangerouslySetInnerHTML" apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx` returns hits; `pnpm --filter @monster/admin build` exits 0.
  - Done when: TemplateForm renders toggle and hint panel; build exits 0.

## Observability / Diagnostics

### Runtime Signals
- **Markdown rendering failure:** If `marked()` throws or returns empty string, the legal page will render an empty `<div>` — visible as a blank content area in the browser. Check the Astro build log for unhandled promise rejections from the `[legal].astro` prerender phase.
- **Placeholder substitution:** Log output from `pnpm --filter @monster/generator build` will show any TypeScript errors if `SiteInfo` is missing required fields. Remaining unsubstituted placeholders (literal `{{site.name}}` in rendered HTML) signal a mismatch between `interpolateLegal()` keys and the `SiteInfo` shape.
- **DB seed verification:** `psql $SUPABASE_DB_URL -c "SELECT type, language, LEFT(content, 60) FROM legal_templates ORDER BY type, language"` inspects seed content without dumping full rows.

### Inspection Surfaces
- `grep "set:html" apps/generator/src/pages/[legal].astro` — confirms markdown pipeline is wired
- `grep "interpolateLegal" apps/generator/src/lib/legal.ts` — confirms helper is exported
- `pnpm --filter @monster/generator build` exit code 0 — end-to-end build validation
- Built `dist/<slug>/privacidad/index.html` — grep for `<h2>` or `<ul>` confirms HTML rendering (not plain text)

### Failure Visibility
- Build errors from `marked` type incompatibility (async vs sync API) surface immediately in `pnpm check` output
- Missing `contact_email` on `SiteInfo` will produce a TypeScript error pointing to `legal.ts`
- Template Preview (T03) renders with a mock site object — if placeholder keys mismatch, rendered HTML will still show `{{...}}` literals, making the gap obvious in the UI

### Redaction Constraints
- No secrets in legal template content — placeholders are safe to log and inspect
- `supabase_anon_key` is in `SiteInfo` but must not appear in legal template content or seed SQL

## Files Likely Touched

- `apps/generator/src/lib/legal.ts` (new)
- `apps/generator/src/pages/[legal].astro`
- `apps/generator/package.json`
- `packages/db/supabase/migrations/20260317000004_legal_templates_seed.sql`
- `apps/admin/src/app/(dashboard)/templates/TemplateForm.tsx`
