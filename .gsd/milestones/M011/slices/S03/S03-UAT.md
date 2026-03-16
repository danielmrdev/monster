---
id: S03-UAT
parent: S03
milestone: M011
written: 2026-03-16
---

# S03: Infra Fleet Dashboard + Provision UI — UAT

**Milestone:** M011
**Written:** 2026-03-16

## UAT Type

- UAT mode: mixed (artifact-driven for static checks; live-runtime for SSE route; human-experience for full provisioning)
- Why this mode is sufficient: All static artifacts (files, build output, grep checks) are verified by the closer. Live SSE behavior can be confirmed via curl without a real Hetzner account. Full end-to-end provisioning (creating a real CX22, bootstrapping it, seeing it in fleet) is deferred to human UAT post-merge because it requires live Hetzner credentials and a real Tailscale key.

## Preconditions

- Admin server is running (`pm2` shows `monster-admin online`) on VPS1 or local dev (`pnpm --filter @monster/admin dev`).
- `pnpm --filter @monster/admin build` has been run successfully (all 4 routes in build output).
- For SSE smoke test: admin accessible at `http://localhost:3000` (or VPS1 internal port).
- For human UAT: `hetzner_api_token` set in Settings, a real Tailscale auth key available, and an SSH public key to register with Hetzner.

## Smoke Test

Navigate to `/infra` in the admin panel. Confirm:
1. Fleet health table is visible (from S02's `InfraService.getFleetHealth()`).
2. A "Provision New Server" button appears below the page heading.
3. Clicking the button opens the provision form (datacenter select, server type select, 3 text inputs).
4. Closing the modal (or waiting for the server to provision) returns to the fleet table.

## Test Cases

### 1. GET /api/infra/datacenters — fallback when token absent

**Scenario:** Hetzner API token not yet configured in Settings.

1. `curl http://localhost:3000/api/infra/datacenters`
2. **Expected:** HTTP 200; body is `{"datacenters":["nbg1-dc3","fsn1-dc14","hel1-dc2"]}`. No error, no 500. The fallback list is returned silently.

### 2. GET /api/infra/server-types — fallback when token absent

1. `curl http://localhost:3000/api/infra/server-types`
2. **Expected:** HTTP 200; body is `{"serverTypes":["cx22","cx32"]}`. Filtered to allowed types.

### 3. POST /api/infra/provision — 400 on missing fields

1. `curl -X POST http://localhost:3000/api/infra/provision -H 'Content-Type: application/json' -d '{}'`
2. **Expected:** HTTP 400; body is `{"ok":false,"error":"name, datacenter, serverType, tailscaleKey, and sshPublicKey are required"}`. No SSE stream opened.

### 4. POST /api/infra/provision — 400 on invalid JSON

1. `curl -X POST http://localhost:3000/api/infra/provision -H 'Content-Type: application/json' -d 'not-json'`
2. **Expected:** HTTP 400; body is `{"ok":false,"error":"Invalid JSON body"}`.

### 5. POST /api/infra/provision — SSE stream opens with valid body

1. `curl -N -X POST http://localhost:3000/api/infra/provision -H 'Content-Type: application/json' -d '{"name":"test","datacenter":"nbg1-dc3","serverType":"cx22","tailscaleKey":"tskey-placeholder","sshPublicKey":"ssh-rsa AAAA..."}'`
2. **Expected:**
   - Response headers include `Content-Type: text/event-stream`.
   - First event: `data: {"type":"progress","step":"ssh_key","message":"..."}` (or error if no Hetzner token configured).
   - If Hetzner token absent: `data: {"type":"error","error":"[HetznerClient] hetzner_api_token not found in settings"}`.
   - In either case: **no `tailscaleKey` value appears in any event line** (D147). The stream does not hang indefinitely.

### 6. ProvisionModal opens from /infra page

1. Navigate to `/infra` in admin panel.
2. Click "Provision New Server" button.
3. **Expected:**
   - Button disappears (ProvisionSection hides it while modal is open).
   - A form appears with fields: Server Name (text), Datacenter (select), Server Type (select), Tailscale Auth Key (password — characters masked), SSH Public Key (textarea).
   - Datacenter select is populated with `['nbg1-dc3', 'fsn1-dc14', 'hel1-dc2']` options (fallback values when token absent).
   - Server type select is populated with `['cx22', 'cx32']` options.

### 7. ProvisionModal form validation — empty submit

1. Open the provision modal.
2. Leave all fields blank; click Submit / "Provision Server" button.
3. **Expected:** Request to `/api/infra/provision` returns 400 JSON `{ ok: false, error: "name, datacenter, serverType, tailscaleKey, and sshPublicKey are required" }`. Modal should display error. No SSE stream opened in browser.

### 8. ProvisionModal — SSE error surfaces to operator

1. Open the provision modal.
2. Fill all fields with valid-format values but provide a dummy `tailscaleKey` and `sshPublicKey`.
3. Submit. (Hetzner token is absent in Settings — provision will fail.)
4. **Expected:**
   - Progress log area appears inside the modal.
   - One or more `[step] message` lines appear in the monospace log area.
   - The error message from `ProvisioningService` (e.g. `[HetznerClient] hetzner_api_token not found in settings`) appears in red (`text-destructive`) below the log.
   - No raw tailscaleKey value visible anywhere in the modal or browser devtools network tab.

### 9. ProvisionModal — done state triggers fleet table refresh (human UAT with live credentials)

**Requires:** Live Hetzner token in Settings, real Tailscale auth key, real SSH public key.

1. Open the provision modal.
2. Fill: Name = `test-server-01`, Datacenter = `nbg1-dc3`, Server Type = `cx22`, Tailscale Key = (real key), SSH Public Key = (operator's public key).
3. Submit.
4. **Expected:**
   - Progress log updates in real time: 5 phase events visible (`ssh_key`, `create_server`, `wait_boot`, `bootstrap`, `register`).
   - No tailscaleKey value appears in any log line.
   - On completion, a green "✓ Server provisioned — refreshing fleet table…" confirmation appears.
   - After ~1500ms, the modal closes and the `/infra` fleet table refreshes.
   - New server row appears in the fleet table with `status = active` and live health metrics (SSH reachability, Caddy status, disk, memory).

## Edge Cases

### Datacenter/server-type selects when token IS configured

1. Configure a valid `hetzner_api_token` in Settings.
2. Open the provision modal.
3. **Expected:** Datacenter select populates with real Hetzner datacenter names returned by `HetznerClient.listDatacenters()` (may include more than the 3 fallback entries). Server type select shows only `cx22`/`cx32` even if Hetzner offers more types.

### Tailscale key masking

1. Open the provision modal.
2. Type a value in the "Tailscale Auth Key" field.
3. **Expected:** Characters are masked (password input type). The value is never visible in plain text in the UI, the network payload (it's in the POST body — acceptable), or any SSE event line.

### Client disconnects mid-provision

1. Start a provision (valid credentials required).
2. Close the modal or navigate away after the first `progress` event fires.
3. **Expected:**
   - Provision continues server-side (Node.js stream keeps running).
   - The server is eventually created and registered in the `servers` table even without a connected client.
   - No Node.js crash; `closed` boolean guard prevents `controller.enqueue()` from throwing after the client disconnects.
   - pm2 logs show `[ProvisioningService]` phase lines completing to end; `[infra/provision] completed — server id=<uuid>` log is visible.

### Fleet table refresh after modal close

1. Provision a server successfully (human UAT).
2. Watch the fleet table after modal closes.
3. **Expected:** `router.refresh()` fires; Next.js re-fetches the server component; new server row appears. No full page reload needed.

## Failure Signals

- `GET /api/infra/datacenters` returns a non-200 status → fallback is not working; check HetznerClient catch block.
- Modal form submit triggers no visual response (no progress log, no error) → fetch/SSE consumer broken; check browser devtools network tab for the POST response and Content-Type header.
- `tailscaleKey` value appears in any SSE event line → D147 violated; check `emit()` message strings in `provisioning.ts`.
- `POST /api/infra/provision` returns `{"ok":false}` without a stream → validate + 400 path triggered; check all 5 required fields are being sent.
- After successful provision, fleet table does not refresh → `router.refresh()` not firing; check ProvisionModal `done` state handler and setTimeout.
- `pnpm --filter @monster/admin build` fails → TypeScript or import error; check the specific error in build output.

## Requirements Proved By This UAT

- R006 (partial) — The provision flow end-to-end (Hetzner API → SSH bootstrap → DB registration → fleet table appearance) demonstrates a multi-server deployment infrastructure where new site servers can be provisioned from the admin panel. Full validation requires the live human UAT in test case 9.

## Not Proven By This UAT

- R006 full validation — live provisioning a real CX22 (test case 9) is deferred post-merge; requires human with live Hetzner credentials and a real Tailscale auth key.
- Fleet table showing accurate health metrics for the newly provisioned server — health checks require actual SSH connectivity; deferred to human UAT.
- SSE connection resilience under network interruption — the `closed` boolean guard prevents crashes but there is no automatic reconnect or status polling fallback.

## Notes for Tester

- Test cases 1–8 can be run without any real Hetzner or Tailscale credentials. The fallback path and error surfaces are the primary acceptance criteria for this slice.
- Test case 9 (live provisioning) is the M011 milestone's final UAT gate. It should be performed after merge to main, once `hetzner_api_token` is configured in the production admin panel Settings.
- When running test case 5 (SSE curl), expect the stream to terminate quickly with an error event if `hetzner_api_token` is absent — this is correct behavior, not a bug.
- The `ProvisionSection` component hides the "Provision New Server" button while the modal is open. This is intentional. Refreshing the page will reset the state.
- If the admin build hasn't been rebuilt since T02 landed, run `pnpm --filter @monster/admin build` first to ensure all routes are compiled.
