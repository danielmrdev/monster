---
estimated_steps: 5
estimated_files: 11
---

# T03: Dashboard layout, sidebar nav, and section stubs

**Slice:** S04 — Admin Panel Shell
**Milestone:** M001

## Description

With auth working, this task adds the visible shell: the protected dashboard layout (server component that checks auth + renders the sidebar), the sidebar nav component with all 7 section links, and 7 stub section pages. The root `page.tsx` is updated to redirect to `/dashboard`. After this task, the full browser cycle works.

The sidebar needs a logout button wired to the `signOut` server action from T02. Since server actions can't be called directly from a Server Component's JSX href, the logout button lives in the sidebar as a `<form action={signOut}><button type="submit">Logout</button></form>` — no client component needed for this pattern.

Apply sensible styling with shadcn/Tailwind — a fixed-width left sidebar (e.g. 240px), full-height, with the main content area filling the rest. This is a functional shell, not a pixel-perfect design, but it should look like an intentional admin panel.

## Steps

1. **Write `apps/admin/src/app/(dashboard)/layout.tsx`** — protected layout with auth guard:
   ```tsx
   import { redirect } from 'next/navigation'
   import { createClient } from '@/lib/supabase/server'
   import { NavSidebar } from '@/components/nav-sidebar'

   export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
     const supabase = await createClient()
     const { data: { user } } = await supabase.auth.getUser()
     if (!user) redirect('/login')
     return (
       <div className="flex h-screen">
         <NavSidebar />
         <main className="flex-1 overflow-auto p-8">{children}</main>
       </div>
     )
   }
   ```

2. **Write `apps/admin/src/components/nav-sidebar.tsx`** — sidebar with nav links and logout form:
   - Import `Link` from `next/link` and `signOut` from `@/app/(auth)/login/actions`
   - Nav items array: `[{ href: '/dashboard', label: 'Dashboard' }, { href: '/sites', label: 'Sites' }, { href: '/monster', label: 'Monster Chat' }, { href: '/research', label: 'Research Lab' }, { href: '/analytics', label: 'Analytics' }, { href: '/finances', label: 'Finances' }, { href: '/settings', label: 'Settings' }]`
   - Render as a `<nav>` with a list of `<Link>` elements plus a logout `<form action={signOut}><button type="submit">Logout</button></form>` at the bottom
   - Style: fixed sidebar with a dark background (e.g. `bg-gray-900 text-white`) or a neutral sidebar — keep it clean and functional
   - This is a server component (no `'use client'` needed — server actions work fine in server component JSX)

3. **Write 7 section stub pages** — each is a server component with a heading and "Coming soon" text:
   - `(dashboard)/dashboard/page.tsx` — "Dashboard"
   - `(dashboard)/sites/page.tsx` — "Sites"
   - `(dashboard)/monster/page.tsx` — "Monster Chat"
   - `(dashboard)/research/page.tsx` — "Research Lab"
   - `(dashboard)/analytics/page.tsx` — "Analytics"
   - `(dashboard)/finances/page.tsx` — "Finances"
   - `(dashboard)/settings/page.tsx` — "Settings"
   
   Pattern for each:
   ```tsx
   export default function DashboardPage() {
     return (
       <div>
         <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
         <p className="text-gray-500">Coming soon.</p>
       </div>
     )
   }
   ```

4. **Update `apps/admin/src/app/page.tsx`** to redirect to `/dashboard`:
   ```tsx
   import { redirect } from 'next/navigation'
   export default function Home() { redirect('/dashboard') }
   ```

5. **Final build and type check** — run `pnpm --filter @monster/db build && pnpm --filter @monster/shared build && pnpm --filter @monster/admin build`. Then run `pnpm --filter @monster/admin exec tsc --noEmit`. Fix any type errors before declaring done. Start dev server and do full browser verification cycle.

## Must-Haves

- [ ] `(dashboard)/layout.tsx` calls `getUser()` and redirects to `/login` if no user — auth guard must not be bypassable
- [ ] `nav-sidebar.tsx` renders all 7 nav links with correct hrefs
- [ ] Logout button in sidebar is a `<form action={signOut}>` — not a client-side fetch
- [ ] All 7 section pages exist and render without errors
- [ ] Root `page.tsx` redirects to `/dashboard`
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `pnpm --filter @monster/admin exec tsc --noEmit` exits 0

## Verification

```bash
# Full build clean
pnpm --filter @monster/db build && pnpm --filter @monster/shared build
pnpm --filter @monster/admin build
echo "Build exit: $?"

# TypeScript clean
pnpm --filter @monster/admin exec tsc --noEmit
echo "TSC exit: $?"

# All 7 section page files exist
ls apps/admin/src/app/\(dashboard\)/*/page.tsx | wc -l  # must be 7

# Sidebar nav has all 7 hrefs
grep -c "href=" apps/admin/src/components/nav-sidebar.tsx  # must be >= 7

# Auth guard in layout
grep "getUser\|redirect" apps/admin/src/app/\(dashboard\)/layout.tsx

# Browser cycle (with dev server running):
# 1. http://localhost:3004 → redirect to /login (not logged in)
# 2. Login with valid credentials → /dashboard with sidebar visible
# 3. All 7 nav links navigate to correct stub pages
# 4. Each stub page shows heading + "Coming soon"
# 5. Logout → /login (session cleared)
# 6. Attempt http://localhost:3004/dashboard without session → redirect to /login
```

## Observability Impact

**New runtime surfaces introduced by this task:**
- `(dashboard)/layout.tsx` auth guard: any unauthenticated request to a dashboard route triggers middleware + layout double-check. If the guard fires, `redirect('/login')` produces a 307 in the network log — visible in browser DevTools Network tab and in `curl -sI` output.
- Dashboard section pages: each page responds 200 when authenticated. A 404 means the file is missing/misnamed; a 500 means a server component import or render error. The `next dev` terminal shows the full RSC error stack.
- Sidebar server action form: the logout `<form action={signOut}>` submits a POST to the Next.js server actions handler. In DevTools → Network, look for a POST to the current URL with a `Next-Action` header — a 303 redirect to `/login` confirms the action fired and session was cleared.

**How a future agent inspects this task:**
- `grep -r "getUser\|redirect" apps/admin/src/app/\(dashboard\)/layout.tsx` — confirms auth guard
- `grep -c "href=" apps/admin/src/components/nav-sidebar.tsx` — must be ≥7
- `ls apps/admin/src/app/\(dashboard\)/*/page.tsx | wc -l` — must be 7
- `curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location)"` — 307 = guard active, 200 = bypassed (broken)
- `next dev` stdout: RSC errors appear with full stack trace; successful renders are silent

**Failure state visibility:**
- Missing page file → 404 in browser + `NEXT_NOT_FOUND` in server log
- Broken sidebar import (e.g. wrong signOut path) → 500 with `Module not found` in server log
- Auth guard removed/bypassed → `curl -sI /dashboard` returns 200 without a cookie — this is the sentinel check

## Inputs

- `apps/admin/src/app/(auth)/login/actions.ts` — `signOut` server action from T02; imported by sidebar
- `apps/admin/src/lib/supabase/server.ts` — `createClient()` from T02; used in dashboard layout for auth check
- `apps/admin/components.json` — shadcn config from T01; needed for any additional `shadcn add` calls if nav primitives are needed
- `apps/admin/src/app/globals.css` — Tailwind v4 styles from T01; must already be imported in root layout

## Expected Output

- `apps/admin/src/app/(dashboard)/layout.tsx` — protected layout with auth guard + sidebar
- `apps/admin/src/components/nav-sidebar.tsx` — sidebar with 7 nav links + logout form
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/monster/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/research/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/analytics/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — stub page
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — stub page
- `apps/admin/src/app/page.tsx` — updated to redirect to `/dashboard`
- Full browser cycle verified: login → dashboard → nav → logout
