# S04: Admin Panel Shell

**Goal:** Next.js 15 admin panel builds and runs, Supabase Auth login/logout cycle works end-to-end, and a protected dashboard layout with sidebar navigation renders all 7 sections.
**Demo:** `pnpm build` in `apps/admin` exits 0; `next dev` on port 3004 shows login page → credentials → dashboard layout with sidebar → logout redirects back to login.

## Must-Haves

- `apps/admin/package.json` has Next.js 15, React 19, Tailwind v4, `@supabase/ssr@^0.9`, shadcn deps; `pnpm install` at monorepo root succeeds
- `next.config.ts`, `postcss.config.mjs`, `src/app/globals.css` (TW v4 CSS-only config), `components.json` (shadcn) all present
- `src/middleware.ts` uses `@supabase/ssr` 0.9.0 `getAll`/`setAll` interface and `getUser()` (not `getSession()`) for redirect decisions
- Login page + server action: `signInWithPassword` → session cookie; `/login?error=...` on failure
- Logout server action: `signOut()` → redirect to `/login`
- `(dashboard)/layout.tsx` reads session with `getUser()`, redirects to `/login` if unauthenticated
- All 7 section pages present: dashboard, sites, monster, research, analytics, finances, settings
- Sidebar nav component renders all 7 links with correct hrefs
- `pnpm build` (with packages built first) exits 0
- `pnpm --filter @monster/admin exec tsc --noEmit` exits 0

## Proof Level

- This slice proves: integration (real Supabase Auth round-trip)
- Real runtime required: yes — `next dev` running, login tested with real credentials
- Human/UAT required: yes — open browser, log in, see dashboard, log out

## Verification

```bash
# 1. Build order check
pnpm --filter @monster/db build && pnpm --filter @monster/shared build
pnpm --filter @monster/admin build   # must exit 0

# 2. TypeScript clean
pnpm --filter @monster/admin exec tsc --noEmit

# 3. Middleware redirect (unauthenticated — no cookie)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/dashboard
# → 307 (redirect to /login)

# 4. Login page reachable
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/login
# → 200

# 5. Full auth cycle
# Start dev server: pnpm --filter @monster/admin dev
# Open http://localhost:3004 in browser
# → Redirects to /login
# → Enter valid admin credentials → dashboard layout visible with sidebar
# → All 7 nav links present
# → Click logout → /login page visible

# 6. Login with bad credentials
# Enter wrong password → /login?error=Invalid login credentials

# 7. Diagnostic: inspect middleware redirect header (confirms 307 + Location)
curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location|Location)"
# → HTTP/1.1 307 Temporary Redirect
# → location: /login  (or Location: http://localhost:3004/login)

# 8. Diagnostic: confirm session cookie is httpOnly (no JS access)
curl -sc /tmp/monster-cookies.txt http://localhost:3004/login > /dev/null
curl -sb /tmp/monster-cookies.txt -o /dev/null -w "%{http_code}" http://localhost:3004/dashboard
# After login via browser: cookie jar must have sb-* cookie flagged HttpOnly
# Verify in DevTools → Application → Cookies: sb-*-auth-token present, HttpOnly=true

# 9. Diagnostic: missing env var failure path
# Temporarily unset NEXT_PUBLIC_SUPABASE_URL in .env → restart dev server
# → Server startup should throw / surface a clear error (not a silent undefined)
# Restore env var before continuing.

# 10. Failure-path: auth guard bypass attempt — direct URL to protected route without session
curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location|Location)"
# → HTTP/1.1 307 + location: /login  — confirms middleware fires even on direct nav
# If 200 is returned, auth guard is broken. Check middleware matcher config.

# 11. Failure-path: sidebar rendering error — if nav-sidebar crashes, dashboard route returns 500
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/dashboard   # after login session exists in cookie jar
# → should be 200. 500 means sidebar server component threw (check import of signOut action).

# 12. Failure-path: all 7 section stubs must respond 200 — not 404
for path in /dashboard /sites /monster /research /analytics /finances /settings; do
  code=$(curl -sb /tmp/monster-cookies.txt -o /dev/null -w "%{http_code}" http://localhost:3004$path)
  echo "$path → $code"
done
# Every path must be 200. Any 404 means the page file is missing or incorrectly named.
```

## Observability / Diagnostics

- Runtime signals: middleware logs redirect decisions via console.error on auth failures; login action returns error string to URL param (not cookie) — no secret value in URL
- Inspection surfaces: `next dev` stdout for SSR/middleware logs; browser DevTools → Application → Cookies for session cookie presence; `curl -I http://localhost:3004/dashboard` for redirect header
- Failure visibility: auth errors surface as `/login?error=<message>` in URL; missing env vars throw at server startup (reads at call time per D021)
- Redaction constraints: session tokens live only in httpOnly cookies; error messages are descriptive but not token-leaking

## Integration Closure

- Upstream surfaces consumed: `packages/db/dist/index.js` (Database type), `packages/shared/dist/index.js` (SiteStatus etc.), `.env` (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
- New wiring introduced: `apps/admin` → Supabase Auth via `@supabase/ssr`; middleware session refresh on every request; server actions for sign-in/sign-out
- What remains before milestone is end-to-end: S05 (pm2 ecosystem config, deploy script, process survival on reboot)

## Tasks

- [x] **T01: Install deps + scaffold Next.js build infrastructure** `est:45m`
  - Why: The apps/admin directory has only a package.json stub. Next.js, Tailwind v4, shadcn, and auth deps must be installed and configured before any app code can be written or built.
  - Files: `apps/admin/package.json`, `apps/admin/tsconfig.json`, `apps/admin/next.config.ts`, `apps/admin/postcss.config.mjs`, `apps/admin/src/app/globals.css`, `apps/admin/components.json`, `apps/admin/src/app/layout.tsx`, `apps/admin/src/app/page.tsx`
  - Do: Add Next.js 15, React 19, `@supabase/ssr@^0.9`, and Tailwind v4 deps to package.json manually; run `pnpm install` at monorepo root; fix tsconfig (lib/jsx/module/noEmit/isolatedModules/includes); write next.config.ts; write postcss.config.mjs; write minimal globals.css with TW v4 `@import "tailwindcss"`; run `pnpm dlx shadcn@latest init -y --cwd apps/admin`; verify workspace deps (@monster/db, @monster/shared) still present in package.json; create minimal root layout.tsx and page.tsx (just enough for build to pass — auth and real content come in T02/T03)
  - Verify: `pnpm --filter @monster/admin build` exits 0; `ls apps/admin/components.json` exists; `grep "@monster/db" apps/admin/package.json` still present after shadcn init
  - Done when: `pnpm --filter @monster/admin build` exits 0 from monorepo root with a minimal app

- [x] **T02: Wire Supabase Auth — middleware, server client, login/logout** `est:60m`
  - Why: This is the core risk item. `@supabase/ssr` 0.9.0 cookie interface + async `cookies()` + `getUser()` must be wired correctly or auth state silently breaks. Login and logout server actions must work before the protected layout can be built.
  - Files: `apps/admin/src/middleware.ts`, `apps/admin/src/lib/supabase/server.ts`, `apps/admin/src/lib/supabase/client.ts`, `apps/admin/src/app/(auth)/login/page.tsx`, `apps/admin/src/app/(auth)/login/actions.ts`
  - Do: Write `src/middleware.ts` using `@supabase/ssr` `createServerClient` with `getAll`/`setAll` cookie interface + `getUser()` for redirect decisions; protected paths include `/dashboard`, `/sites`, `/monster`, `/research`, `/analytics`, `/finances`, `/settings`; write `src/lib/supabase/server.ts` (async `createClient` with `await cookies()`); write `src/lib/supabase/client.ts` (browser client wrapper using `createBrowserClient` from `@monster/db`); write login page with email+password form (shadcn Input, Button, Form components); write `actions.ts` with `'use server'` `signIn(formData)` using `signInWithPassword` → redirect to `/dashboard` on success, redirect to `/login?error=<msg>` on failure; write `signOut()` action → `supabase.auth.signOut()` → redirect to `/login`; add middleware config matcher
  - Verify: `pnpm --filter @monster/admin build` still exits 0; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/dashboard` returns 307; `curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/login` returns 200; login with real credentials in browser → session cookie appears in DevTools
  - Done when: Login → session cookie → protected route access; bad credentials → `/login?error=...`; logout → session cleared → `/login`

- [x] **T03: Dashboard layout, sidebar nav, and section stubs** `est:45m`
  - Why: The protected layout with sidebar nav is the visible shell promised by the slice. All 7 section pages must exist to prove the navigation works.
  - Files: `apps/admin/src/app/(dashboard)/layout.tsx`, `apps/admin/src/components/nav-sidebar.tsx`, `apps/admin/src/app/(dashboard)/dashboard/page.tsx`, `apps/admin/src/app/(dashboard)/sites/page.tsx`, `apps/admin/src/app/(dashboard)/monster/page.tsx`, `apps/admin/src/app/(dashboard)/research/page.tsx`, `apps/admin/src/app/(dashboard)/analytics/page.tsx`, `apps/admin/src/app/(dashboard)/finances/page.tsx`, `apps/admin/src/app/(dashboard)/settings/page.tsx`
  - Do: Write `(dashboard)/layout.tsx` — async server component, calls `createClient()` from `src/lib/supabase/server.ts`, calls `getUser()`, redirects to `/login` if no user; renders sidebar + `{children}`; write `nav-sidebar.tsx` — client component with Next.js `Link` for all 7 nav items (Dashboard, Sites, Monster Chat, Research Lab, Analytics, Finances, Settings) with matching hrefs; apply sensible shadcn/Tailwind styling for a sidebar panel; write 7 section pages — each a simple server component with a heading + "Coming soon" message; update root `page.tsx` to `redirect('/dashboard')` using Next.js `redirect()`; run final `pnpm build` and `tsc --noEmit`
  - Verify: `pnpm --filter @monster/admin build` exits 0; `pnpm --filter @monster/admin exec tsc --noEmit` exits 0; browser: login → dashboard shows sidebar with 7 links; each nav link navigates to correct stub; logout from sidebar button redirects to `/login`
  - Done when: Full browser cycle works — login → protected dashboard with sidebar → all 7 sections navigate correctly → logout returns to login

## Files Likely Touched

- `apps/admin/package.json`
- `apps/admin/tsconfig.json`
- `apps/admin/next.config.ts`
- `apps/admin/postcss.config.mjs`
- `apps/admin/components.json`
- `apps/admin/src/app/globals.css`
- `apps/admin/src/app/layout.tsx`
- `apps/admin/src/app/page.tsx`
- `apps/admin/src/middleware.ts`
- `apps/admin/src/lib/supabase/server.ts`
- `apps/admin/src/lib/supabase/client.ts`
- `apps/admin/src/app/(auth)/login/page.tsx`
- `apps/admin/src/app/(auth)/login/actions.ts`
- `apps/admin/src/app/(dashboard)/layout.tsx`
- `apps/admin/src/components/nav-sidebar.tsx`
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/page.tsx`
- `apps/admin/src/app/(dashboard)/monster/page.tsx`
- `apps/admin/src/app/(dashboard)/research/page.tsx`
- `apps/admin/src/app/(dashboard)/analytics/page.tsx`
- `apps/admin/src/app/(dashboard)/finances/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/page.tsx`
