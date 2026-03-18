---
id: T01
parent: S05
milestone: M013
provides:
  - "apps/generator/src/lib/cloaking.ts — buildCloakUrl(slug) and buildCloakMap(products, market, tag)"
  - "apps/generator/src/pages/go/[slug].astro — static meta-refresh redirect page per product (noindex, canonical)"
  - "index.astro, categories/[slug].astro, products/[slug].astro — all affiliate CTAs now use /go/ cloaked URLs, zero direct Amazon URLs on content pages"
  - "Build produces 15 pages (11 content + 4 /go/ redirects)"
key_files:
  - apps/generator/src/lib/cloaking.ts
  - apps/generator/src/pages/go/[slug].astro
  - apps/generator/src/pages/index.astro
  - apps/generator/src/pages/categories/[slug].astro
  - apps/generator/src/pages/products/[slug].astro
key_decisions:
  - "Used HTML meta-refresh (not HTTP 302) for the /go/ redirect — static site constraint; HTTP 302 requires Caddy rules (deferred per milestone context)"
  - "Removed target='_blank' from all affiliate CTAs — /go/ page does its own redirect, opening in same tab is correct"
  - "noindex + nofollow on /go/ pages — redirect pages must not rank in search, only the product pages should"
  - "buildCloakUrl is template-agnostic: takes only productSlug, returns /go/{slug}/ — future templates reuse without change"
patterns_established:
  - "All affiliate CTAs across all page types use buildCloakUrl(product.slug) — never buildAffiliateUrl directly on content pages"
  - "buildAffiliateUrl is now only called from buildCloakMap (inside go/[slug].astro getStaticPaths) — single place where real Amazon URL is assembled"
observability_surfaces:
  - "grep 'href=\"https://www.amazon' dist/index.html — zero output = no direct affiliate URL leakage on content pages"
  - "grep -c 'href=\"/go/' dist/index.html — equals number of featured products"
  - "ls dist/go/ — one directory per product slug"
  - "grep 'http-equiv=\"refresh\"' dist/go/{slug}/index.html — confirms redirect page is correctly formed"
duration: ~20m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Link cloaking — cloaking.ts, /go/[slug].astro, swap all affiliate hrefs

**Built `cloaking.ts` module, `/go/[slug].astro` static redirect pages, and swapped all affiliate CTAs across three page files to use `/go/{slug}/` — zero direct Amazon URLs on content pages, build produces 15 pages, astro check exits 0 (0 hints).**

## What Happened

Created `apps/generator/src/lib/cloaking.ts` with two exports:
- `buildCloakUrl(productSlug)` — returns `/go/{slug}/`, root-relative with trailing slash
- `buildCloakMap(products, market, tag)` — builds the `slug → amazonUrl` map used by the redirect page's `getStaticPaths()`

Created `apps/generator/src/pages/go/[slug].astro` — a plain HTML page (no TsaLayout, intentionally) with:
- `meta name="robots" content="noindex, nofollow"` — redirect pages must not rank
- `meta http-equiv="refresh" content="0; url={affiliateUrl}"` — immediate redirect
- `link rel="canonical" href={affiliateUrl}` — points to Amazon as canonical

Updated all three content pages (`index.astro`, `categories/[slug].astro`, `products/[slug].astro`):
- Removed `buildAffiliateUrl` import
- Removed `MARKET`/`TAG` vars from frontmatter (no longer needed)
- Replaced affiliate href with `buildCloakUrl(p.slug)` / `buildCloakUrl(product.slug)`
- Removed `target="_blank"` — `/go/` page handles its own redirect

`astro check` returns 0 errors/warnings/hints across 11 files — cleaner than ever.

## Verification

```
SITE_SLUG=fixture pnpm build              → exit 0, 15 pages (11 + 4 /go/)
SITE_SLUG=fixture pnpm check              → exit 0, 0 errors, 0 warnings, 0 hints
grep 'href="https://www.amazon' dist/index.html    → OK (no match)
grep 'href="https://www.amazon' dist/categories/…  → OK (no match)
grep 'href="https://www.amazon' dist/products/…    → OK (no match)
grep -c 'href="/go/' dist/index.html               → 4 (one per featured product)
grep -c 'href="/go/' dist/categories/freidoras-de-aire/index.html → 3
grep 'meta-refresh' → 0; url=https://www.amazon.es/dp/B08Z7RGQPK?tag=test-fixture-20
ls dist/go/                               → 4 slug directories
```

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ 15 pages | 2.57s |
| 2 | `SITE_SLUG=fixture pnpm --filter @monster/generator check` | 0 | ✅ 0 errors/hints | 6.6s |
| 3 | `grep 'href="https://www.amazon' dist/index.html` | 1 (no match) | ✅ OK | — |
| 4 | `grep 'href="https://www.amazon' dist/categories/.../index.html` | 1 (no match) | ✅ OK | — |
| 5 | `grep 'href="https://www.amazon' dist/products/.../index.html` | 1 (no match) | ✅ OK | — |
| 6 | `grep -c 'href="/go/' dist/index.html` | — | ✅ 4 hits | — |
| 7 | `grep 'http-equiv="refresh"' dist/go/philips-hd9252-90/index.html` | — | ✅ correct URL | — |
| 8 | `ls dist/go/` | — | ✅ 4 directories | — |

## Diagnostics

```bash
# Confirm no direct Amazon URL leakage on any content page
grep 'href="https://www.amazon' apps/generator/.generated-sites/fixture/dist/index.html && echo "FAIL" || echo "OK"
grep 'href="https://www.amazon' apps/generator/.generated-sites/fixture/dist/categories/freidoras-de-aire/index.html && echo "FAIL" || echo "OK"
grep 'href="https://www.amazon' apps/generator/.generated-sites/fixture/dist/products/philips-hd9252-90/index.html && echo "FAIL" || echo "OK"

# Confirm redirect pages are correctly formed
grep 'http-equiv="refresh"' apps/generator/.generated-sites/fixture/dist/go/philips-hd9252-90/index.html

# Count /go/ pages
ls apps/generator/.generated-sites/fixture/dist/go/ | wc -l  # must equal product count
```

## Deviations

- Removed `target="_blank"` from all affiliate CTAs (was present in S02/S03 implementation). The `/go/` page is a redirect — opening in same tab is correct behaviour. This is an intentional improvement, not a regression.

## Known Issues

- HTTP 302 redirect (via Caddy) is more performant than meta-refresh but requires server config — deferred per milestone spec. The meta-refresh approach is correct for the current static-only constraint.

## Files Created/Modified

- `apps/generator/src/lib/cloaking.ts` — new module (buildCloakUrl, buildCloakMap)
- `apps/generator/src/pages/go/[slug].astro` — new redirect page
- `apps/generator/src/pages/index.astro` — affiliate CTAs swapped to buildCloakUrl
- `apps/generator/src/pages/categories/[slug].astro` — affiliate CTAs swapped to buildCloakUrl
- `apps/generator/src/pages/products/[slug].astro` — affiliate CTA swapped to buildCloakUrl
- `.gsd/milestones/M013/slices/S05/S05-PLAN.md` — created
