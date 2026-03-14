# S03: Domain Management + Spaceship Integration

**Goal:** User can check domain availability from the admin panel, approve registration, and the system registers the domain via Spaceship + updates nameservers to Cloudflare automatically — completing R011.
**Demo:** From the site detail page, user types a domain name, clicks "Check Availability", sees whether it's available, then clicks "Approve & Register" (with a confirmation step). The server action calls Spaceship to register the domain and then updates NS to Cloudflare nameservers already in `domains.cf_nameservers`.

## Must-Haves

- `SpaceshipClient` in `packages/domains/src/spaceship.ts` with four methods: `checkAvailability`, `registerDomain`, `pollOperation`, `updateNameservers`
- Settings keys `spaceship_api_secret` and `spaceship_contact_id` added (key `spaceship_api_key` already exists) — 3-file settings pattern: `constants.ts` → `actions.ts` → `settings-form.tsx`
- `checkDomainAvailability(domain)` server action in site detail `actions.ts`
- `registerDomain(siteId, domain)` server action — R031 gate: triggered only by explicit user form submission, never autonomous
- Domain Management card in site detail `page.tsx`: availability check input + result display + "Approve & Register" form with confirmation warning
- `packages/domains` builds cleanly (`pnpm --filter @monster/domains build` exits 0)
- `pnpm --filter @monster/admin build` exits 0

## Proof Level

- This slice proves: contract (build + type verification)
- Real runtime required: no (Spaceship API requires live credentials + real domain)
- Human/UAT required: yes — actual availability check + registration requires live Spaceship API credentials entered in Settings

## Verification

```bash
# All builds exit 0
pnpm --filter @monster/domains build
pnpm --filter @monster/domains typecheck
pnpm --filter @monster/admin build

# SpaceshipClient exported correctly
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.SpaceshipClient))"
# → function

# Settings keys present
grep -E "spaceship_api_secret|spaceship_contact_id" apps/admin/src/app/\(dashboard\)/settings/constants.ts

# Server actions present
grep -E "checkDomainAvailability|registerDomain" apps/admin/src/app/\(dashboard\)/sites/\[id\]/actions.ts

# Domain management card present in page.tsx
grep "Domain Management" apps/admin/src/app/\(dashboard\)/sites/\[id\]/page.tsx

# Failure-path diagnostic: SpaceshipClient throws descriptive error when credentials missing
# NOTE: Requires NEXT_PUBLIC_SUPABASE_URL env var to reach the settings layer.
# In a bare shell without Supabase env, createServiceClient() throws first (NEXT_PUBLIC_SUPABASE_URL missing).
# With Supabase env but no settings row: throws '[SpaceshipClient] spaceship_api_key not configured'.
# Both paths are descriptive — no silent failures. Verify at runtime in admin panel (Settings page shows missing key).
node -e "
import('/home/daniel/monster/packages/domains/dist/index.js').then(async (m) => {
  const client = new m.SpaceshipClient();
  try {
    await client.checkAvailability('test.com');
    console.log('ERROR: should have thrown');
  } catch (e) {
    const ok = e.message.includes('[SpaceshipClient]') && e.message.includes('spaceship_api_key');
    console.log(ok ? 'PASS: descriptive throw on missing credentials' : 'FAIL: ' + e.message);
  }
});
"
# → PASS in live env (with Supabase URL set + no spaceship_api_key in settings)
# → FAIL in bare shell (no Supabase URL) — expected; use live env for this check
```

## Observability / Diagnostics

- Runtime signals: `[SpaceshipClient]` structured log prefix on every API call (mirrors CloudflareClient pattern)
- Inspection surfaces: `domains` table row — `registrar`, `registered_at`, `spaceship_id` columns updated on successful registration
- Failure visibility: server action returns `{ error: string }` surfaced inline in UI; Spaceship 422 → contact ID hint displayed
- Redaction constraints: `spaceship_api_key` and `spaceship_api_secret` never logged; only operation IDs and domain names are safe to log

## Integration Closure

- Upstream surfaces consumed: `domains.cf_nameservers` (written by `runDeployPhase` in S02) — read by `registerDomain` action to call `updateNameservers()`; `spaceship_api_key` already in `SETTINGS_KEYS`
- New wiring introduced: `SpaceshipClient` exported from `packages/domains/src/index.ts`; server actions wired into site detail page forms
- What remains before the milestone is truly usable end-to-end: live Spaceship credentials in Settings + live CF nameservers in `domains` row (requires prior deploy)

## Tasks

- [x] **T01: Implement SpaceshipClient + wire settings keys** `est:45m`
  - Why: Provides the Spaceship API layer needed by the site detail server actions; adds the two missing settings keys
  - Files: `packages/domains/src/spaceship.ts`, `packages/domains/src/index.ts`, `apps/admin/src/app/(dashboard)/settings/constants.ts`, `apps/admin/src/app/(dashboard)/settings/actions.ts`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
  - Do: Implement `SpaceshipClient` following `CloudflareClient` pattern exactly (D028 credential reads, `[SpaceshipClient]` log prefix, descriptive throws). Four methods: `checkAvailability(domain)`, `registerDomain(domain, contactId)`, `pollOperation(operationId)`, `updateNameservers(domain, nameservers)`. Auth: `X-Api-Key` + `X-Api-Secret` headers (exact case from curl examples). Registration async op ID from `spaceship-async-operationid` response header. NS update is synchronous (200, no poll). Add `spaceship_api_secret` and `spaceship_contact_id` to `constants.ts` + `SaveSettingsSchema` + `SaveSettingsErrors`. Add both fields to the existing Spaceship section in `settings-form.tsx` (API Secret as password input, Contact ID as text input with format hint).
  - Verify: `pnpm --filter @monster/domains build && pnpm --filter @monster/domains typecheck` both exit 0; `node -e "import('...dist/index.js').then(m => console.log(typeof m.SpaceshipClient))"` → function; settings keys present in constants.ts
  - Done when: `packages/domains` builds with `SpaceshipClient` exported; settings form has all 3 Spaceship fields

- [x] **T02: Domain management UI on site detail page** `est:45m`
  - Why: Closes R011 — the admin UI surface that lets users check availability and trigger registration (R031 gate: explicit click only)
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`, `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
  - Do: Add `checkDomainAvailability(domain: string)` and `registerDomain(siteId: string, domain: string)` server actions. `checkDomainAvailability` returns `{ available: boolean; price?: string; error?: string }`. `registerDomain` guards against missing `domains` row or empty `cf_nameservers` with clear error messages; on success: polls operation (10 attempts × 2s), calls `updateNameservers`, updates `domains` row (`registrar='spaceship'`, `registered_at`, `spaceship_id`). Add "Domain Management" card to `page.tsx` below the Deployment card: domain input + "Check Availability" submit button, result display (available badge + price or "taken" state), and when available: "Approve & Register" form with a red-border warning box ("Real registration — charges will apply to your Spaceship account"). "Approve & Register" must be a separate `<form action={...}>` with a submit button — not a JS fetch — to enforce R031. Show registration result (success with NS update confirmation, or error) inline.
  - Verify: `pnpm --filter @monster/admin build` exits 0; grep confirms both actions present + "Domain Management" heading in page.tsx
  - Done when: Admin builds cleanly with domain management card; both server actions present and type-safe

## Files Likely Touched

- `packages/domains/src/spaceship.ts` (new)
- `packages/domains/src/index.ts`
- `apps/admin/src/app/(dashboard)/settings/constants.ts`
- `apps/admin/src/app/(dashboard)/settings/actions.ts`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts`
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
