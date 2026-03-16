# S02: Admin Infra Health Page — UAT

**Milestone:** M010
**Written:** 2026-03-16

## UAT Type

- UAT mode: mixed (artifact-driven for build/type verification + live-runtime for VPS2 health display)
- Why this mode is sufficient: The /infra page renders health data from a live SSH connection — the key behavior requires a running admin panel with Supabase env vars and VPS2 reachable via Tailscale SSH. Build verification confirms all code compiles and routes exist.

## Preconditions

- Admin panel running on VPS1 via pm2 (`pm2 status monster-admin` → online)
- Supabase env vars configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY)
- `vps2_host` and `vps2_user` settings configured in Settings page (VPS2 Deployment card)
- VPS2 reachable from VPS1 via Tailscale SSH (`ssh <vps2_user>@<vps2_host> echo ok`)
- Caddy installed and running on VPS2 (`systemctl is-active caddy` → active)

## Smoke Test

Navigate to `/infra` in the admin panel. The page should load without error and display 4 status cards with live data from VPS2. If VPS2 is reachable, "VPS2 Reachability" shows green "Reachable" and Caddy shows green "Active". If unreachable, the page still renders with red "Unreachable" text and error detail — never a blank page or 500 error.

## Test Cases

### 1. Health dashboard shows live VPS2 data

1. Navigate to `/infra` in the admin panel
2. Observe the 4 status cards:
   - **VPS2 Reachability:** green "Reachable"
   - **Caddy Service:** green "Active"
   - **Disk Usage:** a percentage (e.g. "23%")
   - **Memory:** e.g. "512 / 3840 MB"
3. Observe the fetch timestamp below the heading (e.g. "fetched at 16/03/2026, 14:30:00")
4. **Expected:** All 4 cards show real data from VPS2. No "—" placeholders when VPS2 is healthy.

### 2. Test Deploy Connection — success

1. Navigate to `/infra`
2. In the "Deploy Connection" card, click "Test Deploy Connection"
3. Observe the button shows a spinner and "Testing…" text
4. Wait for the result (1-3 seconds)
5. **Expected:** Green badge appears: "✓ Connection OK"

### 3. Test Deploy Connection — failure (wrong host)

1. In Settings → VPS2 Deployment, temporarily change `vps2_host` to a non-existent hostname (e.g. "invalid-host-xyz")
2. Navigate to `/infra`
3. Click "Test Deploy Connection"
4. **Expected:** Red badge "✗ Failed" with error detail (e.g. SSH connection error mentioning the bad hostname)
5. Restore the correct `vps2_host` value in Settings

### 4. Navigation item present and active

1. Look at the left sidebar navigation
2. **Expected:** "Infrastructure" appears after "Settings" with a Server icon
3. Click it — navigates to `/infra`
4. **Expected:** The nav item shows active state (highlighted background, dot indicator)

### 5. Page renders gracefully when VPS2 is unreachable

1. Stop Tailscale on VPS1 temporarily, or change `vps2_host` to an unreachable IP
2. Navigate to `/infra`
3. **Expected:** Page loads without 500 error. "VPS2 Reachability" card shows red "Unreachable" with error detail in red monospace text. Caddy shows "Inactive". Disk and Memory show "—". TestConnectionButton still clickable.
4. Restore Tailscale / correct host

### 6. API route returns correct JSON shape

1. From VPS1 terminal: `curl -s -X POST http://localhost:3004/api/infra/test-connection | jq .`
2. **Expected (VPS2 reachable):** `{ "ok": true }`
3. **Expected (VPS2 unreachable):** `{ "ok": false, "error": "<descriptive error>" }`
4. Verify the response is always valid JSON with `ok` boolean field

## Edge Cases

### Missing settings (vps2_host not configured)

1. Delete the `vps2_host` row from Supabase settings table (or set it to empty)
2. Navigate to `/infra`
3. **Expected:** Page renders with "Unreachable" and error message mentioning "Missing required settings: vps2_host"
4. Click "Test Deploy Connection"
5. **Expected:** Red badge "✗ Failed" with same settings error message

### Page refresh shows updated data

1. Navigate to `/infra` — note the timestamp
2. Wait 10 seconds, then hard-refresh the page (Ctrl+Shift+R)
3. **Expected:** Timestamp updates to current time. Health metrics may change if VPS2 state changed.

### Concurrent test button clicks

1. Navigate to `/infra`
2. Click "Test Deploy Connection" — while spinner is showing, try clicking again
3. **Expected:** Button is disabled during loading (no duplicate requests)

## Failure Signals

- `/infra` returns 500 or shows a React error boundary → InfraService threw unexpectedly (should never happen due to never-throw contract)
- "Test Deploy Connection" returns no response or hangs indefinitely → SSH connection timeout not handled
- Disk or Memory show "NaN%" or "NaN / NaN MB" → parsing failed on unexpected `df` or `free` output format
- Nav sidebar missing "Infrastructure" item → nav-sidebar.tsx change lost
- Build fails with "Can't resolve 'cpu-features'" or similar → webpack externals config incomplete (D140)

## Requirements Proved By This UAT

- R006 (partial) — Deployment operability: operator can verify VPS2 SSH path and health from admin panel before deploying

## Not Proven By This UAT

- Full R006 validation requires end-to-end deployment (S03 deploy.sh pre-flight + actual rsync + Caddy reload)
- No automated test coverage — health check is inherently integration-level (requires live SSH to VPS2)
- No performance testing — SSH connection time on slow Tailscale links not measured

## Notes for Tester

- The page fetches data on every server component render (RSC). There is no client-side polling or auto-refresh — you must refresh the page to get updated data.
- If Caddy is installed but not running on VPS2, the "Caddy Service" card will correctly show red "Inactive" — this is accurate, not a bug.
- The `[InfraService]` log lines in `pm2 logs monster-admin` trace every SSH connection — useful for debugging if the page shows unexpected errors.
- Pre-existing `@monster/agents` typecheck error (`template_type` column) is unrelated to this slice — ignore it.
