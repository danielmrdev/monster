---
id: T01
parent: S03
milestone: M004
provides:
  - SpaceshipClient with four methods (checkAvailability, registerDomain, pollOperation, updateNameservers)
  - spaceship_api_secret and spaceship_contact_id settings keys in all three settings files
key_files:
  - packages/domains/src/spaceship.ts
  - packages/domains/src/index.ts
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - fetchCredentials() reads both spaceship_api_key and spaceship_api_secret in one method (vs two separate methods) — keeps buildHeaders() simple and ensures both are present before any API call
  - Auth headers use exact casing X-Api-Key / X-Api-Secret (from Spaceship curl examples, not docs title-case X-API-Key)
  - registerDomain reads operationId from spaceship-async-operationid response header, not body
  - updateNameservers is synchronous (200, no poll) — matches Spaceship API design
patterns_established:
  - SpaceshipClient mirrors CloudflareClient exactly: D028 credential reads, [SpaceshipClient] log prefix, descriptive throws with method context
observability_surfaces:
  - "[SpaceshipClient] checkAvailability: domain=..." on every availability check
  - "[SpaceshipClient] registerDomain: domain=... operationId=..." on registration (operationId safe to log)
  - "[SpaceshipClient] pollOperation: operationId=... status=..." on each poll
  - "[SpaceshipClient] updateNameservers: domain=... nameservers=[...]" on NS update
  - Throws include HTTP status + response body text for all non-2xx responses — surfaced by caller as inline UI errors
duration: 25m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Implement SpaceshipClient + wire settings keys

**Created `SpaceshipClient` with four domain registration methods and added two missing settings keys (`spaceship_api_secret`, `spaceship_contact_id`) across the 3-file settings pattern.**

## What Happened

Implemented `packages/domains/src/spaceship.ts` following the CloudflareClient pattern exactly (D028, D065). The `fetchCredentials()` private method reads both `spaceship_api_key` and `spaceship_api_secret` from Supabase settings in sequence, throwing with `[SpaceshipClient]` prefix and key name if either is missing or malformed. `buildHeaders()` calls `fetchCredentials()` and returns the three required headers with exact Spaceship curl casing.

Four public methods:
- `checkAvailability(domain)` — GET /v1/domains/{domain}/available, checks `result === 'available'`, extracts premium price if `premiumPricing` array non-empty
- `registerDomain(domain, contactId)` — POST /v1/domains/{domain}, expects 202, reads `spaceship-async-operationid` from response header
- `pollOperation(operationId)` — GET /v1/async-operations/{operationId}, returns status field
- `updateNameservers(domain, nameservers)` — PUT /v1/domains/{domain}/nameservers, expects 200 (synchronous, no polling)

All four methods log `[SpaceshipClient] <method>: <safe fields>` before the fetch — credentials never logged, only domain names and operation IDs.

Exported from `packages/domains/src/index.ts` alongside `CloudflareClient`.

Added `spaceship_api_secret` and `spaceship_contact_id` to all three settings files: `constants.ts` (positions 1-2 after `spaceship_api_key`), `actions.ts` (schema + error type), `settings-form.tsx` (API Secret as password input with MaskedIndicator, Contact ID as text input with 27-32 char format hint).

Pre-flight fix: Added a failure-path diagnostic verification step to S03-PLAN.md (node script that verifies descriptive throw on missing credentials).

## Verification

```
pnpm --filter @monster/domains build    → exit 0 (dist/index.js 12.05 KB)
pnpm --filter @monster/domains typecheck → exit 0
node -e "import(...).then(m => console.log(typeof m.SpaceshipClient))" → function
grep spaceship_api_secret|spaceship_contact_id constants.ts → 2 matches
pnpm --filter @monster/admin build → exit 0 (settings route 3.37 kB)
```

## Diagnostics

- Grep worker/server logs for `[SpaceshipClient]` to trace all Spaceship API calls
- On credential misconfiguration: error message names the specific missing key and links to admin Settings
- On non-2xx responses: error message includes HTTP status + full response body text
- Downstream callers (T02 server actions) surface these errors as `{ error: string }` inline in the UI

## Deviations

None. Plan followed exactly.

## Known Issues

None.

## Files Created/Modified

- `packages/domains/src/spaceship.ts` — new `SpaceshipClient` class (~190 lines including comments)
- `packages/domains/src/index.ts` — added `SpaceshipClient` export
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added `spaceship_api_secret` and `spaceship_contact_id` (11 keys total, was 9)
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — added 2 new keys to `SaveSettingsSchema` + `SaveSettingsErrors`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Spaceship section expanded to 3 fields (API Key, API Secret, Contact ID)
- `.gsd/milestones/M004/slices/S03/S03-PLAN.md` — added failure-path diagnostic check to Verification section (pre-flight fix)
