# M004: Deployment + Cloudflare — Research

**Date:** 2026-03-13

## Summary

M004 takes a built Astro site (a slug directory under `apps/generator/.generated-sites/<slug>/dist/`) and makes it publicly accessible at its domain with Cloudflare proxy and auto-SSL. The milestone has three independent execution tracks that converge in the BullMQ worker: (1) rsync to VPS2 + Caddy virtualhost config via SSH, (2) Cloudflare zone creation + A record + SSL status polling, and (3) the domain lifecycle in the admin panel (availability check → approval flow → registration via Spaceship).

The codebase is well-prepared. Both `packages/deployment` and `packages/domains` are empty stubs with correct package.json/tsconfig scaffolds ready to receive implementations. The DB schema already has `domains` (with `cf_zone_id`, `dns_status`) and `deployments` tables from migration 001. `sites.status` already has the full state machine (`deploying → dns_pending → ssl_pending → live`) enforced as a CHECK constraint. `packages/shared` exports `SITE_STATUS_FLOW` (valid transitions) and the `SiteStatus` type. The `GenerateSiteJob` in `packages/agents` is the natural integration point — a `deploy` phase runs after `score_pages` and transitions site status as it progresses. The admin panel follows the established `enqueueSiteGeneration` + `JobStatus` polling pattern.

The primary recommendation is: **file-based Caddy config per site, written over SSH + `sudo systemctl reload caddy`** (not the Caddy JSON API). The JSON API requires exposing port 2019 from VPS2 to VPS1, adds session management complexity, and is hard to introspect. File-based config writes a `<domain>.caddy` snippet to `/etc/caddy/sites/` (picked up by `import sites/*` in the global Caddyfile), then reloads Caddy. This survives VPS2 reboots, is auditable as files, and matches the nginx/Apache pattern any sysadmin would recognize. For Cloudflare, use the official `cloudflare` npm package (v5+) — it has full TypeScript types, handles zones and DNS records natively, and avoids raw `fetch` calls to the CF API.

## Recommendation

Use **Caddy file-based config** (not JSON API): write `/etc/caddy/sites/<domain>.caddy` over SSH and `systemctl reload caddy`. Use the **`cloudflare` npm package** (not raw fetch) for zone create + A record + SSL status. Use the **Spaceship REST API** directly with `fetch` (no official npm client exists). Wire the deploy pipeline as a new phase in `GenerateSiteJob` after `score_pages`, transitioning `sites.status` through `deploying → dns_pending → ssl_pending → live`. Domain purchase approval lives in the admin panel as an explicit user action — never in the background worker.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Cloudflare zones, DNS records, SSL polling | `cloudflare` npm package (v5.2.0) | TypeScript types, auto-pagination, consistent error handling, `client.zones.create()`, `client.dns.records.create()`, `client.ssl.verification.get()` |
| rsync over SSH | Node.js `child_process.spawn('rsync', [...])` | rsync is the right tool; `node-ssh` adds unnecessary abstraction; direct spawn is debuggable and idiomatic for this use case |
| Caddy reload after writing config | `ssh` to VPS2 + `sudo systemctl reload caddy` | Caddy reloads atomically — config is hot-swapped with no downtime. File-based config survives reboots unlike API-injected routes. |
| Site state machine | `SITE_STATUS_FLOW` from `@monster/shared` | Already defined with all valid transitions; use it in the worker to validate transitions before writing to DB |

## Existing Code and Patterns

- `packages/agents/src/jobs/generate-site.ts` — **Primary integration point.** Add a `deploy` phase after `score_pages`. Follow the same ai_jobs progress update pattern (`phase`, `done`, `total`). Transition `sites.status` here: set `deploying` before rsync, `dns_pending` after Cloudflare A record, `ssl_pending` after zone activation, `live` after SSL cert active.
- `packages/agents/src/worker.ts` — Standalone process pattern (dotenv, SIGTERM/SIGINT handlers, `new GenerateSiteJob().register()`). New `DeploySiteJob` should follow the same standalone pattern if it needs to be independently enqueue-able for redeploys.
- `packages/deployment/` — Empty stub. Implement: `RsyncService` (rsync + SSH Caddy write + systemctl reload), typed by domain+slug+VPS2 IP.
- `packages/domains/` — Empty stub. Implement: `SpaceshipClient` (availability check, registration, NS update — REST fetch) and `CloudflareClient` (thin wrapper over `cloudflare` npm package for zone create, A record, SSL poll).
- `packages/shared/src/constants/index.ts` — `SITE_STATUS_FLOW` maps every valid state transition. Use this in the deploy worker to guard `sites.status` updates.
- `packages/agents/src/clients/dataforseo.ts` — Pattern to follow: read credentials from Supabase `settings` table at call time (D028/D050). `CloudflareClient` should read `cloudflare_api_token` from settings. `SpaceshipClient` reads `spaceship_api_key` and `spaceship_api_secret`.
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — Add `cloudflare_api_token`, `spaceship_api_key`, `spaceship_api_secret`, `vps2_ip`, `vps2_ssh_user` (or equivalently `vps2_tailscale_host`) to `SETTINGS_KEYS`. These are deployment-critical and should be configurable from the Settings UI.
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `enqueueSiteGeneration` pattern: insert ai_jobs row → enqueue BullMQ → return jobId. Replicate for `enqueueSiteDeploy` (new server action in the same file). Alternatively, add deploy as a continuation phase inside the generate job (simpler for M004).
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — Site detail page. Add "Deploy" button alongside "Generate Site". Add a deployment status card showing current `sites.status` and the latest `deployments` row. Domain availability check input for Research Lab integration.
- `packages/db/supabase/migrations/20260313000001_core.sql` — `domains` table already has `cf_zone_id`, `dns_status` ('pending'|'active'|'error'), `spaceship_id`, `registered_at`, `expires_at`. `deployments` table has `status` ('pending'|'running'|'succeeded'|'failed'), `deployed_at`, `duration_ms`, `error`, `metadata`.

## Constraints

- **VPS2 must exist with Caddy installed** — VPS2 provisioning is out of scope. Caddy must have `import sites/*` in its global Caddyfile. The deploy service writes to `/etc/caddy/sites/<domain>.caddy`. The SSH user must have passwordless `sudo` for `systemctl reload caddy` (sudoers rule required).
- **rsync path**: `rsync -avz --delete -e "ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=no" apps/generator/.generated-sites/<slug>/dist/ <user>@<vps2_host>:/var/www/sites/<slug>/`
- **Cloudflare zone creation is async**: after creating a zone, CF assigns nameservers but the zone status stays `pending` until the user updates NS at Spaceship. The deploy worker must not block waiting for NS propagation — it transitions to `dns_pending` and the poller checks later.
- **NS propagation is manual (Spaceship side)**: after zone creation, display Cloudflare's assigned NS records to the user (in the admin panel) and instruct them to update NS at Spaceship. The `PUT /v1/domains/{domain}/nameservers` Spaceship endpoint can automate the NS update once we have the domain registered.
- **Spaceship domain registration returns HTTP 202** (async operation). Poll `/v1/async-operations/{operationId}` for `success`/`failed` status. Same for NS update.
- **Spaceship auth**: `X-Api-Key` + `X-Api-Secret` headers. No bearer token. No npm client — raw `fetch`.
- **Cloudflare SSL cert**: takes 1–15 minutes after zone becomes active. Poll `client.ssl.verification.get({ zone_id })` checking `certificate_status === 'active'`. Use BullMQ delayed jobs or a background polling interval — do not busy-wait in the worker.
- **D028 credential storage**: all API tokens stored as `{"value": "..."}` JSON in `settings.value`. Both `CloudflareClient` and `SpaceshipClient` must read at call time from Supabase (not process.env) to match the DataForSEO pattern.
- **Domain purchase approval is a hard requirement** (R031, anti-feature). The admin panel shows domain suggestions and an "Approve & Register" button. The BullMQ worker only registers a domain when explicitly triggered by this approval action — never autonomously.
- **Worker runs on VPS1** — SSH to VPS2 over Tailscale. VPS1 must have `id_ed25519` key authorized on VPS2. Tailscale must be running on both VPS1 and VPS2.

## Common Pitfalls

- **Caddy JSON API vs file-based**: the JSON API (`POST /load`, `/config/[path]`) requires port 2019 to be accessible from VPS1. Over Tailscale this is feasible but adds another network dependency. File-based config (write file + `systemctl reload`) is simpler and survives reboots without maintaining in-memory state. **Use file-based.**
- **Cloudflare zone already exists**: if the zone was previously created (e.g. a failed retry), `zones.create()` will return an error. Always check `zones.list({ name: domain })` first and reuse the existing zone_id. Idempotent zone creation avoids duplicate billing or state confusion.
- **DNS TTL propagation != Cloudflare activation**: even after Cloudflare proxies the A record, the zone may still be `pending` if NS records haven't propagated globally. The state machine needs two separate signals: (1) zone `status === 'active'` (NS propagated) and (2) `certificate_status === 'active'` (SSL issued). Don't collapse these into one check.
- **`--delete` flag on rsync for redeploys**: without `--delete`, stale files from previous builds (e.g. removed product pages) persist on VPS2. Always use `--delete` to ensure the live site exactly matches the built dist.
- **SSH StrictHostKeyChecking**: first-time SSH to VPS2 will prompt for host key confirmation, blocking automation. Pass `-o StrictHostKeyChecking=no` or pre-populate `~/.ssh/known_hosts` on VPS1. In a proper setup, seed known_hosts as part of VPS2 provisioning.
- **Caddy reload vs restart**: `systemctl reload caddy` does a graceful hot-reload (no downtime). `systemctl restart caddy` briefly interrupts service. Always use `reload` in automation. Validate the Caddyfile syntax before reloading (`caddy validate --config /etc/caddy/Caddyfile`) to avoid blowing up all sites if one config is malformed.
- **Spaceship contact IDs required for registration**: domain registration at Spaceship requires registrant/admin/tech/billing contact IDs. These must be pre-created in the Spaceship account and stored as a setting (e.g. `spaceship_contact_id`). The Settings page needs a field for this. Without a valid contact ID, the registration call will fail with a 422.
- **BullMQ lockDuration for deploy phase**: rsync + Cloudflare polling could take several minutes. Use `lockDuration: 300000` (already set) and ensure the deploy phase doesn't wait indefinitely for SSL (which can take up to 15 min). Use a separate `ssl-poller` BullMQ job with delayed retries, or transition to `ssl_pending` and let a cron pick it up — don't block the main worker thread waiting for Cloudflare.
- **`packages/deployment` runs in the same worker process as Astro build**: Astro `build()` uses `process.chdir()` (D049), which is process-global. Ensure the deploy phase runs after `process.chdir(prevCwd)` is restored in the `finally` block of the build phase.

## Open Risks

- **VPS2 doesn't exist yet** — if VPS2 isn't provisioned, S01 (rsync) can't be validated end-to-end. Caddy file-writing logic can be unit-tested with mocks; rsync integration test requires VPS2. This should be a documented prerequisite confirmed before S01 starts.
- **Spaceship contact ID prerequisite** — registration requires a pre-existing contact in the Spaceship account. If the account has no saved contacts, the registration endpoint returns 422. This contact ID setup is a one-time manual step that needs to be surfaced clearly in the Settings UI.
- **Cloudflare free plan zone limit** — CF free plan is limited to 1 account, unlimited zones. However, if the account was created as a team/org account, there may be zone limits. Verify the CF account type before assuming unlimited zones.
- **NS propagation timing** — after Spaceship NS update, TTL expiry on old nameservers can take 24-48h. The `dns_pending` state in the site state machine can linger. The user needs to understand this is normal — the admin panel should show a "waiting for NS propagation" message with the assigned CF nameservers.
- **Caddy validation failure takes down all sites** — if a badly-formed `<domain>.caddy` file is written and reloaded, Caddy will reject the entire config and revert (graceful). But if `validate` is skipped and the config is bad enough, it could fail to revert cleanly. Always run `caddy validate` before `systemctl reload`.
- **M003 pre-requisite**: the context notes an operational end-to-end run (real DataForSEO + Anthropic credentials) should happen before M004 to confirm SEO score distribution and fix the Amazon CDN User-Agent issue. If this hasn't happened, M004 may deploy sites with 0-image products.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Cloudflare API | `npx skills find "cloudflare"` | none found (use official `cloudflare` npm pkg) |
| Caddy | none | none found (simple SSH pattern suffices) |
| Spaceship API | none | none found (raw fetch, well-documented REST API) |

## Sources

- Caddy `import sites/*` pattern and file-based virtualhost management (source: [Caddy Documentation — Caddyfile Concepts](https://caddyserver.com/docs/caddyfile/concepts))
- Caddy Admin API `/load` endpoint for JSON config (source: [Caddy API docs](https://caddyserver.com/docs/api))
- Cloudflare `cloudflare` npm package (v5): `client.zones.create()`, `client.dns.records.create()`, `client.ssl.verification.get()` (source: [Cloudflare API Node.js docs](https://developers.cloudflare.com/api/node/resources/dns/subresources/records/methods/create/))
- Zone status polling: `status: "initializing" | "pending" | "active"` (source: [Cloudflare API zones.list](https://developers.cloudflare.com/api/node/resources/zones/methods/list/))
- SSL certificate status: `certificate_status: "active"` via `ssl.verification.get()` (source: [Cloudflare SSL Verification](https://developers.cloudflare.com/api/resources/ssl/subresources/verification/methods/get/))
- Spaceship API: availability check `GET /v1/domains/{domain}/available`, registration `POST /v1/domains/{domain}` (202 async), NS update `PUT /v1/domains/{domain}/nameservers` (source: [Spaceship API docs](https://docs.spaceship.dev/))
- Spaceship async operation polling: `GET /v1/async-operations/{operationId}` returns `pending|success|failed` (source: [Spaceship API docs](https://docs.spaceship.dev/))
- DataForSEO credential-read-from-Supabase pattern reused for Cloudflare/Spaceship clients (source: `packages/agents/src/clients/dataforseo.ts`, D028, D050)
- DB schema: `domains` + `deployments` tables already in migration 001 (source: `packages/db/supabase/migrations/20260313000001_core.sql`)
- State machine: `SITE_STATUS_FLOW` in `packages/shared/src/constants/index.ts`
