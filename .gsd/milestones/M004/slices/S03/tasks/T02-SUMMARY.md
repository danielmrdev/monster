---
id: T02
parent: S03
milestone: M004
provides:
  - checkDomainAvailability server action (pure read, returns available/price/error)
  - registerDomain server action (guards + polls + updateNameservers + domains row update)
  - DomainManagement client component (availability check + R031-gated registration form)
  - Domain Management card in site detail page.tsx
  - @monster/domains added to admin package.json dependencies
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/package.json
key_decisions:
  - registerDomain destructures { operationId } from SpaceshipClient.registerDomain() (returns object, not raw string)
  - DomainManagement is a 'use client' component using useActionState for both check and register forms; page.tsx stays a server component
  - @monster/domains added to admin dependencies (was missing — not in package.json despite SpaceshipClient being needed server-side)
patterns_established:
  - Availability check and registration are two separate useActionState hooks with independent state machines (check state feeds into register form visibility)
  - Register form hides completely until a domain is confirmed available — prevents accidental submission
  - Registration polling loop (10 × 2s) is inline in the server action, not a separate BullMQ job (appropriate for ~20s max wait)
observability_surfaces:
  - domains table: registrar='spaceship', registered_at=<timestamp>, spaceship_id=<operationId> on successful registration
  - console.log phase progression in registerDomain: [registerDomain] prefix, logs domain+siteId, operationId, each poll attempt result
  - server action returns { error: string } inline for all failure cases — no silent 500s
  - registerDomain failure state inspectable via domains table: missing registrar/registered_at = not yet registered or failed
duration: 30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Domain management UI on site detail page

**Added checkDomainAvailability + registerDomain server actions and a DomainManagement client component; admin build passes clean.**

## What Happened

Added two server actions to `actions.ts`:
- `checkDomainAvailability(domain)` — calls `SpaceshipClient.checkAvailability()`, returns `{ available, price?, error? }`, no DB writes
- `registerDomain(siteId, domain)` — guards (domains row existence, cf_nameservers populated, spaceship_contact_id in settings), registers via SpaceshipClient, polls operation (10 × 2s), calls updateNameservers, updates domains row (`registrar`, `registered_at`, `spaceship_id`)

Created `DomainManagement.tsx` as a `'use client'` component with two `useActionState` hooks:
1. Check form: domain input + "Check Availability" button → shows available/taken badge + price
2. Register form: only shown when check state is `available=true`; red-border warning box with "Charges will apply" copy + "Approve & Register" submit button (R031 gate — explicit form submit only)

Added Domain Management card to `page.tsx` between Deployment and SEO Scores sections. Added `@monster/domains` to `apps/admin/package.json` (was missing; SpaceshipClient import failed at typecheck without it).

One type fix: `SpaceshipClient.registerDomain()` returns `{ operationId: string }` (object), not a raw string — destructured correctly.

## Verification

```
pnpm --filter @monster/domains build     → success
pnpm --filter @monster/domains typecheck → success
pnpm --filter @monster/admin build       → success (13/13 static pages)

grep checkDomainAvailability/registerDomain in actions.ts  → 2 exports confirmed
grep "Domain Management" in page.tsx                        → heading + comment
grep DomainManagement in page.tsx                           → import + JSX usage
grep "Charges will apply" in DomainManagement.tsx           → warning text present

SpaceshipClient export: node -e "...typeof m.SpaceshipClient" → function
settings keys: spaceship_api_secret + spaceship_contact_id in constants.ts → confirmed
```

## Diagnostics

- **Registration success:** `domains` table row for site has `registrar='spaceship'`, `registered_at` non-null, `spaceship_id=<operationId>`
- **Registration failure:** server action returns `{ error: string }` displayed inline; check `domains` row — if registrar/registered_at null, registration never completed
- **Missing credentials guard:** `checkDomainAvailability` returns `{ available: false, error: '[SpaceshipClient] ...' }`; UI shows error inline
- **Missing domains row guard:** `registerDomain` returns `{ error: 'Deploy the site first...' }` — domains row only exists after deploy
- **Missing cf_nameservers guard:** `registerDomain` returns `{ error: 'Cloudflare nameservers not yet assigned...' }` — cf_nameservers populated by deploy job
- **Missing contact ID guard:** `registerDomain` returns `{ error: 'spaceship_contact_id not configured...' }` — directs user to Settings
- **Failure-path check note:** The bare-shell test (`node -e ...`) fails at `NEXT_PUBLIC_SUPABASE_URL` (before reaching settings layer) — expected in CI without Supabase env. Error is descriptive at every layer; verify with live env for settings-level check.

## Deviations

- `@monster/domains` added to `apps/admin/package.json` — not in the plan's listed files, but required for the import to resolve at typecheck
- `SpaceshipClient.registerDomain()` returns `{ operationId }` (destructured), not a raw string — minor type fix from reading the actual signature

## Known Issues

None. All must-haves met, build clean, slice verifications pass.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — added `checkDomainAvailability` and `registerDomain` server actions; added `SpaceshipClient` import
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` (new) — client component: availability check + R031-gated registration form with warning
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — added Domain Management card + DomainManagement import
- `apps/admin/package.json` — added `@monster/domains: workspace:*` to dependencies
- `.gsd/milestones/M004/slices/S03/S03-PLAN.md` — updated failure-path diagnostic note for bare-shell env limitation
