---
id: T02
parent: S01
milestone: M013
provides:
  - "@tailwindcss/typography installed and wired into BaseLayout.astro via @plugin directive"
key_files:
  - apps/generator/package.json
  - apps/generator/src/layouts/BaseLayout.astro
  - pnpm-lock.yaml
key_decisions:
  - Used @plugin CSS directive (Tailwind v4 approach) rather than vite plugin config — correct for this stack
patterns_established:
  - Tailwind v4 plugins are loaded with `@plugin "package-name"` inside the <style> block containing `@import "tailwindcss"`, not in astro.config.ts
observability_surfaces:
  - "grep \"@plugin\" apps/generator/src/layouts/BaseLayout.astro — confirms directive is present"
  - "grep \"@tailwindcss/typography\" apps/generator/package.json — confirms package version"
  - "SITE_SLUG=fixture pnpm --filter @monster/generator build — build still exits 0 (regression check)"
duration: 5m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T02: Install @tailwindcss/typography and configure in BaseLayout

**Installed `@tailwindcss/typography@^0.5.19` and added `@plugin "@tailwindcss/typography"` to BaseLayout.astro; build still exits 0 with 11 pages.**

## What Happened

Package installed cleanly via `pnpm add @tailwindcss/typography` in `apps/generator`. Added the `@plugin "@tailwindcss/typography"` directive on the line immediately after `@import "tailwindcss"` in the first `<style>` block of `BaseLayout.astro`. The `<style define:vars=...>` block and the analytics tracker injection block were not touched.

## Verification

All three verification commands passed:
1. `grep "@tailwindcss/typography" apps/generator/package.json` → shows `"^0.5.19"`
2. `grep "@plugin" apps/generator/src/layouts/BaseLayout.astro` → shows the directive
3. `SITE_SLUG=fixture pnpm --filter @monster/generator build` → exits 0, 11 pages built in 2.73s

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `grep "@tailwindcss/typography" apps/generator/package.json` | 0 | ✅ pass | <1s |
| 2 | `grep "@plugin" apps/generator/src/layouts/BaseLayout.astro` | 0 | ✅ pass | <1s |
| 3 | `SITE_SLUG=fixture pnpm --filter @monster/generator build` | 0 | ✅ pass | 2.73s |

## Diagnostics

To verify the plugin is active after any future BaseLayout edit:
```bash
grep "@plugin" apps/generator/src/layouts/BaseLayout.astro
# Expected: @plugin "@tailwindcss/typography";
```

To check the installed version:
```bash
grep "@tailwindcss/typography" apps/generator/package.json
```

To confirm `prose` classes compile correctly, build with fixture and inspect the generated CSS bundle — prose utility classes (`.prose`, `.prose-gray`, `.prose-sm`) should appear in the output if any page uses them. The current fixture pages don't yet use prose classes, so the plugin is wired up but its output is tree-shaken until prose markup exists in a template (introduced in S04).

**Failure shape:** If `@plugin "@tailwindcss/typography"` is absent from the `<style>` block, `prose prose-gray` classes produce no CSS output — a silent visual failure visible only at runtime, not at build time. `astro build` will still exit 0.

## Deviations

None. Plan followed exactly.

## Known Issues

None.

## Files Created/Modified

- `apps/generator/package.json` — Added `"@tailwindcss/typography": "^0.5.19"` to dependencies
- `apps/generator/src/layouts/BaseLayout.astro` — Added `@plugin "@tailwindcss/typography"` after `@import "tailwindcss"` in the first `<style>` block
- `pnpm-lock.yaml` — Updated with new package entries
