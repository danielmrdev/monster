---
estimated_steps: 4
estimated_files: 2
---

# T02: Install @tailwindcss/typography and configure in BaseLayout

**Slice:** S01 — Data layer + new layout base
**Milestone:** M013

## Description

Legal pages (`[legal].astro`) already use `prose prose-gray` and `prose prose-sm` Tailwind classes, and the new tsa layout will use `prose` for legal page content in S04. Without `@tailwindcss/typography` installed, these classes produce no output — a silent failure that's invisible at build time but produces unstyled text at runtime.

In Tailwind v4 (which the generator uses), the typography plugin is loaded via a CSS `@plugin` directive, not a vite plugin in `astro.config.ts`. The plugin is loaded inside the `<style>` block that already has `@import "tailwindcss"` in `BaseLayout.astro`.

**Important:** Do NOT modify `BaseLayout.astro`'s analytics tracker injection logic (the `readFileSync` + `.replace()` block). Only add `@plugin "@tailwindcss/typography"` to the existing `<style>` block.

## Steps

1. **Install the package** — Run:
   ```bash
   cd apps/generator && pnpm add @tailwindcss/typography
   ```
   This adds it to `apps/generator/package.json` dependencies. The package version should be `^0.5.19` or later (supports Tailwind v4).

2. **Edit `apps/generator/src/layouts/BaseLayout.astro`** — Find the `<style>` block that contains `@import "tailwindcss"`. Add `@plugin "@tailwindcss/typography"` on the line immediately after `@import "tailwindcss"`. The result should look like:
   ```html
   <style>
     @import "tailwindcss";
     @plugin "@tailwindcss/typography";
   </style>
   ```
   Do not touch the `<style define:vars=...>` block below it.

3. **Verify the build still passes** — Run:
   ```bash
   SITE_SLUG=fixture pnpm --filter @monster/generator build
   ```
   Must exit 0 and produce 11 pages (same as baseline).

4. **Confirm plugin is in the file** — Run:
   ```bash
   grep "@plugin" apps/generator/src/layouts/BaseLayout.astro
   ```
   Must show: `@plugin "@tailwindcss/typography";`

## Must-Haves

- [ ] `@tailwindcss/typography` in `apps/generator/package.json` dependencies
- [ ] `@plugin "@tailwindcss/typography"` directive in `BaseLayout.astro` `<style>` block, immediately after `@import "tailwindcss"`
- [ ] Analytics tracker injection logic in `BaseLayout.astro` is unchanged
- [ ] `SITE_SLUG=fixture pnpm --filter @monster/generator build` exits 0

## Verification

```bash
# Confirm package installed
grep "@tailwindcss/typography" apps/generator/package.json

# Confirm directive in BaseLayout
grep "@plugin" apps/generator/src/layouts/BaseLayout.astro

# Confirm build still passes
SITE_SLUG=fixture pnpm --filter @monster/generator build
```

## Inputs

- `apps/generator/src/layouts/BaseLayout.astro` — The existing `<style>` block structure; read it before editing to find the exact `@import "tailwindcss"` line position
- T01 must be complete (fixture + shared rebuild) before this task runs, so `astro check` errors from data gaps don't confuse verification

## Expected Output

- `apps/generator/package.json` — `"@tailwindcss/typography": "^0.5.x"` in dependencies
- `apps/generator/src/layouts/BaseLayout.astro` — `@plugin "@tailwindcss/typography"` in the first `<style>` block
- `pnpm-lock.yaml` updated with the new package
