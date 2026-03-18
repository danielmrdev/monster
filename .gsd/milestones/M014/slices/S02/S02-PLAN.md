# S02: Generator Integration — Logo Path + Favicon Install

**Goal:** Wire S01's upload outputs into the generator: copy `logo.webp` and favicon files into `dist/` during site generation, and emit the correct `<link>` tags in `BaseLayout.astro`'s `<head>`.
**Demo:** Run `SITE_SLUG=fixture pnpm --filter @monster/generator build` against a fixture that includes `customization.logoUrl` and `customization.faviconDir` → `dist/` contains `logo.webp` and `favicon.ico` at the root, and `dist/index.html` has `<link rel="manifest" href="/site.webmanifest">` and `<link rel="icon" href="/favicon.ico">`.

## Must-Haves

- `generate-site.ts` copies `public/uploads/sites/[id]/logo.webp` → `dist/logo.webp` when `customization.logoUrl` is set (skip gracefully if source doesn't exist)
- `generate-site.ts` copies `public/uploads/sites/[id]/favicon/` → `dist/` root when `customization.faviconDir` is set (skip gracefully if source doesn't exist)
- `apps/generator/src/lib/data.ts` `SiteCustomization` interface has `faviconDir?: string`
- `BaseLayout.astro` emits four favicon `<link>` tags in `<head>` when `faviconDir` prop is set
- `Layout.astro` passes `faviconDir={site.customization.faviconDir}` to `BaseLayout`
- Fixture build passes and produces the expected `dist/` artifacts

## Proof Level

- This slice proves: integration
- Real runtime required: yes (fixture Astro build)
- Human/UAT required: no

## Verification

```bash
# 1. Build generator against fixture
SITE_SLUG=fixture pnpm --filter @monster/generator build

# 2. Logo in dist/
ls apps/generator/.generated-sites/fixture/dist/logo.webp

# 3. Favicon files in dist/ root
ls apps/generator/.generated-sites/fixture/dist/favicon.ico
ls apps/generator/.generated-sites/fixture/dist/site.webmanifest

# 4. <link> tags in generated HTML
grep 'rel="manifest"' apps/generator/.generated-sites/fixture/dist/index.html
grep 'rel="icon"' apps/generator/.generated-sites/fixture/dist/index.html
grep 'rel="apple-touch-icon"' apps/generator/.generated-sites/fixture/dist/index.html

# 5. TypeScript clean (generator)
pnpm --filter @monster/generator tsc --noEmit 2>&1 | tail -5
```

All five checks must pass (exit 0 / non-empty grep matches).

## Integration Closure

- Upstream surfaces consumed: `customization.logoUrl` (string `/uploads/sites/[id]/logo.webp`), `customization.faviconDir` (string `/uploads/sites/[id]/favicon`) — both written by S01 upload routes
- New wiring introduced: `generate-site.ts` post-build copy step; `BaseLayout.astro` favicon `<link>` tags; `Layout.astro` `faviconDir` prop pass-through; `SiteCustomization.faviconDir` in `data.ts`
- What remains before the milestone is truly usable end-to-end: S03–S06 slices (independent; this slice does not block them)

## Tasks

- [ ] **T01: Wire faviconDir into data.ts, generate-site.ts, BaseLayout.astro, and Layout.astro** `est:45m`
  - Why: Four files need coordinated changes to thread `faviconDir` from the DB customization JSON through to HTML output. This is all code; no build needed until T02 verifies it.
  - Files: `apps/generator/src/lib/data.ts`, `packages/agents/src/jobs/generate-site.ts`, `apps/generator/src/layouts/BaseLayout.astro`, `apps/generator/src/layouts/tsa/Layout.astro`
  - Do: See `T01-PLAN.md` for full steps.
  - Verify: `pnpm --filter @monster/generator tsc --noEmit` exits 0
  - Done when: TypeScript check exits 0 with no errors in any of the four modified files

- [ ] **T02: Update fixture and run end-to-end build verification** `est:20m`
  - Why: Proves the T01 code changes actually work at runtime — files copied, tags rendered.
  - Files: `apps/generator/src/data/fixture/site.json`
  - Do: See `T02-PLAN.md` for full steps.
  - Verify: Full S02 verification commands (fixture build + file checks + grep)
  - Done when: All five verification checks pass

## Files Likely Touched

- `apps/generator/src/lib/data.ts`
- `packages/agents/src/jobs/generate-site.ts`
- `apps/generator/src/layouts/BaseLayout.astro`
- `apps/generator/src/layouts/tsa/Layout.astro`
- `apps/generator/src/data/fixture/site.json`
