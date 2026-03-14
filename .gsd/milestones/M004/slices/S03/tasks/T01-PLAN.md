---
estimated_steps: 7
estimated_files: 5
---

# T01: Implement SpaceshipClient + wire settings keys

**Slice:** S03 — Domain Management + Spaceship Integration
**Milestone:** M004

## Description

Create `SpaceshipClient` in `packages/domains/src/spaceship.ts` following the exact structure of `CloudflareClient` (D028 credential pattern, `[SpaceshipClient]` log prefix, descriptive throws on missing config). Export from `packages/domains/src/index.ts`. Add two new settings keys (`spaceship_api_secret`, `spaceship_contact_id`) to the 3-file Settings pattern.

`spaceship_api_key` already exists in `SETTINGS_KEYS` and the form. This task adds only the two missing keys and expands the existing Spaceship section in the form.

## Steps

1. Create `packages/domains/src/spaceship.ts`:
   - Private `fetchCredentials()` method: reads `spaceship_api_key` and `spaceship_api_secret` from Supabase settings (D028 pattern — `(row.value as { value: string }).value`); throws if either is missing
   - Private `buildHeaders()` that calls `fetchCredentials()` and returns `{ 'X-Api-Key': key, 'X-Api-Secret': secret, 'Content-Type': 'application/json' }` — use exact casing from Spaceship curl examples
   - `checkAvailability(domain: string): Promise<{ available: boolean; price?: string }>` — `GET https://api.spaceship.com/v1/domains/{domain}/available`. Check `response.result === 'available'`. If `premiumPricing` array non-empty, extract price from first entry. Throw on non-200.
   - `registerDomain(domain: string, contactId: string): Promise<{ operationId: string }>` — `POST https://api.spaceship.com/v1/domains/{domain}` with body `{ contacts: { registrant: contactId, admin: contactId, tech: contactId, billing: contactId } }`. Expect 202. Read `spaceship-async-operationid` from response headers. Throw on non-202 with body text in message.
   - `pollOperation(operationId: string): Promise<'pending' | 'success' | 'failed'>` — `GET https://api.spaceship.com/v1/async-operations/{operationId}`. Return `response.status` field. Throw on non-200.
   - `updateNameservers(domain: string, nameservers: string[]): Promise<void>` — `PUT https://api.spaceship.com/v1/domains/{domain}/nameservers` with body `{ provider: 'custom', hosts: nameservers }`. Expect 200 (synchronous — no async polling). Throw on non-200.
   - All methods log `[SpaceshipClient] <method>: <key details>` before the fetch call

2. Export from `packages/domains/src/index.ts`: add `export { SpaceshipClient } from './spaceship.js'` alongside the existing `CloudflareClient` export

3. Add to `apps/admin/src/app/(dashboard)/settings/constants.ts`:
   - Append `'spaceship_api_secret'` and `'spaceship_contact_id'` to the `SETTINGS_KEYS` array (after `'spaceship_api_key'`)

4. Add to `apps/admin/src/app/(dashboard)/settings/actions.ts` `SaveSettingsSchema`:
   - `spaceship_api_secret: z.string().optional()`
   - `spaceship_contact_id: z.string().optional()`
   - Add same keys to `SaveSettingsErrors` type

5. Add to `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`:
   - Expand the existing Spaceship section (currently only has API Key field) with two new fields:
   - API Secret: `<Input type="password">` with name `spaceship_api_secret`, same `MaskedIndicator` + `FieldError` pattern
   - Contact ID: `<Input type="text">` with name `spaceship_contact_id`, with a hint `<p>` saying "27-32 character alphanumeric ID. Find it in Spaceship account → Contacts."

6. Build `packages/domains`:
   ```bash
   cd /home/daniel/monster && pnpm --filter @monster/domains build
   pnpm --filter @monster/domains typecheck
   ```

7. Verify the export is importable:
   ```bash
   node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.SpaceshipClient))"
   ```

## Must-Haves

- [ ] `SpaceshipClient` has all four methods: `checkAvailability`, `registerDomain`, `pollOperation`, `updateNameservers`
- [ ] Auth headers use exact casing: `X-Api-Key` and `X-Api-Secret` (not `X-API-Key`)
- [ ] `registerDomain` reads `spaceship-async-operationid` from response HEADER (not body)
- [ ] `updateNameservers` does NOT poll (synchronous 200 response)
- [ ] Both new settings keys in `SETTINGS_KEYS`, `SaveSettingsSchema`, `SaveSettingsErrors`, and form
- [ ] `pnpm --filter @monster/domains build` exits 0
- [ ] `pnpm --filter @monster/domains typecheck` exits 0
- [ ] No API credentials logged — only operation IDs and domain names

## Verification

```bash
pnpm --filter @monster/domains build        # exits 0
pnpm --filter @monster/domains typecheck    # exits 0
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.SpaceshipClient))"
# → function
grep -E "spaceship_api_secret|spaceship_contact_id" apps/admin/src/app/\(dashboard\)/settings/constants.ts
# → 2 matches
```

## Observability Impact

- Signals added: `[SpaceshipClient] checkAvailability/registerDomain/pollOperation/updateNameservers: domain="..." operationId="..."` log lines — safe to log (no credentials)
- How a future agent inspects this: grep worker logs for `[SpaceshipClient]` to trace Spaceship API calls
- Failure state exposed: throws with descriptive messages including HTTP status and response body text; settings misconfiguration identified by method name in throw message

## Inputs

- `packages/domains/src/cloudflare.ts` — primary pattern to mirror for class structure, credential fetching, logging
- `packages/domains/src/index.ts` — add export alongside `CloudflareClient`
- `packages/domains/tsup.config.ts` — no changes needed (SpaceshipClient uses only fetch + @monster/db, both already handled)
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — `spaceship_api_key` already at position 0; append two new keys
- S03-RESEARCH.md API reference table — authoritative endpoint + response shape reference

## Expected Output

- `packages/domains/src/spaceship.ts` — new `SpaceshipClient` class (~100 lines)
- `packages/domains/dist/index.js` — rebuilt with `SpaceshipClient` export
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — 11 keys total (was 9)
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — 2 new keys in schema + error type
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Spaceship section expanded to 3 fields
