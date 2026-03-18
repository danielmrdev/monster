---
estimated_steps: 8
estimated_files: 8
---

# T03: Write tsa/Layout.astro, strip triple-dispatch from all four page files, delete old layouts

**Slice:** S01 — Data layer + new layout base
**Milestone:** M013

## Description

This task replaces the three-layout triple-dispatch pattern with a single `layouts/tsa/Layout.astro`. It's the primary deliverable of S01 — all downstream slices (S02, S03, S04) depend on this layout existing.

**Current state (from T01/T02):**
- Four page files each import Classic, Modern, and Minimal layouts and switch on `site.template_slug`
- This dispatch is what causes the 8 pre-existing `astro check` errors (comparing `SiteTemplate` against `'tsa/modern'`/`'tsa/minimal'` which aren't in the type)
- Classic/Modern/Minimal layout files exist at `src/layouts/classic/`, `src/layouts/modern/`, `src/layouts/minimal/`

**What this task does:**
1. Creates `src/layouts/tsa/Layout.astro` — the single new layout
2. Updates all four page files to import only `TsaLayout` and remove all dispatch logic
3. Deletes the three old layout directories
4. Runs the full slice verification

**Skill to load:** Read `/home/daniel/.gsd/agent/skills/frontend-design/SKILL.md` before implementing the layout for design guidance.

## Steps

1. **Read the classic Layout.astro** before writing the new one — it's at `apps/generator/src/layouts/classic/Layout.astro`. The KN013 hamburger pattern it uses must be copied exactly into the new layout. The classic layout already implements the full header/footer/hamburger structure correctly; the new layout inherits this and adds the centered logo variant.

2. **Create `apps/generator/src/layouts/tsa/Layout.astro`** — Props: `{ title: string; site: SiteInfo; categories: CategoryData[]; metaDescription?: string }`. Structure:

   **Header** — Centered logo variant (different from classic's left-aligned name). The header should:
   - Be a `<header>` with `border-b bg-white shadow-sm`
   - Inside a `max-w-6xl` container: render the site logo (if `site.customization.logoUrl` is set, `<img src={logoUrl} alt={site.name} class="h-8">`, else `<a href="/" class="text-xl font-bold" style="color: var(--color-primary)">{site.name}</a>`)
   - Horizontal category nav links (`hidden md:flex gap-4`) exactly as in classic layout
   - Hamburger button with `id="nav-toggle-tsa"` exactly as in classic layout
   - Mobile dropdown div with `id="mobile-menu-tsa-dropdown"` exactly as in classic layout (separate sibling div per KN013)
   
   **Main** — `<main class="mx-auto max-w-6xl px-4 py-8"><slot /></main>`
   
   **Footer** — `<footer class="border-t border-gray-200 bg-gray-50 mt-12">` with:
   - Amazon affiliate disclosure text (same Spanish text as classic)
   - Legal links: `/privacidad/`, `/aviso-legal/`, `/cookies/`, `/contacto/`
   - Copyright line: `© {new Date().getFullYear()} {site.name}`
   
   **BaseLayout call** — Must pass: `title`, `lang={site.language}`, `metaDescription`, `customization={site.customization}`, `siteId={site.id}`, `supabaseUrl={site.supabase_url}`, `supabaseAnonKey={site.supabase_anon_key}`. All four args are required for analytics tracker substitution.
   
   **Hamburger script** — `<script is:inline>` with IDs `nav-toggle-tsa` and `mobile-menu-tsa-dropdown` (NOT the classic IDs — no ID collision). Copy the 8-line toggle pattern verbatim from classic, updating IDs.

3. **Update `apps/generator/src/pages/index.astro`** — Remove the three layout imports and the triple-dispatch JSX. Import `TsaLayout from "../layouts/tsa/Layout.astro"`. Keep all data loading (`loadSiteData`, `buildAffiliateUrl`, destructuring). The slot content should be a placeholder `<p>Homepage content — filled in S02.</p>` (S02 will replace this, but the file must be syntactically valid and import-free of old layouts).

4. **Update `apps/generator/src/pages/categories/[slug].astro`** — Same pattern: remove three layout imports + dispatch, import `TsaLayout`. Keep `getStaticPaths()` and all data loading. Slot content placeholder: `<p>Category content — filled in S02.</p>`.

5. **Update `apps/generator/src/pages/products/[slug].astro`** — Remove three layout imports + dispatch, import `TsaLayout`. Keep `getStaticPaths()` and all data loading. Slot content placeholder: `<p>Product content — filled in S03.</p>`.

6. **Update `apps/generator/src/pages/[legal].astro`** — Remove three layout imports + dispatch, import `TsaLayout`. Keep `getStaticPaths()` with all defaults/SLUG_TO_TYPE logic. The legal page already has a single render pattern per layout — after removing dispatch, use `TsaLayout` directly:
   ```astro
   <TsaLayout title={title} site={site} categories={categories}>
     <h1 class="text-2xl font-bold text-gray-800 mb-4">{pageTitle}</h1>
     <div set:html={marked(interpolateLegal(pageContent, site))} class="prose prose-sm max-w-none" />
   </TsaLayout>
   ```
   Keep all existing imports (`marked`, `interpolateLegal`) — they're still needed.

7. **Delete old layout directories** — Run:
   ```bash
   rm -rf apps/generator/src/layouts/classic
   rm -rf apps/generator/src/layouts/modern
   rm -rf apps/generator/src/layouts/minimal
   ```

8. **Run full slice verification** — Run the four verification commands from the slice plan:
   ```bash
   # Build must exit 0
   SITE_SLUG=fixture pnpm --filter @monster/generator build
   
   # Type check must exit 0 (8 pre-existing errors should be gone)
   SITE_SLUG=fixture pnpm --filter @monster/generator check
   
   # Old layouts gone
   ls apps/generator/src/layouts/
   
   # Data fields present
   grep -n "description\|original_price" apps/generator/src/lib/data.ts
   
   # Typography plugin present
   grep "@plugin" apps/generator/src/layouts/BaseLayout.astro
   ```

## Must-Haves

- [ ] `apps/generator/src/layouts/tsa/Layout.astro` created with correct props, header, main slot, footer, hamburger
- [ ] BaseLayout receives all six required props (title, lang, metaDescription, customization, siteId, supabaseUrl, supabaseAnonKey)
- [ ] Hamburger uses IDs `nav-toggle-tsa` and `mobile-menu-tsa-dropdown` (not classic IDs)
- [ ] All four page files import only `TsaLayout`, no old layout imports remain
- [ ] Classic, modern, minimal layout directories deleted
- [ ] `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- [ ] `SITE_SLUG=fixture pnpm --filter @monster/generator check` exits 0

## Verification

```bash
# Full slice verification
SITE_SLUG=fixture pnpm --filter @monster/generator build
SITE_SLUG=fixture pnpm --filter @monster/generator check
ls apps/generator/src/layouts/
# Expected: BaseLayout.astro  tsa/

grep -rn "ClassicLayout\|ModernLayout\|MinimalLayout" apps/generator/src/pages/
# Expected: no output (all old imports removed)

grep -n "TsaLayout" apps/generator/src/pages/index.astro apps/generator/src/pages/categories/[slug].astro apps/generator/src/pages/products/[slug].astro apps/generator/src/pages/[legal].astro
# Expected: one import line per file
```

## Inputs

- `apps/generator/src/layouts/classic/Layout.astro` — Copy hamburger pattern exactly (IDs, script structure, KN013)
- `apps/generator/src/layouts/BaseLayout.astro` — Props interface to match (title, lang, metaDescription, customization, siteId, supabaseUrl, supabaseAnonKey)
- T01 complete: `data.ts` has `description`/`original_price`, fixture is complete, `packages/shared` rebuilt
- T02 complete: `@tailwindcss/typography` installed and configured in `BaseLayout.astro`
- Frontend design skill: `/home/daniel/.gsd/agent/skills/frontend-design/SKILL.md`

## Expected Output

- `apps/generator/src/layouts/tsa/Layout.astro` — New unified TSA layout
- `apps/generator/src/pages/index.astro` — Single-branch, imports TsaLayout, placeholder slot content
- `apps/generator/src/pages/categories/[slug].astro` — Single-branch, imports TsaLayout, placeholder slot content
- `apps/generator/src/pages/products/[slug].astro` — Single-branch, imports TsaLayout, placeholder slot content
- `apps/generator/src/pages/[legal].astro` — Single-branch, imports TsaLayout, full legal rendering intact
- `apps/generator/src/layouts/classic/`, `modern/`, `minimal/` — deleted
- `SITE_SLUG=fixture pnpm build` exits 0; `astro check` exits 0
