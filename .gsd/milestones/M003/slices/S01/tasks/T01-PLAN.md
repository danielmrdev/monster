---
estimated_steps: 5
estimated_files: 5
---

# T01: Scaffold `apps/generator` as a real Astro 5 + Tailwind v4 project

**Slice:** S01 — Astro Templates + Build Pipeline
**Milestone:** M003

## Description

`apps/generator` is a skeletal placeholder right now (`package.json` with no scripts, `tsconfig.json` only). This task installs the full Astro 5 + Tailwind v4 dep tree, writes a minimal working Astro project, and proves that `build()` produces real HTML output. Every subsequent task depends on this foundation being solid — nothing in T02/T03 is salvageable if `build()` is broken here.

The `outDir` strategy is critical (D035, D036): each build targets `.generated-sites/<slug>/dist` using `SITE_SLUG` env var, so a single Astro project root serves all sites without directory conflicts. Confirm this works before writing any template logic.

## Steps

1. Add Astro 5, `@astrojs/tailwind`, `tailwindcss` (v4), `sharp`, and TypeScript as deps in `apps/generator/package.json`. Add `astro build` and `astro check` as package scripts.
2. Write `apps/generator/astro.config.ts`: `output: 'static'`, `outDir: \`.generated-sites/\${process.env.SITE_SLUG ?? 'default'}/dist\``, `integrations: [tailwind()]`.
3. Write minimal `apps/generator/src/layouts/BaseLayout.astro` — accepts `{ title, customization }` props, renders `<html>`, `<head>` (meta charset + title), `<body>` with a `<slot />`. Apply CSS custom properties via `<style define:vars={{ primary: customization?.primaryColor ?? '#4f46e5', accent: customization?.accentColor ?? '#7c3aed', font: customization?.fontFamily ?? 'sans-serif' }}>` and a `:root` block referencing `--primary`, `--accent`, `--font`.
4. Write `apps/generator/src/pages/index.astro` — imports `BaseLayout`, renders `<h1>Hello from {site.name}</h1>` stub (hard-coded site name for now; real data injection is T02). Just enough to prove the page compiles.
5. Run `SITE_SLUG=test pnpm --filter @monster/generator build` from monorepo root. Confirm `apps/generator/.generated-sites/test/dist/index.html` exists and contains `<html>`.

## Must-Haves

- [ ] `pnpm install` succeeds with all Astro/Tailwind deps resolved
- [ ] `astro.config.ts` uses `SITE_SLUG` env var to set `outDir` — different slugs produce different output dirs
- [ ] `BaseLayout.astro` wires `define:vars` for three CSS custom properties
- [ ] `pnpm --filter @monster/generator build` exits 0 and produces real HTML

## Verification

- `SITE_SLUG=test pnpm --filter @monster/generator build` exits 0
- `[ -f apps/generator/.generated-sites/test/dist/index.html ] && echo "OK"` prints `OK`
- `grep -q "<html" apps/generator/.generated-sites/test/dist/index.html && echo "HTML valid"`

## Inputs

- `apps/generator/package.json` — current skeleton (name + version only), needs full dep set added
- `apps/generator/tsconfig.json` — already extends `../../tsconfig.base.json` with `moduleResolution: Bundler`; keep as-is

## Expected Output

- `apps/generator/package.json` — full dep set with `astro`, `@astrojs/tailwind`, `tailwindcss`, `sharp`, scripts for `build` and `check`
- `apps/generator/astro.config.ts` — working Astro config with env-var-driven `outDir`
- `apps/generator/src/layouts/BaseLayout.astro` — `define:vars` wired CSS custom properties
- `apps/generator/src/pages/index.astro` — compiling stub page
- `.generated-sites/test/dist/index.html` — proof that Astro build completes

## Observability Impact

**Signals changed by this task:**
- `apps/generator/.generated-sites/<slug>/dist/` — build output directory. Exists and contains `index.html` on success; absent on failure or when `SITE_SLUG` is not set (falls back to `default/dist/`).
- `astro build` exit code — 0 on success, non-zero on compile/config errors.

**How a future agent inspects this task:**
- Run `SITE_SLUG=test pnpm --filter @monster/generator build` — success/failure is self-evident from exit code and Astro's stdout (`[build] Complete!` vs error stack trace).
- Check `apps/generator/.generated-sites/test/dist/index.html` exists and contains `<html`.
- Verify different slugs produce distinct directories: `ls apps/generator/.generated-sites/` should show one dir per build invocation.

**Failure state visibility:**
- Astro compilation errors surface as TypeScript/Vite errors in stdout with file:line references.
- Missing `SITE_SLUG` env var falls back to `default` slug (not a silent failure — the dir name reveals the issue).
- Missing deps cause `astro build` to error immediately with a clear module-not-found message.
- No state written to DB; all diagnostic surface is filesystem + stdout.
