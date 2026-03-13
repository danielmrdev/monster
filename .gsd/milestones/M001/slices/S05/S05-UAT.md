# S05: pm2 + Deploy Script — UAT

**Milestone:** M001
**Written:** 2026-03-13

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: S05 is entirely operational — the deliverables are a running pm2 process, an HTTP endpoint, and an executable shell script. Artifact inspection alone cannot prove the process stays online or the endpoint returns the right status code. Runtime verification is the only valid signal.

## Preconditions

1. Working directory: `/home/daniel/monster`
2. A production build exists in `apps/admin/.next/` (BUILD_ID is not "development") — run `pnpm -r build` if uncertain
3. No orphaned `next dev` process on port 3004 — check with `lsof -i :3004` and kill if present
4. pm2 is installed globally (`pm2 --version` should return a version number)
5. `.env` file (or equivalent) exists in `apps/admin/` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set

## Smoke Test

```bash
pm2 list | grep monster-admin | grep online && curl -sI http://localhost:3004/login | head -1
```

**Expected:** Both lines succeed — `monster-admin online` in pm2 list, `HTTP/1.1 200 OK` from curl.

---

## Test Cases

### 1. ecosystem.config.js uses correct script path

```bash
grep "node_modules/next/dist/bin/next" /home/daniel/monster/ecosystem.config.js
```

1. Run the command above.
2. **Expected:** The path `node_modules/next/dist/bin/next` is found. If this returns nothing, pm2 is using the `.bin/next` shim and will fail to start (SyntaxError).

---

### 2. pm2 starts monster-admin and stays online

```bash
# If not already started:
pm2 start /home/daniel/monster/ecosystem.config.js --only monster-admin

# Verify:
pm2 list | grep monster-admin
```

1. Start the process if needed.
2. Wait 5 seconds for Next.js to boot.
3. **Expected:** `monster-admin` shows `online` status with `0` restarts. Restart count > 0 indicates a crash loop — check `cat logs/pm2-error.log | tail -30`.

---

### 3. Admin panel responds HTTP 200 on port 3004

```bash
curl -sI http://localhost:3004/login | grep -E "^HTTP"
```

1. Run the command.
2. **Expected:** `HTTP/1.1 200 OK`. Any non-200 status (especially 500) indicates a runtime error — check pm2 logs.

---

### 4. Production build is confirmed (not dev)

```bash
python3 -c "
import json
d = json.load(open('apps/admin/.next/server/middleware-manifest.json'))
mid = list(d.get('middleware', {}).values())
bid = mid[0]['env']['__NEXT_BUILD_ID'] if mid else 'no middleware'
print('BUILD_ID:', bid)
print('PASS' if bid != 'development' else 'FAIL: dev build — will crash with EvalError under pm2')
"
```

1. Run from `/home/daniel/monster`.
2. **Expected:** BUILD_ID is a real hash (e.g. `MW73blIiQbTkK2qWpbUk-`), not the string `"development"`. If it shows `"development"`, run `pnpm -r build` and restart pm2.

---

### 5. deploy.sh is valid, executable, and contains expected steps

```bash
# Syntax check
bash -n /home/daniel/monster/scripts/deploy.sh && echo "syntax OK"

# Executable bit
test -x /home/daniel/monster/scripts/deploy.sh && echo "executable OK"

# Contains required steps
grep -E "git pull|pnpm install|pnpm.*build|pm2 reload|pm2 save" /home/daniel/monster/scripts/deploy.sh
```

1. Run all three commands.
2. **Expected:** "syntax OK", "executable OK", and grep finds all five patterns (`git pull`, `pnpm install`, `pnpm.*build`, `pm2 reload`, `pm2 save`). Any missing pattern means the deploy cycle is incomplete.

---

### 6. logs/ directory exists with .gitkeep

```bash
test -f /home/daniel/monster/logs/.gitkeep && echo "PASS" || echo "FAIL"
ls -la /home/daniel/monster/logs/
```

1. Run both commands.
2. **Expected:** `.gitkeep` exists (ensuring the dir is tracked by git). After pm2 has started, `pm2-out.log` and `pm2-error.log` should also be present.

---

### 7. pm2 process list is saved (survives pm2 kill + resurrect)

```bash
# Save current process list
pm2 save

# Verify the dump file exists and is non-empty
test -s ~/.pm2/dump.pm2 && echo "dump OK" || echo "FAIL: dump missing or empty"

# Check monster-admin is in the dump
grep "monster-admin" ~/.pm2/dump.pm2 | head -3
```

1. Run `pm2 save`.
2. Check the dump file.
3. **Expected:** `dump OK` and the grep finds `monster-admin` in `~/.pm2/dump.pm2`. This is the state that pm2 resurrects on reboot (once systemd unit is activated).

---

### 8. M001-SUMMARY.md contains all three protocol sections

```bash
grep -c "worktree\|deploy\|pm2" /home/daniel/monster/.gsd/milestones/M001/M001-SUMMARY.md
```

1. Run the command.
2. **Expected:** Count > 0 (all three keywords present). For a complete review, open the file and confirm it contains:
   - A worktree protocol section
   - A deploy protocol section  
   - A pm2 process management section (including the `pm2 startup systemd` manual sudo step)

---

## Edge Cases

### Port conflict: next dev process holding 3004

```bash
lsof -i :3004
```

1. If this returns a process (e.g. `node ... next dev`), pm2 will fail to bind.
2. Kill the offending process: `kill <PID>`.
3. **Expected after kill:** pm2 restarts without EADDRINUSE error; `pm2 list` shows 0 restarts.

---

### Dev build accidentally used under pm2

```bash
# Simulate: check if pm2 would crash with existing build
python3 -c "
import json
d = json.load(open('apps/admin/.next/server/middleware-manifest.json'))
mid = list(d.get('middleware', {}).values())
if mid and mid[0]['env'].get('__NEXT_BUILD_ID') == 'development':
    print('WARNING: dev build detected — pm2 will crash with EvalError')
    print('Fix: run pnpm -r build, then pm2 restart monster-admin')
else:
    print('OK: production build confirmed')
"
```

1. If WARNING appears, run `pnpm -r build` from `/home/daniel/monster`.
2. Then: `pm2 restart monster-admin`.
3. **Expected:** `pm2 list` shows online with 0 unstable restarts; `curl` returns 200.

---

### pm2 ecosystem uses wrong script (regression check)

```bash
pm2 show monster-admin | grep "script path"
```

1. **Expected:** `script path` is `.../apps/admin/node_modules/next/dist/bin/next` (the actual JS entrypoint). If it shows `.bin/next`, stop the process, fix `ecosystem.config.js`, and restart.

---

## Failure Signals

- `pm2 list` shows `errored` or `stopped` → check `cat logs/pm2-error.log | tail -30`
- Restart count > 0 in `pm2 list` → crash-looping; check `logs/pm2-error.log` immediately
- `SyntaxError` in pm2 error log → wrong script path (`.bin/next` shim used)
- `EvalError: Code generation from strings disallowed` → dev build running under pm2; run `pnpm -r build`
- `EADDRINUSE` in pm2 error log → port 3004 held by another process; `lsof -i :3004` to find it
- `curl` returns HTTP 500 → Next.js started but threw at runtime; check `pm2 logs monster-admin --lines 50`
- `curl` connection refused → Next.js hasn't bound to the port yet; wait 10s and retry, or check if pm2 is running
- `deploy.sh` exits non-zero → `set -euo pipefail` means the first failed command aborts; re-run with `bash -x scripts/deploy.sh` to see which step failed

---

## Requirements Proved By This UAT

- R013 (Admin panel on VPS1 via pm2) — pm2 manages monster-admin, process survives saves, HTTP 200 confirmed. **Validated by M001/S05.**

---

## Not Proven By This UAT

- **Reboot survival** — the systemd unit (`pm2 startup systemd`) requires a manual `sudo` command to install. UAT cannot simulate a VPS reboot. The tester must manually run the startup command and reboot to prove this.
- **Tailscale access** — this UAT tests `localhost:3004`. Actual Tailscale IP access (the operational requirement) requires the VPS to be connected to the Tailscale network and the tester to connect from another Tailscale node.
- **deploy.sh end-to-end** — UAT validates syntax and structure of deploy.sh but not a full live run (which requires uncommitted changes and a remote `origin`). A full run should be tested on the next real deployment.

---

## Notes for Tester

- **Port is 3004**, not the default Next.js 3000. All curl commands should use 3004.
- The `pm2 startup systemd` sudo command is documented in `.gsd/milestones/M001/M001-SUMMARY.md`. It is intentionally not automated — it requires root and is a one-time VPS setup step.
- `pm2 logs monster-admin --lines 50` is the fastest way to see what Next.js printed at startup. It shows both stdout and stderr interleaved.
- If you see `pm2-error.log` growing rapidly, the process is crash-looping. Stop it with `pm2 stop monster-admin` before investigating to avoid filling the disk.
- The `deploy.sh` uses `--frozen-lockfile` so any uncommitted changes to `pnpm-lock.yaml` will cause it to fail. This is intentional — production deploys should not silently update dependencies.
