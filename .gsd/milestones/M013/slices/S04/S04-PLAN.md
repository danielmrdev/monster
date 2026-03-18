# S04: Legal pages

**Goal:** Ensure legal pages render with prose typography, coherent header/footer, and correct legal content through the TsaLayout.
**Demo:** All four legal pages (`/privacidad/`, `/aviso-legal/`, `/cookies/`, `/contacto/`) render with `prose prose-sm` typography and the TsaLayout header/footer.

**Status: Complete — implemented in S01/T03.**

The `[legal].astro` page was fully implemented during S01/T03 as part of the triple-dispatch removal. It already uses:
- `TsaLayout` for header/footer
- `marked()` for Markdown rendering
- `interpolateLegal()` for site-variable substitution
- `class="prose prose-sm max-w-none"` for prose typography
- `@tailwindcss/typography` installed and configured in BaseLayout (S01/T02)

## Must-Haves

- [x] All four legal pages use TsaLayout (header/footer)
- [x] Content rendered through `marked()` with `prose prose-sm` class
- [x] `interpolateLegal()` substitutes site variables (name, domain, email) in content
- [x] Build exits 0, astro check exits 0

## Proof Level

- Contract verification: build + check exit 0; HTML grep confirms prose class and page titles

## Verification

```bash
# Build exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator build

# Type-check exits 0
SITE_SLUG=fixture pnpm --filter @monster/generator check

# Legal pages have prose class
grep -c "prose" apps/generator/.generated-sites/fixture/dist/privacidad/index.html
grep -c "prose" apps/generator/.generated-sites/fixture/dist/aviso-legal/index.html

# Legal pages have correct page titles
grep -c "Política de Privacidad" apps/generator/.generated-sites/fixture/dist/privacidad/index.html
grep -c "Aviso Legal" apps/generator/.generated-sites/fixture/dist/aviso-legal/index.html
grep -c "Política de Cookies" apps/generator/.generated-sites/fixture/dist/cookies/index.html
grep -c "Contacto" apps/generator/.generated-sites/fixture/dist/contacto/index.html
```

## Tasks

- [x] **T01: Legal pages — prose typography via TsaLayout (done in S01/T03)** `est:0m`
  - Note: Implemented as part of S01/T03 triple-dispatch removal. No additional work needed.

## Files Touched

- `apps/generator/src/pages/[legal].astro` — implemented in S01/T03
