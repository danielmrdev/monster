---
id: T01
parent: S01
milestone: M002
provides:
  - SiteCustomizationSchema and SiteCustomization type exported from @monster/shared
  - apps/admin/src/lib/supabase/service.ts canonical re-export of createServiceClient
  - 6 shadcn UI components installed in apps/admin (card, select, textarea, badge, table, separator)
key_files:
  - packages/shared/src/types/customization.ts
  - packages/shared/src/types/index.ts
  - packages/shared/package.json
  - apps/admin/src/lib/supabase/service.ts
  - apps/admin/src/components/ui/card.tsx
  - apps/admin/src/components/ui/select.tsx
  - apps/admin/src/components/ui/textarea.tsx
  - apps/admin/src/components/ui/badge.tsx
  - apps/admin/src/components/ui/table.tsx
  - apps/admin/src/components/ui/separator.tsx
key_decisions:
  - zod added as runtime dependency to packages/shared (not just apps/admin) so the schema is importable by the generator without pulling it through admin
  - createServiceClient re-exported via apps/admin/src/lib/supabase/service.ts — all server actions must import from here, never directly from @monster/db
patterns_established:
  - Canonical service client import path — grep "from '@monster/db'" in apps/admin/src to audit violations
  - SiteCustomizationSchema as the single source of truth for the customization JSON blob shape (admin validation + generator rendering)
observability_surfaces:
  - node -e "const s = require('./packages/shared/dist/index.js'); console.log(Object.keys(s))" — confirms SiteCustomizationSchema exported from dist
  - ls apps/admin/src/components/ui/ — confirms all 6 shadcn components present
  - createServiceClient() throws "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY" at call time if env is unset (visible in pm2 logs monster-admin)
duration: ~20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Define SiteCustomization schema, wire service client, install shadcn components

**Shipped `SiteCustomizationSchema` to `@monster/shared` dist, wired the service client re-export, and installed all 6 shadcn components — T02 has no missing imports.**

## What Happened

Added `zod` as a runtime dependency to `packages/shared/package.json` (was only in `apps/admin`). Created `packages/shared/src/types/customization.ts` with `SiteCustomizationSchema` (five optional string fields: primaryColor, accentColor, fontFamily, logoUrl, faviconUrl) and `SiteCustomization` type. Wired the re-export into `packages/shared/src/types/index.ts`.

Created `apps/admin/src/lib/supabase/service.ts` as a thin re-export of `createServiceClient` from `@monster/db` — establishes the auditable canonical import path for all admin server actions.

Ran `pnpm shadcn add card select textarea badge table separator` in `apps/admin` — all 6 installed cleanly, no conflicts with existing button/input/label.

## Verification

- `pnpm --filter @monster/shared build` → exits 0, `dist/index.js` 1.78 KB, `dist/index.d.ts` 5.75 KB
- `pnpm --filter @monster/shared typecheck` → exits 0, no errors
- `node -e "const s = require('./packages/shared/dist/index.js'); const r = s.SiteCustomizationSchema.safeParse({primaryColor:'#fff'}); console.log(r.success)"` → prints `true`
- `ls apps/admin/src/components/ui/` → shows badge.tsx, card.tsx, select.tsx, separator.tsx, table.tsx, textarea.tsx (plus pre-existing button/input/label)
- `cd apps/admin && pnpm tsc --noEmit` → exits 0, no output

## Diagnostics

- `node -e "const s = require('./packages/shared/dist/index.js'); console.log(Object.keys(s).filter(k => k.includes('Customization')))"` → `[ 'SiteCustomizationSchema' ]`
- `grep -r "createServiceClient" apps/admin/src/` → should only show `service.ts` (the re-export) as the source; any direct `@monster/db` import in action files is a violation
- Missing `SUPABASE_SERVICE_ROLE_KEY` → `createServiceClient()` throws at call time with a descriptive message (D021), surfaced in `pm2 logs monster-admin`

## Deviations

none

## Known Issues

none

## Files Created/Modified

- `packages/shared/src/types/customization.ts` — new: SiteCustomizationSchema (Zod object, 5 optional string fields) + SiteCustomization type
- `packages/shared/src/types/index.ts` — added `export * from './customization.js'`
- `packages/shared/package.json` — added `zod ^3.22.0` as runtime dependency
- `apps/admin/src/lib/supabase/service.ts` — new: canonical re-export of createServiceClient from @monster/db
- `apps/admin/src/components/ui/card.tsx` — new: shadcn card component
- `apps/admin/src/components/ui/select.tsx` — new: shadcn select component
- `apps/admin/src/components/ui/textarea.tsx` — new: shadcn textarea component
- `apps/admin/src/components/ui/badge.tsx` — new: shadcn badge component
- `apps/admin/src/components/ui/table.tsx` — new: shadcn table component
- `apps/admin/src/components/ui/separator.tsx` — new: shadcn separator component
- `.gsd/milestones/M002/slices/S01/S01-PLAN.md` — added failure-path and missing-env diagnostic checks to Verification section (pre-flight fix)
- `.gsd/milestones/M002/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
