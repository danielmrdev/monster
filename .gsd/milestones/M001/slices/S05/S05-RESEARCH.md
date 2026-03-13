# S05: pm2 + Deploy Script — Research

**Date:** 2026-03-13

## Summary

S05 is the smallest slice in M001 — it wires a running Next.js build into pm2 and automates the deploy cycle. The skeleton is already largely in place: `ecosystem.config.js` exists with the `monster-admin` entry, `scripts/new-worktree.sh` and `scripts/squash-merge.sh` exist and work. What's missing: the ecosystem has a **critical bug** (wrong script path), the `scripts/deploy.sh` doesn't exist yet, pm2 startup (systemd) has not been configured, and the logs directory is created on first pm2 start (not pre-existing).

The biggest discovery: pm2 treats `node_modules/.bin/next` (a POSIX shell shim) as a Node.js file and fails with `SyntaxError: missing ) after argument list`. The fix is to point `script` at the actual Next.js JS binary: `node_modules/next/dist/bin/next`. This was reproduced and confirmed — the corrected path starts Next.js successfully and responds 200 on `/login`.

The `.env.local` symlink (`apps/admin/.env.local → ../../.env`) loads correctly under `next start` in production mode. No explicit env var injection is needed in the ecosystem config — `PORT` and `NODE_ENV` are the only vars that need to be in the `env` block.

## Recommendation

1. **Fix `ecosystem.config.js`**: change `script` from `node_modules/.bin/next` to `node_modules/next/dist/bin/next`. Keep PORT=3004 (consistent with dev; dev and prod don't run simultaneously). Clarify: 3001 is taken by `nous`, 3002 by nous internal, 3003 by another Next.js process, 3100 by `better-copilot`.
2. **Write `scripts/deploy.sh`**: `git pull → pnpm install --frozen-lockfile → pnpm -r build → pm2 reload monster-admin || pm2 start ecosystem.config.js --only monster-admin`. The `||` fallback handles first-run when the process isn't registered yet.
3. **pm2 startup**: The `systemd` service does not exist yet. The startup command requires `sudo` — this is a one-time manual step that the deploy script cannot automate. Document the command in the summary. After running it, `pm2 save` persists the process list.
4. **Write `M001-SUMMARY.md`**: Document worktree protocol, deploy protocol, and pm2 process management as required by the boundary map.
5. **Create `logs/` directory** pre-emptively in the repo (with `.gitkeep`) so it exists on a fresh clone before pm2 tries to create it.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Running Next.js under pm2 | `node_modules/next/dist/bin/next` as pm2 script | The `.bin/next` shim is a shell script — pm2 runs it as Node.js, causing a syntax error. The dist path is the actual JS entrypoint. |
| Build ordering across workspaces | `pnpm -r build` | pnpm respects the workspace dep graph — builds `@monster/db` and `@monster/shared` before `@monster/admin` automatically. No turbo needed. |
| pm2 boot persistence | `pm2 startup systemd` + `pm2 save` | Generates and installs the correct systemd unit for the NVM node path. One-time `sudo` command. |
| Reload without process-not-found error | `pm2 reload X || pm2 start ecosystem.config.js --only X` | `pm2 reload` fails with exit 1 if the process isn't registered. The `||` fallback starts it on first deploy. |

## Existing Code and Patterns

- `ecosystem.config.js` — skeleton exists, has `monster-admin` entry. **Bug**: `script: 'node_modules/.bin/next'` must become `script: 'node_modules/next/dist/bin/next'`. Port is 3004 (matches dev script). log paths reference `./logs/pm2-*.log`.
- `scripts/new-worktree.sh` — already complete and executable. No changes needed. Handles both existing and new branch cases.
- `scripts/squash-merge.sh` — already complete and executable. No changes needed.
- `scripts/deploy.sh` — does not exist yet. Must be created.
- `/home/daniel/nous/ecosystem.config.js` — reference pattern for pm2 config. Shows: `fork` mode, `max_memory_restart`, relative log paths, `kill_timeout`. Monster's config should follow the same structure.
- `apps/admin/.env.local → ../../.env` — symlink established in S04. Next.js production mode reads `.env.local` (step 2 of env load order: `.env.production.local → .env.local → .env.production → .env`). The symlink resolves correctly. No duplication needed.

## Constraints

- **Port 3004**: ports 3001, 3002, 3003, 3100 are taken. 3004 is used by dev (`next dev --port 3004`) and production (`PORT=3004` in ecosystem). Since dev and prod never run simultaneously on this VPS, using 3004 for both is acceptable.
- **pm2 startup requires sudo**: `pm2 startup` generates the systemd unit install command which requires `sudo`. The deploy script cannot run `sudo` non-interactively without sudoers config. This is a one-time manual step.
- **`pnpm -r build` ordering**: pnpm resolves build order from the workspace dep graph. `apps/admin` depends on `@monster/db` and `@monster/shared` — they build first. No Turborepo needed.
- **`pm2 reload` for fork mode**: `pm2 reload` in fork mode (`instances: 1`) sends SIGINT, waits for graceful exit, then starts fresh. Brief downtime (1-3s) is acceptable for a private admin panel. No cluster mode needed.
- **NVM path in systemd**: The startup command must include `PATH=$PATH:/home/daniel/.nvm/versions/node/v22.22.1/bin` to ensure pm2 finds node at boot (systemd doesn't inherit NVM PATH). The `pm2 startup systemd` command generates this correctly — do not hand-roll it.
- **`pnpm install --frozen-lockfile`**: deploy script should use `--frozen-lockfile` to catch lockfile drift. If lockfile is out of sync, the install fails loudly rather than silently updating.
- **logs directory**: pm2 creates `./logs/` on first start if it doesn't exist (confirmed). However, creating a `logs/.gitkeep` in the repo ensures the dir exists on fresh clone without a pm2 start.

## Common Pitfalls

- **`node_modules/.bin/next` as pm2 script** — it's a POSIX shell shim, not a Node.js file. pm2 runs it with node and gets `SyntaxError: missing ) after argument list`. Use `node_modules/next/dist/bin/next` instead. **Already reproduced on this VPS.**
- **`pm2 reload` when process not registered** — exits 1 with "Process or Namespace monster-admin not found". The deploy script must handle first-run: `pm2 reload monster-admin || pm2 start ecosystem.config.js --only monster-admin`.
- **`pm2 save` before startup** — the dump file (`~/.pm2/dump.pm2`) must be saved AFTER monster-admin is online. If `pm2 save` was run before this slice, the dump doesn't include monster-admin. Must re-run `pm2 save` after S05 is complete.
- **env vars in ecosystem `env` block** — do NOT add SUPABASE_* or NEXT_PUBLIC_* vars to the ecosystem env block. They come from `.env.local` (the symlink). Adding them to ecosystem.config.js would expose secrets in a committed JS file.
- **`--frozen-lockfile` on new dep** — if M002 adds a new package, the lockfile must be committed before running `deploy.sh` or the frozen install will fail. Document this in the deploy protocol.
- **systemd unit not yet installed** — `pm2 startup` was run during research (output shown above) but the `sudo` command was not executed. pm2 currently survives until next reboot but will NOT auto-restart on reboot until the systemd unit is installed. This is a required step in the slice.

## Open Risks

- **systemd sudo requirement**: The one-time `pm2 startup` command requires `sudo env PATH=...`. If the user doesn't have passwordless sudo for this command, it needs to be run interactively. Low risk — this is the VPS owner's machine.
- **Next.js `next/dist/bin/next` path stability**: This is an internal Next.js path. While stable in practice across minor versions, a major Next.js version bump could change it. Mitigation: pin the Next.js version or test after upgrades.
- **`.env.local` symlink deletion on reinstall**: If `apps/admin/` is wiped and recreated (e.g., a bad `git clean`), the symlink is lost. Next.js starts but Supabase client throws at runtime. The deploy script should verify the symlink exists — or recreate it.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pm2 | none | none found — pm2 config is straightforward, no skill needed |
| Next.js | — | S04 established all patterns; no new library docs needed |

## Sources

- pm2 startup command output: `pm2 startup` (run on VPS, init system: systemd, NVM path confirmed)
- Port inventory: `ss -tlnp` (3001: nous, 3002: nous internal, 3003: unknown Next.js, 3004: admin dev, 3100: better-copilot)
- Next.js env loading order: documented behavior — loads `.env.local` in production (non-test) mode
- `.bin/next` shim bug: reproduced — pm2 logs show `SyntaxError: missing ) after argument list` on `node_modules/.bin/next`
- Correct script path confirmed: `node node_modules/next/dist/bin/next start --port 3005` → HTTP 200 on `/login`
- `pnpm -r build` ordering: confirmed builds db → shared → admin in dep-graph order
- `pm2 reload` failure: reproduced — exits 1 with "Process or Namespace monster-admin not found" when process not registered
