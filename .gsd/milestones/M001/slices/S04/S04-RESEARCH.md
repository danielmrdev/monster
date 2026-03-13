# S04: Admin Panel Shell — Research

**Date:** 2026-03-13

## Summary

S04 scaffolds the Next.js 15 admin panel — deps install, Supabase Auth login/logout cycle, protected dashboard layout with sidebar navigation (7 sections). The dependency tree is stable and well-understood; the primary implementation risk is correct `@supabase/ssr` wiring in the App Router (middleware + server client + cookie handling). Getting that wrong produces auth state that appears to work in dev but fails silently on session refresh.

The apps/admin directory currently has only a package.json stub with `@monster/db` and `@monster/shared` workspace deps and a placeholder `src/index.ts`. Everything else — Next.js, React, Tailwind, shadcn, auth plumbing — must be installed and wired from scratch. The `gsd/M001/S04` branch is checked out at the main repo directory (`/home/daniel/monster/`); no separate worktree was created for this slice.

Port 3004 is the correct port (3001/3002/3003 already occupied by nous, its websocket, and the better-copilot panel). The `ecosystem.config.js` skeleton from S01 already uses 3004 — the M001-CONTEXT mention of "3001" is stale.

## Recommendation

**Install deps manually, then run `pnpm dlx shadcn@latest init` for component scaffolding.** Do NOT use `shadcn init --template=next` (creates a fresh Next.js project, overwriting the workspace package setup). Manual install sequence:

1. Add Next.js 15, React 19, TW4, and auth deps to `apps/admin/package.json`
2. Run `pnpm install` at monorepo root (to preserve workspace links)
3. Update `apps/admin/tsconfig.json` with Next.js-required fields
4. Create `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css`
5. Run `pnpm dlx shadcn@latest init -y --cwd apps/admin` to generate `components.json` and inject CSS variables
6. Wire Supabase auth: `src/middleware.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts`
7. Build the route tree: root layout → login page + server actions → dashboard layout (protected) → 7 section stubs

Use `signInWithPassword` (email/password) only — no signup route needed for a single-owner admin panel. The auth error surface should redirect back to `/login?error=<msg>` (readable URL param, not a query string token leak — errors are descriptive, not secret).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Server-side Supabase auth in App Router | `@supabase/ssr` createServerClient + middleware pattern | Cookie chunking, token refresh on every request, `Set-Cookie` header management — all handled correctly. Hand-rolling is the #1 cause of broken session persistence |
| SSR cookie handling specifics | `@supabase/ssr` 0.9.0 with `getAll`/`setAll` cookie interface | New interface (replaces `get`/`set`/`remove` from 0.4.x) — use the 0.9.0 pattern, not tutorials from 2024 that show the old API |
| UI components (sidebar, form, button, input) | `shadcn@latest` + Radix UI primitives | Accessible, headless, zero-runtime — copies source into repo for full ownership |
| Login form validation | react-hook-form 7 + zod 4 + @hookform/resolvers 5 | Standard stack, already specified in CLAUDE.md. Zod 4 has minor API changes vs v3 but the `z.object`, `z.string().email()`, `z.string().min()` API is the same |
| Tailwind v4 config | CSS-only via `@import "tailwindcss"` in globals.css | No `tailwind.config.ts` in v4 — configuration is inline in CSS via `@theme`. shadcn init generates this correctly |

## Existing Code and Patterns

- `packages/db/src/client.ts` — exports `createBrowserClient()` and `createServiceClient()`. The SSR client (`createServerClient` with cookie handlers) is NOT in this package (D019) — it belongs in `apps/admin/src/lib/supabase/server.ts`. Apps/admin will call `@supabase/ssr` directly for that.
- `packages/db/dist/index.js` + `packages/shared/dist/index.js` — compiled ESM artifacts. No `transpilePackages` needed in `next.config.ts`; Next.js will import these directly via pnpm symlinks.
- `apps/admin/package.json` — already has `@monster/db: workspace:*` and `@monster/shared: workspace:*`. Add all Next.js deps here; run `pnpm install` at monorepo root (not `npm install`).
- `apps/admin/tsconfig.json` — currently extends `../../tsconfig.base.json` with `moduleResolution: Bundler`. Needs additional fields for Next.js (see Constraints below). The `"plugins": [{"name": "next"}]` entry is already there but Next.js plugin requires the rest of the tsconfig to be correct first.
- `ecosystem.config.js` at repo root — skeleton from S01 with `name: 'monster-admin'`, `PORT: 3004`, `cwd: /home/daniel/monster/apps/admin`. S05 fills this in fully; S04 just needs the Next.js app to build and start.
- `/home/daniel/nous/ecosystem.config.js` — reference pm2 pattern (autorestart, max_memory_restart, log paths, kill_timeout).
- `/home/daniel/better-copilot/panel/` — reference Next.js 15.5.12 app running on port 3003. Uses Tailwind v3 + App Router. Useful for layout patterns but uses Tailwind v3 (not v4).

## Constraints

- **Port 3004** — 3001, 3002, 3003 are occupied (`nous`, `nous` websocket, `better-copilot` Next.js panel). `ecosystem.config.js` already reflects 3004. `next dev` should also use `--port 3004` in the `dev` script.
- **pnpm install at monorepo root** — running `pnpm install` inside `apps/admin` alone risks breaking workspace symlinks for `@monster/db` and `@monster/shared`. Always run from `/home/daniel/monster/`.
- **`@supabase/ssr` 0.9.0 cookie interface** — uses `getAll()` + `setAll()`, not the older `get(name)`/`set(name, value, options)`/`remove(name)` interface. Any tutorial or example from before mid-2024 will show the wrong interface.
- **`cookies()` is async in Next.js 15** — `await cookies()` is required in server components and route handlers. This is a breaking change from Next.js 14.
- **No `tailwind.config.ts`** — Tailwind v4 uses CSS-only configuration. The `postcss.config.mjs` uses `@tailwindcss/postcss` (not `tailwindcss`).
- **tsconfig must add**: `"lib": ["dom", "dom.iterable", "esnext"]`, `"jsx": "preserve"`, `"module": "esnext"`, `"noEmit": true`, `"isolatedModules": true`. The base config has `"lib": ["ES2022"]` which lacks DOM types needed for client components.
- **tsconfig `include` must add** `"next-env.d.ts"` — Next.js generates this file and the TypeScript plugin requires it in `include`.
- **`src/` directory layout** — existing tsconfig has `"include": ["src/**/*"]`. Next.js 15 with `src/` layout expects: `src/app/`, `src/middleware.ts`, `src/lib/`, `src/components/`.
- **middleware.ts location** — must be at `apps/admin/src/middleware.ts` (with `src/` layout). The route `(auth)/login/page.tsx` starts with `(auth)` route group which is purely organizational (not in URL).
- **`@monster/db` has `@supabase/ssr` 0.6.1** — that version is a transitive dep of `packages/db`. `apps/admin` needs `@supabase/ssr` 0.9.0 as its own direct dep to get the current API for `createServerClient` in middleware/server.ts. They'll coexist without conflict (pnpm isolates by package).
- **No email confirmation required** — this is a single-owner admin panel. Supabase email confirmation should be disabled in the Supabase dashboard (Auth → Email → Confirm email = off). Login uses `signInWithPassword` directly; no `/auth/callback` route needed for email-password flow.
- **shadcn `--cwd apps/admin` flag** — required when running from monorepo root. Without it, shadcn will look for framework config in the root directory.

## Common Pitfalls

- **Running `pnpm install` inside `apps/admin`** — breaks workspace symlinks. Always install from `/home/daniel/monster/`.
- **Using `getSession()` instead of `getUser()` for auth checks** — `getSession()` only reads cookie data (unverified). `getUser()` makes a Supabase API call and returns the authenticated user. Use `getUser()` for redirect decisions in middleware.
- **Forgetting `response = NextResponse.next({ request })` before `response.cookies.set()`** — the middleware must rebind the response object before setting cookies; otherwise the session refresh headers are lost. The `setAll` cookie handler in `createServerClient` handles this internally, but only if the middleware response is wired correctly.
- **Caching server components that read auth state** — Next.js aggressively caches server components. Pages that check auth must opt out with `export const dynamic = 'force-dynamic'` or use `unstable_noStore()`, or more commonly just call `getUser()` which triggers dynamic rendering automatically via the `cookies()` dependency.
- **`shadcn init --template=next`** — this creates a fresh Next.js project, wiping `package.json`. Run `shadcn init` without `--template=next` in an existing Next.js project directory.
- **Stale shadcn docs / tutorials** — shadcn changed significantly in v4. The `components.json` format, CSS variable names, and Tailwind v4 integration differ from v3 tutorials. Use `pnpm dlx shadcn@latest` (4.0.6) and follow what it generates.
- **Old `@supabase/ssr` cookie API** — many tutorials use `get/set/remove` API from v0.4.x. v0.9.0 uses `getAll/setAll`. If cookie interface errors appear at build, this is why.
- **`next.config.ts` vs `next.config.js`** — use `.ts` extension (TypeScript config). Import type: `import type { NextConfig } from 'next'`.
- **tsconfig lib mismatch** — if `"lib"` only has `"ES2022"` (from base), client components using `document`, `window`, or `HTMLElement` will type-error. Override to include `"dom"` in the admin tsconfig.

## Open Risks

- **shadcn init modifying package.json** — `shadcn init` installs its own deps (Radix UI, tailwind-merge, clsx, etc.). These will be added to `apps/admin/package.json`. Verify `@monster/db` and `@monster/shared` workspace deps survive. If they're dropped, re-add them.
- **Next.js 15 + pnpm workspace peer dep noise** — React 19 compatibility warnings are expected from some shadcn deps. The `strict-peer-dependencies=false` in `.npmrc` suppresses hard failures; warnings are acceptable.
- **`@supabase/ssr` version skew** — packages/db has 0.6.1, apps/admin will have 0.9.0. Since pnpm isolates by default (`shamefully-hoist=false`), they won't conflict. But if createBrowserClient is imported from `@monster/db` (0.6.1) and createServerClient from `@supabase/ssr` directly (0.9.0), and the Supabase session token format ever changes between versions, there could be subtle auth state mismatches. Mitigation: keep packages/db's @supabase/ssr in sync with apps/admin's version; update packages/db to 0.9.0 at the start of S04.
- **Supabase email confirmation** — if email confirmation is enabled in the Supabase project, `signInWithPassword` will succeed but the session won't be valid until email is confirmed. For a first-time setup, the admin user may need to be created via the Supabase dashboard directly (create user → confirm email manually). Document this in the task.
- **`pnpm build` with workspace packages** — when `next build` runs in `apps/admin`, it needs `packages/db/dist/` and `packages/shared/dist/` to exist. If the packages haven't been built, `next build` will fail with module resolution errors. The build order must be: `pnpm --filter @monster/db build && pnpm --filter @monster/shared build && pnpm --filter @monster/admin build`.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js 15 Admin UI | `frontend-design` | installed (relevant for sidebar + login page visual polish) |
| Supabase SSR auth | none found | — docs from Context7 `/supabase/ssr` are sufficient |

## Key File Map (S04 deliverables)

```
apps/admin/
├── package.json                          — add next, react, react-dom, tw4, shadcn deps, @supabase/ssr@0.9
├── tsconfig.json                         — override lib, jsx, module, noEmit, isolatedModules; add next-env.d.ts include
├── next.config.ts                        — NextConfig with output port note; no transpilePackages needed
├── postcss.config.mjs                    — @tailwindcss/postcss plugin (TW v4)
├── components.json                       — generated by shadcn init
└── src/
    ├── middleware.ts                     — createServerClient, getUser(), redirect logic
    ├── lib/
    │   └── supabase/
    │       ├── server.ts                 — createServerClient with cookie handlers (server components)
    │       └── client.ts                 — createBrowserClient wrapper (client components)
    ├── components/
    │   ├── ui/                           — shadcn components (button, input, form, label, sidebar, etc.)
    │   └── nav-sidebar.tsx               — navigation sidebar with 7 section links
    └── app/
        ├── layout.tsx                    — root layout, fonts, globals.css
        ├── page.tsx                      — redirect to /dashboard
        ├── globals.css                   — Tailwind v4 @import + shadcn CSS variables
        ├── (auth)/
        │   └── login/
        │       ├── page.tsx              — login form (email + password + submit)
        │       └── actions.ts            — 'use server'; signInWithPassword + signOut server actions
        └── (dashboard)/
            ├── layout.tsx                — protected layout: getUser() check + redirect + sidebar
            ├── dashboard/page.tsx        — "Dashboard — coming soon"
            ├── sites/page.tsx            — "Sites — coming soon"
            ├── monster/page.tsx          — "Monster Chat — coming soon"
            ├── research/page.tsx         — "Research Lab — coming soon"
            ├── analytics/page.tsx        — "Analytics — coming soon"
            ├── finances/page.tsx         — "Finances — coming soon"
            └── settings/page.tsx         — "Settings — coming soon"
```

## Supabase SSR Wiring Reference (v0.9.0 API)

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() — verified, makes API call
  const { data: { user } } = await supabase.auth.getUser()
  
  const path = request.nextUrl.pathname
  const isProtected = path.startsWith('/dashboard') || path.startsWith('/sites') || /* etc */
  const isAuth = path.startsWith('/login')

  if (!user && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && isAuth) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@monster/db'

export async function createClient() {
  const cookieStore = await cookies()  // async in Next.js 15
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — can't set cookies; middleware handles refresh
          }
        },
      },
    }
  )
}
```

## Sources

- `@supabase/ssr` 0.9.0 cookie API + middleware pattern (source: Context7 `/supabase/ssr`)
- Supabase auth server actions pattern (source: Context7 `/websites/supabase`)
- Next.js 15 App Router middleware and auth (source: Context7 `/vercel/next.js`)
- Tailwind v4 + shadcn + Next.js 15 setup: CSS-only config, no tailwind.config.ts (source: dev.to article, 2025)
- Port verification: `ss -tlnp` — 3001/3002/3003 occupied, 3004 free
- `ecosystem.config.js` pm2 pattern: `/home/daniel/nous/ecosystem.config.js`
- Next.js 15 tsconfig requirements: `/home/daniel/better-copilot/panel/tsconfig.json`
