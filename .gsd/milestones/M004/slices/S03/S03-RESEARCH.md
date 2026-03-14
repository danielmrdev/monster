# S03: Domain Management + Spaceship Integration — Research

**Date:** 2026-03-14

## Summary

S03 completes R011 (domain management via Spaceship + Cloudflare) by adding `SpaceshipClient` to `packages/domains`, wiring three new settings keys, and adding a domain management UI to the admin panel. The existing infrastructure is well-prepared: `packages/domains` already has `CloudflareClient` (including `ensureZone()` which produces the nameservers Spaceship needs), the `domains` table already has `spaceship_id`, `registered_at`, `expires_at` columns, the `settings` schema accepts new keys without migration, and the admin Settings follow a clear 3-file pattern. The scope is narrower than S02 — no new BullMQ jobs, no migrations — just one new class, 3 settings keys, and one new UI section.

The Spaceship API is well-documented REST with straightforward auth (`X-Api-Key` + `X-Api-Secret` headers). Four operations are needed: availability check (`GET /v1/domains/{domain}/available`), register (`POST /v1/domains/{domain}` → 202 async), update nameservers (`PUT /v1/domains/{domain}/nameservers`), and poll async operation (`GET /v1/async-operations/{operationId}`). No npm client exists; raw `fetch` is correct (D065). The availability check is synchronous (200 response with `result: "available" | "taken"`); registration and NS update are async (202 + `spaceship-async-operationid` header, poll until `success | failed`). The registration body requires a `contacts` object with `registrant`, `admin`, `tech`, `billing` — all must be the same pre-existing contact ID stored in settings as `spaceship_contact_id`.

The admin panel UI has two responsibilities: (1) a domain availability check input on the site detail page (type a domain name → check → show result + price), and (2) an "Approve & Register" button that triggers the actual registration + NS update sequence via a server action. The "Approve & Register" button is the hard R031 gate — it must be an explicit human-click action, never triggered automatically.

## Recommendation

Implement `SpaceshipClient` in `packages/domains/src/spaceship.ts` following the exact pattern of `CloudflareClient`: D028 credential reading (`fetchApiKey/ApiSecret()` from Supabase settings at call time), clean error messages, structured log lines with `[SpaceshipClient]` prefix. Export from `packages/domains/src/index.ts`. No new BullMQ job — the registration + NS update sequence is fast enough to run synchronously in a server action (registration is 202/async but the poll is short-lived: typical Spaceship registration completes in <10s). Add a `registerDomainQueue` only if real-world registration latency proves blocking. Wire settings keys and UI following the established 3-file Settings pattern. Add the domain management card to the site detail page.

The NS update should run immediately after `pollOperation` returns `'success'` for registration — within the same server action call. CF nameservers come from `domains.cf_nameservers` (already written by `runDeployPhase`). If no CF zone exists yet (site never deployed), surface a clear error: "Deploy the site first to generate Cloudflare nameservers."

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Spaceship API auth/fetch | Raw `fetch` with `X-Api-Key`/`X-Api-Secret` headers (D065) | No npm client exists. API is simple REST. Thin `SpaceshipClient` class is correct level of abstraction. |
| Credential storage/reading | D028 pattern: `(row.value as { value: string }).value` from Supabase `settings` table at call time | Already used by `DataForSEOClient` and `CloudflareClient`. Credentials entered via admin Settings UI — no VPS env vars. |
| Settings UI 3-file pattern | `constants.ts` → `actions.ts` (schema + errors) → `settings-form.tsx` (card) | Established in S02. D034 enforces that constants must live in a sibling file (not the `'use server'` file). |
| Async operation polling | `pollOperation(operationId)` with bounded retries | Spaceship registration/NS update return 202 + operation ID. `GET /v1/async-operations/{operationId}` returns `{ status: "pending" | "success" | "failed" }`. Polling in the server action (10 attempts × 2s) is sufficient — typical ops complete in <10s. |
| CF nameservers for NS update | `domains.cf_nameservers` column (written by `runDeployPhase` in S02) | Always read from DB — never make a live CF API call to get NS in S03. `cf_nameservers` is a `text[]` column guaranteed to have Cloudflare NS hosts. |

## Existing Code and Patterns

- `packages/domains/src/cloudflare.ts` — **Primary pattern to follow.** `SpaceshipClient` should mirror its structure: private credential-fetching methods, one method per API operation, `[SpaceshipClient]` log prefix, descriptive throw on missing config.
- `packages/domains/src/index.ts` — Add `export { SpaceshipClient } from './spaceship.js'` alongside the existing `CloudflareClient` export.
- `packages/domains/tsup.config.ts` — No changes needed. `SpaceshipClient` uses only `fetch` (built-in Node 20) and `@monster/db` (already an external). No new dependencies.
- `packages/agents/src/clients/dataforseo.ts` — D028 credential pattern: `private async fetchAuthHeader()` reads from Supabase `settings` at call time. `SpaceshipClient` needs two methods: `fetchApiKey()` and `fetchApiSecret()` (or combined `fetchCredentials()` returning both).
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — Add `'spaceship_api_secret'` and `'spaceship_contact_id'` to `SETTINGS_KEYS`. `'spaceship_api_key'` already present (line 2). Three keys total for Spaceship.
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — Add the two new keys to `SaveSettingsSchema` + `SaveSettingsErrors`. Follow the existing `z.string().optional()` pattern.
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — Add a "Spaceship" card (similar to "Cloudflare" card) with three fields: API Key (password input, already rendered but without secret/contact_id), API Secret (password input), Contact ID (text input with note that it's a 27-32 char alphanumeric ID from Spaceship account).
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — Add `checkDomainAvailability(domain)` and `registerDomain(siteId, domain)` server actions. Both call `SpaceshipClient` methods. `registerDomain` is the R031 gate — explicit user action only, no autonomous triggering.
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Add a "Domain Management" card below the "Deployment" card. Contains: domain input + "Check Availability" button (calls `checkDomainAvailability` server action), availability result display (available/taken + price), and when available: "Approve & Register" button (calls `registerDomain` server action — must be clearly labeled as "Real registration - charges apply"). NS update status shown after registration.

## Constraints

- **Spaceship auth headers**: `X-Api-Key` and `X-Api-Secret` — NOT bearer tokens. The docs use `X-API-Key`/`X-API-Secret` (mixed case) but the curl examples show `X-Api-Key`/`X-Api-Secret`. Use the exact format from the curl examples as the authoritative reference.
- **Registration requires contacts**: `POST /v1/domains/{domain}` body must include `{ registrant, admin, tech, billing }` contact IDs. For Phase 1, all four use the same `spaceship_contact_id` setting value. Without a valid contact ID, the API returns 422.
- **NS update body format**: `PUT /v1/domains/{domain}/nameservers` takes `{ provider: "custom", hosts: ["ns1.cf.example", "ns2.cf.example"] }`. The `hosts` array must have 2-12 entries. Cloudflare always assigns exactly 2 nameservers — this satisfies the constraint.
- **NS update is synchronous**: `PUT /v1/domains/{domain}/nameservers` returns 200 (not 202) when successful — no async polling needed for this step. Only registration uses the async operation pattern.
- **Availability check endpoint**: `GET /v1/domains/{domain}/available` (single domain, synchronous 200). Response: `{ domain: string, result: "available" | "taken" | ..., premiumPricing: [...] }`. The `result` field drives the UI. There is also `POST /v1/domains/available` for bulk checks (up to 20 domains) — not needed for S03.
- **`spaceship_api_key` already in `SETTINGS_KEYS`**: The key `'spaceship_api_key'` was added in M002/S03 (Settings page). Two new keys needed: `'spaceship_api_secret'` and `'spaceship_contact_id'`. Settings form already renders the API key field — need to add the two new fields to the existing Spaceship section.
- **No migration needed**: `domains` table already has `spaceship_id`, `registered_at`, `expires_at` columns. `registrar` column can hold `'spaceship'`. After registration + NS update, update the `domains` row: `registrar='spaceship'`, `registered_at=now()`, `spaceship_id=operationId` (or whatever ID Spaceship returns in the operation details).
- **`domains` row may not exist when user checks availability**: The availability check is pre-deployment (user is checking before clicking Deploy). The `domains` row is created by `runDeployPhase` — it may not exist yet. The `registerDomain` server action must handle this: if no `domains` row exists, surface error "Deploy the site first." If the row exists but `cf_nameservers` is empty, surface error "Cloudflare nameservers not yet assigned — deploy the site first."
- **Async operation operation ID is in response header**: `POST /v1/domains/{domain}` returns HTTP 202 with `spaceship-async-operationid` response header (not in body). Must read from `response.headers.get('spaceship-async-operationid')`.
- **Poll timeout for availability**: `GET /v1/domains/{domain}/available` has a rate limit of 5 requests per domain per 300s. Safe to call on user demand, not in polling loops.
- **Supabase types are current**: `domains` table Row/Insert/Update includes `spaceship_id: string | null`, `registered_at: string | null`, `expires_at: string | null`. No type changes needed.

## Common Pitfalls

- **Header casing**: Spaceship docs show both `X-API-Key` (all-caps API) and `X-Api-Key` (title-case). The working curl examples use `X-Api-Key` / `X-Api-Secret`. Use these exact strings to avoid auth failures.
- **Availability result field**: The response has `result` not `available` (boolean). Check `response.result === "available"` not `response.available`. Response also has `premiumPricing: []` — if non-empty, the domain is premium and may have a higher price.
- **Domain format**: Spaceship requires ASCII format (A-label) for IDN domains. For Phase 1 (ES market), all domains should be ASCII — no special handling needed.
- **`spaceship_contact_id` is a 27-32 char alphanumeric string** — easy to mistype. The Settings UI should show a hint about the format (e.g. "27-32 character alphanumeric ID from Spaceship account → Contacts").
- **NS update must happen after registration is confirmed `success`**: Never call `PUT /v1/domains/{domain}/nameservers` before `pollOperation` returns `'success'`. If registration is still `pending` or `failed`, NS update will return 404 (domain not found in account).
- **`registerDomain` server action must not be callable without user interaction**: The "Approve & Register" button must be inside a `<form action={...}>` with a submit button — not a client-side fetch — so the cost is incurred only on explicit form submission. Consider a confirmation dialog or "Are you sure?" step before the form submission to prevent accidental clicks.
- **`runDeployPhase` uses `slug = domain.replace(/\./g, '-')`** for the rsync path. `registerDomain` action doesn't need to care about slugs — it only touches the `domains` table and calls Spaceship.
- **Settings actions.ts Zod schema must include new keys**: The `SaveSettingsSchema` in `actions.ts` (a `'use server'` file) validates submitted form data. Missing keys silently skip saving. Verify both `spaceship_api_secret` and `spaceship_contact_id` are in the schema.
- **`.next` cache stale type errors**: If `packages/domains` builds new exports and the admin build false-positives on types, `rm -rf apps/admin/.next` before rebuilding (S02 precedent).

## Open Risks

- **`spaceship_contact_id` doesn't exist in Spaceship account**: If the user hasn't created a contact in Spaceship, the registration call returns 422. The Settings UI must link to the Spaceship contacts page with instructions. The error message from `SpaceshipClient` should be surfaced clearly in the UI.
- **Spaceship registration 422 for unsupported TLDs**: Some ccTLDs (.es, .de) may require additional contact attributes (country-specific). For Phase 1 targeting ES market, registering `.com`, `.net`, `.org` domains avoids this. `.es` TLD may require extended attributes. Consider scoping S03 to common TLDs and documenting `.es` limitations.
- **Domain not in Spaceship account after registration**: The `POST /v1/domains/{domain}` registers the domain in the account; `PUT /v1/domains/{domain}/nameservers` then updates NS. If the user already owns the domain externally (not via Spaceship), the NS update should work but registration will 409/422. Surface this clearly.
- **Price not shown in availability check response**: `GET /v1/domains/{domain}/available` returns `result` and `premiumPricing` but not the standard registration price for non-premium domains. The UI may need to show "Standard price — check Spaceship pricing page" for non-premium domains. Premium price is in `premiumPricing[].price`.
- **Cloudflare zone not yet created when "Approve & Register" is clicked**: If the site hasn't been deployed (no `domains` row, or `cf_nameservers` is empty), `registerDomain` must fail early with a clear message, not silently register without updating NS.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Spaceship API | none found | none found (raw fetch, D065) |
| Cloudflare API | none found | already using `cloudflare` npm pkg from S02 |

## API Reference Summary

| Operation | Method | Endpoint | Response | Notes |
|-----------|--------|----------|----------|-------|
| Check availability | GET | `/v1/domains/{domain}/available` | 200 `{ result: "available"\|"taken", premiumPricing: [] }` | Sync. Rate: 5/domain/300s. |
| Register domain | POST | `/v1/domains/{domain}` | 202 + `spaceship-async-operationid` header | Async. Poll operation. Requires contacts. |
| Poll async op | GET | `/v1/async-operations/{operationId}` | 200 `{ status: "pending"\|"success"\|"failed" }` | Rate: 60/user/300s. |
| Update nameservers | PUT | `/v1/domains/{domain}/nameservers` | 200 `{ hosts: [], provider: "custom" }` | Sync (not 202). |

## Sources

- Spaceship API: availability check `GET /v1/domains/{domain}/available` → `{ result: "available"|"taken", premiumPricing: [...] }` (source: [Spaceship API docs](https://docs.spaceship.dev/))
- Spaceship API: registration `POST /v1/domains/{domain}` → 202 + `spaceship-async-operationid` header (source: [Spaceship API docs](https://docs.spaceship.dev/))
- Spaceship API: NS update `PUT /v1/domains/{domain}/nameservers` → 200 synchronous (source: [Spaceship API docs](https://docs.spaceship.dev/))
- Spaceship API: async poll `GET /v1/async-operations/{operationId}` → `{ status: "pending"|"success"|"failed", type, details, createdAt, modifiedAt }` (source: [Spaceship API docs](https://docs.spaceship.dev/))
- Spaceship auth: `X-Api-Key` + `X-Api-Secret` headers — no encoding required (source: [Spaceship API docs](https://docs.spaceship.dev/))
- CF nameservers stored in `domains.cf_nameservers` (text[]) after S02 `ensureZone()` call (source: S02-SUMMARY.md)
- D065: Spaceship via raw fetch, no npm client (source: DECISIONS.md)
- D028: API credentials as `{ value: "..." }` JSON in `settings.value`, read at call time (source: DECISIONS.md)
- D034: `'use server'` files export only async functions — constants in sibling `constants.ts` (source: DECISIONS.md)
- D075: domains upsert with `onConflict: 'domain'` — UNIQUE constraint on `domain` column alone (source: DECISIONS.md)
- Existing `spaceship_api_key` in `SETTINGS_KEYS` at position 0 (source: `apps/admin/src/app/(dashboard)/settings/constants.ts`)
- `domains` table already has `spaceship_id`, `registered_at`, `expires_at`, `registrar` columns (source: `packages/db/supabase/migrations/20260313000001_core.sql`)
- `packages/domains/tsup.config.ts`: external `['cloudflare']` only — `SpaceshipClient` needs no new externals (source: `packages/domains/tsup.config.ts`)
