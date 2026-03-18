# S01: Data layer + new layout base

**Goal:** Close the three data gaps that block template work (`CategoryData.description`, `ProductData.original_price`, `@tailwindcss/typography`), replace the three old layout files with a single `layouts/tsa/Layout.astro`, strip the triple-dispatch from all four page files, and verify `SITE_SLUG=fixture pnpm build` + `astro check` both exit 0.
**Demo:** `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0 and produces 11 pages. `SITE_SLUG=fixture pnpm --filter @monster/generator check` exits 0 (was 8 errors). `ls apps/generator/src/layouts/` shows only `BaseLayout.astro` and `tsa/`.

## Must-Haves

- `CategoryData.description: string | null` in `apps/generator/src/lib/data.ts`
- `ProductData.original_price: number | null` in `apps/generator/src/lib/data.ts`
- Both fields present in `apps/generator/src/data/fixture/site.json`
- `@tailwindcss/typography` installed in `apps/generator` and loaded via `@plugin "@tailwindcss/typography"` in `BaseLayout.astro`
- `apps/generator/src/layouts/tsa/Layout.astro` exists with header (centered logo + horizontal cat nav + hamburger), `<main><slot /></main>`, and footer (affiliate disclosure + legal links + copyright)
- Classic, modern, and minimal layout directories deleted
- All four page files import only `TsaLayout` (no dispatch logic)
- `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
- `SITE_SLUG=fixture pnpm --filter @monster/generator check` exits 0

## Proof Level

- This slice proves: contract
- Real runtime required: yes (Astro build + check)
- Human/UAT required: no

## Verification

```bash
# Build exits 0, produces all 11 pages
SITE_SLUG=fixture pnpm --filter @monster/generator build

# Type-check exits 0 (pre-existing 8 errors must be gone)
SITE_SLUG=fixture pnpm --filter @monster/generator check

# Old layouts are gone
ls apps/generator/src/layouts/
# Expected output: BaseLayout.astro  tsa/

# Data fields confirmed in interfaces
grep -n "description\|original_price" apps/generator/src/lib/data.ts

# Typography plugin configured
grep "@plugin" apps/generator/src/layouts/BaseLayout.astro

# Diagnostic failure path: confirm astro check has 0 errors (non-zero = data gap or dispatch remains)
SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | grep -E "^(✓|error|warning)" | head -20
```

## Observability / Diagnostics

**Runtime signals introduced by this slice:**
- `astro check` exit code: 0 = all type errors resolved; non-zero = remaining interface mismatches
- `astro build` exit code and page count: `dist/` should contain 11 HTML files after a successful build
- `grep -n "description\|original_price" apps/generator/src/lib/data.ts` — confirms interface fields exist
- `grep 'tsa/classic' packages/shared/dist/index.js` — confirms shared bundle is up to date
- `ls apps/generator/src/layouts/` — confirms old layout directories are gone

**Failure visibility:**
- `astro check` prints structured TypeScript diagnostics: file path, line, error message. Data-gap errors look like `Type 'null' is not assignable to type 'string'` or `Property 'description' does not exist`.
- `astro build` ENOENT errors point to missing data files (wrong `SITE_SLUG` or missing fixture fields).
- If `tsa/classic` is absent from the shared dist, `astro check` will flag `Argument of type '"tsa/classic"' is not assignable to parameter of type 'SiteTemplate'`.

**Redaction constraints:** No secrets in fixture data. `supabase_url` and `supabase_anon_key` in fixture are empty strings (safe to commit). The analytics tracker bakes these at build time — production sites use real values from the database, not fixture values.

**Inspection surface:** After any task completes, run `SITE_SLUG=fixture pnpm --filter @monster/generator check 2>&1 | head -40` to get a quick diagnostics snapshot.

## Integration Closure

- Upstream surfaces consumed: `packages/shared/src/types/index.ts` (SiteTemplate type), `apps/generator/src/layouts/BaseLayout.astro` (extended with typography plugin)
- New wiring introduced: `layouts/tsa/Layout.astro` becomes the single layout consumed by all four page files
- What remains before the milestone is truly usable end-to-end: S02 (homepage + category content), S03 (product page), S04 (legal pages), S05 (link cloaking)

## Tasks

- [x] **T01: Add description and original_price to data interfaces and fixture** `est:30m`
  - Why: `CategoryData` and `ProductData` in the generator's `data.ts` are missing fields that the milestone spec requires; fixture `site.json` is missing `id`, `focus_keyword`, `supabase_url`, `supabase_anon_key`, `contact_email` on `site`, plus `description` on categories, `original_price` on products. These gaps cause `astro check` type errors and will cause template rendering issues in S02+.
  - Files: `apps/generator/src/lib/data.ts`, `apps/generator/src/data/fixture/site.json`, `packages/shared/src/types/index.ts`
  - Do: See T01-PLAN.md
  - Verify: `grep -n "description\|original_price" apps/generator/src/lib/data.ts` shows both fields; `SITE_SLUG=fixture pnpm --filter @monster/generator check` exits 0 or has ≤0 data-gap errors
  - Done when: Both interface fields exist in `data.ts`, fixture has all required fields, `packages/shared` `SiteTemplate` type is updated, `pnpm --filter @monster/shared build` exits 0

- [ ] **T02: Install @tailwindcss/typography and configure in BaseLayout** `est:20m`
  - Why: Legal pages already use `prose prose-gray` and `prose prose-sm` classes. Without the plugin these classes produce no output (silent fail). The typography plugin is required before the tsa layout and legal page templates can render prose correctly in S04.
  - Files: `apps/generator/package.json`, `apps/generator/src/layouts/BaseLayout.astro`
  - Do: See T02-PLAN.md
  - Verify: `grep "@plugin" apps/generator/src/layouts/BaseLayout.astro` shows the directive; `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0
  - Done when: `@tailwindcss/typography` in generator `package.json` dependencies, `@plugin "@tailwindcss/typography"` in `BaseLayout.astro` `<style>` block, build still exits 0

- [ ] **T03: Write tsa/Layout.astro, strip triple-dispatch from all four page files, delete old layouts** `est:1h`
  - Why: The entire milestone depends on a single polished layout replacing three mediocre ones. All four page files currently import three layouts and switch on `template_slug` — this dispatch code causes the 8 pre-existing `astro check` errors and is the primary target of S01.
  - Files: `apps/generator/src/layouts/tsa/Layout.astro` (new), `apps/generator/src/pages/index.astro`, `apps/generator/src/pages/categories/[slug].astro`, `apps/generator/src/pages/products/[slug].astro`, `apps/generator/src/pages/[legal].astro`, `apps/generator/src/layouts/classic/` (delete), `apps/generator/src/layouts/modern/` (delete), `apps/generator/src/layouts/minimal/` (delete)
  - Do: See T03-PLAN.md
  - Verify: Full slice verification suite (see Verification section above)
  - Done when: Build exits 0, `astro check` exits 0, `ls apps/generator/src/layouts/` shows only `BaseLayout.astro` and `tsa/`

## Files Likely Touched

- `apps/generator/src/lib/data.ts`
- `apps/generator/src/data/fixture/site.json`
- `packages/shared/src/types/index.ts`
- `apps/generator/package.json`
- `apps/generator/src/layouts/BaseLayout.astro`
- `apps/generator/src/layouts/tsa/Layout.astro` (new)
- `apps/generator/src/pages/index.astro`
- `apps/generator/src/pages/categories/[slug].astro`
- `apps/generator/src/pages/products/[slug].astro`
- `apps/generator/src/pages/[legal].astro`
- `apps/generator/src/layouts/classic/Layout.astro` (deleted)
- `apps/generator/src/layouts/modern/Layout.astro` (deleted)
- `apps/generator/src/layouts/minimal/Layout.astro` (deleted)
