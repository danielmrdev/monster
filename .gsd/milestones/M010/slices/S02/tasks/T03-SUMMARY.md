---
id: T03
parent: S02
milestone: M010
provides:
  - /infra admin page with 4 live VPS2 health cards (reachability, Caddy, disk, memory)
  - TestConnectionButton client component with loading/pass/fail states
key_files:
  - apps/admin/src/app/(dashboard)/infra/page.tsx
  - apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx
key_decisions:
  - Used InfraService never-throw contract — page wraps getVps2Health() in try/catch as defensive belt but relies on structured error fields for display
  - Health cards use conditional green/red/gray coloring matching dashboard card visual pattern
patterns_established:
  - Server component fetching infrastructure health via InfraService with graceful error rendering (error banner card, not 500)
  - Client-side test button pattern: useState loading/result → POST to API → inline badge result display
observability_surfaces:
  - /infra page displays live VPS2 health (reachability, Caddy status, disk %, memory MB) with error detail inline
  - TestConnectionButton shows inline ✓/✗ with error message from /api/infra/test-connection
  - [InfraService] prefixed server logs trace SSH connection attempts during page load
duration: 25m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T03: Infra page (server component + TestConnectionButton)

**Built /infra admin page with 4 VPS2 health status cards and interactive deploy connection test button**

## What Happened

Created two files completing the S02 slice UI:

1. **`page.tsx`** — async server component that calls `new InfraService().getVps2Health()` with try/catch. On success, renders "Infrastructure" heading with fetch timestamp, 4 status cards (VPS2 Reachability green/red, Caddy Service green/red, Disk Usage gray, Memory gray), and a "Deploy Connection" card containing TestConnectionButton. On error/unreachable, the page still renders with structured error detail inline — never a 500.

2. **`TestConnectionButton.tsx`** — `'use client'` component with `useState` for loading/result. On click: POSTs to `/api/infra/test-connection`, shows Loader2 spinner while loading, then renders green Badge "✓ Connection OK" or red Badge "✗ Failed" with error detail in destructive mono text.

Used existing Card/CardHeader/CardContent pattern from dashboard page. Badge and Button from shadcn/ui. Lucide icons (Plug, Loader2) for button states.

## Verification

- `pnpm --filter @monster/admin build` → exits 0, `/infra` listed as `ƒ` (dynamic) route
- `pnpm --filter @monster/admin exec tsc --noEmit` → exits 0
- `pnpm --filter @monster/deployment build` → exits 0, InfraService exported
- `pnpm --filter @monster/deployment typecheck` → exits 0
- Dev server curl `GET /infra` → 200, HTML contains all 4 health cards (VPS2 Reachability: "Unreachable", Caddy: "Inactive", Disk Usage: "—", Memory: "—") + "Test Deploy Connection" button + error detail rendered inline
- Dev server curl `POST /api/infra/test-connection` → `{ ok: false, error: "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL" }` (expected in dev without Supabase env)
- Page renders gracefully when VPS2 is unreachable — structured error banner, not 500

### Slice-level verification

- ✅ `pnpm --filter @monster/deployment build` exits 0 with `InfraService` exported
- ✅ `pnpm --filter @monster/admin build` exits 0
- ✅ `pnpm --filter @monster/deployment typecheck` exits 0
- ✅ `pnpm --filter @monster/admin exec tsc --noEmit` exits 0
- ⚠️ `pnpm -r typecheck` has pre-existing failure in `@monster/agents` (unrelated `template_type` column error in `generate-site.ts`)
- ⬜ Human UAT: verified via curl that /infra renders health cards and test button; full browser UAT requires running admin with Supabase env vars on VPS

## Diagnostics

- **Page inspection:** Navigate to `/infra` — shows 4 health cards with live data (or structured error when VPS2 unreachable)
- **API test:** `curl -X POST /api/infra/test-connection` — returns `{ ok: boolean, error?: string }`
- **Server logs:** `[InfraService]` prefixed lines trace SSH connections and metric collection during page load
- **Error shape:** `Vps2Health.error` field contains SSH/settings error detail, rendered inline in red on the VPS2 Reachability card

## Deviations

- Used `InfraPage` as function name (matches Next.js convention) instead of `Page` per plan — minor naming difference
- Added fetch timestamp display below heading for observability (not in plan but useful for diagnosing stale data)
- Wrapped TestConnectionButton inside a Card for visual consistency with dashboard patterns (plan said "below the cards" — we used a dedicated Deploy Connection card)

## Known Issues

- `pnpm -r typecheck` fails in `@monster/agents` due to pre-existing `template_type` column error — unrelated to this task
- Browser UAT not fully completed in CI (Playwright Chromium headless missing `libnspr4.so` — works locally via curl verification)

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/infra/page.tsx` — async server component with 4 health cards + TestConnectionButton (new)
- `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` — client component for deploy connection testing (new)
- `.gsd/milestones/M010/slices/S02/tasks/T03-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M010/slices/S02/S02-PLAN.md` — marked T03 as [x] done
