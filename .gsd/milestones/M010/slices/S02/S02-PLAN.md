# S02: Admin Infra Health Page

**Goal:** Add an `/infra` page to the admin panel that shows VPS2 infrastructure health fetched live over SSH: reachability, Caddy service status, disk usage, memory usage, and a "Test Deploy Connection" button that validates the exact SSH paths used by `RsyncService` and `CaddyService`.

**Demo:** Navigating to `/infra` in the admin panel shows a dashboard with four health indicators (SSH reachable, Caddy active, disk %, memory %) populated with live VPS2 data. Clicking "Test Deploy Connection" sends a POST to `/api/infra/test-connection`, runs an SSH check matching `CaddyService`'s node-ssh config, and displays "✓ Connection OK" or "✗ Failed — <error detail>" inline.

## Must-Haves

- `/infra` nav item added to NavSidebar under the Settings section (or at the bottom).
- Server component `app/(dashboard)/infra/page.tsx` fetches health data from `InfraService.getVps2Health()` — no client-side data fetching; health data arrives via RSC.
- `InfraService` in `packages/deployment/src/infra.ts`: `getVps2Health()` uses node-ssh with the same SSH agent pattern as `CaddyService`; runs `systemctl is-active caddy`, `df -h /`, `free -m` via execCommand; parses and returns typed `Vps2Health` object.
- `testDeployConnection()` method: creates a fresh node-ssh connection to `vps2_host` as `vps2_user`, runs `echo ok`, disposes; returns `{ ok: true }` or `{ ok: false, error: string }`.
- `GET /api/infra/health` route handler: calls `InfraService.getVps2Health()` (used by page.tsx revalidation or direct fetch).
- `POST /api/infra/test-connection` route handler: calls `InfraService.testDeployConnection()`, returns JSON `{ ok, error? }`.
- Client component `TestConnectionButton.tsx` — `'use client'`; POSTs to `/api/infra/test-connection`; shows loading spinner, then ✓ or ✗ result inline.
- Page gracefully handles SSH failure (VPS2 unreachable): shows "Unreachable" status with the error detail rather than crashing.
- `pnpm build` and `pnpm typecheck` exit 0.

## Proof Level

- This slice proves: integration (live SSH to VPS2, real service status)
- Real runtime required: yes (VPS2 must be reachable via Tailscale SSH for full verification)
- Human/UAT required: yes (navigate to /infra in browser, verify live health indicators, click test button)

## Verification

- `pnpm --filter @monster/deployment build` exits 0 with `InfraService` exported
- `pnpm -r build` exits 0
- `pnpm -r typecheck` exits 0
- Human UAT: `/infra` page loads and shows VPS2 health; "Test Deploy Connection" returns ✓ on a healthy VPS2

## Observability / Diagnostics

- Runtime signals: `[InfraService]` prefixed log lines for SSH commands and results
- Inspection surfaces: `/infra` page shows live status; `/api/infra/test-connection` POST returns JSON with error detail
- Failure visibility: SSH errors surface as `{ ok: false, error: "..." }` in API response and displayed in UI; never swallowed silently
- Redaction constraints: VPS2 host/user read from Supabase settings (D028 pattern); not logged

## Integration Closure

- Upstream surfaces consumed: `vps2_host`, `vps2_user` from Supabase settings (same as CaddyService); `node-ssh` SSH agent pattern from D070/D071
- New wiring introduced in this slice: `InfraService` exported from `packages/deployment`; `/infra` page in admin nav
- What remains before the milestone is truly usable end-to-end: S03 deploy.sh pre-flight (connects shell scripts to InfraService logic)

## Tasks

- [x] **T01: InfraService in packages/deployment** `est:45m`
  - Why: The health data needs a typed service layer that `page.tsx` can call server-side and that the API route can call too.
  - Files: `packages/deployment/src/infra.ts`, `packages/deployment/src/index.ts`
  - Do: Create `InfraService` class. `getVps2Health()`: reads `vps2_host` + `vps2_user` from Supabase settings (createServiceClient pattern); creates NodeSSH connection via SSH agent; runs 3 commands: `systemctl is-active caddy`, `df -h / | tail -1 | awk '{print $5}'`, `free -m | awk '/Mem/{print $3, $2}'`; parses into `Vps2Health = { reachable: boolean, caddyActive: boolean, diskUsedPct: number, memUsedMb: number, memTotalMb: number, error?: string }`. `testDeployConnection()`: similar pattern but just runs `echo ok`; returns `{ ok: boolean, error?: string }`. Export both from `packages/deployment/src/index.ts`. Rebuild package.
  - Verify: `pnpm --filter @monster/deployment build` exits 0; `InfraService` exported from index.
  - Done when: package builds, `Vps2Health` type exported, both methods implemented with SSH agent connection

- [x] **T02: Infra API routes and nav item** `est:30m`
  - Why: Admin panel needs to call InfraService from server-side RSC and from a client button.
  - Files: `apps/admin/src/app/api/infra/test-connection/route.ts`, `apps/admin/src/components/nav-sidebar.tsx`
  - Do: Create `POST /api/infra/test-connection` route: calls `new InfraService().testDeployConnection()`, returns `NextResponse.json({ ok, error? })`. Add `/infra` nav item to `NavSidebar` below Settings or at bottom of nav list (use existing NavItem pattern). Ensure `@monster/deployment` is in `serverExternalPackages` in `next.config.ts` if not already.
  - Verify: `pnpm build` exits 0; nav item appears in sidebar
  - Done when: route handler exists, nav item wired, build passes

- [x] **T03: Infra page (server component + TestConnectionButton)** `est:45m`
  - Why: The visible health dashboard and the interactive test button close the loop on this slice.
  - Files: `apps/admin/src/app/(dashboard)/infra/page.tsx`, `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx`
  - Do: `page.tsx` is an async server component: calls `new InfraService().getVps2Health()`, wraps in try/catch for SSH failure. Renders 4 status cards (SSH reachable, Caddy active, Disk %, Memory) using existing shadcn Card pattern. Shows error banner if `getVps2Health()` throws. Import `TestConnectionButton` as a leaf client component. `TestConnectionButton.tsx`: `'use client'`; `useState` for loading/result; POSTs to `/api/infra/test-connection`; shows spinner during request; renders ✓ green / ✗ red badge with error detail. Match existing dashboard card visual pattern.
  - Verify: `pnpm build` exits 0; navigate to /infra — page renders without crash; test button POSTs and shows result
  - Done when: page renders health data (or graceful error), TestConnectionButton works end-to-end

## Files Likely Touched

- `packages/deployment/src/infra.ts` (new)
- `packages/deployment/src/index.ts`
- `apps/admin/src/app/(dashboard)/infra/page.tsx` (new)
- `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` (new)
- `apps/admin/src/app/api/infra/test-connection/route.ts` (new)
- `apps/admin/src/components/nav-sidebar.tsx`
- `apps/admin/next.config.ts`
