---
id: T02
parent: S04
milestone: M001
provides:
  - Supabase Auth middleware with getAll/setAll cookie interface and getUser() protection
  - Server-side Supabase client factory (async cookies() pattern, Next.js 15 compatible)
  - Browser-side Supabase client factory (direct @supabase/ssr, no version skew)
  - Login page with shadcn Input/Label/Button components and server action form
  - signIn/signOut server actions — signInWithPassword, error → URL param, signOut → /login
  - apps/admin/.env.local symlink to monorepo root .env (env var loading fix)
key_files:
  - apps/admin/src/middleware.ts
  - apps/admin/src/lib/supabase/server.ts
  - apps/admin/src/lib/supabase/client.ts
  - apps/admin/src/app/(auth)/login/page.tsx
  - apps/admin/src/app/(auth)/login/actions.ts
  - apps/admin/src/components/ui/input.tsx
  - apps/admin/src/components/ui/label.tsx
  - apps/admin/.env.local
key_decisions:
  - D023: apps/admin/.env.local symlinked to ../../.env — Next.js doesn't traverse monorepo root
  - D024: shadcn v4 has no form component — native HTML form + shadcn primitives used directly
  - D022 (confirmed): shadcn v4 add form returns nothing; add input/label works fine
patterns_established:
  - Server action form: <form action={serverActionFn}> — no react-hook-form needed for simple server action forms
  - Error routing: auth errors go to /login?error=encodeURIComponent(msg), never in cookies
  - Env loading: symlink apps/<app>/.env.local → ../../.env for monorepo-root .env files
observability_surfaces:
  - curl -sI http://localhost:3004/dashboard | grep Location → confirms middleware firing (307 + location:/login)
  - curl http://localhost:3004/login?error=... → error message visible in HTML, no token in URL
  - POST /login with bad creds → 303 + Location:/login?error=Invalid%20login%20credentials
  - next dev stdout shows middleware compile status + any SSR errors with file+line
duration: 45m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Wire Supabase Auth — middleware, server client, login/logout

**Supabase Auth wired end-to-end: middleware protects all 7 routes, login redirects to dashboard on success, and bad credentials surface as `/login?error=...` — all verified against a running dev server.**

## What Happened

Wrote the three Supabase client files following the exact `@supabase/ssr` 0.9.0 cookie interface (`getAll`/`setAll`). Middleware uses `getUser()` (verified server call, not unverified cookie). Server factory uses `await cookies()` (async in Next.js 15). Browser client factory uses `@supabase/ssr` directly to avoid version skew with `@monster/db`'s bundled 0.6.1 version.

Installed shadcn `input` and `label` components. The `form` component doesn't exist in shadcn v4 registry — wrote the login form using a native HTML `<form action={serverAction}>` with shadcn Input/Label/Button directly. This is simpler and correct: server actions accept FormData natively, no wrapper needed.

First dev server start failed with "URL and Key are required" — Next.js only reads `.env*` files in the app directory, not the monorepo root. Fixed by symlinking `apps/admin/.env.local → ../../.env`. Second attempt also surfaced a webpack cache corruption error (`segment-explorer-node.js not in React Client Manifest`) after adding `react-hook-form` deps mid-session — cleared by deleting `.next/` and restarting cleanly.

Added `react-hook-form`, `@hookform/resolvers`, and `zod` to `apps/admin` deps (for use in T03 and beyond — login form doesn't need them, but they're needed for dashboard forms).

## Verification

```
# Static checks
grep "getAll|setAll" apps/admin/src/middleware.ts          ✓ both present
grep "getUser" apps/admin/src/middleware.ts                 ✓ supabase.auth.getUser()
grep "await cookies" apps/admin/src/lib/supabase/server.ts ✓ async cookies()
grep "'use server'" apps/admin/src/app/(auth)/login/actions.ts ✓ directive present

# Build
pnpm --filter @monster/db build                            ✓ exit 0
pnpm --filter @monster/shared build                        ✓ exit 0
pnpm --filter @monster/admin build                         ✓ exit 0 (login route 15kB, middleware 82kB)
pnpm --filter @monster/admin exec tsc --noEmit             ✓ exit 0

# Runtime (dev server on port 3004)
curl http://localhost:3004/dashboard → 307                 ✓ 307 Temporary Redirect
curl -I http://localhost:3004/dashboard | grep location    ✓ location: /login
curl http://localhost:3004/login → 200                     ✓ 200 OK

# Error path
POST /login with bad creds → 303 Location: /login?error=Invalid%20login%20credentials ✓
GET /login?error=Invalid%20login%20credentials → error rendered in HTML ✓
```

## Diagnostics

- Middleware firing: `curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location)"` → `HTTP/1.1 307` + `location: /login`
- Auth error path: `curl -sI -X POST http://localhost:3004/login -F 'email=x' -F 'password=y' -F '$ACTION_ID_<id>='` → `303 Location: /login?error=Invalid%20login%20credentials`
- Missing env vars: dev server startup throws `"Your project's URL and Key are required"` — no silent undefined
- Webpack cache corruption: if `segment-explorer-node.js not in React Client Manifest` appears, `rm -rf apps/admin/.next` + restart resolves it (Next.js 15 devtools bug with dep changes mid-session)

## Deviations

- **`shadcn form` not available in v4**: `shadcn@latest add form` returns no files. Login form uses `<form action={signIn}>` with native FormData — no react-hook-form wrapper. Documented as D024.
- **`.env.local` symlink**: Task plan assumed env vars would load automatically. Next.js only reads `.env*` in the app directory. Created `apps/admin/.env.local → ../../.env` symlink. Documented as D023.
- **`react-hook-form` + `zod` added**: Not in original task plan. Added to `apps/admin` for future T03 dashboard forms.

## Known Issues

None — all must-haves verified.

## Files Created/Modified

- `apps/admin/src/middleware.ts` — route protection + session refresh; getAll/setAll; getUser(); 7 protected prefixes
- `apps/admin/src/lib/supabase/server.ts` — async factory with await cookies() and getAll/setAll cookie interface
- `apps/admin/src/lib/supabase/client.ts` — browser client via createBrowserClient from @supabase/ssr directly
- `apps/admin/src/app/(auth)/login/page.tsx` — login form with shadcn Input/Label/Button; error display from ?error param
- `apps/admin/src/app/(auth)/login/actions.ts` — signIn (signInWithPassword → redirect) and signOut server actions
- `apps/admin/src/components/ui/input.tsx` — shadcn Input component (Base UI InputPrimitive)
- `apps/admin/src/components/ui/label.tsx` — shadcn Label component
- `apps/admin/.env.local` — symlink to ../../.env (monorepo root env vars)
- `apps/admin/package.json` — added react-hook-form, @hookform/resolvers, zod
