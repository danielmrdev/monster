# M004: Deployment + Cloudflare — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M003 is complete

## Why This Milestone

M003 builds sites locally. M004 makes them publicly accessible. This milestone delivers the deployment service (rsync to VPS2 + Caddy virtualhost config), Cloudflare automation (zone creation + A record + SSL tracking), domain management via Spaceship API, and the site state machine (`generating → live`). After M004, a TSA site built in M003 is publicly accessible at its domain with SSL, CDN, and DDoS protection.

## User-Visible Outcome

### When this milestone is complete, the user can:
- Click "Deploy" in admin panel → site rsyncs to VPS2, Cloudflare zone created, DNS record set
- See the site progress through states: deploying → dns_pending → ssl_pending → live
- Visit the live site at its domain in a browser with SSL (https)
- See Cloudflare proxy active (orange cloud in CF dashboard)
- Check domain availability and register a domain (with explicit approval step) from admin panel

### Entry point / environment
- Entry point: "Deploy" button in admin panel site detail
- Environment: VPS1 → VPS2 via Tailscale SSH rsync, Cloudflare API, Spaceship API
- Live dependencies: VPS2 (Caddy), Cloudflare API, Spaceship API, Tailscale

## Completion Class

- Contract complete means: deployment package is typed and the rsync/CF API calls are wired
- Integration complete means: a real site is live at a real domain with working SSL
- Operational complete means: Caddy on VPS2 auto-configures virtualhost; site survives VPS2 reboot

## Final Integrated Acceptance

- Deploy a real TSA site built in M003 to VPS2
- Visit `https://<domain>` in browser — loads correctly, SSL valid, Cloudflare proxied
- `curl -I https://<domain>` shows `CF-RAY` header (confirming Cloudflare proxy active)
- Redeploy (with a content change) → site updates without downtime

## Risks and Unknowns

- **VPS2 setup** — VPS2 must exist with Caddy installed and SSH accessible from VPS1 via Tailscale. If VPS2 doesn't exist yet, provisioning is out of scope for this milestone (document as prerequisite).
- **Caddy API vs config file** — Caddy can be configured via its API or by writing/reloading config files. API approach is cleaner for automation. Need to validate Caddy version on VPS2 supports the API.
- **Cloudflare zone creation for new domains** — first zone creation for a domain triggers NS update instructions. The user must update nameservers at Spaceship. This is a manual step that can't be fully automated (Spaceship NS update is automatable but NS propagation is not instant).
- **Spaceship API docs**: https://docs.spaceship.dev/ — need to verify domain registration + NS update endpoints.

## Existing Codebase / Prior Art

- M001-M003: all site types, DB schema, typed client
- `docs/PRD.md`: deployment architecture section, Cloudflare analysis
- D004/D005 in DECISIONS.md: Cloudflare strategy + site state machine

## Relevant Requirements

- R006 — Automated deployment to VPS2 via Cloudflare
- R011 — Domain management via Spaceship + Cloudflare

## Scope

### In Scope
- `packages/deployment`: rsync service (VPS1 → VPS2 via Tailscale SSH), Caddy API client
- `packages/domains`: Spaceship API client (availability check, registration, NS update) + Cloudflare API client (zone create, A record, SSL status check)
- Site state machine in Supabase + background worker polling Cloudflare for SSL readiness
- Domain availability check UI in admin panel (Research Lab prereq)
- Domain approval flow: agent proposes → user approves in UI → auto-registers

### Out of Scope
- VPS2 provisioning (assumed to exist with Caddy installed)
- Cloudflare Workers or advanced CF features
- Multi-region deployment

## Technical Constraints

- rsync via SSH over Tailscale: `rsync -avz -e "ssh -i ~/.ssh/id_ed25519" .generated-sites/<slug>/ daniel@100.X.X.X:/var/www/sites/<slug>/`
- Caddy API: `POST /load` or file-based config in `/etc/caddy/sites/<domain>.caddy`
- Cloudflare API: zone create → verify NS → create A record → poll SSL status
- Domain purchase: ALWAYS requires explicit user confirmation before Spaceship registration call
- State transitions must be persisted in Supabase `sites.status` field

## Integration Points

- VPS2: SSH via Tailscale, Caddy HTTP API
- Cloudflare API: Bearer token auth, zones + DNS records + SSL verification endpoints
- Spaceship API: API key + secret auth, domain search + registration + NS management
- Supabase: site state updates, domain records
