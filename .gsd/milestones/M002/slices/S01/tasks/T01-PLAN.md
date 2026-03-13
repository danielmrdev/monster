---
estimated_steps: 5
estimated_files: 7
---

# T01: Define SiteCustomization schema, wire service client, install shadcn components

**Slice:** S01 — Sites CRUD
**Milestone:** M002

## Description

Retire the two highest-risk items before any UI work begins: define the canonical `SiteCustomization` Zod schema in `packages/shared` (D027 — must be importable by both admin and generator), and create the service client re-export in `apps/admin` so all subsequent server actions use the right client (D019 — RLS with zero policies means anon client returns nothing). Install the 6 shadcn components needed by the create form so T02 has no missing imports.

## Steps

1. Add `zod` as a runtime dependency to `packages/shared/package.json` (it's only in `apps/admin` today). Run `pnpm install` from monorepo root.

2. Create `packages/shared/src/types/customization.ts`:
   - Define `SiteCustomizationSchema` as a `z.object()` with all optional string fields: `primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, `faviconUrl`
   - Export `SiteCustomization` as `z.infer<typeof SiteCustomizationSchema>`
   - Export the schema itself

3. Add export to `packages/shared/src/types/index.ts`:
   - Add `export * from './customization.js'`

4. Create `apps/admin/src/lib/supabase/service.ts`:
   - Single export: `export { createServiceClient } from '@monster/db'`
   - This establishes the canonical import path for all admin server actions (never import `createServiceClient` from `@monster/db` directly in actions — always via this local re-export so the import path is auditable)

5. Install shadcn components in `apps/admin`:
   - Run `pnpm shadcn add card select textarea badge table separator` from `apps/admin/`
   - Verify each file exists in `apps/admin/src/components/ui/`

6. Build and typecheck `packages/shared`:
   - `pnpm --filter @monster/shared build`
   - `pnpm --filter @monster/shared typecheck`

7. Typecheck `apps/admin`:
   - `pnpm --filter admin typecheck` (or `cd apps/admin && pnpm tsc --noEmit`)

## Must-Haves

- [ ] `SiteCustomizationSchema` exported from `@monster/shared` with fields: `primaryColor`, `accentColor`, `fontFamily`, `logoUrl`, `faviconUrl` (all optional strings)
- [ ] `SiteCustomization` TypeScript type exported from `@monster/shared`
- [ ] `apps/admin/src/lib/supabase/service.ts` exists and re-exports `createServiceClient`
- [ ] All 6 shadcn components present: `card.tsx`, `select.tsx`, `textarea.tsx`, `badge.tsx`, `table.tsx`, `separator.tsx` in `apps/admin/src/components/ui/`
- [ ] `pnpm --filter @monster/shared build` exits 0
- [ ] `tsc --noEmit` exits 0 in `apps/admin`

## Verification

- `pnpm --filter @monster/shared build` — exits 0, `packages/shared/dist/` contains `index.js` and `index.d.ts`
- `node -e "const s = require('./packages/shared/dist/index.js'); const r = s.SiteCustomizationSchema.safeParse({primaryColor:'#fff'}); console.log(r.success)"` — prints `true`
- `ls apps/admin/src/components/ui/` — shows all 6 new component files
- `cd apps/admin && pnpm tsc --noEmit` — exits 0

## Inputs

- `packages/shared/src/types/index.ts` — existing types file to extend
- `packages/shared/package.json` — needs zod added as dependency
- `packages/db/src/client.ts` — source of `createServiceClient` being re-exported
- D027 — schema field list: primaryColor, accentColor, fontFamily, logoUrl, faviconUrl

## Expected Output

- `packages/shared/src/types/customization.ts` — new file with Zod schema and TypeScript type
- `packages/shared/dist/` — rebuilt with customization exports included
- `apps/admin/src/lib/supabase/service.ts` — new file, service client re-export
- `apps/admin/src/components/ui/` — 6 new shadcn component files

## Observability Impact

**What changes after this task:**
- `@monster/shared` dist now exports `SiteCustomizationSchema` — inspectable via `node -e "const s = require('./packages/shared/dist/index.js'); console.log(Object.keys(s))"` which should include `SiteCustomizationSchema`
- `apps/admin/src/lib/supabase/service.ts` is the single canonical import point for `createServiceClient` — grep `from '@monster/db'` in server actions to audit any accidental direct import
- shadcn component files land at `apps/admin/src/components/ui/{card,select,textarea,badge,table,separator}.tsx` — `ls` is sufficient to verify presence

**Failure state visibility:**
- `pnpm --filter @monster/shared build` failing means the Zod schema has a type error — tsup error output identifies the offending line
- `tsc --noEmit` failing in `apps/admin` after this task means a shadcn component or the service re-export has a type conflict — tsc output names the file and line
- If `createServiceClient` is called without `SUPABASE_SERVICE_ROLE_KEY` set, it throws `"Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY"` at call time (D021), visible in `pm2 logs monster-admin`
- Missing shadcn components surface as `Module not found` errors at build time in T02 — `pnpm --filter admin build` output names the missing import
