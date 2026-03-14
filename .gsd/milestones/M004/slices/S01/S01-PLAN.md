# S01: rsync + Caddy Deployment Service

**Goal:** A built Astro site can be rsynced to VPS2 over Tailscale SSH and served by Caddy at VPS2's direct IP — proved by `packages/deployment` building cleanly, and by the admin Settings UI accepting `vps2_host`, `vps2_user`, and `vps2_sites_root`.

**Demo:** `pnpm --filter @monster/deployment build` exits 0; Settings UI shows VPS2 fields; calling `RsyncService.deploy()` + `CaddyService.writeVirtualhost()` from a test script against live VPS2 successfully serves the site at `http://<vps2-ip>` (human verification).

## Must-Haves

- `packages/deployment` builds cleanly (`tsup` exits 0, `tsc --noEmit` exits 0)
- `RsyncService.deploy(slug, vps2Host, vps2User, vps2SitesRoot)` rsyncs `.generated-sites/<slug>/dist/` to VPS2 over Tailscale SSH with `--delete`
- `CaddyService.writeVirtualhost(domain, slug, vps2Host, vps2User)` writes `/etc/caddy/sites/<domain>.caddy` to VPS2 via SSH and runs `sudo systemctl reload caddy`
- Settings keys `vps2_host`, `vps2_user`, `vps2_sites_root` added to admin Settings UI (constants, schema, form fields, action)
- `downloadAndConvertImage()` in `packages/agents` sends a browser User-Agent header (D069 fix)
- `pnpm --filter @monster/agents build` still exits 0 after User-Agent fix
- `pnpm --filter @monster/admin build` still exits 0 after Settings UI extension

## Proof Level

- This slice proves: contract + operational (TypeScript build + live VPS2 SSH verification)
- Real runtime required: yes (VPS2 must be reachable via Tailscale for the integration check)
- Human/UAT required: yes (load `http://<vps2-ip>` in browser to confirm Caddy serves the site)

## Verification

- `pnpm --filter @monster/deployment build` exits 0
- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/agents build` exits 0 (User-Agent fix doesn't break existing build)
- `pnpm --filter @monster/admin build` exits 0 (Settings extension doesn't break admin build)
- Manual: `node scripts/test-deploy.mjs <slug>` rsyncs a built site and writes Caddy config, then `curl http://<vps2-ip>` returns 200 (human-run after VPS2 is confirmed reachable)
- Failure-path diagnostic: `RsyncService` error message must include rsync exit code and stderr text — verify by inspecting the error thrown when a bad host is passed (error contains "rsync exited with code"); `CaddyService` errors must identify which step failed (write vs reload) — visible in thrown error message and `[CaddyService]` prefixed log lines

## Observability / Diagnostics

- Runtime signals: `[RsyncService]` and `[CaddyService]` prefixed console.log lines per operation; rsync stdout/stderr forwarded to caller; SSH exec stdout/stderr forwarded
- Inspection surfaces: VPS2 `/etc/caddy/sites/` directory (files written by CaddyService); `sudo systemctl status caddy` on VPS2; `journalctl -u caddy -n 50` on VPS2
- Failure visibility: thrown errors include operation name, host, and original stderr; rsync non-zero exit code included in error message; SSH connection failure surfaces host + auth method used
- Redaction constraints: SSH private key path only (never log key contents); VPS2 host and user are non-secret

## Integration Closure

- Upstream surfaces consumed: `.generated-sites/<slug>/dist/` (output of `GenerateSiteJob` Astro build phase)
- New wiring introduced in this slice: `packages/deployment` exports `RsyncService` and `CaddyService`; Settings UI adds VPS2 keys readable by future `GenerateSiteJob` deploy phase (S02)
- What remains before the milestone is truly usable end-to-end: S02 (wire rsync + Caddy into `GenerateSiteJob` deploy phase + Cloudflare A record + status transitions)

## Tasks

- [x] **T01: Implement `packages/deployment` (RsyncService + CaddyService) + User-Agent fix** `est:2h`
  - Why: Core of S01. Creates the two services S02 will wire into the deploy pipeline. User-Agent fix (D069) is the prerequisite that gives deployed sites real product images.
  - Files: `packages/agents/src/pipeline/images.ts`, `packages/deployment/src/rsync.ts`, `packages/deployment/src/caddy.ts`, `packages/deployment/src/index.ts`, `packages/deployment/package.json`, `packages/deployment/tsconfig.json`
  - Do: Add browser User-Agent header to `downloadAndConvertImage()` fetch call. Add `node-ssh` dependency to `packages/deployment`. Implement `RsyncService` using `child_process.spawn` for rsync subprocess (rsync handles SSH transport natively via `-e ssh -o StrictHostKeyChecking=no`). Implement `CaddyService` using `node-ssh` to connect over SSH, write Caddyfile snippet via `conn.putFile()` or `conn.execCommand('tee /etc/caddy/sites/...')`, then run `sudo systemctl reload caddy`. Wire tsup build config. Both services must forward stdout/stderr for observability.
  - Verify: `pnpm --filter @monster/deployment build` exits 0; `pnpm --filter @monster/deployment typecheck` exits 0; `pnpm --filter @monster/agents build` exits 0
  - Done when: `packages/deployment/dist/index.js` exists and exports `RsyncService` and `CaddyService`; `packages/agents` build still clean

- [x] **T02: Extend Settings UI with VPS2 keys + workspace build validation** `est:1h`
  - Why: `vps2_host`, `vps2_user`, `vps2_sites_root` must be readable from Supabase settings so the S02 deploy phase can fetch them. Settings UI is the only config surface for these keys (D028 pattern).
  - Files: `apps/admin/src/app/(dashboard)/settings/constants.ts`, `apps/admin/src/app/(dashboard)/settings/actions.ts`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
  - Do: Add `vps2_host`, `vps2_user`, `vps2_sites_root` to `SETTINGS_KEYS`. Extend `SaveSettingsSchema` with the three new fields. Add a "VPS2 Deployment" card section to `settings-form.tsx` with Input fields for each key (plain text, not password — these aren't secrets). Verify `pnpm --filter @monster/admin build` passes.
  - Verify: `pnpm --filter @monster/admin build` exits 0; Settings page renders new VPS2 Deployment section without errors
  - Done when: Three new settings keys are saved to Supabase when submitted; admin builds cleanly

## Files Likely Touched

- `packages/agents/src/pipeline/images.ts`
- `packages/deployment/src/rsync.ts` (new)
- `packages/deployment/src/caddy.ts` (new)
- `packages/deployment/src/index.ts` (new)
- `packages/deployment/package.json`
- `packages/deployment/tsconfig.json`
- `apps/admin/src/app/(dashboard)/settings/constants.ts`
- `apps/admin/src/app/(dashboard)/settings/actions.ts`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
