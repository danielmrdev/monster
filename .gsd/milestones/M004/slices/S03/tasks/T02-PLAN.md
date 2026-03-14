---
estimated_steps: 6
estimated_files: 2
---

# T02: Domain management UI on site detail page

**Slice:** S03 — Domain Management + Spaceship Integration
**Milestone:** M004

## Description

Add `checkDomainAvailability` and `registerDomain` server actions to the site detail `actions.ts`, then add a "Domain Management" card to `page.tsx`. This is the R011 UI surface and the R031 gate — "Approve & Register" must be triggered only by an explicit form submit, never autonomously.

The card has two distinct interaction states:
1. **Check phase** — domain text input + "Check Availability" submit button → shows available/taken result + price
2. **Register phase** — shown only when a domain is available; "Approve & Register" form with a red warning box and separate submit button

`registerDomain` must guard early: if no `domains` row exists for the site, or `cf_nameservers` is empty, return a clear error before calling Spaceship. On success, it polls the operation (10 × 2s), calls `updateNameservers` with the CF nameservers, and updates the `domains` row.

## Steps

1. Add `checkDomainAvailability(domain: string)` server action to `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`:
   - Import `SpaceshipClient` from `@monster/domains`
   - Call `new SpaceshipClient().checkAvailability(domain)`
   - Return `{ available: boolean; price?: string }` on success
   - Catch and return `{ available: false; error: string }` on failure
   - No DB writes — pure read

2. Add `registerDomain(siteId: string, domain: string)` server action:
   - Import `SpaceshipClient` from `@monster/domains` and `createServiceClient` (already imported)
   - Guard 1: fetch `domains` row for site — if missing, return `{ error: "Deploy the site first to generate Cloudflare nameservers." }`
   - Guard 2: if `domains.cf_nameservers` is null or empty, return `{ error: "Cloudflare nameservers not yet assigned — deploy the site first." }`
   - Read `spaceship_contact_id` from settings (same D028 pattern: `(row.value as { value: string }).value`); if missing, return `{ error: "spaceship_contact_id not configured — add it in Settings." }`
   - Call `new SpaceshipClient().registerDomain(domain, contactId)` → get `operationId`
   - Poll up to 10 times with 2s sleep: `SpaceshipClient().pollOperation(operationId)`. If `'failed'`, return `{ error: 'Spaceship registration failed (operation: <operationId>)' }`. If `'success'`, break.
   - If poll exhausted (still 'pending' after 10 attempts), return `{ error: 'Registration timed out — check Spaceship account for operation <operationId>' }`
   - Call `new SpaceshipClient().updateNameservers(domain, domains.cf_nameservers)`
   - Update `domains` row: `registrar = 'spaceship'`, `registered_at = now()`, `spaceship_id = operationId`
   - Return `{ success: true; nameservers: domains.cf_nameservers }`
   - All errors are returned (not thrown) so the UI can display them inline

3. Add "Domain Management" card to `page.tsx` below the Deployment card:
   - Card heading: "Domain Management"
   - Section 1 — Availability Check:
     - `<form action={checkDomainAvailability}>` — but since it returns a value, use a client-compatible pattern: make it a regular `<form>` with a hidden `siteId` and call `checkDomainAvailability` via `formAction`. Use `useActionState` in a client component **OR** implement as a simple server action form that stores result via `searchParams` redirect. Given the page is a server component, the cleanest approach is a small `DomainCheck` client component that holds local state + calls the server action directly.
     - Actually: keep page.tsx as server component. Extract a `DomainManagement` client component (new file) that manages: availability check state (idle/checking/available/taken/error), registration state (idle/registering/success/error). Uses `useActionState` for availability check and a separate `useActionState` for registration form.
   - `DomainManagement` component renders:
     - Domain input + "Check Availability" button (availability check form)
     - After check: green "Available" or red "Taken" badge + price if applicable
     - If available: "Approve & Register" section with red-border warning box ("⚠️ Real registration — charges will apply to your Spaceship account") + "Approve & Register" submit button (red/destructive variant)
     - After registration: success message showing nameservers that were set, or error message
   - Import and render `<DomainManagement siteId={site.id} />` in `page.tsx` below the Deployment card section
   - Note: if `site.domain` is already set, show it prominently at the top of the card with a note "Domain assigned: <domain>"

4. Build the admin app:
   ```bash
   cd /home/daniel/monster && pnpm --filter @monster/admin build
   ```

5. If build fails due to stale `.next` cache (false-positive type errors), clear and rebuild:
   ```bash
   rm -rf apps/admin/.next && pnpm --filter @monster/admin build
   ```

6. Verify wiring:
   ```bash
   grep -E "checkDomainAvailability|registerDomain" apps/admin/src/app/\(dashboard\)/sites/\[id\]/actions.ts
   grep "Domain Management" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
   grep "DomainManagement" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
   ```

## Must-Haves

- [ ] `checkDomainAvailability` server action — no DB writes, catches and returns errors
- [ ] `registerDomain` server action — guards against missing `domains` row + empty `cf_nameservers`; reads `spaceship_contact_id` from settings; polls operation; calls `updateNameservers`; updates `domains` row on success
- [ ] "Approve & Register" is a form submit action, NOT a client-side fetch — enforces R031
- [ ] Warning box with cost language shown before the "Approve & Register" button
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] Registration errors displayed inline (not thrown as 500s)
- [ ] "Deploy first" guard message shown when `domains` row or `cf_nameservers` is missing

## Verification

```bash
pnpm --filter @monster/admin build    # exits 0
grep -E "checkDomainAvailability|registerDomain" apps/admin/src/app/\(dashboard\)/sites/\[id\]/actions.ts
# → 2 matches
grep "Domain Management" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
# → 1 match
grep "DomainManagement" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx
# → import + JSX usage
grep "charges" apps/admin/src/app/\(dashboard\)/sites/\[id\]/DomainManagement.tsx
# → warning text present
```

## Observability Impact

- Signals added: `registerDomain` action logs phase progression via `console.log` in worker; result written to `domains` table (`registrar`, `registered_at`, `spaceship_id`)
- How a future agent inspects this: check `domains` table row for site — `registrar='spaceship'` + `registered_at` non-null = successful registration; `spaceship_id` = Spaceship operation ID for audit
- Failure state exposed: server action returns `{ error: string }` with specific guard message; UI displays inline; no silent failures

## Inputs

- `packages/domains/dist/index.js` — T01 output: `SpaceshipClient` available for import
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — existing server actions to extend
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — existing page to add card to
- `packages/db/src/types/supabase.ts` — `domains` Row type (spaceship_id, registered_at, registrar, cf_nameservers already present)

## Expected Output

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — two new server actions (`checkDomainAvailability`, `registerDomain`)
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` (new) — client component with availability check + registration forms
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Domain Management card section added
