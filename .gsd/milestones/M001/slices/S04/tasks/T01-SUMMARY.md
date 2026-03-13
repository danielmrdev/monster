---
id: T01
parent: S04
milestone: M001
provides:
  - Next.js 15 + Tailwind v4 + shadcn installed and buildable in apps/admin
  - Minimal app shell (layout.tsx, page.tsx, globals.css) for build to pass
  - tsconfig with dom lib, jsx preserve, noEmit, isolatedModules, @/* alias
  - postcss.config.mjs with @tailwindcss/postcss (Tailwind v4 style)
  - components.json (shadcn v4 Radix/Base UI preset)
key_files:
  - apps/admin/package.json
  - apps/admin/tsconfig.json
  - apps/admin/next.config.ts
  - apps/admin/postcss.config.mjs
  - apps/admin/components.json
  - apps/admin/src/app/globals.css
  - apps/admin/src/app/layout.tsx
  - apps/admin/src/app/page.tsx
  - apps/admin/src/components/ui/button.tsx
  - apps/admin/src/lib/utils.ts
key_decisions:
  - shadcn v4 uses Base UI (@base-ui/react) not Radix primitives — "Radix" in shadcn 4.x is the Base UI preset name
  - shadcn 4.x requires tailwindcss explicitly as devDep and @/* path alias in tsconfig before init will succeed
  - shadcn --defaults flag skips interactive prompts; -y alone does not fully suppress them in v4
  - pnpm install always run from monorepo root; shadcn preserved workspace:* deps correctly
  - Next.js 15 auto-updated tsconfig during first build: added incremental, .next/types/**/*.ts include, exclude node_modules — kept as-is (harmless, correct)
patterns_established:
  - Tailwind v4: no tailwind.config.ts needed; globals.css uses @import "tailwindcss"; postcss uses @tailwindcss/postcss
  - shadcn v4 init: run with --defaults --cwd apps/admin from monorepo root; check workspace deps after
  - Build order: @monster/db build → @monster/shared build → @monster/admin build
observability_surfaces:
  - pnpm --filter @monster/admin build: exit code 0 = all pages compiled and type-checked
  - pnpm --filter @monster/admin exec tsc --noEmit: TypeScript clean check
duration: 25m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Install deps + scaffold Next.js build infrastructure

**Next.js 15 admin panel skeleton wired, built, and TypeScript-clean with shadcn v4 + Tailwind v4.**

## What Happened

Started from a stub `package.json` with only workspace deps and a placeholder `src/index.ts`. Added Next.js 15, React 19, @supabase/ssr@^0.9, Supabase JS, Tailwind v4 (`tailwindcss` + `@tailwindcss/postcss`), and @types/* to package.json. Updated tsconfig with dom lib, jsx preserve, module esnext, noEmit, isolatedModules, allowJs, skipLibCheck, and the `@/*` path alias required by shadcn.

Ran `pnpm install` from monorepo root. Wrote next.config.ts, postcss.config.mjs, deleted src/index.ts placeholder, then wrote minimal globals.css (`@import "tailwindcss"`), layout.tsx, and page.tsx.

shadcn init required two non-obvious fixes: (1) `tailwindcss` as an explicit devDep (not just via postcss plugin) and (2) the `@/*` path alias — without these, `shadcn init --defaults` fails validation. Used `--defaults` flag instead of `-y` to suppress interactive prompts in shadcn v4. shadcn installed Base UI (`@base-ui/react`), clsx, tailwind-merge, lucide-react, tw-animate-css, and added `src/components/ui/button.tsx` + `src/lib/utils.ts`. It also enriched globals.css with CSS custom properties (design tokens) and font setup. Workspace deps (`@monster/db`, `@monster/shared`) were preserved.

Re-ran `pnpm install` after shadcn added deps. Built db and shared packages first (producing dist/ artifacts). Then ran `pnpm --filter @monster/admin build` — succeeded on first attempt. TypeScript check also clean.

## Verification

```
pnpm --filter @monster/db build && pnpm --filter @monster/shared build   ✓ exit 0
pnpm --filter @monster/admin build                                        ✓ exit 0
pnpm --filter @monster/admin exec tsc --noEmit                           ✓ exit 0
grep "@monster/db" apps/admin/package.json                               ✓ present
grep "@monster/shared" apps/admin/package.json                           ✓ present
ls apps/admin/components.json                                            ✓ exists
grep "tailwindcss/postcss" apps/admin/postcss.config.mjs                 ✓ present
```

## Diagnostics

- Build output: `.next/` directory in apps/admin — route table shows `/` (123B) and `/_not-found`
- TypeScript errors: `pnpm --filter @monster/admin exec tsc --noEmit` — runs in <5s, clean
- shadcn component check: `ls apps/admin/src/components/ui/` — button.tsx present = shadcn wired correctly
- Workspace link check: `ls apps/admin/node_modules/@monster/` — db and shared symlinked

## Deviations

- `tailwindcss` added as explicit devDep (not in original task plan) — required by shadcn v4 init validation
- `@/* ` path alias added to tsconfig before shadcn init — required by shadcn v4 import alias validation
- shadcn v4 uses Base UI (@base-ui/react), not Radix UI — `shadcn/tailwind.css` import in globals.css (from shadcn package itself, not a separate dep)
- shadcn used `--defaults` flag (not `-y`) — `-y` in v4 still shows prompts; `--defaults` suppresses them
- Next.js 15 mutated tsconfig on first build (added `incremental: true`, `.next/types/**/*.ts`, `exclude: [node_modules]`) — kept as-is, harmless and correct

## Known Issues

None.

## Files Created/Modified

- `apps/admin/package.json` — all deps added; workspace links preserved; shadcn deps included
- `apps/admin/tsconfig.json` — full Next.js-compatible config with dom lib, jsx, noEmit, isolatedModules, @/* alias; Next.js 15 added incremental + .next/types includes
- `apps/admin/next.config.ts` — minimal NextConfig
- `apps/admin/postcss.config.mjs` — @tailwindcss/postcss plugin (Tailwind v4 style)
- `apps/admin/components.json` — shadcn v4 config (Radix/Base UI preset, Nova theme, @/ alias)
- `apps/admin/src/app/globals.css` — Tailwind v4 import + shadcn CSS tokens + dark mode vars
- `apps/admin/src/app/layout.tsx` — root layout with Geist font (shadcn updated from our minimal version)
- `apps/admin/src/app/page.tsx` — minimal placeholder
- `apps/admin/src/components/ui/button.tsx` — shadcn Button component (generated)
- `apps/admin/src/lib/utils.ts` — cn() utility (clsx + tailwind-merge)
- `apps/admin/src/index.ts` — deleted (was S03 placeholder)
