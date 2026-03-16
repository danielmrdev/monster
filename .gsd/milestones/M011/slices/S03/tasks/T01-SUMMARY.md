---
id: T01
parent: S03
milestone: M011
provides:
  - POST /api/infra/provision SSE handler (replaces 501 stub)
  - ProvisioningService.provision() onProgress optional callback with 5-phase emit()
key_files:
  - packages/deployment/src/provisioning.ts
  - apps/admin/src/app/api/infra/provision/route.ts
key_decisions:
  - SSE D108 pattern (closed boolean guard + send() try/catch) used verbatim from chat/route.ts
  - emit() helper in provision() is a closure — null-safe, callers passing no callback are unaffected
patterns_established:
  - ProvisioningService.provision(opts, onProgress?) — optional callback pattern for streaming service phases
  - SSE route pattern: validate → 400 JSON (pre-stream); open ReadableStream; service call inside start(); done/error events; controller.close() in finally
observability_surfaces:
  - "[infra/provision] starting provision for..." — route entry log"
  - "[infra/provision] completed — server id=<uuid>" — success terminal"
  - "[infra/provision] failed: <message>" — console.error on exception"
  - SSE stream: { type: 'progress', step, message } × 5 phases; { type: 'done', ok: true, serverId }; { type: 'error', error }
duration: ~15m
verification_result: passed
completed_at: 2026-03-16T17:13:00Z
blocker_discovered: false
---

# T01: Implement `POST /api/infra/provision` SSE route + add `onProgress` to `ProvisioningService`

**Replaced the 501 stub with a real SSE streaming handler; wired `onProgress` into `ProvisioningService.provision()` at all 5 phases.**

## What Happened

1. Added `onProgress?: (step: string, message: string) => void` as optional second param to `provision()` in `packages/deployment/src/provisioning.ts`.
2. Added `emit()` closure at start of `provision()` that calls `onProgress` if provided — null-safe, existing callers unaffected.
3. Added 5 `emit()` calls immediately before each phase's `console.log`: `ssh_key`, `create_server`, `wait_boot`, `bootstrap`, `register`. No `tailscaleKey` in any message string (D147 respected).
4. Replaced the 501 stub at `apps/admin/src/app/api/infra/provision/route.ts` with the full SSE handler following the D108 pattern from `monster/chat/route.ts`: `closed` boolean guard, `send()` with try/catch, `controller.close()` in `finally`.
5. Route validates all 5 required fields; returns 400 JSON before stream opens if any are missing.
6. Fixed pre-flight issue in S03-PLAN.md: added failure-path diagnostic verification checks (SSE error event shape, 400 validation path, `[infra/provision] failed` log).

## Verification

```
pnpm --filter @monster/deployment typecheck   → exit 0
pnpm --filter @monster/deployment build       → exit 0 (dist/index.js 20.16 KB)
grep -c "not implemented" ...route.ts         → 0
grep "ProvisioningService" ...route.ts        → import line present
grep -c "emit(" provisioning.ts               → 5
grep "emit(" provisioning.ts                  → no tailscaleKey in any line
grep -c "closed" ...route.ts                  → 5 (well above minimum 2)
grep -c "status: 400" ...route.ts             → 2
```

## Diagnostics

- SSE stream observable via: `curl -N -X POST http://localhost:3000/api/infra/provision -H 'Content-Type: application/json' -d '{...}'`
- Progress events: `data: {"type":"progress","step":"ssh_key","message":"Registering SSH key with Hetzner…"}`
- Done event: `data: {"type":"done","ok":true,"serverId":"<uuid>"}`
- Error event: `data: {"type":"error","error":"[ProvisioningService] SSH connect failed after 6 attempts: ..."}`
- 400 path: `curl -X POST .../provision -d '{}'` returns `{"ok":false,"error":"name, datacenter, serverType, tailscaleKey, and sshPublicKey are required"}`
- pm2 logs show `[ProvisioningService]` phase lines; route logs `[infra/provision]` prefix

## Deviations

- Pre-flight fix: Added failure-path diagnostic checks to S03-PLAN.md Verification section (required by pre-flight instructions). Not a plan deviation — it's a required pre-flight action.
- S03-PLAN slice-level check `grep -c "onProgress" provisioning.ts → >= 5` is a plan inconsistency: `onProgress` only appears 2× (signature + guard). The T01-PLAN check `grep -c "emit(" provisioning.ts → >= 5` is correct and passes at exactly 5. Future slice verification should use `emit(` not `onProgress`.

## Known Issues

None.

## Files Created/Modified

- `packages/deployment/src/provisioning.ts` — added `onProgress` param + `emit()` helper + 5 phase emit calls
- `apps/admin/src/app/api/infra/provision/route.ts` — replaced 501 stub with full SSE handler (D108 pattern)
- `.gsd/milestones/M011/slices/S03/S03-PLAN.md` — marked T01 done; added failure-path diagnostic verification steps (pre-flight fix)
