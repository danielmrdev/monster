# S02: Services migration + Settings cleanup — Research

**Date:** 2026-03-16

## Summary

S02 is straightforward pattern application. The `servers` table and `Server` type exist from S01. The goal is:

1. **Settings cleanup** — remove `vps2_*` keys, add `hetzner_api_token`. Touches 3 files: `constants.ts`, `actions.ts`, `settings-form.tsx`.
2. **`RsyncService` + `CaddyService` migration** — accept a `Server` record (or `serverId`) from DB instead of bare host/user strings. The callers in `deploy-site.ts` currently read `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip` from settings and pass them as strings. New callers read the first active server from `servers` table and pass the `Server` record.
3. **`InfraService` migration** — replace `getVps2Health()` / `testDeployConnection()` (which read `vps2_host`/`vps2_user` from settings) with `getFleetHealth()` that queries all active `servers` rows and SSHes into each.
4. **Update callers** — `deploy-site.ts` (`runDeployPhase`), `infra/page.tsx`, and `api/infra/test-connection/route.ts`.

There are no unfamiliar technologies. Everything uses patterns established in S01 (`Server` type, D028 settings read, `node-ssh`, Supabase `servers` table query).

## Recommendation

Execute as three sequential tasks:

- **T01** — Settings cleanup: `constants.ts`, `actions.ts`, `settings-form.tsx`. Remove `vps2_*`, add `hetzner_api_token`. Quickest win; has no deps.
- **T02** — Service signatures: update `RsyncService.deploy()` and `CaddyService.writeVirtualhost()` to accept a `Server` record. Update `InfraService` to expose `getFleetHealth()` returning `FleetHealth`. Update `packages/deployment/src/index.ts` exports. Rebuild `@monster/deployment`.
- **T03** — Caller updates: update `runDeployPhase()` in `deploy-site.ts` to query first active server from `servers` table; update `infra/page.tsx` and `api/infra/test-connection/route.ts` to use `getFleetHealth()` and the new `Server`-based `testDeployConnection()`. Rebuild `@monster/agents`, then `@monster/admin`.

T01 is independent of T02/T03. T02 must precede T03.

## Implementation Landscape

### Key Files

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — `SETTINGS_KEYS` array. Remove `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`. Add `hetzner_api_token`.
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — `SaveSettingsSchema`, `SaveSettingsErrors` type, and loop reference `SETTINGS_KEYS`. Remove `vps2_*` fields from all three; add `hetzner_api_token: z.string().optional()` and matching error field. The `saveSettings` loop iterates `SETTINGS_KEYS` automatically — no logic change needed beyond schema/type.
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — remove the entire "VPS2 Deployment" `<Card>` section (3 fields: vps2_host, vps2_user, vps2_sites_root). Remove `vps2_ip` from the Cloudflare card. Add `hetzner_api_token` field under API Keys card (type="password", same pattern as other keys).
- `packages/deployment/src/rsync.ts` — `RsyncService.deploy(slug, vps2Host, vps2User, vps2SitesRoot)` → `RsyncService.deploy(slug, server: Server)`. Extract `server.public_ip` (or `server.tailscale_ip`) for the host, `server.ssh_user` for user. The `vps2SitesRoot` is hardcoded to `/var/www/sites` inside the function (it was always `/var/www/sites` — see Caddyfile snippet in caddy.ts which uses `root * /var/www/sites/${slug}/dist`). Import `Server` type from `./provisioning.js`.
- `packages/deployment/src/caddy.ts` — `CaddyService.writeVirtualhost(domain, slug, vps2Host, vps2User)` → accept `server: Server`. Extract `server.tailscale_ip ?? server.public_ip` for host, `server.ssh_user` for user. Import `Server` type from `./provisioning.js`.
- `packages/deployment/src/infra.ts` — major refactor. Add `FleetHealth` / `ServerHealth` interfaces. Add `getFleetHealth()`: query `servers` table for `status = 'active'`, SSH into each one (same metric collection as existing `getVps2Health()`), return `{ servers: ServerHealth[] }`. Keep or deprecate `getVps2Health()` — the roadmap says replace it, but `infra/page.tsx` currently imports it. Safest: rename to `getFleetHealth()` and update the page. `testDeployConnection()` should accept a `serverId?: string` (defaults to first active server) or keep current auto-resolve behavior. `readVps2Settings()` private helper is deleted; replaced by direct Supabase `servers` query.
- `packages/deployment/src/index.ts` — add exports for `FleetHealth`, `ServerHealth`. Remove export of `Vps2Health` (or keep for backward compat if anything else imports it — check first).
- `packages/agents/src/jobs/deploy-site.ts` — `runDeployPhase()` currently reads `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip` from settings. Replace with: query first active server from `servers` table (`status = 'active'` ordered by `created_at` asc, take first). Use `server.tailscale_ip ?? server.public_ip` as host, `server.ssh_user` as user. The `vps2_ip` for Cloudflare A record becomes `server.public_ip`. The `vps2_sites_root` path is hardcoded to `/var/www/sites` (already implied by Caddyfile content).
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — update import from `Vps2Health` to `FleetHealth`; call `getFleetHealth()` instead of `getVps2Health()`. The current single-server card layout must become a fleet table (multiple servers). S03 owns the full fleet UI — for S02, rendering a fleet table with N servers is sufficient even if basic.
- `apps/admin/src/app/api/infra/test-connection/route.ts` — `testDeployConnection()` may need a `serverId` param or auto-resolves to first active server. Update as needed.

### `vps2SitesRoot` path — confirm it's always `/var/www/sites`

`CaddyService.writeVirtualhost()` hardcodes `root * /var/www/sites/${slug}/dist` in the Caddyfile snippet. `RsyncService.deploy()` uses `vps2SitesRoot` as the remote base. These must match. Since the Caddyfile always writes `/var/www/sites`, `RsyncService` should also hardcode `/var/www/sites` or store `sites_root` in the `servers` table. The `servers` table as defined in S01 does **not** have a `sites_root` column — so the simplest approach is to hardcode `/var/www/sites` in `RsyncService` once `vps2SitesRoot` is removed from settings. This is consistent with how Caddy already works.

### `vps2_ip` in deploy-site.ts — becomes `server.public_ip`

Currently `vps2_ip` (the public Cloudflare-facing IP) is a settings key. After S02, this comes from `servers.public_ip`. The `ProvisioningService` already writes `public_ip` from Hetzner's server object — this is the authoritative source.

### Build Order

1. `pnpm --filter @monster/deployment build` — must rebuild after signature changes
2. `pnpm --filter @monster/agents build` — depends on updated deployment
3. `pnpm --filter @monster/admin build` — depends on both; also picks up settings UI changes

For the admin build to succeed, all sibling packages must already have `dist/` from S01 (they do — S01 T04 built them all). Only `deployment` and `agents` need rebuilding after S02 changes. Admin build can rely on existing `dist/` for `shared`, `db`, `domains`, `seo-scorer`.

### Verification Approach

```bash
# After T01 (settings cleanup)
grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts   # present
grep "vps2_host" apps/admin/src/app/(dashboard)/settings/constants.ts            # absent

# After T02 (service signatures)
pnpm --filter @monster/deployment typecheck   # exit 0
pnpm --filter @monster/deployment build       # exit 0

# After T03 (callers + admin)
pnpm --filter @monster/agents build           # exit 0
pnpm --filter @monster/admin build            # exit 0, /infra in route list
grep "vps2_host\|vps2_user\|vps2_sites_root\|vps2_ip" \
  packages/deployment/src/infra.ts \
  packages/deployment/src/rsync.ts \
  packages/deployment/src/caddy.ts \
  packages/agents/src/jobs/deploy-site.ts    # no matches
```

## Constraints

- `Server` type is exported from `packages/deployment/src/provisioning.js` — import it from there inside rsync.ts, caddy.ts, infra.ts (same package, relative import).
- `servers` table has `status` as plain text (not an enum). Active servers query: `.eq('status', 'active')`.
- `tailscale_ip` is nullable. Fallback to `public_ip` when selecting the connection host: `server.tailscale_ip ?? server.public_ip`. Always try Tailscale IP first (deploy pipeline runs from VPS1 which is on the same Tailscale network).
- `Vps2Health` is currently exported from `infra.ts` and imported in `infra/page.tsx`. When renaming to `ServerHealth` / `FleetHealth`, update both the export and the import in `page.tsx`.
- D034 applies: `SETTINGS_KEYS` lives in `constants.ts` (no directive) — already correct, no change to this pattern needed.
- Settings form uses the `errors` object keyed by field name. After removing `vps2_*` fields, the `SaveSettingsErrors` type must also drop them — TypeScript will catch any missed references at typecheck.

## Common Pitfalls

- **`vps2SitesRoot` hardcoding** — the `servers` table has no `sites_root` column. Do not try to read it from anywhere; hardcode `/var/www/sites` in `RsyncService` once the parameter is removed. It already matches the Caddy snippet.
- **Rebuilding deployment before agents** — agents bundles deployment transitively via `noExternal: [/@monster\/.*/]`. If agents is built before deployment dist is updated, the bundle will contain stale signatures and callers will have type errors.
- **`getFleetHealth()` with zero active servers** — must return `{ servers: [] }` gracefully (not throw). The infra page should render an empty state when no servers are registered yet (pre-provision).
