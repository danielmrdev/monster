# M004 Secrets Manifest

**Milestone:** M004 — Deployment + Cloudflare
**Generated:** 2026-03-13

### CLOUDFLARE_API_TOKEN

**Service:** Cloudflare
**Dashboard:** https://dash.cloudflare.com/profile/api-tokens
**Format hint:** 40-character alphanumeric string
**Status:** pending
**Destination:** dotenv

1. Log in to https://dash.cloudflare.com and navigate to My Profile → API Tokens
2. Click "Create Token"
3. Use the "Edit zone DNS" template (or create a custom token)
4. Set Permissions: Zone → Zone (Edit), Zone → DNS (Edit), Zone → SSL and Certificates (Read)
5. Set Zone Resources: Include → All zones (or restrict to specific zones once created)
6. Click "Continue to summary" → "Create Token"
7. Copy the token immediately (shown only once) — this is `CLOUDFLARE_API_TOKEN`
8. Also note your Cloudflare Account ID (visible in the right sidebar of any zone page) — stored separately as `cloudflare_account_id` in admin Settings

### SPACESHIP_API_KEY

**Service:** Spaceship.com
**Dashboard:** https://www.spaceship.com/application/settings/api-keys
**Format hint:** UUID or alphanumeric key
**Status:** pending
**Destination:** dotenv

1. Log in to https://www.spaceship.com and go to Account → Settings → API Keys
2. Click "Generate API Key"
3. Copy the API Key value — this is `SPACESHIP_API_KEY`
4. The API Secret is shown alongside the key — copy it immediately as `SPACESHIP_API_SECRET`
5. Store both in admin Settings via the Settings UI (not .env directly — they are read from Supabase at call time per D028)

### SPACESHIP_API_SECRET

**Service:** Spaceship.com
**Dashboard:** https://www.spaceship.com/application/settings/api-keys
**Format hint:** alphanumeric secret string
**Status:** pending
**Destination:** dotenv

1. Generated alongside `SPACESHIP_API_KEY` (see above)
2. Copy the API Secret shown during key generation — it may not be retrievable later
3. Store in admin Settings as `spaceship_api_secret`

### VPS2_HOST

**Service:** Hetzner VPS2 (Sites server)
**Dashboard:** https://console.hetzner.cloud/projects
**Format hint:** Tailscale hostname (e.g. `monster-sites`) or Tailscale IP (e.g. `100.x.x.x`)
**Status:** pending
**Destination:** dotenv

1. Log in to Tailscale admin at https://login.tailscale.com/admin/machines
2. Find VPS2 (the public-facing sites server) in the machine list
3. Note its Tailscale IP (`100.x.x.x`) or hostname
4. Store as `vps2_host` in admin Settings — used by `RsyncService` for SSH target

### VPS2_IP

**Service:** Hetzner VPS2 (Sites server — public IP for Cloudflare A record)
**Dashboard:** https://console.hetzner.cloud/projects
**Format hint:** IPv4 address (e.g. `1.2.3.4`)
**Status:** pending
**Destination:** dotenv

1. Log in to https://console.hetzner.cloud and open the VPS2 server detail
2. Copy the public IPv4 address shown on the server overview page
3. Store as `vps2_ip` in admin Settings — used by `CloudflareClient` when creating the A record pointing domains to VPS2
4. This is different from `vps2_host` (which is the Tailscale address used for SSH): `vps2_ip` is the public internet IP that Cloudflare routes traffic to
