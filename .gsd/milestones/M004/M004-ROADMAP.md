# M004: Deployment + Cloudflare

**Vision:** A TSA site built by M003's pipeline becomes publicly accessible at its domain with Cloudflare proxy, auto-SSL, and tracked state — all triggered by a single "Deploy" button in the admin panel.

## Success Criteria

- "Deploy" button in admin panel site detail triggers rsync to VPS2, creates Cloudflare zone + A record, and updates `sites.status` through `deploying → dns_pending → ssl_pending → live`
- `curl -I https://<domain>` returns a `CF-RAY` header (Cloudflare proxy active, SSL valid)
- Redeploying (after a content change) updates the live site without downtime
- Domain availability can be checked from the admin panel; user can approve + register a domain via Spaceship with a single click (after which Cloudflare NS update is triggered automatically)
- All state transitions are persisted in Supabase and visible in the admin panel site detail

## Key Risks / Unknowns

- **VPS2 SSH + Caddy setup** — rsync + Caddy file-writing over Tailscale SSH is the only real infra unknown. If VPS2 doesn't exist or Caddy isn't configured with `import sites/*`, S01 cannot complete. This is the milestone's critical path.
- **Cloudflare zone async lifecycle** — zone creation, NS propagation, and SSL issuance are three separate async signals that can each stall for different durations. The state machine must not conflate them. Polling strategy must not block the BullMQ worker thread.
- **Spaceship contact ID prerequisite** — domain registration requires a pre-created contact record in the Spaceship account. Missing contact ID → 422 from Spaceship registration endpoint. Must be surfaced clearly in Settings UI.

## Proof Strategy

- VPS2 SSH + Caddy → retire in S01 by successfully rsyncing a built site and loading it in a browser from VPS2's direct IP (bypassing Cloudflare, proving Caddy serves it)
- Cloudflare async lifecycle → retire in S02 by tracking a zone through `pending → active` and observing `CF-RAY` header in `curl -I https://<domain>` with NS pointed at Cloudflare
- Spaceship contact ID → retire in S03 by completing a domain registration flow end-to-end (availability check → approval → registration → NS update), with Settings UI surfacing the contact ID field

## Verification Classes

- Contract verification: `pnpm --filter @monster/deployment build`, `pnpm --filter @monster/domains build`, `pnpm --filter @monster/agents typecheck`, `pnpm --filter @monster/admin build` — all exit 0
- Integration verification: rsync to VPS2 (live SSH), Caddy reload (live VPS2), Cloudflare zone create + A record (live CF API), Spaceship availability check + registration (live Spaceship API), SSL cert polling to `active`
- Operational verification: VPS2 reboot → Caddy auto-starts → site still serves (Caddy file-based config survives restart); redeploy with `--delete` removes stale pages
- UAT / human verification: visit `https://<domain>` in browser — loads correctly, SSL valid, padlock shows; `curl -I https://<domain>` shows `CF-RAY` header

## Milestone Definition of Done

This milestone is complete only when all are true:

- `packages/deployment` RsyncService + CaddyService are implemented and build cleanly
- `packages/domains` CloudflareClient + SpaceshipClient are implemented and build cleanly
- `GenerateSiteJob` deploy phase wires rsync → Caddy → Cloudflare A record, transitioning `sites.status` correctly
- SSL poller BullMQ job transitions `ssl_pending → live` when CF reports `certificate_status: 'active'`
- Admin panel "Deploy" button triggers the deploy pipeline; site detail shows current status with live state transitions
- Domain availability check UI works in admin panel; approval flow completes a real Spaceship registration + NS update
- `curl -I https://<domain>` shows `CF-RAY` header (Cloudflare proxy active, SSL valid)
- Redeploy with a content change updates the live site without downtime
- All new settings keys (`cloudflare_api_token`, `spaceship_api_key`, `spaceship_api_secret`, `spaceship_contact_id`, `vps2_host`, `vps2_user`, `vps2_sites_root`) are configurable from admin Settings UI
- `pnpm -r build` and `tsc --noEmit` both exit 0

## Requirement Coverage

- Covers: R006 (automated deployment to VPS2 via Cloudflare), R011 (domain management via Spaceship + Cloudflare)
- Partially covers: R001 (end-to-end pipeline — deploy is the final loop-closing step; pipeline now goes idea → generate → deploy → live)
- Leaves for later: R003 (niche research — M007), R007 (product refresh — M006), R008 (alerts — M006), R009 (analytics — M005), R010 (Monster Chat — M007), R012 (finances — M008)
- Orphan risks: none

## Slices

- [x] **S01: rsync + Caddy Deployment Service** `risk:high` `depends:[]`
  > After this: a built Astro site can be rsynced to VPS2 over Tailscale SSH and served by Caddy at VPS2's direct IP — provable by opening `http://<vps2-ip>/<slug>` in a browser and seeing the site render

- [ ] **S02: Cloudflare Automation + Deploy Pipeline** `risk:medium` `depends:[S01]`
  > After this: clicking "Deploy" in admin panel rsyncs the site to VPS2, creates a Cloudflare zone + A record, and tracks the site through `deploying → dns_pending → ssl_pending → live`; `curl -I https://<domain>` shows `CF-RAY` header once NS propagates

- [ ] **S03: Domain Management + Spaceship Integration** `risk:low` `depends:[S02]`
  > After this: user can check domain availability from admin panel, approve registration, and the system registers the domain via Spaceship + updates NS to Cloudflare automatically — completing R011

## Boundary Map

### S01 → S02

Produces:
- `RsyncService.deploy(slug, vps2Host, vps2User, vps2SitesRoot): Promise<void>` — rsync `.generated-sites/<slug>/dist/` to VPS2 over SSH with `--delete`
- `CaddyService.writeVirtualhost(domain, slug, vps2Host, vps2User): Promise<void>` — writes `/etc/caddy/sites/<domain>.caddy` over SSH + `systemctl reload caddy`
- Settings keys wired: `vps2_host`, `vps2_user`, `vps2_sites_root` readable from Supabase settings
- Pre-requisite fix: Amazon CDN User-Agent header in `downloadAndConvertImage()` so deployed sites have real product images

Consumes:
- nothing (first slice) — VPS2 must exist with Caddy installed and `import sites/*` in global Caddyfile (documented prerequisite)

### S02 → S03

Produces:
- `CloudflareClient.ensureZone(domain): Promise<{zoneId, nameservers}>` — idempotent zone create (check-then-create)
- `CloudflareClient.ensureARecord(zoneId, vps2Ip): Promise<void>` — idempotent A record upsert
- `CloudflareClient.pollSslStatus(zoneId): Promise<'active' | 'pending'>` — ssl.verification.get() wrapper
- `DeploySiteJob` / deploy phase in `GenerateSiteJob` wired end-to-end: rsync → Caddy → CF zone → A record → `sites.status` transitions
- `SslPollerJob` — BullMQ delayed job that polls CF SSL status and transitions `ssl_pending → live`
- Admin panel: "Deploy" button + deployment status card showing `sites.status` + latest `deployments` row
- Settings keys wired: `cloudflare_api_token`, `vps2_ip` (VPS2 public IP for A record)

Consumes:
- S01: `RsyncService`, `CaddyService`, `vps2_host`/`vps2_user`/`vps2_sites_root` settings

### S03 → (end)

Produces:
- `SpaceshipClient.checkAvailability(domain): Promise<{available, price}>` — `GET /v1/domains/{domain}/available`
- `SpaceshipClient.registerDomain(domain, contactId): Promise<{operationId}>` — `POST /v1/domains/{domain}` (202 async)
- `SpaceshipClient.updateNameservers(domain, nameservers): Promise<{operationId}>` — `PUT /v1/domains/{domain}/nameservers`
- `SpaceshipClient.pollOperation(operationId): Promise<'pending' | 'success' | 'failed'>` — async op poller
- Admin panel domain management UI: availability check input, "Approve & Register" button (requires explicit click), NS update status display
- Settings keys: `spaceship_api_key`, `spaceship_api_secret`, `spaceship_contact_id`
- `domains` table row lifecycle: `availability_checked → registration_pending → registered → ns_updated`

Consumes:
- S02: `CloudflareClient.ensureZone()` (provides nameservers for Spaceship NS update after registration)
