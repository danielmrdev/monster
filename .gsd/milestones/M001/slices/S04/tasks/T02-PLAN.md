---
estimated_steps: 7
estimated_files: 5
---

# T02: Wire Supabase Auth — middleware, server client, login/logout

**Slice:** S04 — Admin Panel Shell
**Milestone:** M001

## Description

This is the highest-risk task in S04. Correct `@supabase/ssr` 0.9.0 wiring is subtle: the cookie interface changed from `get/set/remove` (0.4.x, used in most tutorials) to `getAll/setAll`. `cookies()` is async in Next.js 15. Auth checks must use `getUser()` (verified server call), not `getSession()` (reads unverified cookie only). Getting any of these wrong produces auth that looks fine in dev but silently breaks session persistence.

The single-owner constraint means no signup route — only `signInWithPassword`. Error messages go in the URL query param (`/login?error=<msg>`). No `/auth/callback` route needed for email+password flow.

For the login UI: use shadcn `Button`, `Input`, `Label`, and `Form` (react-hook-form) components. Install the shadcn components needed with `pnpm dlx shadcn@latest add button input label form --cwd apps/admin`.

## Steps

1. **Write `apps/admin/src/lib/supabase/server.ts`** — async factory for server-side Supabase client:
   ```ts
   import { createServerClient } from '@supabase/ssr'
   import { cookies } from 'next/headers'
   import type { Database } from '@monster/db'

   export async function createClient() {
     const cookieStore = await cookies()
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
               // Server Component — middleware handles cookie refresh
             }
           },
         },
       }
     )
   }
   ```

2. **Write `apps/admin/src/lib/supabase/client.ts`** — thin wrapper for browser-side use in client components:
   ```ts
   import { createBrowserClient } from '@supabase/ssr'
   import type { Database } from '@monster/db'

   export function createClient() {
     return createBrowserClient<Database>(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
     )
   }
   ```
   Note: use `@supabase/ssr` directly here (not `@monster/db`'s `createBrowserClient`) — apps/admin has `@supabase/ssr@^0.9` as a direct dep; using it directly avoids version skew with the 0.6.1 version in packages/db.

3. **Write `apps/admin/src/middleware.ts`** — session refresh + route protection on every request:
   ```ts
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

     const { data: { user } } = await supabase.auth.getUser()

     const path = request.nextUrl.pathname
     const protectedPrefixes = ['/dashboard', '/sites', '/monster', '/research', '/analytics', '/finances', '/settings']
     const isProtected = protectedPrefixes.some(p => path.startsWith(p))
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

4. **Install shadcn components needed for the login form**:
   ```bash
   pnpm dlx shadcn@latest add button input label form --cwd apps/admin
   ```
   After install, verify the component files appear in `apps/admin/src/components/ui/`.

5. **Write `apps/admin/src/app/(auth)/login/actions.ts`** — server actions for sign in and sign out:
   ```ts
   'use server'
   import { redirect } from 'next/navigation'
   import { createClient } from '@/lib/supabase/server'

   export async function signIn(formData: FormData) {
     const supabase = await createClient()
     const { error } = await supabase.auth.signInWithPassword({
       email: formData.get('email') as string,
       password: formData.get('password') as string,
     })
     if (error) {
       redirect(`/login?error=${encodeURIComponent(error.message)}`)
     }
     redirect('/dashboard')
   }

   export async function signOut() {
     const supabase = await createClient()
     await supabase.auth.signOut()
     redirect('/login')
   }
   ```

6. **Write `apps/admin/src/app/(auth)/login/page.tsx`** — login form using shadcn components and react-hook-form. Display `searchParams.error` if present. Form submits via the `signIn` server action. Include a hidden submit button that fires `signIn`. Use shadcn Form/Input/Button; email and password fields; error display if `?error` param present.

7. **Run `pnpm --filter @monster/admin build`** and verify it still exits 0. If the dev server is not running, start it briefly with `pnpm --filter @monster/admin dev` and test: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/dashboard` must return 307.

## Must-Haves

- [ ] `src/middleware.ts` uses `getAll`/`setAll` cookie interface (NOT `get`/`set`/`remove`)
- [ ] `src/middleware.ts` uses `supabase.auth.getUser()` (NOT `getSession()`) for redirect decisions
- [ ] `src/lib/supabase/server.ts` uses `await cookies()` (async in Next.js 15)
- [ ] Login `actions.ts` uses `'use server'` directive and `signInWithPassword`
- [ ] Login errors redirect to `/login?error=<encodeURIComponent(msg)>` — no token values in URL
- [ ] `signOut` action calls `supabase.auth.signOut()` then redirects to `/login`
- [ ] `pnpm --filter @monster/admin build` exits 0 after these additions

## Verification

```bash
# Build still passes
pnpm --filter @monster/db build && pnpm --filter @monster/shared build
pnpm --filter @monster/admin build
echo "Exit: $?"

# Middleware exists and has correct cookie interface
grep "getAll\|setAll" apps/admin/src/middleware.ts
grep "getUser" apps/admin/src/middleware.ts

# Async cookies() in server client
grep "await cookies" apps/admin/src/lib/supabase/server.ts

# Server action directive
grep "'use server'" apps/admin/src/app/\(auth\)/login/actions.ts

# Start dev server and test redirect (run in background, kill after check)
# In separate terminal or bg_shell:
#   pnpm --filter @monster/admin dev
# Then:
#   curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/dashboard  → 307
#   curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/login      → 200

# Full login cycle in browser:
#   http://localhost:3004/login → enter valid admin credentials → dashboard redirect
#   Browser DevTools → Application → Cookies → sb-* cookie present
#   Navigate to http://localhost:3004/dashboard → loads (no redirect back to login)
#   Bad credentials → /login?error=Invalid+login+credentials
```

## Observability Impact

- Signals added: middleware redirects unauthenticated requests — observable via HTTP 307 response headers
- How a future agent inspects this: `curl -I http://localhost:3004/dashboard` — `Location: /login` confirms middleware is firing; absence of redirect = session cookie valid or middleware misconfigured
- Failure state exposed: `/login?error=<message>` makes auth failures visible without server log access

## Inputs

- `apps/admin/package.json` — `@supabase/ssr@^0.9` present (added in T01)
- `apps/admin/components.json` — shadcn config (from T01) required for `shadcn add` to work
- `packages/db/dist/index.d.ts` — exports `Database` type; imported by `server.ts` and `client.ts`
- `.env` — `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` present from S02

## Expected Output

- `apps/admin/src/middleware.ts` — route protection + session refresh on every request
- `apps/admin/src/lib/supabase/server.ts` — SSR Supabase client factory
- `apps/admin/src/lib/supabase/client.ts` — browser Supabase client factory
- `apps/admin/src/app/(auth)/login/page.tsx` — login form with error display
- `apps/admin/src/app/(auth)/login/actions.ts` — signIn and signOut server actions
- `apps/admin/src/components/ui/` — shadcn button, input, label, form components
- Auth cycle verified: login → session cookie → `/dashboard` redirect; logout → session cleared → `/login`
