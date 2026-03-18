---
id: S06
parent: M014
milestone: M014
provides:
  - is_local migration applied to servers table (boolean column, DEFAULT false)
  - servers.Row/Insert/Update types updated with is_local field in supabase.ts
  - InfraService local-mode execSync branch via private checkServerHealthLocal() method
  - DomainManagement component accepts optional siteId; registration panel hidden when absent
  - Research Lab page renders DomainManagement (availability check only, no site context)
  - Deploy tab (SiteDetailTabs) has no domainSlot prop and no Domain Management card
requires: []
affects: []
key_files:
  - packages/db/supabase/migrations/20260318120000_servers_is_local.sql
  - packages/db/src/types/supabase.ts
  - packages/deployment/src/infra.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
key_decisions:
  - checkServerHealthLocal is a private method (not inline) for clarity and testability
  - getFleetHealth passes is_local via explicit object spread to satisfy TS inline type shape
  - Each execSync call individually try/caught; inactive Caddy (exit code 3) recovers stdout from error object
  - Both registration blocks wrapped in single {siteId && (<>...</>)} fragment — single guard point, not two
  - useActionState(registerAction, null) stays in component even when siteId is absent (hooks cannot be conditional)
patterns_established:
  - execSync error objects carry stdout/stderr on non-zero exits — cast to { stdout?: string } to recover "inactive" from Caddy exit code 3
  - Monorepo dependency rebuild order: packages/db build must precede packages/deployment build when supabase.ts changes
  - When making a required prop optional with conditional UI, wrap ALL dependent JSX in one guard fragment
observability_surfaces:
  - "[InfraService] local-mode metrics for \"<name>\"" — logged to stdout on every successful local health check
  - "[InfraService] local-mode error for \"<name>\": <msg>" — logged to stderr on execSync failure; also in ServerHealth.error
  - /infra page: reachable:true + numeric disk/mem values visible for any server with is_local=true
  - /research page: DomainManagement card visible in left column with availability search form
drill_down_paths:
  - .gsd/milestones/M014/slices/S06/tasks/T01-SUMMARY.md
  - .gsd/milestones/M014/slices/S06/tasks/T02-SUMMARY.md
duration: 40m
verification_result: passed
completed_at: 2026-03-18T21:15:00Z
---

# S06: VPS Local Mode + Domain Management Relocation

**Added `is_local` column to servers table with execSync-based health collection for the local admin VPS, and relocated Domain Management from the Deploy tab to the Research Lab as a site-context-free availability checker.**

## What Happened

### T01 — is_local migration + InfraService local-mode branch

Created `20260318120000_servers_is_local.sql` adding `is_local boolean NOT NULL DEFAULT false` to the `servers` table and applied it via `npx supabase db push`. Updated `packages/db/src/types/supabase.ts` to add `is_local: boolean` to `servers.Row` and `is_local?: boolean` to `Insert`/`Update`.

In `packages/deployment/src/infra.ts`, added `import { execSync } from 'node:child_process'` and a new private method `checkServerHealthLocal()`. The method runs three `execSync` calls — one each for Caddy status, disk usage, and memory — each wrapped in its own `try/catch`. The key subtlety: `systemctl is-active caddy` exits with code 3 when Caddy is inactive, which causes `execSync` to throw; the inner catch recovers `stdout` from the error object (`err.stdout`) to get the `"inactive"` string rather than propagating the exception.

`checkServerHealth()` now short-circuits to `checkServerHealthLocal()` when `server.is_local === true`; the SSH path is unchanged. `getFleetHealth()` spreads `is_local: server.is_local ?? false` into the explicit object it passes to `checkServerHealth()` to satisfy the inline type shape.

A critical deviation from the plan: `@monster/db` had to be rebuilt before `@monster/deployment` because `supabase.ts` changes only propagate downstream via `dist/index.d.ts`. A first deployment build failed with TS2339; running `pnpm --filter @monster/db build` first resolved it. This is now documented as KN017.

The `SUPABASE_DB_URL` env var expansion also failed in the shell invocation — passing the URL literal inline resolved it (documented as KN018).

### T02 — DomainManagement siteId optional + Research Lab wiring

Four surgical edits:

1. **`DomainManagement.tsx`**: `siteId: string` → `siteId?: string`. Both registration sections (the Approve & Register form block and the registration result block) wrapped together in a single `{siteId && (<>...</>)}` fragment. Hooks remain unconditional — only the JSX that uses `siteId` is guarded.

2. **`research/page.tsx`**: Added `import DomainManagement from '@/app/(dashboard)/sites/[id]/DomainManagement'` and a Domain Management card (with `rounded-lg border bg-card p-6 shadow-sm` styling) in the left column between the "New Research Session" card and the session history block. Rendered as `<DomainManagement />` with no props.

3. **`SiteDetailTabs.tsx`**: Removed `domainSlot: React.ReactNode` from `TabsProps`, from the destructured props, and the `<Card>` wrapping it from the Deploy tab JSX.

4. **`sites/[id]/page.tsx`**: Removed the `DomainManagement` import and the `domainSlot={<DomainManagement siteId={site.id} ... />}` prop from the `<SiteDetailTabs>` call.

`cd apps/admin && npx tsc --noEmit` exits 0 — zero type errors.

## Verification

All slice-level verification checks passed:

| Check | Command | Result |
|-------|---------|--------|
| Migration file exists | `ls packages/db/supabase/migrations/20260318120000_servers_is_local.sql` | ✅ |
| DB types updated (3 matches) | `grep "is_local" packages/db/src/types/supabase.ts` | ✅ |
| Migration applied to remote DB | `npx supabase db push --db-url <url>` | ✅ |
| Deployment package builds | `pnpm --filter @monster/deployment build` | ✅ |
| Local-mode log strings present | `grep "local-mode" packages/deployment/src/infra.ts` | ✅ |
| DomainManagement siteId optional | `grep "siteId" DomainManagement.tsx` → `siteId?: string;` | ✅ |
| Research Lab imports component | `grep "DomainManagement" research/page.tsx` | ✅ |
| Deploy tab has no domainSlot | `grep -c "domainSlot" SiteDetailTabs.tsx` → 0 | ✅ |
| Admin TypeScript clean | `cd apps/admin && npx tsc --noEmit` | ✅ |

## New Requirements Surfaced

- none

## Deviations

- **Build order not mentioned in plan (T01):** `@monster/db` must be rebuilt before `@monster/deployment` when `supabase.ts` changes. Plan didn't call this out. First deployment build attempt failed with TS2339; fixed by adding the intermediate db build step. Documented as KN017.
- **SUPABASE_DB_URL env expansion (T01):** `npx supabase db push --db-url $SUPABASE_DB_URL` with unexported env var fails silently to local socket. Passing URL literal inline worked. Documented as KN018.
- **Single guard fragment vs. two separate guards (T02):** Plan implied two separate `{siteId && (...)}` guards. Implementation uses one `{siteId && (<>...</>)}` wrapping both blocks — functionally identical and cleaner.

## Known Limitations

- **Domain registration no longer accessible from site detail page.** The Deploy tab no longer has a Domain Management card. Registration requires navigating to Research Lab. If site-context registration is needed in future, a `<DomainManagement siteId={site.id} />` would need to be re-added to the Deploy tab or a dedicated action added to the site detail page.
- **Manual step required to activate local mode for hel1:** Set `is_local=true` on the hel1 row via Supabase REST API (`PATCH /rest/v1/servers?name=eq.hel1` with service_role key) or the Supabase dashboard. The code is ready; the flag must be set by the operator.
- **execSync commands assume standard Linux tools** (`df`, `free`, `systemctl`, `awk`). If run on macOS or a non-systemd Linux, the commands will fail and log `[InfraService] local-mode error`. This is expected — VPS1 is Ubuntu 24.04.

## Follow-ups

- Set `is_local=true` on hel1 row in production Supabase to activate local-mode metrics collection.
- Consider adding `is_local` toggle to the Infra admin UI so operators can flip the flag without touching Supabase directly.
- If domain registration from a site context is needed again in the future, re-add `DomainManagement` with `siteId` prop to the Deploy tab.

## Files Created/Modified

- `packages/db/supabase/migrations/20260318120000_servers_is_local.sql` — new; adds `is_local boolean NOT NULL DEFAULT false` to servers
- `packages/db/src/types/supabase.ts` — `servers.Row` gains `is_local: boolean`; Insert and Update gain `is_local?: boolean`
- `packages/deployment/src/infra.ts` — `execSync` import; `checkServerHealth` parameter shape adds `is_local: boolean`; local-mode early return; new `checkServerHealthLocal` private method; `getFleetHealth` passes `is_local` field
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — `siteId` made optional; registration panel guarded by `{siteId && (...)}`
- `apps/admin/src/app/(dashboard)/research/page.tsx` — imports DomainManagement; adds Domain Management card in left column
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — `domainSlot` prop removed from interface, destructuring, and Deploy tab JSX
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — DomainManagement import and `domainSlot` prop pass-through removed

## Forward Intelligence

### What the next slice should know
- `is_local` mode is complete but **requires the operator to set the flag**. The /infra page won't show real local metrics until `is_local=true` is set on hel1 in the DB. Any milestone DoD check that requires "hel1 shows real metrics" needs this manual step first.
- `checkServerHealthLocal()` is the pattern for any future "run command locally" health check. Adding a new metric (e.g., CPU usage) follows: add an `execSync` call in its own try/catch, parse the output, add the field to the returned `ServerHealth` object.
- Domain registration is now **only accessible from Research Lab** — intentional per the slice plan. The Deploy tab no longer has any domain management UI. If a product owner wants registration back in site context, it needs a scoped decision first.

### What's fragile
- `execSync` commands in `checkServerHealthLocal()` are brittle shell pipelines (`df -h / | tail -1 | awk '{print $5}'`, `free -m | awk '/^Mem:/{print $3, $2}'`). These work on Ubuntu 24.04 but would break on Alpine or macOS. If the VPS OS changes, revisit these.
- The `DomainManagement` import path in `research/page.tsx` is `'@/app/(dashboard)/sites/[id]/DomainManagement'` — a cross-route import. If `DomainManagement` is moved or renamed, this import will silently break TypeScript compilation.

### Authoritative diagnostics
- `[InfraService] local-mode metrics for "<name>"` in admin server stdout — confirms local mode is active and healthy
- `[InfraService] local-mode error for "<name>": <message>` in stderr — confirm the specific execSync failure
- `cd apps/admin && npx tsc --noEmit` — authoritative type-check for any admin UI change in this slice

### What assumptions changed
- **Plan assumed `SUPABASE_DB_URL` is always available via env var expansion.** It's not — the variable must be explicitly exported or passed as a literal. The workaround (use the literal URL) is reliable but tedious.
- **Plan assumed deployment build would succeed after editing `supabase.ts`.** It doesn't — `@monster/db` must be rebuilt first because downstream packages consume `dist/index.d.ts`, not the source.
