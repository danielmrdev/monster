# S03: VPS1 Setup Script + Deploy Pre-flight — UAT

**Milestone:** M010
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S03 produces shell scripts only — no runtime services, no UI, no DB changes. Verification is syntax checking, argument handling, and structured output inspection. Live runtime proof (running on a fresh VPS) is an operational step beyond this UAT.

## Preconditions

- Worktree at `/home/daniel/monster/.gsd/worktrees/M010` is checked out
- `bash` is available (4.x+)
- No VPS2 SSH connection required (pre-flight check is tested via skip paths)
- No Tailscale, nvm, or pm2 required (script is validated for syntax and argument handling, not executed end-to-end)

## Smoke Test

Run `bash -n scripts/setup-vps1.sh && bash -n scripts/deploy.sh && echo "OK"` — should print `OK`.

## Test Cases

### 1. setup-vps1.sh: --help prints usage

1. Run: `bash scripts/setup-vps1.sh --help`
2. **Expected:** Prints usage text including `--tailscale-key` and `--repo-url` options, exits with code 1

### 2. setup-vps1.sh: no args shows error

1. Run: `bash scripts/setup-vps1.sh`
2. **Expected:** First output line contains `ERROR: --tailscale-key is required`, followed by usage text, exits with code 1

### 3. setup-vps1.sh: Tailscale key is never printed

1. Run: `bash scripts/setup-vps1.sh --tailscale-key tskey-auth-mysecretkey123 2>&1 | head -20`
2. **Expected:** Output contains `[REDACTED]`, does NOT contain `tskey-auth-mysecretkey123`. (Script will fail at Tailscale install step since we're not on a fresh VPS, but the header banner should have printed by then showing `[REDACTED]`.)

### 4. setup-vps1.sh: unknown argument rejected

1. Run: `bash scripts/setup-vps1.sh --unknown-flag 2>&1`
2. **Expected:** Output contains `ERROR: Unknown argument: --unknown-flag`, exits non-zero

### 5. setup-vps1.sh: syntax validation

1. Run: `bash -n scripts/setup-vps1.sh`
2. **Expected:** Exits 0 with no output

### 6. deploy.sh: syntax validation

1. Run: `bash -n scripts/deploy.sh`
2. **Expected:** Exits 0 with no output

### 7. deploy.sh: SKIP_VPS2_CHECK bypass

1. Run: `SKIP_VPS2_CHECK=1 bash scripts/deploy.sh 2>&1 | head -5`
2. **Expected:** First line contains `[pre-flight] ⏭ VPS2 check skipped (SKIP_VPS2_CHECK=1)`. Deploy proceeds to `git pull`.

### 8. deploy.sh: empty VPS2_HOST backward compatibility

1. Run: `VPS2_HOST="" bash scripts/deploy.sh 2>&1 | head -5`
2. **Expected:** Output contains `[pre-flight] ⏭ VPS2 check skipped (VPS2_HOST not set)`. Deploy proceeds to `git pull`.

### 9. deploy.sh: unreachable VPS2 fails fast

1. Run: `VPS2_HOST=192.0.2.1 VPS2_USER=testuser bash scripts/deploy.sh 2>&1`
2. **Expected:** Output contains `[pre-flight] ✗ VPS2 health check failed`, lists `VPS2_HOST`, `VPS2_USER`, and Tailscale as things to check, exits with code 1. No `git pull` or `pnpm install` output appears.

### 10. deploy.sh: .vps2.env file is sourced when present

1. Create a temp `.vps2.env` file: `echo 'VPS2_HOST=10.0.0.99' > .vps2.env && echo 'VPS2_USER=testoperator' >> .vps2.env`
2. Run: `bash scripts/deploy.sh 2>&1 | head -5`
3. **Expected:** Output contains `Checking VPS2 (testoperator@10.0.0.99)` — proving the file was sourced
4. Cleanup: `rm .vps2.env`

### 11. setup-vps1.sh: all 6 steps documented

1. Run: `grep -c "^step " scripts/setup-vps1.sh` (or count the `step()` calls)
2. **Expected:** Output is `6` — matching the documented 6-step structure

### 12. setup-vps1.sh: script is executable

1. Run: `test -x scripts/setup-vps1.sh && echo "OK"`
2. **Expected:** Prints `OK`

### 13. deploy.sh: script is executable

1. Run: `test -x scripts/deploy.sh && echo "OK"`
2. **Expected:** Prints `OK`

## Edge Cases

### Unknown argument with value

1. Run: `bash scripts/setup-vps1.sh --tailscale-key mykey --bogus arg 2>&1`
2. **Expected:** Output contains `ERROR: Unknown argument: --bogus`, exits non-zero

### deploy.sh with VPS2_HOST set but no SSH agent

1. Run: `SSH_AUTH_SOCK="" VPS2_HOST=100.64.0.1 VPS2_USER=root bash scripts/deploy.sh 2>&1`
2. **Expected:** Pre-flight check fails (SSH can't authenticate), prints `[pre-flight] ✗`, exits 1

## Failure Signals

- `bash -n` on either script returns non-zero → syntax error introduced
- `setup-vps1.sh --help` executes provisioning commands → argument parsing broken
- `deploy.sh` with empty VPS2_HOST proceeds to SSH check → backward compat broken
- `deploy.sh` with unreachable VPS2 proceeds to `git pull` → pre-flight not gating
- Tailscale key appears in any output → security issue

## Requirements Proved By This UAT

- R006 (partial) — deploy.sh pre-flight validates VPS2 before rsync, improving deployment operability

## Not Proven By This UAT

- Actual VPS1 provisioning from scratch (requires fresh Ubuntu 24.04 VPS)
- Actual VPS2 SSH + Caddy check succeeding (requires live VPS2 with Tailscale + Caddy)
- pm2 startup persistence across reboot (requires reboot test)
- shellcheck lint pass (shellcheck not available locally)

## Notes for Tester

- Test cases 7, 8, 9, 10 will attempt `git pull` after the pre-flight passes/skips — this is expected behavior. The test only cares about the pre-flight output lines.
- Test case 3 will fail partway through (no sudo/tailscale on dev machine) — that's expected. Check only that the banner section printed with `[REDACTED]`.
- Test case 9 uses RFC 5737 documentation IP (192.0.2.1) — guaranteed unreachable.
- The `.vps2.env` file in test case 10 must be cleaned up to avoid polluting other tests.
