---
estimated_steps: 7
estimated_files: 6
---

# T01: Implement `packages/deployment` (RsyncService + CaddyService) + User-Agent fix

**Slice:** S01 — rsync + Caddy Deployment Service
**Milestone:** M004

## Description

Three things in one context window:

1. **User-Agent fix (D069):** `downloadAndConvertImage()` in the agents pipeline currently sends no User-Agent header, causing Amazon CDN to return 403. Add a browser UA string so deployed sites have real product images.

2. **`packages/deployment` package:** Create `RsyncService` and `CaddyService` — the two building blocks the S02 deploy phase will call. `RsyncService` spawns a local `rsync` subprocess with SSH transport to copy `.generated-sites/<slug>/dist/` to VPS2. `CaddyService` SSHes into VPS2, writes a per-site Caddyfile snippet to `/etc/caddy/sites/<domain>.caddy`, then reloads Caddy.

3. **Build wiring:** tsup config, package.json scripts/deps, tsconfig — all the scaffolding that makes `pnpm --filter @monster/deployment build` exit 0.

The Caddy snippet format is file-based (D063): each site gets `/etc/caddy/sites/<domain>.caddy` containing a `<domain> { root * /var/www/sites/<slug>/dist; file_server }` virtualhost block. VPS2's global Caddyfile must have `import sites/*` (documented prerequisite — not implemented here).

## Steps

1. **User-Agent fix in `packages/agents/src/pipeline/images.ts`:** In `downloadAndConvertImage()`, add `'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'` to the `fetch()` call's headers. Verify `pnpm --filter @monster/agents build` still exits 0.

2. **Add `node-ssh` dependency to `packages/deployment/package.json`:** Also add `tsup` and `typescript` as devDependencies. Add `build` and `typecheck` scripts. Set `"type": "module"` and fill in `exports` map with `"."` pointing to `dist/index.js`.

3. **Create `packages/deployment/src/rsync.ts` — `RsyncService`:** Implement `deploy(slug, vps2Host, vps2User, vps2SitesRoot)`. Source path: `<monorepoRoot>/.generated-sites/<slug>/dist/`. Remote path: `<vps2User>@<vps2Host>:<vps2SitesRoot>/<slug>/dist/`. Spawn rsync with flags: `-avz --delete -e "ssh -o StrictHostKeyChecking=no"`. Stream stdout and stderr to console with `[RsyncService]` prefix. Reject on non-zero exit code with error message containing rsync stderr output. Use `fileURLToPath(new URL('../../../../', import.meta.url))` or `process.cwd()` to resolve the monorepo root (pick whichever is reliable at call time — document the choice).

4. **Create `packages/deployment/src/caddy.ts` — `CaddyService`:** Implement `writeVirtualhost(domain, slug, vps2Host, vps2User)`. SSH into VPS2 via `node-ssh` with `{ host: vps2Host, username: vps2User, agent: process.env.SSH_AUTH_SOCK }` (use the SSH agent — no key file management). Generate Caddyfile snippet: `${domain} {\n  root * /var/www/sites/${slug}/dist\n  file_server\n  encode zstd gzip\n}\n`. Write file via `conn.execCommand(\`echo '...' | sudo tee /etc/caddy/sites/${domain}.caddy\`)`. Then `conn.execCommand('sudo systemctl reload caddy')`. Log stdout/stderr from both commands with `[CaddyService]` prefix. Throw if reload command exits non-zero.

5. **Create `packages/deployment/src/index.ts`:** Re-export `RsyncService` and `CaddyService`.

6. **Create `packages/deployment/tsup.config.ts`:** Entry: `src/index.ts`. Format: `esm`. DTS: `true`. Target: `node20`. External: `['node-ssh']` (avoid bundling native deps).

7. **Build verification:** Run `pnpm --filter @monster/deployment build` and `pnpm --filter @monster/deployment typecheck`. Fix any type errors. Verify `dist/index.js` and `dist/index.d.ts` exist.

## Must-Haves

- [ ] `downloadAndConvertImage()` sends browser User-Agent header in fetch call
- [ ] `RsyncService.deploy()` spawns rsync with `--delete` and SSH transport; resolves on exit 0; rejects on non-zero with stderr in error message
- [ ] `CaddyService.writeVirtualhost()` writes Caddyfile snippet to VPS2 via SSH and reloads Caddy; uses SSH agent (no key file)
- [ ] Both services prefix all console output with `[RsyncService]` / `[CaddyService]`
- [ ] `pnpm --filter @monster/deployment build` exits 0
- [ ] `pnpm --filter @monster/deployment typecheck` exits 0
- [ ] `pnpm --filter @monster/agents build` exits 0 (User-Agent change doesn't break build)

## Verification

- `pnpm --filter @monster/deployment build` exits 0 and produces `dist/index.js` + `dist/index.d.ts`
- `pnpm --filter @monster/deployment typecheck` exits 0
- `pnpm --filter @monster/agents build` exits 0
- `node -e "import('@monster/deployment').then(m => { console.log(typeof m.RsyncService, typeof m.CaddyService); })"` prints `function function` (or run from inside monorepo with workspace resolution)

## Observability Impact

- Signals added/changed: `[RsyncService]` prefixed rsync progress lines to stdout; `[CaddyService]` prefixed SSH command stdout/stderr; rsync exit code and stderr in rejection error
- How a future agent inspects this: Check `pnpm --filter @monster/deployment build` output; for live failures, check VPS2 `/etc/caddy/sites/` for written files and `journalctl -u caddy -n 50` for reload errors
- Failure state exposed: RsyncService error includes rsync stderr + exit code; CaddyService error includes SSH command output + which step failed (write vs reload)

## Inputs

- `packages/agents/src/pipeline/images.ts` — existing file; only the `fetch()` call in `downloadAndConvertImage()` changes
- `packages/deployment/package.json` — exists as shell with empty `exports` and `scripts`; needs real content
- `packages/deployment/tsconfig.json` — exists with correct base settings; no changes needed

## Expected Output

- `packages/agents/src/pipeline/images.ts` — `fetch()` call has User-Agent header
- `packages/deployment/src/rsync.ts` — `RsyncService` class
- `packages/deployment/src/caddy.ts` — `CaddyService` class
- `packages/deployment/src/index.ts` — barrel export
- `packages/deployment/tsup.config.ts` — build config
- `packages/deployment/package.json` — complete with deps, scripts, exports
- `packages/deployment/dist/index.js` + `dist/index.d.ts` — built output
