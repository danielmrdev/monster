---
id: T01
parent: S01
milestone: M003
provides:
  - Astro 6 + Tailwind v4 project scaffold in apps/generator
  - astro.config.ts with SITE_SLUG-driven outDir (D041)
  - BaseLayout.astro with define:vars CSS custom properties
  - Stub index.astro proving compilation works
  - Verified build output at .generated-sites/test/dist/index.html
key_files:
  - apps/generator/package.json
  - apps/generator/astro.config.ts
  - apps/generator/src/layouts/BaseLayout.astro
  - apps/generator/src/pages/index.astro
  - apps/generator/.generated-sites/test/dist/index.html
key_decisions:
  - D043: Astro 6 + @tailwindcss/vite used instead of Astro 5 + @astrojs/tailwind (plan referenced legacy integration)
  - D041: SITE_SLUG env var drives outDir — confirmed different slugs produce different dist dirs
patterns_established:
  - Tailwind v4 in Astro uses @tailwindcss/vite as a vite.plugins[] entry, not an integration
  - astro.config.ts reads SITE_SLUG at module load time — worker must set process.env.SITE_SLUG before importing/calling build()
  - BaseLayout.astro define:vars passes CSS custom properties through to inline style on <body>
observability_surfaces:
  - apps/generator/.generated-sites/<slug>/dist/ — exists on success, absent on failure
  - astro build stdout — "[build] Complete!" on success, TypeScript/Vite error on failure
  - ls apps/generator/.generated-sites/ — reveals which slugs have been built
duration: ~20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Scaffold `apps/generator` as a real Astro 6 + Tailwind v4 project

**Astro 6 builds `index.html` with CSS custom properties; `SITE_SLUG` env var drives distinct output dirs per site.**

## What Happened

Replaced the empty `apps/generator` stub with a real Astro 6 project. Updated `package.json` with `astro@^6.0.4`, `@tailwindcss/vite@^4.2.1`, `tailwindcss@^4.2.1`, and `sharp@^0.33.0`. Wrote `astro.config.ts` using `@tailwindcss/vite` as a Vite plugin (not the legacy `@astrojs/tailwind` integration which only supports Tailwind v3). `outDir` reads `SITE_SLUG` env var at config load time.

`BaseLayout.astro` uses `define:vars` to pass three CSS custom properties (`--primary`, `--accent`, `--font`) inline on `<body>`. `index.astro` imports it and renders a stub page. Build succeeded on first attempt — `[build] Complete!` in 1.94s.

Disabled Astro telemetry to prevent interactive prompts in automated/CI builds.

## Verification

```bash
# Install
pnpm install --filter @monster/generator  →  Done in 5.3s, exit 0

# Build
SITE_SLUG=test pnpm --filter @monster/generator build  →  exit 0, "[build] Complete!"
# Output dir:  apps/generator/.generated-sites/test/dist/

# File exists
[ -f apps/generator/.generated-sites/test/dist/index.html ]  →  OK

# Contains <html
grep -q "<html" apps/generator/.generated-sites/test/dist/index.html  →  HTML valid

# Content present
grep "Hello from Monster Site" ...index.html  →  found, including CSS vars in style attr

# Slug isolation
SITE_SLUG=another-site pnpm --filter @monster/generator build
ls apps/generator/.generated-sites/  →  another-site  test
```

All task must-haves confirmed.

## Diagnostics

- Build output: `apps/generator/.generated-sites/<slug>/dist/index.html` — existence confirms successful build for that slug
- Missing `SITE_SLUG`: falls back to `default` slug (visible from directory name, not a silent failure)
- Astro stdout always prints `[build] directory: <path>` — confirms which slug was targeted
- Compile errors surface as TypeScript/Vite stack traces with file:line references

## Deviations

- **Astro version:** Plan says "Astro 5" but Astro 6.0.4 is current stable. Used 6.x (D043).
- **Tailwind integration:** Plan says `@astrojs/tailwind` but that integration is Tailwind v3 only. Used `@tailwindcss/vite` as a Vite plugin instead — this is the correct approach for Tailwind v4 in any Vite-based project.
- **`integrations: []` removed:** `astro.config.ts` has no `integrations` array since @tailwindcss/vite goes under `vite.plugins`, not `integrations`.

## Known Issues

- `sharp` build scripts disabled by pnpm trust policy (warning at install time). Sharp is optional for image optimization — Astro falls back to its built-in image service. T02+ will need `pnpm approve-builds` or `pnpm-trusted-scripts` config if image optimization is required during build.

## Files Created/Modified

- `apps/generator/package.json` — full dep set: astro, @tailwindcss/vite, tailwindcss, sharp, scripts for build/check/dev
- `apps/generator/astro.config.ts` — static output, SITE_SLUG-driven outDir, Tailwind v4 via vite plugin
- `apps/generator/src/layouts/BaseLayout.astro` — define:vars CSS custom properties (primary, accent, font)
- `apps/generator/src/pages/index.astro` — stub page proving compilation
- `apps/generator/.generated-sites/test/dist/index.html` — proof artifact (gitignored)
- `.gsd/DECISIONS.md` — appended D043 (Astro 6 + @tailwindcss/vite decision)
- `.gsd/milestones/M003/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
