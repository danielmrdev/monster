# S05: pm2 + Deploy Script

**Goal:** `pm2 start ecosystem.config.js` launches `monster-admin` on port 3004; `scripts/deploy.sh` builds and reloads it; process survives reboot via `pm2 save && pm2 startup`.
**Demo:** `pm2 list` shows `monster-admin` as `online`; `curl -sI http://localhost:3004/login` returns HTTP 200; `scripts/deploy.sh` runs to completion without error.

## Must-Haves

- `ecosystem.config.js` uses `node_modules/next/dist/bin/next` (not the `.bin/next` shim)
- `scripts/deploy.sh` exists, is executable, and runs the full deploy cycle
- `logs/` directory exists in the repo (with `.gitkeep`) so pm2 log paths resolve on fresh clone
- `M001-SUMMARY.md` documents the worktree protocol, deploy protocol, and pm2 process management
- pm2 startup (systemd unit install command) is documented for the required manual `sudo` step

## Observability / Diagnostics

**Runtime signals:**
- `pm2 list` — process status table; `monster-admin` should show `online`, not `errored`/`stopped`
- `pm2 logs monster-admin --lines 50` — tail application stdout/stderr; shows Next.js startup messages or boot errors
- `pm2 show monster-admin` — detailed process info: pid, uptime, restart count, error log path
- `logs/pm2-out.log` / `logs/pm2-err.log` — on-disk log files; persisted across pm2 restarts

**Failure visibility:**
- If pm2 shows `errored`: `pm2 logs monster-admin --err` reveals the exact Node.js exception (e.g. `SyntaxError` for the `.bin/next` shim bug)
- If HTTP returns non-200: `pm2 logs monster-admin` shows whether Next.js started at all; `curl -v http://localhost:3004/login` shows TCP + HTTP detail
- Restart count in `pm2 list` > 0 = crash-looping; check `pm2-err.log` immediately
- `pm2 save` failure: check `~/.pm2/dump.pm2` exists and is valid JSON

**Inspection surface after deploy:**
```bash
pm2 show monster-admin      # full process metadata
cat logs/pm2-err.log        # last error output
pm2 startup systemd         # shows the sudo command needed (does not run it)
```

**Redaction:** pm2 logs may contain env var values if Next.js logs them at startup — do not echo log contents verbatim in agent output.

## Verification

```bash
# pm2 starts and stays online
pm2 start /home/daniel/monster/ecosystem.config.js --only monster-admin
pm2 list | grep monster-admin | grep online

# Admin responds on port 3004
curl -sI http://localhost:3004/login | grep -E "^HTTP" | grep "200"

# deploy.sh is syntactically valid and executable
bash -n scripts/deploy.sh && test -x scripts/deploy.sh

# logs dir present
test -f logs/.gitkeep

# Summary exists with required sections
grep -l "worktree\|deploy\|pm2" .gsd/milestones/M001/M001-SUMMARY.md

# Failure-path diagnostic: pm2 error log is accessible
test -d logs && echo "logs dir OK" || echo "FAIL: logs dir missing — pm2 log paths will break"
pm2 show monster-admin 2>/dev/null | grep -E "status|restart" || echo "FAIL: monster-admin not registered"
```

## Tasks

- [x] **T01: Fix ecosystem.config.js, write deploy.sh, create logs dir, document M001** `est:30m`
  - Why: Closes R013. All deliverables are coupled — the ecosystem fix must be verified by actually starting pm2, which requires the logs dir; deploy.sh references the ecosystem; summary documents the result.
  - Files: `ecosystem.config.js`, `scripts/deploy.sh`, `logs/.gitkeep`, `.gsd/milestones/M001/M001-SUMMARY.md`
  - Do: Fix script path in ecosystem.config.js → create logs/.gitkeep → write scripts/deploy.sh → start pm2 and verify HTTP 200 → document pm2 startup manual step and protocols in M001-SUMMARY.md
  - Verify: `pm2 list | grep monster-admin | grep online` + `curl -sI http://localhost:3004/login | head -1`
  - Done when: pm2 shows monster-admin online, curl returns HTTP 200, deploy.sh passes `bash -n`, M001-SUMMARY.md exists with all three protocol sections

## Files Likely Touched

- `ecosystem.config.js`
- `scripts/deploy.sh`
- `logs/.gitkeep`
- `.gsd/milestones/M001/M001-SUMMARY.md`
