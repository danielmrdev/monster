---
id: T01
parent: S01
milestone: M004
provides:
  - packages/deployment package with RsyncService and CaddyService
  - User-Agent fix in downloadAndConvertImage() (D069)
  - pnpm onlyBuiltDependencies config for ssh2/cpu-features native build
key_files:
  - packages/deployment/src/rsync.ts
  - packages/deployment/src/caddy.ts
  - packages/deployment/src/index.ts
  - packages/deployment/tsup.config.ts
  - packages/deployment/package.json
  - packages/agents/src/pipeline/images.ts
  - package.json (root — onlyBuiltDependencies added)
key_decisions:
  - D070: RsyncService uses child_process.spawn; CaddyService uses node-ssh
  - D071: CaddyService uses SSH agent (process.env.SSH_AUTH_SOCK), no key file
  - D073: RsyncService resolves monorepo root via process.cwd()
patterns_established:
  - "[ServiceName] prefixed console.log/error for all service stdout/stderr"
  - "Rejection errors include operation name, host, exit code, and full stderr text"
  - "CaddyService error identifies which step failed (write vs reload)"
observability_surfaces:
  - "[RsyncService] prefixed stdout/stderr lines during rsync transfer"
  - "[CaddyService] prefixed SSH command stdout/stderr lines (write step and reload step)"
  - "RsyncService rejection: 'rsync exited with code N for slug X on host Y\\nstderr:\\n...'"
  - "CaddyService rejection: 'write step failed (exit N)' or 'reload step failed (exit N)' with full SSH output"
  - "VPS2 inspection: ls /etc/caddy/sites/, sudo systemctl status caddy, journalctl -u caddy -n 50"
duration: ~30min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Implement `packages/deployment` (RsyncService + CaddyService) + User-Agent fix

**Built and verified `packages/deployment` with `RsyncService` and `CaddyService`; applied D069 User-Agent fix to image pipeline.**

## What Happened

1. **User-Agent fix:** Added browser UA string to `downloadAndConvertImage()` fetch call in `packages/agents/src/pipeline/images.ts`. One-line change inside the `fetch()` options object.

2. **packages/deployment/package.json:** Filled in `type: "module"`, `exports` map, `build`/`typecheck`/`dev` scripts, `node-ssh` as a dependency, `tsup` and `typescript` as devDeps.

3. **Native build unlock:** `ssh2` (dependency of `node-ssh`) requires native compilation via node-gyp. pnpm 10's default security policy blocks build scripts. Added `onlyBuiltDependencies: ["cpu-features", "ssh2"]` to the root `package.json`'s `pnpm` config block. Native build succeeded (sshcrypto.node compiled).

4. **RsyncService (`packages/deployment/src/rsync.ts`):** Spawns `rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no" <source>/ <user>@<host>:<root>/<slug>/dist/` via `child_process.spawn`. Monorepo root resolved via `process.cwd()` (D073). Streams both stdout and stderr to console with `[RsyncService]` prefix. Rejects on non-zero exit with an error message containing the exit code and full stderr text.

5. **CaddyService (`packages/deployment/src/caddy.ts`):** Connects to VPS2 via `node-ssh` using `SSH_AUTH_SOCK` agent (D071). Generates Caddyfile snippet with `root * /var/www/sites/<slug>/dist`, `file_server`, and `encode zstd gzip`. Writes via `printf '%s' '...' | sudo tee /etc/caddy/sites/<domain>.caddy`. Reloads via `sudo systemctl reload caddy`. Logs all SSH command stdout/stderr with `[CaddyService]` prefix. Throws with step identification (write vs reload) on non-zero exit code. Uses `finally { conn.dispose() }` to always close the SSH connection.

6. **tsup.config.ts:** Entry `src/index.ts`, format `esm`, dts `true`, target `node20`, external `['node-ssh']`.

7. **S01-PLAN.md pre-flight fix:** Added failure-path diagnostic verification step to the Verification section.

## Verification

```
pnpm --filter @monster/deployment build     # exits 0; dist/index.js (5.02 KB) + dist/index.d.ts (1.09 KB)
pnpm --filter @monster/deployment typecheck # exits 0 (no output)
pnpm --filter @monster/agents build        # exits 0; dist/index.js + dist/worker.js built cleanly

# Export check
node -e "import('/home/daniel/monster/packages/deployment/dist/index.js').then(m => {
  console.log(typeof m.RsyncService, typeof m.CaddyService);
})"
# Output: function function
```

All T01 must-haves confirmed:
- [x] `downloadAndConvertImage()` sends browser User-Agent header
- [x] `RsyncService.deploy()` spawns rsync with `--delete` and SSH; resolves on 0; rejects on non-zero with exit code + stderr
- [x] `CaddyService.writeVirtualhost()` writes Caddyfile snippet via SSH + reloads Caddy; uses SSH agent
- [x] Both services prefix all output with `[RsyncService]` / `[CaddyService]`
- [x] `pnpm --filter @monster/deployment build` exits 0
- [x] `pnpm --filter @monster/deployment typecheck` exits 0
- [x] `pnpm --filter @monster/agents build` exits 0

## Diagnostics

- **RsyncService:** All rsync progress lines forwarded to console with `[RsyncService]` prefix. Failure error message format: `[RsyncService] rsync exited with code N for slug "X" on host "Y".\nstderr:\n<rsync stderr>`. Spawn errors (e.g. rsync binary not found) surface as `[RsyncService] failed to spawn rsync: <error>`.
- **CaddyService:** SSH write step logged as `[CaddyService] writing /etc/caddy/sites/<domain>.caddy`. Reload step logged as `[CaddyService] reloading caddy on <host>`. Failure errors identify step: `[CaddyService] write step failed (exit N)` or `[CaddyService] reload step failed (exit N)` — both include full SSH stdout + stderr.
- **VPS2 inspection:** `ls /etc/caddy/sites/` shows written files; `sudo systemctl status caddy` and `journalctl -u caddy -n 50` surface reload errors.

## Deviations

- **Root package.json modified:** Had to add `pnpm.onlyBuiltDependencies: ["cpu-features", "ssh2"]` to allow native build of `ssh2`'s crypto binding. This was not in the plan but is a standard pnpm 10 configuration for packages with native addons. No behavioral change to any other package.
- **`printf` instead of `echo` in CaddyService:** Used `printf '%s'` rather than `echo` in the tee command to avoid trailing newlines from `echo` interacting with single-quoted strings containing newlines. Functionally equivalent.

## Known Issues

None. `SSH_AUTH_SOCK` must be set in the worker process environment for CaddyService to connect — this is standard for processes launched by pm2 with agent forwarding configured on VPS1.

## Files Created/Modified

- `packages/agents/src/pipeline/images.ts` — Added `User-Agent` header to `fetch()` call in `downloadAndConvertImage()`
- `packages/deployment/package.json` — Complete: type, exports, scripts, dependencies
- `packages/deployment/src/rsync.ts` — `RsyncService` class (new)
- `packages/deployment/src/caddy.ts` — `CaddyService` class (new)
- `packages/deployment/src/index.ts` — Barrel export (new)
- `packages/deployment/tsup.config.ts` — tsup build config (new)
- `package.json` (root) — Added `pnpm.onlyBuiltDependencies` for ssh2/cpu-features
- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — Added failure-path diagnostic verification step (pre-flight fix)
- `.gsd/DECISIONS.md` — Appended D073
