---
id: S02
parent: M010
milestone: M010
provides:
  - /infra admin page with live VPS2 health dashboard (reachability, Caddy status, disk, memory)
  - InfraService class in @monster/deployment (getVps2Health, testDeployConnection)
  - POST /api/infra/test-connection route
  - TestConnectionButton client component with loading/pass/fail states
  - /infra nav item in NavSidebar
requires:
  - slice: S01
    provides: VPS2 reachable via SSH over Tailscale (prerequisite for live health fetch)
affects:
  - S03
key_files:
  - packages/deployment/src/infra.ts
  - packages/deployment/src/index.ts
  - apps/admin/src/app/(dashboard)/infra/page.tsx
  - apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx
  - apps/admin/src/app/api/infra/test-connection/route.ts
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/next.config.ts
key_decisions:
  - D139: InfraService reads settings internally (self-contained) — different ergonomics from CaddyService/RsyncService which receive params from BullMQ jobs
  - D140: webpack.externals + serverExternalPackages both needed to externalize node-ssh/ssh2/cpu-features when imported via workspace package
patterns_established:
  - InfraService never-throw pattern: both methods return structured error objects instead of throwing
  - readVps2Settings() shared helper extracts vps2_host/vps2_user from Supabase settings table using correct (s.value as { value?: string })?.value pattern
  - Webpack externals for native SSH modules in next.config.ts — any future route importing @monster/deployment is already covered
  - Server component fetching infrastructure health with graceful error rendering (error banner card, not 500)
  - Client-side test button pattern: useState loading/result → POST to API → inline badge result display
observability_surfaces:
  - /infra page displays live VPS2 health (reachability, Caddy status, disk %, memory MB) with error detail inline
  - POST /api/infra/test-connection returns { ok: boolean, error?: string } — structured error detail on failure
  - [InfraService] prefixed console logs trace SSH connections and metric collection
  - Vps2Health.error and testDeployConnection().error fields surface failures as structured data
drill_down_paths:
  - .gsd/milestones/M010/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M010/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M010/slices/S02/tasks/T03-SUMMARY.md
duration: 62m
verification_result: passed
completed_at: 2026-03-16
---

# S02: Admin Infra Health Page

**Live VPS2 health dashboard in admin panel with SSH-based reachability, Caddy status, disk/memory metrics, and interactive deploy connection test button**

## What Happened

Built the full `/infra` admin page in three tasks:

**T01 — InfraService** (`packages/deployment/src/infra.ts`): Created the `InfraService` class with two never-throw methods. `getVps2Health()` reads `vps2_host`/`vps2_user` from Supabase settings, SSHes into VPS2 via SSH agent (`SSH_AUTH_SOCK`), runs three commands (`systemctl is-active caddy`, `df -h /`, `free -m`), and parses results into a typed `Vps2Health` object. `testDeployConnection()` runs `echo ok` over the same SSH path. Both return structured error objects on failure — callers never need try/catch. Added `@monster/db` as a workspace dependency for settings access.

**T02 — API route + nav** (`apps/admin`): Created the `POST /api/infra/test-connection` route handler calling `InfraService.testDeployConnection()`. Added "Infrastructure" nav item with Server icon to NavSidebar after Settings. Added `@monster/deployment` to admin's `package.json` and configured both `serverExternalPackages` and explicit `webpack.externals` for `node-ssh`, `ssh2`, `cpu-features` native modules — `serverExternalPackages` alone was insufficient for transitive deps via workspace packages (D140).

**T03 — Page + client button** (`apps/admin/src/app/(dashboard)/infra/`): Built the async server component `page.tsx` that calls `InfraService.getVps2Health()` and renders 4 status cards (VPS2 Reachability green/red, Caddy Service green/red, Disk Usage, Memory) plus a Deploy Connection card with `TestConnectionButton`. The page gracefully handles unreachable VPS2 with structured error display, never a 500. `TestConnectionButton` is a `'use client'` component with loading spinner and inline ✓/✗ badge result.

## Verification

- ✅ `pnpm --filter @monster/deployment build` — exits 0, `InfraService` + `Vps2Health` exported in `dist/index.d.ts`
- ✅ `pnpm --filter @monster/deployment typecheck` — exits 0
- ✅ `pnpm --filter @monster/admin build` — exits 0, `/infra` and `/api/infra/test-connection` listed as dynamic routes
- ✅ `pnpm --filter @monster/admin exec tsc --noEmit` — exits 0
- ✅ curl `GET /infra` → 200, HTML contains all 4 health cards + TestConnectionButton
- ✅ curl `POST /api/infra/test-connection` → `{ ok: false, error: "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL" }` — correct shape, expected in dev without Supabase env
- ✅ Page renders gracefully when VPS2 unreachable — structured error banner, not 500
- ⚠️ `pnpm -r typecheck` has pre-existing failure in `@monster/agents` (`template_type` column error) — unrelated
- ⬜ Human UAT: verified via curl; full browser UAT requires running admin with Supabase env vars on VPS

## Requirements Advanced

- R006 — Deployment operability improved: operator can now verify VPS2 SSH connectivity, Caddy status, and resource usage from the admin panel before and after deployments

## Requirements Validated

- none

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Added `@monster/db` as workspace dependency of `@monster/deployment` — not explicitly in plan but required for `createServiceClient` import in InfraService
- Added `@monster/deployment` to admin's `package.json` — plan assumed it might already exist from M004; it didn't
- Added explicit `webpack.externals` for `node-ssh`/`ssh2`/`cpu-features` beyond `serverExternalPackages` — plan only mentioned the latter but it was insufficient for native modules imported transitively via workspace packages (D140)
- Fetch timestamp displayed below heading for observability (not in plan)
- TestConnectionButton wrapped in a dedicated Card for visual consistency (plan said "below the cards")

## Known Limitations

- Full health data requires Supabase env vars + VPS2 reachable via Tailscale SSH — in dev without these, page renders with structured "missing env" or "unreachable" errors (graceful, not broken)
- `pnpm -r typecheck` has a pre-existing failure in `@monster/agents` on `template_type` column — not related to this slice
- No auto-refresh on the `/infra` page — data is fetched once on server component render. Operator must refresh page for updated data.
- Disk/memory cards show "—" when VPS2 is unreachable (no cached data)

## Follow-ups

- none — S03 is the natural continuation (deploy.sh pre-flight uses equivalent shell logic)

## Files Created/Modified

- `packages/deployment/src/infra.ts` — new: InfraService class + Vps2Health interface (~160 lines)
- `packages/deployment/src/index.ts` — added InfraService + Vps2Health exports
- `packages/deployment/package.json` — added @monster/db workspace dependency
- `packages/deployment/tsup.config.ts` — added @monster/db to external array
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — new: async server component with 4 health cards
- `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` — new: client component for deploy connection testing
- `apps/admin/src/app/api/infra/test-connection/route.ts` — new: POST route handler
- `apps/admin/src/components/nav-sidebar.tsx` — added Server icon import + /infra nav item
- `apps/admin/next.config.ts` — added serverExternalPackages + webpack.externals for SSH native modules
- `apps/admin/package.json` — added @monster/deployment workspace dependency

## Forward Intelligence

### What the next slice should know
- `InfraService` in `packages/deployment/src/infra.ts` uses `readVps2Settings()` to fetch `vps2_host`/`vps2_user` from Supabase settings. S03's `deploy.sh` pre-flight needs the shell equivalent — it should use `scripts/lib/vps2-check.sh` (from S01) which accepts host/user as CLI args.
- The webpack externals config in `next.config.ts` (D140) already covers any future admin route that imports `@monster/deployment`. S03 does not need to touch `next.config.ts`.

### What's fragile
- The settings value extraction pattern `(s.value as { value?: string })?.value` is non-obvious and differs from the lossy `s.value as string` cast in `deploy-site.ts`. If settings value structure changes, both patterns need updating.
- `ssh2` native module externalization requires both `serverExternalPackages` AND `webpack.externals` — forgetting either causes build failure with cryptic binary parse errors.

### Authoritative diagnostics
- `curl -X POST /api/infra/test-connection` — returns `{ ok, error? }` with structured SSH error detail; the fastest way to verify the deploy SSH path works
- `/infra` page in browser — shows all 4 health metrics or structured error; the single pane of glass for VPS2 health
- `[InfraService]` log lines in server console — trace SSH connections, metric parsing, and failures

### What assumptions changed
- Assumed `serverExternalPackages` alone handles native module externalization — actually need explicit `webpack.externals` too for workspace package transitive deps (D140)
- Assumed `@monster/deployment` was already in admin's package.json from M004 — it wasn't; had to add it
