# S04: Admin Panel Shell — UAT

**Milestone:** M001
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (curl-automated + human-experience for browser cycle)
- Why this mode is sufficient: middleware redirects and HTTP status codes are fully curl-verifiable. The full browser cycle (login form interaction → session cookie → sidebar navigation → logout) requires human eyes since Playwright is unavailable on this VPS. The automated checks confirm all network-observable behaviors; the human step confirms the visual shell.

## Preconditions

1. `pnpm --filter @monster/db build && pnpm --filter @monster/shared build` — packages must be built first
2. `pnpm --filter @monster/admin build` — production build must exit 0
3. Dev server running: `cd apps/admin && pnpm dev` (port 3004)
4. `apps/admin/.env.local` symlink to `../../.env` exists and `.env` contains `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Valid admin credentials exist in Supabase Auth (the user that will log in for UAT)
6. Network: tester can reach `http://localhost:3004` (or Tailscale IP equivalent if on VPS1)

## Smoke Test

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/login
```
Expected: `200`. If this returns anything else, the dev server is not up or the login page failed to compile.

## Test Cases

### 1. Unauthenticated access redirects to login (middleware protection)

```bash
for path in /dashboard /sites /monster /research /analytics /finances /settings; do
  code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3004$path)
  echo "$path → $code"
done
```

**Expected:** Every path returns `307`. No path returns `200`, `404`, or `500`.

---

### 2. Middleware redirect points to /login

```bash
curl -sI http://localhost:3004/dashboard | grep -E "^(HTTP|location)"
```

**Expected:**
```
HTTP/1.1 307 Temporary Redirect
location: /login
```

If the `location` header is missing or points elsewhere, middleware config is broken.

---

### 3. Login page renders (200, no crash)

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/login
```

**Expected:** `200`. Also verify the page has the login form:

```bash
curl -s http://localhost:3004/login | grep -i "email\|password\|sign in"
```

**Expected:** grep returns at least one match — confirms the login form rendered, not a blank page.

---

### 4. Bad credentials surface as URL error param (not silent failure)

In browser: navigate to `http://localhost:3004/login`, enter email `test@invalid.com` and password `wrongpassword`, click Sign In.

**Expected:**
- URL changes to `/login?error=Invalid%20login%20credentials` (or similar message from Supabase)
- Error message visible on the login page below the form
- No redirect to dashboard
- No session cookie set

Alternative via curl (verifies the redirect, not the rendered message):
```bash
# Note: ACTION_ID varies — inspect form source for the actual _action field name
# This verifies the redirect pattern without authenticating
curl -sI -X POST http://localhost:3004/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "email=bad@bad.com&password=badpass" | grep -E "^(HTTP|location|Location)"
```
**Expected:** `303` redirect + `location: /login?error=...`

---

### 5. Valid credentials → session cookie → dashboard (full browser cycle)

In browser:
1. Navigate to `http://localhost:3004` — should redirect to `/dashboard` then to `/login` (no session)
2. Enter valid admin email and password
3. Click Sign In
4. **Expected:** Redirect to `/dashboard`. Dashboard layout visible with:
   - Dark sidebar on the left (~240px wide)
   - "BuilderMonster" or similar heading in sidebar
   - 7 navigation links: Dashboard, Sites, Monster Chat, Research Lab, Analytics, Finances, Settings
   - "Logout" or "Sign Out" button at the bottom of the sidebar
   - Main content area showing the Dashboard stub (heading + "Coming soon." or similar)
5. Check DevTools → Application → Cookies → `localhost`
   - **Expected:** One or more `sb-*-auth-token` cookies present, flagged `HttpOnly: true`, `SameSite: Lax`

---

### 6. All 7 sidebar nav links navigate to correct stub pages

After logging in, click each sidebar link in sequence:

| Nav link | Expected URL | Expected page content |
|---|---|---|
| Dashboard | `/dashboard` | Heading "Dashboard" + "Coming soon." |
| Sites | `/sites` | Heading "Sites" + "Coming soon." |
| Monster Chat | `/monster` | Heading "Monster Chat" + "Coming soon." |
| Research Lab | `/research` | Heading "Research Lab" + "Coming soon." |
| Analytics | `/analytics` | Heading "Analytics" + "Coming soon." |
| Finances | `/finances` | Heading "Finances" + "Coming soon." |
| Settings | `/settings` | Heading "Settings" + "Coming soon." |

**Expected for each:** Page renders with sidebar still visible. No 404 or 500.

Automated version (requires session cookie from browser, then copy cookie value):
```bash
# After login via browser, get the sb-* cookie value from DevTools
# Replace <cookie> with actual value
TOKEN="sb-<project-ref>-auth-token=<value>"
for path in /dashboard /sites /monster /research /analytics /finances /settings; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Cookie: $TOKEN" http://localhost:3004$path)
  echo "$path → $code"
done
```
**Expected:** All 7 return `200`.

---

### 7. Logout clears session and redirects to login

After completing Test Case 5:
1. Click the Logout / Sign Out button in the sidebar
2. **Expected:** Redirect to `/login`. Session cookies cleared.
3. Verify session is gone: attempt to navigate to `http://localhost:3004/dashboard`
4. **Expected:** Redirect back to `/login` (307). Not the dashboard.

---

### 8. Direct URL to protected route without session (post-logout bypass attempt)

After logging out (Test Case 7):
1. In browser, manually type `http://localhost:3004/settings` in the address bar and press Enter
2. **Expected:** Redirect to `/login`. No settings page visible.

Automated:
```bash
curl -sI http://localhost:3004/settings | grep -E "^(HTTP|location)"
```
**Expected:** `307 Temporary Redirect` + `location: /login`

---

### 9. Build verification (production build exits 0)

```bash
cd /home/daniel/monster
pnpm --filter @monster/db build
pnpm --filter @monster/shared build
pnpm --filter @monster/admin build
```

**Expected:** All three exit 0. Build output for admin should show 8 routes (/ + 7 sections, all marked `ƒ` dynamic, plus `/_not-found`).

---

### 10. TypeScript clean (no type errors in admin app)

```bash
pnpm --filter @monster/admin exec tsc --noEmit
```

**Expected:** Exits 0 with no output. Any output means type errors introduced during slice work.

---

## Edge Cases

### Missing env vars (env loading failure path)

Remove or comment out `NEXT_PUBLIC_SUPABASE_URL` from `.env`, restart dev server.

**Expected:** Server startup fails or throws an error during the first request. Error message references the missing URL and key. Should NOT silently serve the login page with a broken Supabase client.

Restore env var and restart before continuing.

---

### Concurrent request during session refresh

Open two browser tabs simultaneously to `/dashboard` while logged in. Both should render the dashboard. Middleware refreshes session cookies on each request — parallel requests should not race-condition each other's cookie updates.

**Expected:** Both tabs render `/dashboard` without error. No 500 or redirect loop.

---

### Accessing /login while already authenticated

While holding a valid session, navigate to `http://localhost:3004/login`.

**Expected (current behavior):** Login page renders (no automatic redirect to dashboard). The login page is not protected. This is acceptable behavior for Phase 1 — the authenticated user can submit the form again (no-op) or manually navigate to `/dashboard`.

**Not acceptable:** 500 error or redirect loop.

---

## Failure Signals

- Any protected route returns `200` without valid session → middleware broken (check matcher config in `src/middleware.ts`)
- `/login` returns non-200 → login page compile error (check `src/app/(auth)/login/page.tsx` and `actions.ts`)
- Dev server fails to start with "URL and Key are required" → env var not loaded; check that `apps/admin/.env.local` symlink exists and points to a `.env` file with Supabase vars
- Dev server fails to start with "segment-explorer-node.js not in React Client Manifest" → webpack cache corruption; `rm -rf apps/admin/.next` and restart
- Login with valid creds → stays on `/login` without redirect → signIn action broken; check `apps/admin/src/app/(auth)/login/actions.ts`
- Sidebar not visible after login → (dashboard)/layout.tsx auth guard may be redirecting even with valid session; check `getUser()` return value and cookie presence
- Any of the 7 section paths return 404 → page file missing or incorrectly named; check `ls apps/admin/src/app/(dashboard)/*/page.tsx`
- Logout button does nothing → signOut server action not wired; check `<form action={signOut}>` in `nav-sidebar.tsx`

## Requirements Proved By This UAT

- R013 (Admin panel on VPS1 via pm2) — *partially*: this UAT proves the Next.js 15 admin panel builds and runs with working auth. Full validation requires S05 (pm2 ecosystem, deploy script, reboot survival).

## Not Proven By This UAT

- pm2 process management and reboot survival — covered by S05
- Production port 3001 behavior — currently tested on dev port 3004; S05 validates production mode on 3001
- Access via Tailscale IP — local network tests only; Tailscale connectivity validated when accessing from another machine on the Tailscale network
- Content in any dashboard section — all stubs; M002 adds real content
- Integration with @monster/db types in dashboard components — types imported and used structurally, but no actual DB queries in stub pages

## Notes for Tester

- The Playwright browser verification tools are unavailable on this VPS (missing libnspr4.so). Browser cycle tests (5, 6, 7) require a real browser — either on the VPS via an X session, or by accessing the dev server from another machine on the network.
- When inspecting session cookies in DevTools, look for cookies prefixed `sb-` followed by the Supabase project ref. The cookie is split into chunks (`-0`, `-1`) for large JWTs — this is normal Supabase behavior, not a bug.
- If the sidebar styling looks unstyled (no dark background, plain links), Tailwind CSS is not processing the sidebar file. Check that `globals.css` has `@import "tailwindcss"` and that postcss config references `@tailwindcss/postcss`.
- The `pnpm --filter @monster/admin build` must be run with packages pre-built. Running it without `@monster/db` and `@monster/shared` built first will fail with "Module not found" for `@monster/db` and `@monster/shared`.
