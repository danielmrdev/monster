---
id: S03
parent: M004
milestone: M004
provides:
  - SpaceshipClient with checkAvailability, registerDomain, pollOperation, updateNameservers
  - spaceship_api_secret and spaceship_contact_id settings keys (3-file settings pattern)
  - checkDomainAvailability server action (availability check, returns available/price/error)
  - registerDomain server action (guards + polls operation + updateNameservers + domains row update)
  - DomainManagement client component (availability check form + R031-gated registration form)
  - Domain Management card in site detail page.tsx
  - @monster/domains added to admin package.json dependencies
requires:
  - slice: S02
    provides: domains.cf_nameservers (written by runDeployPhase, consumed by registerDomain NS update)
affects: []
key_files:
  - packages/domains/src/spaceship.ts
  - packages/domains/src/index.ts
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/actions.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/package.json
key_decisions:
  - SpaceshipClient uses raw fetch (D065) — no npm client exists; thin class wrapping fetch is sufficient
  - fetchCredentials() reads both spaceship_api_key and spaceship_api_secret in one call, ensuring both present before any API call
  - Auth headers use exact Spaceship curl casing X-Api-Key / X-Api-Secret (not title-case X-API-Key)
  - registerDomain reads operationId from spaceship-async-operationid response header, not body
  - updateNameservers is synchronous (200, no poll) — matches Spaceship API design
  - DomainManagement is 'use client' using useActionState; page.tsx stays a server component
  - Registration form hides completely until domain confirmed available (prevents accidental submission)
  - Polling loop (10 × 2s) is inline in server action, not a BullMQ job (appropriate for ~20s max wait)
  - @monster/domains added to admin package.json (was missing; SpaceshipClient import failed typecheck without it)
  - SpaceshipClient.registerDomain() returns { operationId } (object), not raw string — destructured correctly
patterns_established:
  - SpaceshipClient mirrors CloudflareClient exactly: D028 credential reads, [SpaceshipClient] log prefix, descriptive throws with method context
  - Two separate useActionState hooks for check and register — independent state machines
  - Availability check result feeds register form visibility — explicit user intent required before R031 gate
observability_surfaces:
  - "[SpaceshipClient] checkAvailability: domain=..." on every availability check
  - "[SpaceshipClient] registerDomain: domain=... operationId=..." on registration
  - "[SpaceshipClient] pollOperation: operationId=... status=..." on each poll attempt
  - "[SpaceshipClient] updateNameservers: domain=... nameservers=[...]" on NS update
  - "[registerDomain] Starting/polling/completed" prefix in server action (domain + operationId)
  - domains table: registrar='spaceship', registered_at, spaceship_id on successful registration
drill_down_paths:
  - .gsd/milestones/M004/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S03/tasks/T02-SUMMARY.md
duration: 55m
verification_result: passed
completed_at: 2026-03-13
---

# S03: Domain Management + Spaceship Integration

**SpaceshipClient implemented with four domain registration methods; domain management UI added to site detail page with R031-gated registration form; all builds exit 0.**

## What Happened

**T01** created `packages/domains/src/spaceship.ts` — a `SpaceshipClient` class following the CloudflareClient pattern (D065, D028). `fetchCredentials()` reads `spaceship_api_key` + `spaceship_api_secret` from Supabase settings in one call, throwing with a `[SpaceshipClient]` prefix and key name if either is missing. Four public methods:

- `checkAvailability(domain)` — `GET /v1/domains/{domain}/available`, checks `result === 'available'`, extracts premium price if `premiumPricing` non-empty
- `registerDomain(domain, contactId)` — `POST /v1/domains/{domain}`, expects 202, reads `operationId` from `spaceship-async-operationid` response header
- `pollOperation(operationId)` — `GET /v1/async-operations/{operationId}`, returns status field
- `updateNameservers(domain, nameservers)` — `PUT /v1/domains/{domain}/nameservers`, expects 200 (synchronous)

Exported from `packages/domains/src/index.ts` alongside `CloudflareClient`. Added `spaceship_api_secret` and `spaceship_contact_id` to all three settings files: `constants.ts` (positions 1-2 after `spaceship_api_key`), `actions.ts` (schema + error type), `settings-form.tsx` (API Secret as password input, Contact ID as text with format hint).

**T02** wired the client into the site detail page. Two server actions in `actions.ts`:

- `checkDomainAvailability(domain)` — calls `SpaceshipClient.checkAvailability()`, returns `{ available, price?, error? }`, no DB writes
- `registerDomain(siteId, domain)` — guards against missing domains row, empty `cf_nameservers`, and missing `spaceship_contact_id`; on pass: registers, polls operation (10 × 2s), calls `updateNameservers`, updates `domains` row (`registrar='spaceship'`, `registered_at`, `spaceship_id`)

`DomainManagement.tsx` is a `'use client'` component with two `useActionState` hooks. The registration form is hidden until the check result is `available: true` — enforcing an explicit two-step intent before the R031 gate. The form includes a red-border warning ("Real registration — charges will apply to your Spaceship account") with an "Approve & Register" submit button. Added `@monster/domains: workspace:*` to `apps/admin/package.json` (missing — SpaceshipClient import failed typecheck without it).

## Verification

```
pnpm --filter @monster/domains build    → exit 0 (dist/index.js 12.05 KB)
pnpm --filter @monster/domains typecheck → exit 0
pnpm --filter @monster/admin build      → exit 0 (13/13 static pages)

node -e "import('.../domains/dist/index.js').then(m => console.log(typeof m.SpaceshipClient))"
→ function

grep spaceship_api_secret/spaceship_contact_id in constants.ts  → 2 matches
grep checkDomainAvailability/registerDomain in actions.ts        → 2 exports confirmed
grep "Domain Management" in page.tsx                             → heading + comment
grep DomainManagement in page.tsx                                → import + JSX usage
```

## Requirements Advanced

- R011 — Domain management via Spaceship + Cloudflare: `SpaceshipClient` provides all four required methods; admin panel availability check + registration UI implemented. Proof level: contract (build + type verification). Live Spaceship credentials required for runtime validation.

## Requirements Validated

None in this slice — S03 proof level is contract-only. R011 is advanced but runtime validation requires live Spaceship API credentials entered in Settings.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

- `@monster/domains` added to `apps/admin/package.json` — not listed in plan's file list, but required for SpaceshipClient import to resolve at typecheck
- `SpaceshipClient.registerDomain()` returns `{ operationId }` object (not raw string) — server action destructures correctly; minor type fix from reading actual signature

## Known Limitations

- **No live runtime validation**: Spaceship API requires real credentials + real domain. The availability check and registration flow cannot be end-to-end tested without entering `spaceship_api_key`, `spaceship_api_secret`, and `spaceship_contact_id` in admin Settings, and having a real domain available to check.
- **Polling is inline, not a job**: The 10 × 2s operation poll is synchronous inside the server action (~20s max). If Spaceship is slow to process, the user sees a loading state for up to 20s. For Phase 1 this is acceptable; if Spaceship regularly takes >20s, promote to a BullMQ job.
- **No retry on registration failure**: If `pollOperation` returns `'failed'` or times out, the server action returns an error. User must manually retry via the form. No automatic retry logic.

## Follow-ups

- Enter Spaceship credentials in admin Settings (spaceship_api_key, spaceship_api_secret, spaceship_contact_id) for live UAT
- Verify spaceship_contact_id format: Spaceship contact record must be pre-created in the account; ID is 27–32 chars (format hint shown in UI)
- After live registration: verify domains table row has registrar='spaceship', registered_at non-null, spaceship_id=<operationId>
- After NS update: Cloudflare nameservers propagate; site lifecycle transitions from dns_pending → ssl_pending → live (handled by SslPollerJob from S02)

## Files Created/Modified

- `packages/domains/src/spaceship.ts` — new SpaceshipClient class (~190 lines)
- `packages/domains/src/index.ts` — added SpaceshipClient export
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added spaceship_api_secret + spaceship_contact_id (11 keys total)
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — added 2 new keys to SaveSettingsSchema + SaveSettingsErrors
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Spaceship section expanded to 3 fields
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — added checkDomainAvailability + registerDomain server actions
- `apps/admin/src/app/(dashboard)/sites/[id]/DomainManagement.tsx` — new client component (availability check + registration form)
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — added Domain Management card
- `apps/admin/package.json` — added @monster/domains: workspace:*

## Forward Intelligence

### What the next slice should know
- M004 is now complete. The next milestone (M005: Analytics) starts fresh.
- The full domain lifecycle (check → approve → register → NS update → deploy → DNS propagation → SSL → live) requires all four of: live Spaceship credentials, live Cloudflare token, VPS2 operational, and a deployed site (domains row with cf_nameservers populated).
- Domain registration is a real-money action. The R031 gate (explicit form submit, warning box) is correctly placed in the UI — do not automate this path.

### What's fragile
- Spaceship contact ID prerequisite — domain registration returns 422 if the contact ID is wrong or the record doesn't exist in the Spaceship account. The error message is surfaced inline in the UI. Contact ID must be obtained from the Spaceship dashboard before attempting registration.
- `cf_nameservers` must be populated before `registerDomain` can call `updateNameservers`. This requires a prior successful deploy (S02 `runDeployPhase` writes cf_nameservers). Registration without a prior deploy will hit the explicit guard and return a clear error.

### Authoritative diagnostics
- Spaceship API errors: `[SpaceshipClient]` prefix in server/worker logs — every API call logs method + domain + HTTP status on non-2xx; credentials never logged
- Registration state: `domains` table row — `registrar`, `registered_at`, `spaceship_id` columns are the ground truth for whether registration completed
- Missing credentials: UI surfaces the `[SpaceshipClient] spaceship_api_key not configured` error inline — no silent failures at any layer

### What assumptions changed
- Plan assumed `SpaceshipClient.registerDomain()` would return a raw string operationId. Actual signature returns `{ operationId: string }` — destructured in server action (trivial fix).
- Plan listed files to touch; `apps/admin/package.json` was missing from the list but required for typecheck to pass.
