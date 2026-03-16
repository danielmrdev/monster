---
id: S03
parent: M011
milestone: M011
provides:
  - POST /api/infra/provision — real SSE streaming handler (replaces 501 stub)
  - GET /api/infra/datacenters — HetznerClient + hardcoded fallback (nbg1-dc3, fsn1-dc14, hel1-dc2)
  - GET /api/infra/server-types — HetznerClient filtered to cx22/cx32 + hardcoded fallback
  - ProvisioningService.provision() onProgress optional callback with 5-phase emit() closure
  - ProvisionModal client component — SSE streaming form, progress log, error display, router.refresh on done
  - ProvisionSection client component — open-state owner, button + modal
  - /infra page updated with ProvisionSection between heading and fleet table
requires:
  - slice: S01
    provides: ProvisioningService.provision() callable; HetznerClient.listDatacenters() + listServerTypes()
  - slice: S02
    provides: InfraService.getFleetHealth() already wired in infra/page.tsx
affects: []
key_files:
  - packages/deployment/src/provisioning.ts
  - apps/admin/src/app/api/infra/provision/route.ts
  - apps/admin/src/app/api/infra/datacenters/route.ts
  - apps/admin/src/app/api/infra/server-types/route.ts
  - apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
  - apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx
  - apps/admin/src/app/(dashboard)/infra/page.tsx
key_decisions:
  - emit() closure pattern in provision() — null-safe onProgress wrapper; 5 phases call emit(), not onProgress directly
  - SSE D108 pattern (closed boolean guard + send() try/catch + controller.close() in finally)
  - GET helper routes always return 200 with fallback arrays — never throw to client when Hetzner token absent (KN005)
  - ProvisionSection owns open state; ProvisionModal is pure prop-driven (clean RSC/client boundary)
  - tailscaleKey passed as password input; never appears in any emit() message string (D147 respected)
  - native <select> for datacenter and server type (D086 — consistent with form submission from FormData)
  - onClose() triggers router.refresh() via setTimeout(1500ms) — gives server time to commit servers row
patterns_established:
  - SSE route pattern: validate → 400 JSON (pre-stream); open ReadableStream; service call inside start(); done/error events; controller.close() in finally
  - GET helper route pattern: try HetznerClient call; catch all → return hardcoded fallback JSON
  - SSE consumer pattern in browser: res.body.pipeThrough(TextDecoderStream).getReader(); line buffer split on \n; parse data: prefix lines
  - ProvisionSection as thin open-state owner + ProvisionModal as pure prop-driven form
observability_surfaces:
  - "[infra/provision] starting provision for..." — route entry log"
  - "[infra/provision] completed — server id=<uuid>" — success terminal log"
  - "[infra/provision] failed: <message>" — console.error on exception"
  - SSE stream: { type: 'progress', step, message } × 5 phases → { type: 'done', ok: true, serverId } or { type: 'error', error }
  - GET /api/infra/datacenters → always 200 { datacenters: string[] }; fallback silently used when token absent
  - GET /api/infra/server-types → always 200 { serverTypes: string[] }; fallback silently used when token absent
  - ProvisionModal progress log: SSE events rendered as [step] message in monospace log area
  - ProvisionModal error: SSE { type: 'error' } surfaces in text-destructive monospace text
  - ProvisionModal done: green confirmation + auto-dismiss with router.refresh()
drill_down_paths:
  - .gsd/milestones/M011/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M011/slices/S03/tasks/T02-SUMMARY.md
duration: ~30m (T01 ~15m + T02 ~15m)
verification_result: passed
completed_at: 2026-03-16
---

# S03: Infra Fleet Dashboard + Provision UI

**Wired the 501 provision stub to a real SSE handler, built `ProvisionModal` with live progress streaming, and added two GET helper routes — operators can now provision a new Hetzner server from the `/infra` page and watch each bootstrap phase complete in real time.**

## What Happened

**T01 — SSE Route + onProgress callback:**

The 501 stub at `POST /api/infra/provision` was replaced with a full SSE streaming handler following the D108 pattern from `monster/chat/route.ts`. An `emit()` closure was added to `ProvisioningService.provision()` as an optional second parameter (`onProgress?`). All 5 bootstrap phases (`ssh_key`, `create_server`, `wait_boot`, `bootstrap`, `register`) call `emit()` before executing — giving the SSE route a real-time progress signal to forward to the browser. The `closed` boolean guard prevents enqueue errors if the client disconnects mid-stream. Validation failures (missing fields) return 400 JSON before the stream opens. D147 (tailscaleKey never in log strings) is respected: `emit()` messages reference phase names, not secret values.

**T02 — GET Helper Routes + ProvisionModal + /infra wiring:**

Two GET routes were created with hardcoded fallback lists:
- `GET /api/infra/datacenters` → calls `HetznerClient.listDatacenters()`, returns name strings; falls back to `['nbg1-dc3', 'fsn1-dc14', 'hel1-dc2']` on any error (including missing token — KN005).
- `GET /api/infra/server-types` → calls `HetznerClient.listServerTypes()`, filters to `['cx22', 'cx32']`; falls back to `FALLBACK_SERVER_TYPES` when token absent or filtered result is empty.

`ProvisionModal.tsx` is a `'use client'` component with a 5-field form: name, datacenter select, server type select, tailscaleKey (password input), sshPublicKey (textarea). On mount (when `open=true`), it fetches both GET routes to populate the selects. On submit, it `fetch()`es `POST /api/infra/provision` and reads the SSE body via `pipeThrough(new TextDecoderStream())`, splitting on `\n` to parse `data:` prefixed JSON lines. `progress` events append `[step] message` lines to the visible log. On `done`, it shows a green confirmation and fires `router.refresh()` after 1500ms. On `error`, it sets `errorMsg` which renders in `text-destructive` monospace.

`ProvisionSection.tsx` is a thin `'use client'` wrapper that owns the `open` boolean — renders the "Provision New Server" button when closed, passes `open` + `onClose` props to `ProvisionModal` when open. This cleanly isolates the RSC/client boundary. `infra/page.tsx` imports `ProvisionSection` and places it between the heading block and the fleet health table.

## Verification

```bash
# 501 stub gone
grep -c "not implemented" apps/admin/src/app/api/infra/provision/route.ts  → 0

# ProvisioningService imported in route
grep "ProvisioningService" apps/admin/src/app/api/infra/provision/route.ts  → import + new ProvisioningService()

# 5 emit() calls in provisioning.ts (one per phase)
grep -c "emit(" packages/deployment/src/provisioning.ts  → 5

# tailscaleKey not in any emit() message string
grep -n "tailscaleKey" packages/deployment/src/provisioning.ts
# → only in param types, comment, and command string — never in emit() message strings

# SSE error event shape
grep "type.*error\|type: 'error'" apps/admin/src/app/api/infra/provision/route.ts  → send({ type: 'error', error })

# 400 validation path (2 branches: bad JSON + missing fields)
grep -c "status: 400" apps/admin/src/app/api/infra/provision/route.ts  → 2

# Error log prefix
grep "infra/provision.*failed" apps/admin/src/app/api/infra/provision/route.ts  → console.error('[infra/provision] failed:', error)

# GET route fallbacks
grep "FALLBACK_DATACENTERS" apps/admin/src/app/api/infra/datacenters/route.ts  → defined + used
grep "FALLBACK_SERVER_TYPES" apps/admin/src/app/api/infra/server-types/route.ts  → defined + used (2 lines)

# ProvisionSection wired in page.tsx
grep "ProvisionSection" "apps/admin/src/app/(dashboard)/infra/page.tsx"  → import + JSX

# ProvisionModal errorMsg handling
grep "errorMsg" "apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx"
# → useState, setErrorMsg, JSX render in text-destructive

# Provision New Server present in both components
grep -c "Provision New Server" "apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx"  → 1
grep -c "Provision New Server" "apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx"  → 1

# Build exits 0; all 4 routes present in output
pnpm --filter @monster/admin build  → exit 0
# Build output: ƒ /api/infra/datacenters  ƒ /api/infra/provision  ƒ /api/infra/server-types  ƒ /infra

# Deployment package typechecks clean
pnpm --filter @monster/deployment typecheck  → exit 0
```

## Requirements Advanced

- R006 — Deployment pipeline now has a full provision-from-scratch UI path. Operator can create a new Hetzner CX22/CX32 site server, bootstrap it with Caddy + Tailscale, and see it appear in the fleet table — without leaving the admin panel. The multi-server model is operationally usable.

## Requirements Validated

- None (live provisioning UAT still pending — human must provision a real server to validate R006 end-to-end).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- **`grep "ProvisionModal" infra/page.tsx` slice check returns no match** — by design. `page.tsx` imports `ProvisionSection`, not `ProvisionModal` directly (RSC/client boundary decision from T02). The check passes via `grep "ProvisionSection"`. Slice plan wording was slightly off; implementation is correct.
- **`grep -c "onProgress" provisioning.ts` returns 2, not ≥5** — T01 used an `emit()` closure that wraps `onProgress`. The 5 phases call `emit()`, not `onProgress` directly. All 5 phases do emit progress; the check wording in the slice plan doesn't match the implementation. `grep -c "emit(" provisioning.ts → 5` is the correct check. Documented in T01-SUMMARY.

## Known Limitations

- **Human UAT deferred** — live provisioning a real CX22 from the panel (the S03 UAT goal) requires real Hetzner API credentials configured in Settings. The SSE route is wired and the UI is complete; actual end-to-end provisioning requires a human with a live Hetzner account.
- **No SSE reconnect logic** — if the browser loses the SSE connection mid-provision, the modal shows no progress updates. The underlying provisioning continues server-side (it's not request-bound). A future improvement: poll `/api/infra/servers/{id}/status` as a fallback.
- **ProvisionSection shows the button only when modal is closed** — `!open &&` hides the button while the modal is active. This is intentional (prevents double-opens) but may surprise operators who expect the button to remain visible.

## Follow-ups

- **Human UAT** — operator should provision a real CX22 server from `/infra`, watch all 5 phase progress events, and confirm the server appears in the fleet table with `status=active` and healthy SSH reachability.
- **SSE connection resilience** — add a "Provision still running in background" message if the client disconnects mid-stream. Poll `/api/servers` instead of relying solely on the SSE stream completing.
- **Datacenter display names** — currently shows raw Hetzner datacenter IDs (e.g., `nbg1-dc3`). Could map to friendly names ("Nuremberg DC3") using a local lookup table.

## Files Created/Modified

- `packages/deployment/src/provisioning.ts` — added `onProgress` param + `emit()` helper + 5 phase emit calls (one per bootstrap phase)
- `apps/admin/src/app/api/infra/provision/route.ts` — replaced 501 stub with full SSE handler (D108 pattern; validate → 400; stream progress/done/error events)
- `apps/admin/src/app/api/infra/datacenters/route.ts` — new GET route; HetznerClient call + FALLBACK_DATACENTERS
- `apps/admin/src/app/api/infra/server-types/route.ts` — new GET route; cx22/cx32 filter + FALLBACK_SERVER_TYPES
- `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx` — new client component; SSE consumer; 5-field form; progress log; tailscaleKey password input; router.refresh on done; errorMsg in text-destructive
- `apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx` — new client component; owns open state; renders button + ProvisionModal
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — added ProvisionSection import + JSX between heading and fleet table

## Forward Intelligence

### What the next slice should know
- The `/infra` page is now a three-part layout: heading block → `ProvisionSection` → fleet health table. Any new infra UI elements should be inserted between these regions, not prepended to the page.
- `ProvisioningService.provision()` now accepts an optional second argument `(onProgress?: (step: string, message: string) => void)` — any future caller that wants progress streaming should use this pattern. No change needed to the service for additional callers.
- The `emit()` closure pattern (not direct `onProgress()` calls) means slice-plan checks should grep for `emit(` not `onProgress` when verifying 5-phase coverage.
- M011 is now fully complete: S01 (HetznerClient + servers table) → S02 (services migration + settings cleanup) → S03 (fleet dashboard UI + provision form + SSE route). All three slices are done; the milestone can be closed.

### What's fragile
- **GET route fallbacks are silent** — when the Hetzner token is not configured, the selects populate with hardcoded values and the operator sees no warning. A yellow banner "Using fallback datacenter list — configure hetzner_api_token in Settings" would improve discoverability.
- **router.refresh() fires after 1500ms timeout** — this is a fixed delay, not a "server confirmed the row" signal. In low-latency environments, 1500ms may over-wait. In high-latency environments, it may fire before the `servers` row is committed. A GET `/api/infra/servers/{id}` poll would be more reliable.

### Authoritative diagnostics
- **SSE stream inspection**: `curl -N -X POST http://localhost:3000/api/infra/provision -H 'Content-Type: application/json' -d '{"name":"test","datacenter":"nbg1-dc3","serverType":"cx22","tailscaleKey":"tskey-...","sshPublicKey":"ssh-rsa ..."}'` — watch for `data:` prefixed JSON lines
- **GET route state**: `curl http://localhost:3000/api/infra/datacenters` → `{"datacenters":["nbg1-dc3","fsn1-dc14","hel1-dc2"]}` (fallback when token absent)
- **pm2 logs**: `[ProvisioningService]` prefix lines trace each bootstrap phase; `[infra/provision]` prefix in route logs validation/parse errors
- **400 path**: `curl -X POST .../provision -d '{}'` returns `{"ok":false,"error":"name, datacenter, serverType, tailscaleKey, and sshPublicKey are required"}`

### What assumptions changed
- **Slice plan checked `grep "ProvisionModal" infra/page.tsx`** — actual implementation uses `ProvisionSection` as the page.tsx import (ProvisionModal is an implementation detail of ProvisionSection). The check needed to be `grep "ProvisionSection"`. Future slice plans should verify the RSC/client boundary component, not the inner modal, when the encapsulation pattern is used.
- **`grep -c "onProgress" provisioning.ts ≥ 5`** was the planned check — actual correct check is `grep -c "emit(" provisioning.ts ≥ 5`. The emit() closure pattern is more idiomatic and was used from T01 forward.
