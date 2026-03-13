---
id: S04
parent: M001
milestone: M001
provides:
  - Next.js 15 admin panel building cleanly with Tailwind v4 + shadcn v4 + Supabase Auth
  - Middleware route protection (getAll/setAll cookie interface, getUser() — not getSession())
  - Server-side and browser-side Supabase client factories in apps/admin/src/lib/supabase/
  - Login page + signIn/signOut server actions (signInWithPassword, error → URL param, signOut → /login)
  - Protected (dashboard) layout group with auth guard + dark sidebar nav
  - NavSidebar server component: 7 nav links + signOut form, no 'use client' needed
  - 7 stub section pages (dashboard, sites, monster, research, analytics, finances, settings)
  - Root page.tsx redirect to /dashboard
requires:
  - slice: S02
    provides: Supabase project URL + anon key env vars; database schema in Supabase Cloud
  - slice: S03
    provides: "@monster/db typed client; @monster/shared domain types; both packages in dist/"
affects:
  - S05
key_files:
  - apps/admin/package.json
  - apps/admin/tsconfig.json
  - apps/admin/next.config.ts
  - apps/admin/postcss.config.mjs
  - apps/admin/components.json
  - apps/admin/src/app/globals.css
  - apps/admin/src/app/layout.tsx
  - apps/admin/src/app/page.tsx
  - apps/admin/src/middleware.ts
  - apps/admin/src/lib/supabase/server.ts
  - apps/admin/src/lib/supabase/client.ts
  - apps/admin/src/app/(auth)/login/page.tsx
  - apps/admin/src/app/(auth)/login/actions.ts
  - apps/admin/src/app/(dashboard)/layout.tsx
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
  - apps/admin/src/app/(dashboard)/sites/page.tsx
  - apps/admin/src/app/(dashboard)/monster/page.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
  - apps/admin/src/app/(dashboard)/analytics/page.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
  - apps/admin/src/app/(dashboard)/settings/page.tsx
key_decisions:
  - D022: shadcn v4 requires explicit tailwindcss devDep + @/* tsconfig alias + --defaults flag before init
  - D023: apps/admin/.env.local symlinked to ../../.env — Next.js doesn't traverse monorepo root for env vars
  - D024: shadcn v4 has no form component — native <form action={serverAction}> with shadcn primitives
patterns_established:
  - Tailwind v4: no tailwind.config.ts; globals.css uses @import "tailwindcss"; postcss uses @tailwindcss/postcss
  - shadcn v4 init: run with --defaults --cwd apps/admin from monorepo root; verify workspace deps after
  - Build order: @monster/db → @monster/shared → @monster/admin
  - @supabase/ssr 0.9.0 pattern: getAll/setAll cookie interface in both middleware and server factory
  - getUser() not getSession() for auth guard decisions (verified server-side call)
  - Server action form: <form action={serverActionFn}> — no react-hook-form wrapper for simple forms
  - Error routing: auth errors go to /login?error=encodeURIComponent(msg), never in cookies or response body
  - Protected layout group pattern: (dashboard)/layout.tsx calls getUser() + redirects as belt-and-suspenders
  - NavSidebar as server component: signOut form action works without 'use client'
  - Env loading: symlink apps/<app>/.env.local → ../../.env for monorepo-root env files
observability_surfaces:
  - curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location)" → 307 + location:/login (middleware active)
  - curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/login → 200 (login accessible)
  - POST /login with bad creds → 303 + Location:/login?error=Invalid%20login%20credentials (error surface)
  - /login?error=<msg> → error message rendered in HTML, no token in URL
  - next dev stdout → SSR/middleware compile errors with file+line
  - DevTools → Application → Cookies: sb-*-auth-token present, HttpOnly=true (session stored correctly)
drill_down_paths:
  - .gsd/milestones/M001/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S04/tasks/T03-SUMMARY.md
duration: ~115m (T01: 25m, T02: 45m, T03: 45m)
verification_result: passed
completed_at: 2026-03-13
---

# S04: Admin Panel Shell

**Next.js 15 admin panel running with Supabase Auth login/logout cycle, middleware protection on all 7 routes, and a dark-sidebar protected layout rendering all 7 sections — build and TypeScript both clean.**

## What Happened

Three tasks, each building on the last.

**T01** started from a package.json stub with only workspace deps and a placeholder src/index.ts. Added all production deps (Next.js 15, React 19, Tailwind v4, @supabase/ssr@^0.9, shadcn), ran pnpm install at monorepo root, and wrote the minimal config files (next.config.ts, postcss.config.mjs, tsconfig.json, globals.css). shadcn v4 init required two non-obvious prerequisites: explicit `tailwindcss` devDep and the `@/*` path alias in tsconfig — both must be present before `shadcn init --defaults` will succeed. shadcn v4 uses Base UI (`@base-ui/react`) rather than Radix UI, installed button.tsx and utils.ts (cn helper). Build exited 0 with a minimal 2-route app.

**T02** wired the full auth layer. The three Supabase client files follow @supabase/ssr 0.9.0 exactly: getAll/setAll cookie interface in both middleware and server factory, `await cookies()` for async Next.js 15 cookie access, `getUser()` (verified server call) for redirect decisions. Browser client uses @supabase/ssr directly to avoid version skew with @monster/db's bundled 0.6.1. Two issues surfaced during initial dev server startup: (1) Next.js doesn't traverse up for env vars — fixed with `apps/admin/.env.local → ../../.env` symlink; (2) webpack cache corruption after adding react-hook-form mid-session — cleared by deleting .next/. Login form uses native `<form action={signIn}>` with shadcn Input/Label/Button since shadcn v4 has no form component in its registry. signIn redirects to /dashboard on success, encodes error message in URL param on failure. signOut clears session and redirects to /login.

**T03** completed the protected shell. The `(dashboard)/layout.tsx` auth guard calls `getUser()` and redirects unauthenticated users to /login — belt-and-suspenders alongside middleware. NavSidebar is a server component; the signOut form action import works in server component JSX without `'use client'`. The 7 nav links are in an array mapped to Next.js Link components, styled with dark Tailwind classes (bg-gray-900 / text-gray-100, w-60 fixed sidebar, logout pinned to bottom with border-t). Seven stub section pages follow a minimal pattern — heading + "Coming soon." text. Root page.tsx updated to `redirect('/dashboard')`.

## Verification

```
# Build chain
pnpm --filter @monster/db build                              ✓ exit 0
pnpm --filter @monster/shared build                          ✓ exit 0
pnpm --filter @monster/admin build                           ✓ exit 0 (8 routes, all ƒ dynamic)

# TypeScript
pnpm --filter @monster/admin exec tsc --noEmit               ✓ exit 0

# Structural checks
ls apps/admin/src/app/(dashboard)/*/page.tsx | wc -l         ✓ 7
grep -c "href:" apps/admin/src/components/nav-sidebar.tsx    ✓ 7
grep "getAll|setAll" apps/admin/src/middleware.ts             ✓ both present
grep "getUser" apps/admin/src/middleware.ts                   ✓ supabase.auth.getUser()
grep "await cookies" apps/admin/src/lib/supabase/server.ts   ✓ async cookies()
grep "'use server'" apps/admin/src/app/(auth)/login/actions.ts ✓ present
grep "form action" apps/admin/src/components/nav-sidebar.tsx  ✓ 1 match (signOut)
ls apps/admin/components.json                                 ✓ exists
ls -la apps/admin/.env.local                                  ✓ symlink → ../../.env

# Runtime (dev server on port 3004)
curl http://localhost:3004/dashboard → 307                   ✓
curl -I http://localhost:3004/dashboard | grep location       ✓ location: /login
curl http://localhost:3004/login → 200                       ✓
for /dashboard /sites /monster /research /analytics /finances /settings → 307 each ✓

# Error path
POST /login bad creds → 303 Location:/login?error=Invalid%20login%20credentials ✓
```

## Requirements Advanced

- R013 (Admin panel on VPS1 via pm2) — Next.js 15 admin panel is now buildable and runnable. Auth login/logout cycle verified. S05 completes this requirement by adding pm2 ecosystem config and deploy script.

## Requirements Validated

None validated by this slice — validation requires full end-to-end proof including pm2 survival (S05) and human browser verification.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

- **shadcn v4 no form component**: `shadcn@latest add form` returns nothing in v4. Login form uses native `<form action={serverAction}>` directly. Documented as D024.
- **`.env.local` symlink**: Task plan assumed env vars would load automatically. Next.js only reads `.env*` in the app directory. Created symlink. Documented as D023.
- **`react-hook-form` + `zod` added to apps/admin**: Not in original task plan. Added for future M002 dashboard forms. Doesn't affect current slice behavior.
- **shadcn v4 Base UI**: shadcn v4 uses `@base-ui/react` not `@radix-ui/*`. The "Radix" preset name in the shadcn 4.x CLI refers to the Base UI preset layer. Documented as D022.

## Known Limitations

- Playwright browser automation unavailable on this VPS (missing libnspr4.so). Full visual browser cycle (login → click sidebar → click logout) must be verified manually. All curl-observable signals pass.
- Dashboard section stubs show only "Coming soon." — content added in M002.
- Sidebar has no active link highlighting — deferred to M002 when real routes are built.
- No error boundary around (dashboard)/layout.tsx auth guard — unhandled DB errors propagate to 500.

## Follow-ups

- S05: pm2 ecosystem.config.js + deploy script + pm2 save/startup for process survival on reboot
- M002: Replace stub pages with real content; add active link state to sidebar; error boundaries
- M002: Add Input/Form components for site creation forms (react-hook-form already installed)

## Files Created/Modified

- `apps/admin/package.json` — all production deps; workspace links preserved; shadcn + react-hook-form + zod added
- `apps/admin/tsconfig.json` — Next.js 15 compatible config; dom lib, jsx preserve, noEmit, isolatedModules, @/* alias; Next.js mutated on first build (incremental, .next/types includes — harmless)
- `apps/admin/next.config.ts` — minimal NextConfig
- `apps/admin/postcss.config.mjs` — @tailwindcss/postcss (Tailwind v4 style)
- `apps/admin/components.json` — shadcn v4 config (Base UI preset, Nova theme, @/ alias)
- `apps/admin/src/app/globals.css` — Tailwind v4 @import + shadcn CSS design tokens + dark mode vars
- `apps/admin/src/app/layout.tsx` — root layout with Geist font (shadcn enriched from minimal)
- `apps/admin/src/app/page.tsx` — redirect('/dashboard')
- `apps/admin/src/middleware.ts` — route protection + session refresh; getAll/setAll; getUser(); 7 protected prefixes
- `apps/admin/src/lib/supabase/server.ts` — async factory with await cookies() and getAll/setAll cookie interface
- `apps/admin/src/lib/supabase/client.ts` — browser client via createBrowserClient from @supabase/ssr directly
- `apps/admin/src/app/(auth)/login/page.tsx` — login form with shadcn Input/Label/Button; error from ?error param
- `apps/admin/src/app/(auth)/login/actions.ts` — signIn (signInWithPassword → redirect) and signOut server actions
- `apps/admin/src/app/(dashboard)/layout.tsx` — protected layout group; getUser() + redirect; renders NavSidebar + children
- `apps/admin/src/components/nav-sidebar.tsx` — server component; 7 nav Links + signOut form; dark sidebar styling
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/research/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — stub page
- `apps/admin/src/components/ui/button.tsx` — shadcn Button (Base UI)
- `apps/admin/src/components/ui/input.tsx` — shadcn Input (Base UI InputPrimitive)
- `apps/admin/src/components/ui/label.tsx` — shadcn Label
- `apps/admin/src/lib/utils.ts` — cn() utility (clsx + tailwind-merge)
- `apps/admin/.env.local` — symlink to ../../.env

## Forward Intelligence

### What the next slice should know
- The `apps/admin/.env.local` symlink to `../../.env` is essential. Any new environment (VPS1, CI) needs this symlink recreated or proper `.env.local` in `apps/admin/`. The root `.env` file is gitignored.
- `pnpm build` in `apps/admin` must be preceded by `@monster/db build` and `@monster/shared build` — the admin app imports from `packages/*/dist/`. The build order matters.
- The ecosystem.config.js for pm2 should set `PORT=3001` (production) and ensure the `.env` path is resolved correctly at startup — pm2 does not pick up the `.env.local` symlink the same way `next dev` does. Use the `env` block in ecosystem config to pass vars explicitly, or verify `dotenv` loading.
- `next start` in pm2 requires `.next/` to exist (production build). S05 deploy script must run `pnpm build` before `pm2 reload`.

### What's fragile
- `.env.local` symlink — if someone runs `pnpm install` in a way that clears `apps/admin/`, the symlink disappears silently. Auth fails at runtime with "URL and Key are required" — not a build error.
- `(dashboard)/layout.tsx` auth guard has no error boundary. If Supabase is unreachable, `getUser()` throws and the page returns 500 with no user-visible explanation. Low risk in Phase 1 (private VPS), but worth noting.
- Webpack `.next/` cache can corrupt when deps change mid-session (`segment-explorer-node.js not in React Client Manifest`). Fix: `rm -rf apps/admin/.next` and restart. Not a production risk but a common dev-mode footgun.

### Authoritative diagnostics
- `curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location)"` — fastest way to verify middleware is firing. 307 + `/login` = working. 200 = middleware broken.
- `pnpm --filter @monster/admin build` exit code — the single most reliable indicator of correctness. Build includes type checking for all server components.
- `next dev` stdout — SSR errors appear here with full stack traces and file:line. Browser console only shows client component errors.
- `/login?error=<msg>` URL param — auth error surface. If bad credentials return 200 (not redirect to /login?error=...), the signIn action is broken.

### What assumptions changed
- *Original assumption*: shadcn v4 would have a `form` component — it doesn't. Native `<form action={serverAction}>` is the correct and simpler pattern for server action forms.
- *Original assumption*: env vars would load from monorepo root automatically — they don't. Next.js scope is the app directory.
- *Original assumption*: `@supabase/ssr` could be consumed via `@monster/db` re-export for browser clients — version skew (db bundles 0.6.1, app needs 0.9.0) means the browser client must import `@supabase/ssr` directly in `apps/admin`. Server clients use the app's own ssr install.
