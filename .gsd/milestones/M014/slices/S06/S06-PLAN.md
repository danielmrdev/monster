# S06: VPS Local Mode + Domain Management Relocation

**Goal:** Servers with `is_local=true` report real disk/memory/Caddy metrics via `child_process` instead of SSH; Domain Management widget is accessible from Research Lab and removed from the Deploy tab.
**Demo:** After running the migration and setting `is_local=true` on hel1, the `/infra` page shows hel1 as `reachable: true` with real metrics (no SSH error). The Research Lab page has a Domain Management section with the availability check form; the Deploy tab has no Domain Management card.

## Must-Haves

- Migration `20260318120000_servers_is_local.sql` adds `is_local boolean NOT NULL DEFAULT false` to `servers`
- `packages/db/src/types/supabase.ts` updated with `is_local: boolean` in `servers.Row`, `Insert`, `Update`
- `InfraService.checkServerHealth()` short-circuits to `execSync` commands when `server.is_local === true`; SSH path unchanged
- `execSync` calls wrapped individually in try/catch (non-zero exits from inactive Caddy must not throw)
- `DomainManagement.tsx` accepts `siteId?: string` (optional); registration panel hidden when `siteId` is absent
- Research Lab page (`research/page.tsx`) renders `<DomainManagement />` with no `siteId` prop
- Deploy tab (`SiteDetailTabs.tsx`) has no `domainSlot` prop and no Domain Management card
- `@monster/deployment` builds with zero TypeScript errors
- `apps/admin` builds with zero TypeScript errors (`npx tsc --noEmit`)

## Proof Level

- This slice proves: operational + integration
- Real runtime required: yes (migration applied, is_local flag set on hel1 row; admin app renders Research Lab page)
- Human/UAT required: yes (visual check of /infra and /research pages)

## Verification

```bash
# T01: Migration applied
cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL

# T01: DB type updated
grep "is_local" packages/db/src/types/supabase.ts

# T01: Deployment package builds
pnpm --filter @monster/deployment build

# T02: Admin builds with no type errors
cd apps/admin && npx tsc --noEmit

# T02: DomainManagement accepts optional siteId
grep "siteId\?:" apps/admin/src/app/\(dashboard\)/sites/\[id\]/DomainManagement.tsx

# T02: Deploy tab has no domainSlot
grep -c "domainSlot" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx

# T02: Research Lab imports DomainManagement
grep "DomainManagement" apps/admin/src/app/\(dashboard\)/research/page.tsx
```

## Observability / Diagnostics

- Runtime signals: `[InfraService] local-mode metrics for "<name>"` logged on each local check; SSH path logs unchanged (`[InfraService] connecting to ...`)
- Inspection surfaces: `/infra` page shows `reachable: true` + disk/memory values for local server; server console logs
- Failure visibility: if `execSync` fails (permissions, command not found), error message logged as `[InfraService] local-mode error for "<name>": <message>`; server returned with `reachable: false, error: <message>`
- Redaction constraints: none — metrics are non-sensitive

## Integration Closure

- Upstream surfaces consumed: `packages/db/supabase/migrations/` (migration file), `packages/db/src/types/supabase.ts` (type shape), `packages/deployment/src/infra.ts` (`checkServerHealth` signature)
- New wiring introduced: `research/page.tsx` imports `DomainManagement` from `@/app/(dashboard)/sites/[id]/DomainManagement`; `infra.ts` calls `execSync` from `node:child_process` for local servers
- What remains before the milestone is truly usable end-to-end: manual step — set `is_local=true` on the hel1 row via Supabase REST or dashboard after migration

## Tasks

- [ ] **T01: Add is_local migration and wire local-mode execSync in InfraService** `est:45m`
  - Why: Enables hel1 (admin VPS, local machine) to report real metrics without requiring SSH into itself — which is both unnecessary and may fail if the SSH agent socket is not available in the admin process.
  - Files: `packages/db/supabase/migrations/20260318120000_servers_is_local.sql`, `packages/db/src/types/supabase.ts`, `packages/deployment/src/infra.ts`
  - Do: Create migration file; update `servers.Row/Insert/Update` in supabase.ts; add `is_local: boolean` to the inline server shape in `checkServerHealth`; add `import { execSync } from 'node:child_process'` at top of infra.ts; add early-return local branch before SSH code; wrap each `execSync` call in individual try/catch.
  - Verify: `grep "is_local" packages/db/src/types/supabase.ts` exits 0; `pnpm --filter @monster/deployment build` succeeds
  - Done when: deployment package builds clean, `infra.ts` has local branch with `execSync`, migration file exists with correct SQL

- [ ] **T02: Make DomainManagement siteId optional and wire into Research Lab** `est:30m`
  - Why: Domain availability checking is useful in the Research Lab (no site context) not just in the Deploy tab. Registration still requires a site, so the registration panel must be conditionally hidden.
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx`, `apps/admin/src/app/(dashboard)/research/page.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`, `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
  - Do: Make `siteId` optional in `DomainManagementProps`; hide `registerAction` and registration panel JSX when `siteId` is absent; import component in `research/page.tsx` via `'@/app/(dashboard)/sites/[id]/DomainManagement'`; add Domain Management card to Research Lab left column; remove `domainSlot` prop from `SiteDetailTabs` and its Deploy tab card; remove `domainSlot` pass-through in `sites/[id]/page.tsx`.
  - Verify: `cd apps/admin && npx tsc --noEmit` exits 0; `grep "siteId\?:" apps/admin/src/app/\(dashboard\)/sites/\[id\]/DomainManagement.tsx` exits 0; `grep "DomainManagement" apps/admin/src/app/\(dashboard\)/research/page.tsx` exits 0; `grep -c "domainSlot" apps/admin/src/app/\(dashboard\)/sites/\[id\]/SiteDetailTabs.tsx` returns 0
  - Done when: admin app builds type-clean, Research Lab has DomainManagement without siteId, Deploy tab has no Domain Management card

## Files Likely Touched

- `packages/db/supabase/migrations/20260318120000_servers_is_local.sql` (new)
- `packages/db/src/types/supabase.ts`
- `packages/deployment/src/infra.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx`
- `apps/admin/src/app/(dashboard)/research/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
