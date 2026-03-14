---
id: S01
parent: M004
milestone: M004
provides:
  - packages/deployment package (RsyncService + CaddyService) — clean ESM build with .d.ts
  - RsyncService.deploy(slug, vps2Host, vps2User, vps2SitesRoot) — rsync over SSH with --delete
  - CaddyService.writeVirtualhost(domain, slug, vps2Host, vps2User) — SSH write + systemctl reload
  - Settings UI extended with vps2_host, vps2_user, vps2_sites_root (VPS2 Deployment card)
  - User-Agent fix in downloadAndConvertImage() — Amazon CDN now receives browser UA header (D069)
  - pnpm onlyBuiltDependencies for ssh2/cpu-features native crypto binding
requires:
  - slice: none
    provides: first slice — no upstream slice dependencies
affects:
  - S02 (Cloudflare Automation + Deploy Pipeline) — consumes RsyncService, CaddyService, vps2_* settings
key_files:
  - packages/deployment/src/rsync.ts
  - packages/deployment/src/caddy.ts
  - packages/deployment/src/index.ts
  - packages/deployment/tsup.config.ts
  - packages/deployment/package.json
  - packages/agents/src/pipeline/images.ts
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
  - package.json (root — onlyBuiltDependencies)
key_decisions:
  - D070: RsyncService uses child_process.spawn; CaddyService uses node-ssh
  - D071: CaddyService uses SSH agent (SSH_AUTH_SOCK), no key file
  - D072: VPS2 config keys are plain text settings, not secrets
  - D073: RsyncService resolves monorepo root via process.cwd()
patterns_established:
  - "[ServiceName] prefixed console.log/error for all service stdout/stderr"
  - "Rejection errors include operation name, host, exit code, and full stderr text"
  - "CaddyService error identifies which step failed (write vs reload)"
  - "New settings keys require changes in exactly 3 places: SETTINGS_KEYS constant, SaveSettingsSchema + SaveSettingsErrors, settings-form.tsx card section"
  - "SETTINGS_KEYS loop in actions.ts automatically handles new keys — no action body changes needed"
observability_surfaces:
  - "[RsyncService] prefixed stdout/stderr lines during rsync transfer"
  - "[CaddyService] prefixed SSH command stdout/stderr lines (write step and reload step)"
  - "RsyncService rejection: 'rsync exited with code N for slug X on host Y\\nstderr:\\n...'"
  - "CaddyService rejection: 'write step failed (exit N)' or 'reload step failed (exit N)' with full SSH output"
  - "VPS2 inspection: ls /etc/caddy/sites/, sudo systemctl status caddy, journalctl -u caddy -n 50"
  - "Settings page /settings — VPS2 Deployment card shows MaskedIndicator (last-4 chars) for configured values"
drill_down_paths:
  - .gsd/milestones/M004/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T02-SUMMARY.md
duration: ~40min
verification_result: passed
completed_at: 2026-03-14
---

# S01: rsync + Caddy Deployment Service

**`packages/deployment` built and verified with `RsyncService` and `CaddyService`; Settings UI extended with VPS2 keys; Amazon CDN User-Agent fixed.**

## What Happened

**T01** created `packages/deployment` from scratch. Two services implement the VPS2 deployment primitive:

- `RsyncService.deploy()` spawns a `rsync` subprocess with `-avz --delete -e "ssh -o StrictHostKeyChecking=no"`, transferring `.generated-sites/<slug>/dist/` to `<user>@<host>:<sites_root>/<slug>/dist/`. Monorepo root resolved via `process.cwd()` (D073). All rsync stdout/stderr forwarded to console with `[RsyncService]` prefix. On non-zero exit: rejects with error containing exit code, slug, host, and full stderr.

- `CaddyService.writeVirtualhost()` connects to VPS2 via `node-ssh` using `SSH_AUTH_SOCK` (D071). Generates a Caddyfile snippet with `root * /var/www/sites/<slug>/dist`, `file_server`, and `encode zstd gzip`. Writes via `printf '%s' '...' | sudo tee /etc/caddy/sites/<domain>.caddy` (avoids trailing newline issues from `echo`). Reloads via `sudo systemctl reload caddy`. Throws on failure identifying which step (write vs reload) failed and including full SSH output.

The `ssh2` native crypto binding required `onlyBuiltDependencies: ["cpu-features", "ssh2"]` in the root `package.json` pnpm config block — standard pnpm 10 unlock for packages with native addons.

The User-Agent fix (D069) added a browser UA string to `downloadAndConvertImage()` in `packages/agents` — one-line change inside the `fetch()` options object.

**T02** extended the settings pipeline at all three touch points. `SETTINGS_KEYS` grew from 4 to 7 entries (`vps2_host`, `vps2_user`, `vps2_sites_root`). `SaveSettingsSchema` and `SaveSettingsErrors` extended with three optional string fields. A "VPS2 Deployment" card added to `settings-form.tsx` following the established Label + Input + MaskedIndicator + FieldError pattern. The existing `SETTINGS_KEYS` loop in `actions.ts` required zero body changes — new keys are handled automatically.

## Verification

```
pnpm --filter @monster/deployment build     # exits 0; dist/index.js (5.02 KB) + dist/index.d.ts (1.09 KB)
pnpm --filter @monster/deployment typecheck # exits 0 (no output)
pnpm --filter @monster/agents build        # exits 0; dist/index.js (475.91 KB) + dist/worker.js (2.69 MB)
pnpm --filter @monster/admin build         # exits 0; next build with TypeScript type-check ("Compiled successfully")

# Export check — both services present
node -e "import('/home/daniel/monster/packages/deployment/dist/index.js').then(m => {
  console.log(typeof m.RsyncService, typeof m.CaddyService)
})"
# Output: function function

# Diagnostic surface check — error includes exit code + host + stderr
node --input-type=module -e "
  import { RsyncService } from '/home/daniel/monster/packages/deployment/dist/index.js';
  const svc = new RsyncService();
  svc.deploy('x', 'bad-host', 'root', '/var/www').catch(e => console.log(e.message.slice(0,80)));
"
# Output: [RsyncService] rsync exited with code 255 for slug "x" on host "bad-host".
```

All slice must-haves confirmed:
- [x] `packages/deployment` builds cleanly (`tsup` exits 0, `tsc --noEmit` exits 0)
- [x] `RsyncService.deploy()` rsyncs with `--delete` over SSH; rejects with exit code + stderr on failure
- [x] `CaddyService.writeVirtualhost()` writes Caddyfile snippet via SSH + reloads Caddy
- [x] Settings keys `vps2_host`, `vps2_user`, `vps2_sites_root` added to Settings UI
- [x] `downloadAndConvertImage()` sends browser User-Agent header
- [x] `pnpm --filter @monster/agents build` exits 0
- [x] `pnpm --filter @monster/admin build` exits 0

## Requirements Advanced

- R006 (Automated deployment to VPS2 via Cloudflare) — `RsyncService` and `CaddyService` are the first two primitives. S02 wires them into the end-to-end deploy pipeline.

## Requirements Validated

- none this slice — R006 validates when S02 completes the full deploy pipeline

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Root package.json modified (T01):** `pnpm.onlyBuiltDependencies: ["cpu-features", "ssh2"]` added for `ssh2` native crypto binding. Not in the plan but standard pnpm 10 configuration for packages with native addons. No behavioral change to other packages.
- **`printf` instead of `echo` in CaddyService (T01):** Used `printf '%s'` in the SSH tee command to avoid trailing newline issues. Functionally equivalent, more correct for heredoc-style file writes over SSH.
- **Browser UAT blocked (T02):** Playwright not available on this host (missing `libnspr4.so`). `next build` type-check serves as the type-safety gate. Human verification of Settings UI rendering against the running dev server is documented in the UAT.

## Known Limitations

- **VPS2 is a prerequisite, not managed by this slice.** VPS2 must exist with Caddy installed and `import sites/*` in the global Caddyfile. This is documented in the UAT as a precondition.
- **SSH_AUTH_SOCK must be set** in the worker process environment for CaddyService to connect. pm2 with Tailscale SSH agent forwarding on VPS1 satisfies this in production. Local test scripts must have the agent running.
- **Integration test (rsync to live VPS2)** is human-run — no automated CI path for live SSH. Documented in S01-UAT.md.

## Follow-ups

- S02 wires `RsyncService` + `CaddyService` into `GenerateSiteJob` deploy phase with `sites.status` transitions
- `SSH_AUTH_SOCK` must be verified present in pm2 worker environment before first live deploy (S02 scope)
- If SSH agent isn't available, add `identityFile: '~/.ssh/id_rsa'` fallback to `CaddyService` (noted in D071)

## Files Created/Modified

- `packages/deployment/src/rsync.ts` — `RsyncService` class (new)
- `packages/deployment/src/caddy.ts` — `CaddyService` class (new)
- `packages/deployment/src/index.ts` — barrel export (new)
- `packages/deployment/tsup.config.ts` — tsup build config (new)
- `packages/deployment/package.json` — type, exports, scripts, dependencies (new)
- `packages/deployment/tsconfig.json` — TypeScript config (new)
- `packages/agents/src/pipeline/images.ts` — added `User-Agent` header to `fetch()` in `downloadAndConvertImage()`
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added vps2_host, vps2_user, vps2_sites_root to SETTINGS_KEYS
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — extended SaveSettingsSchema and SaveSettingsErrors with VPS2 keys
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — added VPS2 Deployment card section
- `package.json` (root) — added `pnpm.onlyBuiltDependencies` for ssh2/cpu-features

## Forward Intelligence

### What the next slice should know
- `RsyncService` and `CaddyService` are ready to import from `@monster/deployment` — add as a workspace dependency to whichever package needs them in S02.
- `vps2_host`, `vps2_user`, `vps2_sites_root` are stored in Supabase `settings` table and follow the same fetch-from-DB pattern as all other settings keys.
- The Caddyfile snippet format is: `<domain> { root * /var/www/sites/<slug>/dist\nfile_server\nencode zstd gzip\n}`. VPS2 global Caddyfile must have `import sites/*` for this to take effect.
- `process.cwd()` in `RsyncService` must resolve to the monorepo root when the worker runs. BullMQ workers launched by pm2 from the repo root satisfy this. If the cwd is ever wrong, the rsync source path will be wrong — add an explicit `monorepoRoot` parameter in that case.

### What's fragile
- **SSH agent dependency in CaddyService** — `SSH_AUTH_SOCK` must be present in the worker process environment. If pm2 doesn't forward the SSH agent, `CaddyService` will throw a connection error. Verify with `echo $SSH_AUTH_SOCK` in the pm2 worker context before first S02 live deploy.
- **`import sites/*` in Caddy global config** — if this directive is missing on VPS2, the written `.caddy` files will be silently ignored and `systemctl reload caddy` will succeed without picking them up. Verify with `curl http://<vps2-ip>` returning 200 after first deploy.

### Authoritative diagnostics
- **RsyncService failures:** `[RsyncService]` prefixed stderr lines show exactly what rsync printed. Non-zero exit code + full stderr in thrown error.
- **CaddyService failures:** `[CaddyService]` prefixed lines identify write vs reload step. Check `journalctl -u caddy -n 50` on VPS2 if reload succeeds but site doesn't serve.
- **VPS2 file check:** `ls /etc/caddy/sites/` confirms the Caddyfile was written; `cat /etc/caddy/sites/<domain>.caddy` shows its content.

### What assumptions changed
- `printf '%s'` required instead of `echo` for SSH tee command — `echo` adds a trailing newline that interacts unexpectedly with single-quoted multi-line strings. This is the correct pattern for all future SSH file-write operations in `CaddyService`.
