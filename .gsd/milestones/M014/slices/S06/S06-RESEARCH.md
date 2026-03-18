# S06: VPS Local Mode + Domain Management Relocation — Research

**Date:** 2026-03-18

## Summary

S06 has two independent concerns: (1) adding an `is_local` flag to the `servers` table so that `InfraService` runs shell commands via `child_process` instead of SSH when the server is the local machine, and (2) relocating the Domain Management widget from the Deploy tab to the Research Lab page.

The local-mode work is mechanical: one SQL migration, a type annotation change in `checkServerHealth`, and a guard branch in that private method. No new dependencies are needed — `child_process` (Node built-in) is already used by `packages/deployment/src/rsync.ts` via `spawn`. The exact same shell commands used over SSH (`systemctl is-active caddy`, `df -h / | tail -1 | awk '{print $5}'`, `free -m | awk '/^Mem:/{print $3, $2}'`) work identically as local `execSync` calls, so parsing logic is unchanged.

The Domain Management relocation is a UI reorganisation. The current `DomainManagement.tsx` component in `sites/[id]/` requires a `siteId` prop because domain registration looks up Cloudflare nameservers via a `domains` row. In the Research Lab context there is no site, so the registration section must be hidden when `siteId` is absent. The cleanest approach is to make `siteId` optional in the component, suppress the registration panel when it is `undefined`, and move the component to `apps/admin/src/components/` so both pages can import it. The `checkDomainAvailability` server action (currently in `sites/[id]/actions.ts`) also needs to be accessible from the Research Lab; the simplest fix is to add it to `apps/admin/src/app/(dashboard)/research/actions.ts` — the logic is a two-line Spaceship call.

## Recommendation

**T01:** Apply the `is_local` migration and update `packages/db/src/types/supabase.ts` manually (same pattern as every prior M014 migration). Then update `InfraService.checkServerHealth` to accept the `is_local` flag and short-circuit to a local `execSync` implementation when true.

**T02:** Relocate `DomainManagement.tsx` to `apps/admin/src/components/DomainManagement.tsx`, make `siteId?: string` optional, hide the register section when it is absent. Add `checkDomainAvailability` to `research/actions.ts`. Wire the component into the Research Lab page and remove it from `SiteDetailTabs` / `sites/[id]/page.tsx`.

Both tasks are independent — T01 touches `packages/deployment` and the DB layer; T02 is purely UI wiring in `apps/admin`. They can be planned or executed in any order.

## Implementation Landscape

### Key Files

**T01 — VPS local mode**

- `packages/deployment/src/infra.ts` — `InfraService.checkServerHealth()` (lines ~148–228). Currently takes a typed inline object `{ id, name, tailscale_ip, public_ip, ssh_user }`. Need to add `is_local: boolean` to that shape. Add a branch at the top: if `server.is_local`, run `execSync` commands and return metrics without SSH. The `conn.dispose()` in the `finally` block must not be called in the local path — structure with an early return or `else` block. No new imports beyond `import { execSync } from 'node:child_process'`.

- `packages/db/supabase/migrations/` — New migration file. Timestamp must be greater than `20260318000001`. Use `20260318120000_servers_is_local.sql`. Content:
  ```sql
  ALTER TABLE servers ADD COLUMN IF NOT EXISTS is_local boolean NOT NULL DEFAULT false;
  ```

- `packages/db/src/types/supabase.ts` — `servers.Row` type (around line 816+). Add `is_local: boolean` to `Row`, `Insert`, and `Update` sub-types. Pattern is identical to how other M014 migrations updated this file manually.

- `apps/admin/src/app/(dashboard)/infra/page.tsx` — No changes needed. The page already renders `fleet.servers` from `getFleetHealth()`; local-mode server will now show `reachable: true` with real metrics instead of an SSH error. 

**T02 — Domain Management relocation**

- `apps/admin/src/components/DomainManagement.tsx` — **New file** (move from `sites/[id]/DomainManagement.tsx`). Change `siteId: string` to `siteId?: string` in the `DomainManagementProps` interface. The `registerAction` internal wrapper and the registration panel JSX block should be conditionally rendered only when `siteId` is truthy. The `checkAction` wrapper and the availability check form are always rendered.

- `apps/admin/src/app/(dashboard)/research/actions.ts` — Add `checkDomainAvailability` server action (copy from `sites/[id]/actions.ts` — it's a 10-line function calling `SpaceshipClient.checkAvailability`). The `'use server'` directive is already at the top of this file.

- `apps/admin/src/app/(dashboard)/research/page.tsx` — Import `DomainManagement` from `@/components/DomainManagement`. Add a "Domain Management" card section somewhere logical — best placement is below the "New Research Session" card in the left column (before the session status block, or after — the left column has `space-y-6` layout so any position works cleanly). The component receives no `siteId` prop here; `existingDomain` is also omitted.

- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — **Delete** (after moving to components/).

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Update import: `import DomainManagement from '@/components/DomainManagement'` (was `./DomainManagement`). Prop call stays identical: `domainSlot={<DomainManagement siteId={site.id} existingDomain={site.domain} />}`.

- `apps/admin/src/app/(dashboard)/sites/[id]/SiteDetailTabs.tsx` — The Deploy tab has `<Card title="Domain Management">{domainSlot}</Card>`. Per the roadmap this section is removed from the Deploy tab. Remove the `domainSlot` prop from `TabsProps`, the destructuring, and the Card. Update the `page.tsx` call-site accordingly.

  **Note on register actions import**: The moved `DomainManagement.tsx` imports `checkDomainAvailability` and `registerDomain` from `'./actions'`. After the move to `components/`, this import path breaks. Two options:
  - Pass the actions as props (adds boilerplate)
  - Import from `'@/app/(dashboard)/sites/[id]/actions'` (valid but couples the component to a route)
  - Best: `checkDomainAvailability` is added to `research/actions.ts`; `registerDomain` stays in `sites/[id]/actions.ts`. The `DomainManagement` component imports `registerDomain` from a different path than `checkDomainAvailability`.
  
  **Simpler alternative**: Keep `DomainManagement.tsx` in `sites/[id]/` — don't move it. In `research/page.tsx`, import it from the app route path: `import DomainManagement from '@/app/(dashboard)/sites/[id]/DomainManagement'`. This is valid in Next.js (any component can be imported cross-route). Add `checkDomainAvailability` to `research/actions.ts` to avoid the component importing from a different route's actions (have `DomainManagement` accept the check action as a prop, OR simply duplicate the tiny function).

  **Recommended path**: Keep the file in `sites/[id]/DomainManagement.tsx`, import it into `research/page.tsx` via `'@/app/(dashboard)/sites/[id]/DomainManagement'`. Make `siteId` optional in the component. The component already imports `registerDomain` from `'./actions'` which resolves to `sites/[id]/actions.ts` — that still works because relative imports are resolved from the file's own directory. Add `checkDomainAvailability` to `research/actions.ts` only if the component's check action needs to be replaced (it doesn't — the component uses the one from `sites/[id]/actions.ts` and that's fine even when rendered in research/).

### Build Order

1. **Migration + DB types** first — unblocks the `infra.ts` change which will produce a TypeScript error once `is_local` is expected by the updated code but not yet in `supabase.ts`.
2. **`infra.ts` local mode** — Add `execSync` branch. Build `@monster/deployment` to verify.
3. **DomainManagement relocation** — Independent of T01. Make `siteId` optional, update imports in `research/page.tsx` and `sites/[id]/page.tsx`. Remove from `SiteDetailTabs`.

### Verification Approach

```bash
# T01: Migration applied
cd packages/db && npx supabase db push --db-url $SUPABASE_DB_URL

# T01: DB type updated — verify is_local in supabase.ts
grep "is_local" packages/db/src/types/supabase.ts

# T01: Deployment package builds cleanly
pnpm --filter @monster/deployment build

# T01: Set is_local=true on hel1 server row via Supabase REST or admin UI
# Then hit /infra page — server should show reachable:true + real disk/memory

# T02: Admin app builds with no type errors
cd apps/admin && npx tsc --noEmit

# T02: Research Lab page renders Domain Management section
# http://localhost:3004/research — should show availability check widget
# Test: enter a domain → Check Availability → result shown

# T02: Deploy tab no longer has Domain Management
# http://localhost:3004/sites/<id> → Deploy tab → no Domain Management card
```

## Common Pitfalls

- **`execSync` throws on non-zero exit** — `systemctl is-active caddy` exits 3 (inactive) or 4 (not-found) when Caddy is not running. These are not errors — wrap `execSync` in try/catch for each command individually, or use `execSync(..., { stdio: 'pipe' })` with `{ encoding: 'utf-8' }` and a try/catch that treats the caught stdout/stderr as the command output (same pattern as SSH).

- **ESM + `node:child_process` import** — `packages/deployment` uses `"module": "NodeNext"` (see `tsconfig.json`). Use `import { execSync } from 'node:child_process'` (node: prefix) — consistent with how `rsync.ts` imports `{ spawn } from 'node:child_process'`.

- **`conn.dispose()` in finally block** — The existing `checkServerHealth` calls `conn.dispose()` in the `finally` block unconditionally. If the local branch returns early before `conn` is created, `conn.dispose()` must not be called (it will throw on an uninitialized NodeSSH). Either only create `conn` inside the SSH branch, or guard with `if (conn)`.

- **DomainManagement `'use client'`** — The component is already `'use client'` and uses `useActionState`. When imported by the Research Lab `page.tsx` (which is a Server Component), Next.js will correctly treat it as a client boundary. No change needed.

- **`registerDomain` import after relocation** — If the component stays in `sites/[id]/DomainManagement.tsx`, the relative `./actions` import still resolves correctly from that location. No change to the import path is needed.

## Open Risks

- `execSync` for `systemctl is-active caddy` may fail if the admin panel process does not have sufficient permissions to query systemd. On a standard Hetzner Ubuntu VPS running as root this is not an issue, but worth logging the actual error clearly.
- The `is_local` column must be set to `true` manually for hel1 after migration (no seed data — it's a one-row update via Supabase dashboard or REST). This is an operational step, not a code step — mention in the task plan.
