# S03: Domain Management + Spaceship Integration — UAT

**Milestone:** M004
**Written:** 2026-03-13

## UAT Type

- UAT mode: mixed (artifact-driven contract verification done; live-runtime human verification pending)
- Why this mode is sufficient: The slice's stated proof level is contract (build + type verification). The contract checks are complete and passing. Live Spaceship API requires real credentials and a real domain — documented as a post-slice precondition for the human UAT below.

## Preconditions

**For contract checks (already verified):**
- `pnpm --filter @monster/domains build` exits 0
- `pnpm --filter @monster/domains typecheck` exits 0
- `pnpm --filter @monster/admin build` exits 0

**For live runtime UAT:**
1. Admin panel running on VPS1 (port 3004, accessible via Tailscale)
2. Spaceship account active with a pre-created contact record (needed for registration)
3. Settings page has all three Spaceship fields populated:
   - `spaceship_api_key`: Spaceship API key (format: `sk_live_...` or similar)
   - `spaceship_api_secret`: Spaceship API secret
   - `spaceship_contact_id`: Contact record ID from Spaceship dashboard (27–32 chars)
4. At least one site created in the admin panel
5. Site has been deployed at least once (so `domains` row exists with `cf_nameservers` populated — required for NS update after registration)
6. A domain name selected for testing (ideally one you intend to register, since "check availability" is safe; "register" costs money)

## Smoke Test

Navigate to Settings → Spaceship section. Confirm three fields are visible: API Key (masked), API Secret (masked), Contact ID. This confirms T01 settings wiring is in place.

## Test Cases

### 1. Settings UI — three Spaceship fields visible

1. Open admin panel → Settings
2. Scroll to the Spaceship section
3. **Expected:** Three input fields present: "Spaceship API Key" (password/masked), "Spaceship API Secret" (password/masked), "Spaceship Contact ID" (text, format hint "27–32 character contact record ID from your Spaceship account")
4. Enter values for all three fields and save
5. **Expected:** Success banner appears; page reloads with "is configured" indicator for all three keys (last-4 chars masked)

### 2. Domain availability check — available domain

1. Navigate to a site detail page (Sites → [site name])
2. Scroll to the "Domain Management" card
3. **Expected:** Card contains a domain input field and "Check Availability" button
4. Type a domain name that is likely available (e.g. `test-freidoras-xz7k.com`)
5. Click "Check Availability"
6. **Expected:** Result shows a green "Available" badge + price (e.g. "$9.99/year") OR a red "Not available" badge
7. **Expected:** If available: "Approve & Register" form appears below the result with a red-border warning box and the domain name pre-displayed

### 3. Domain availability check — taken domain

1. In the Domain Management card, type a well-known taken domain (e.g. `amazon.com`)
2. Click "Check Availability"
3. **Expected:** Result shows a red "Not available" badge
4. **Expected:** No "Approve & Register" form appears (registration form is hidden when not available)

### 4. Domain availability check — missing credentials

1. Before entering Spaceship credentials in Settings, navigate to a site detail page
2. Type any domain in the Domain Management card and click "Check Availability"
3. **Expected:** Inline error displayed (e.g. "spaceship_api_key not configured — add it in Settings")
4. **Expected:** No crash, no blank error; message directs user to Settings

### 5. Domain registration — R031 gate (explicit user approval required)

1. Check availability for a real domain you intend to register
2. Confirm it shows "Available" and the registration form appears
3. Read the red-border warning box: "Real registration — charges will apply to your Spaceship account"
4. Click "Approve & Register"
5. **Expected:** Button shows loading state during polling (~5–20 seconds)
6. **Expected:** Success message appears (e.g. "Domain registered. Nameservers updated to Cloudflare.")
7. Inspect the `domains` table row for this site in Supabase:
   - `registrar = 'spaceship'`
   - `registered_at` is non-null (timestamp of registration)
   - `spaceship_id` = operation ID returned by Spaceship API
8. **Expected:** All three fields populated

### 6. Domain registration — missing cf_nameservers guard

1. Create a new site that has never been deployed (no `domains` row, or domains row with `cf_nameservers = NULL`)
2. Navigate to its site detail page → Domain Management card
3. Check availability for an available domain → "Approve & Register" form appears
4. Click "Approve & Register"
5. **Expected:** Error message: "Cloudflare nameservers not yet assigned — deploy the site first"
6. **Expected:** No Spaceship API call made; no charge

### 7. Domain registration — missing contact ID guard

1. Clear `spaceship_contact_id` from Settings (or leave it empty)
2. Navigate to a deployed site's detail page → Domain Management
3. Check an available domain → click "Approve & Register"
4. **Expected:** Error message: "spaceship_contact_id not configured — add your Spaceship contact record ID in Settings"
5. **Expected:** No Spaceship API call made; no charge

### 8. SpaceshipClient export contract

Run in a shell on VPS1:
```bash
node -e "import('/home/daniel/monster/packages/domains/dist/index.js').then(m => console.log(typeof m.SpaceshipClient))"
```
**Expected:** `function`

### 9. Settings keys present in constants.ts

```bash
grep -E "spaceship_api_secret|spaceship_contact_id" \
  /home/daniel/monster/apps/admin/src/app/\(dashboard\)/settings/constants.ts
```
**Expected:** Two matching lines

### 10. Server actions present in actions.ts

```bash
grep -E "export async function checkDomainAvailability|export async function registerDomain" \
  /home/daniel/monster/apps/admin/src/app/\(dashboard\)/sites/\[id\]/actions.ts
```
**Expected:** Two matching lines

## Edge Cases

### Spaceship returns 422 on registration (bad contact ID)

1. Enter a syntactically valid but non-existent contact ID in Settings
2. Check an available domain → click "Approve & Register"
3. **Expected:** Inline error message with HTTP 422 detail from Spaceship (SpaceshipClient throws with status + body text; server action surfaces it as `{ error: string }`)
4. **Expected:** No partial state — domains row not updated

### Operation polling times out (10 attempts × 2s = 20s max)

1. (Simulate only — Spaceship is async; real timeout requires a slow or stuck operation)
2. If Spaceship's operation does not reach `success` within 20s, the server action returns an error
3. **Expected:** Error message: "Registration timed out — check Spaceship dashboard for operation status"
4. **Expected:** `domains` row not updated (registrar/registered_at remain null)

### Domain input with extra spaces or uppercase

1. Type `  Example.COM  ` in the domain check input
2. Click "Check Availability"
3. **Expected:** Either the SpaceshipClient normalizes the input, or the API returns a clean error — no server crash; inline error displayed if invalid format

### Redeploy after registration (NS already updated)

1. After successful registration + NS update, trigger a redeploy of the same site
2. **Expected:** `runDeployPhase` (S02) re-runs `ensureZone` (idempotent) — no duplicate zone; `SslPollerJob` re-enqueued; site status transitions correctly
3. **Expected:** Domains table `cf_nameservers` unchanged (Cloudflare returns same nameservers for existing zone)

## Failure Signals

- "Domain Management" card missing from site detail page → page.tsx wiring broken
- "Approve & Register" button visible before "Check Availability" is clicked → DomainManagement component state machine broken (register form should only appear after `available: true` check result)
- No inline error on missing credentials → server action not surfacing SpaceshipClient throws
- `domains` table row not updated after successful registration → `registerDomain` action DB update step broken
- `pnpm --filter @monster/admin build` fails with import error → `@monster/domains` missing from admin package.json

## Requirements Proved By This UAT

- R011 (Domain management via Spaceship + Cloudflare) — contract: SpaceshipClient built with all four required methods, admin UI wired, settings keys present. Runtime: availability check + registration + NS update flow verified end-to-end with live Spaceship credentials (pending live UAT).
- R031 (anti-feature: no autonomous domain purchases) — confirmed: registration requires explicit "Approve & Register" form submit with visible cost warning; no code path registers a domain without user action.

## Not Proven By This UAT

- Actual domain availability pricing accuracy (depends on Spaceship API returning correct data per TLD)
- Full lifecycle after registration: DNS propagation → SSL issuance → `live` state transition (these are S02 responsibilities; S02 UAT covers them)
- Spaceship NS update propagation to Cloudflare DNS (requires real domain + NS change + propagation wait — observable via `dig NS <domain>` once propagated)
- Operation polling under real Spaceship latency (mock timeout test only)
- Spaceship contact record creation (must be done manually in Spaceship dashboard; not automatable by this system)

## Notes for Tester

- **Contact ID is a prerequisite you must set up manually**: Go to your Spaceship account, create a contact record (name, address, email — required by ICANN for domain registration), copy the contact ID. The admin Settings UI shows a hint "27–32 character contact record ID". Without this, all registration attempts will fail with a 422.
- **Use a test domain you actually want**: The "Check Availability" call is free and safe to repeat. The "Approve & Register" button results in a real charge. Pick a domain you intend to keep, or use a cheap TLD for testing (`.info` is often <$3).
- **Deploy the site before testing registration**: The `domains` row (with `cf_nameservers`) is only created by the deploy pipeline (S02). If you haven't deployed the site, the registration guard will fire before any Spaceship API call.
- **NS propagation is slow**: After successful `updateNameservers`, Cloudflare's nameservers are set in Spaceship's records. DNS propagation can take 24–48 hours globally. The admin panel shows the CF nameservers (from the `domains` row) — verify these appear in `whois <domain>` output once propagated.
- **Log grepping**: All Spaceship API calls emit `[SpaceshipClient]` prefixed logs. On VPS1: `pm2 logs monster-admin --lines 50` to see server action logs during testing.
