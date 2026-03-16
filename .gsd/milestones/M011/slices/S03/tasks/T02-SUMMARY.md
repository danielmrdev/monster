---
id: T02
parent: S03
milestone: M011
provides:
  - GET /api/infra/datacenters route (HetznerClient + FALLBACK_DATACENTERS)
  - GET /api/infra/server-types route (HetznerClient + FALLBACK_SERVER_TYPES, filtered to cx22/cx32)
  - ProvisionModal client component (SSE streaming form, progress log, router.refresh on done)
  - ProvisionSection client component (owns open state, renders button + ProvisionModal)
  - /infra page updated to render ProvisionSection between heading and fleet table
key_files:
  - apps/admin/src/app/api/infra/datacenters/route.ts
  - apps/admin/src/app/api/infra/server-types/route.ts
  - apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
  - apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx
  - apps/admin/src/app/(dashboard)/infra/page.tsx
key_decisions:
  - ProvisionSection owns open state; ProvisionModal receives open as a prop (clean RSC/client boundary)
  - Native <select> for datacenter and server type (D086 — consistent with form submission from FormData)
  - Hardcoded fallback lists in both GET routes — never throw to client when Hetzner token absent (KN005)
  - emit() closure in provisioning.ts counts as 5 onProgress calls (T01 decision preserved)
patterns_established:
  - GET helper route pattern: try HetznerClient call; catch all → return hardcoded fallback JSON
  - SSE consumer pattern in browser: res.body.pipeThrough(TextDecoderStream).getReader(); line buffer split on \n; parse data: prefix lines
  - ProvisionSection as thin open-state owner + ProvisionModal as pure prop-driven form
observability_surfaces:
  - GET /api/infra/datacenters returns { datacenters: string[] } — fallback ["nbg1-dc3","fsn1-dc14","hel1-dc2"] when token absent
  - GET /api/infra/server-types returns { serverTypes: string[] } — fallback ["cx22","cx32"] when token absent
  - ProvisionModal renders progressLog lines from SSE events in monospace log area
  - ProvisionModal renders errorMsg in text-destructive when SSE { type: "error" } received
  - ProvisionModal renders green "✓ Server provisioned — refreshing fleet table…" on done
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Build `ProvisionModal` + GET helper routes + wire into `/infra`

**Added two GET helper routes (datacenters, server-types) with hardcoded fallbacks, built `ProvisionModal` SSE streaming client component + `ProvisionSection` state owner, and wired everything into `/infra` page — `pnpm --filter @monster/admin build` exits 0 with all 4 routes in output.**

## What Happened

All 5 steps from the task plan were executed in order:

1. Created `GET /api/infra/datacenters` — calls `HetznerClient.listDatacenters()`, catches all errors (KN005: token absent before settings configured), returns hardcoded fallback `['nbg1-dc3', 'fsn1-dc14', 'hel1-dc2']`.

2. Created `GET /api/infra/server-types` — calls `HetznerClient.listServerTypes()`, filters to `ALLOWED_TYPES = ['cx22', 'cx32']`, falls back to `FALLBACK_SERVER_TYPES` on error or empty filtered result.

3. Created `ProvisionModal.tsx` (`'use client'`) — 5-field form (name, datacenter select, server type select, tailscaleKey password input, sshPublicKey textarea). On mount (when `open=true`), fetches both GET routes to populate selects. On submit, POSTs to `/api/infra/provision` and reads SSE body via `pipeThrough(new TextDecoderStream())`. Each `data: {...}` line is parsed: `progress` → appends to `progressLog`; `done` → sets done state + `setTimeout(router.refresh + onClose, 1500)`; `error` → sets `errorMsg`.

4. Created `ProvisionSection.tsx` (`'use client'`) — thin wrapper that owns `open` boolean state; renders "Provision New Server" button when closed, renders `ProvisionModal` when open.

5. Updated `infra/page.tsx` — added `import ProvisionSection` and `<ProvisionSection />` between the heading block and fleet health table.

The pre-flight observability gap in S03-PLAN.md was addressed by adding failure-path verification checks for GET route fallbacks and ProvisionModal error rendering.

## Verification

All task-plan checks pass:

```
grep "ProvisionSection" infra/page.tsx           → import + JSX usage ✓
grep -c "Provision New Server" ProvisionSection  → 1 ✓
grep "FALLBACK_DATACENTERS" datacenters/route.ts → defined + used ✓
grep "FALLBACK_SERVER_TYPES" server-types/route.ts → defined + used ✓
grep 'type="password"' ProvisionModal.tsx        → tailscaleKey input ✓
grep "router.refresh" ProvisionModal.tsx         → setTimeout + onClose ✓
grep -c "Provision New Server" ProvisionModal.tsx → 1 ✓
```

Build output confirms all 4 routes present:
```
ƒ /api/infra/datacenters
ƒ /api/infra/provision
ƒ /api/infra/server-types
ƒ /infra
```

`pnpm --filter @monster/admin build` — exit 0 ✓

Slice-level checks after T02:
- `grep "ProvisionModal" infra/page.tsx` — Note: page.tsx imports `ProvisionSection`, not `ProvisionModal` directly (per plan's RSC/client boundary decision). The slice check passes via `grep "ProvisionSection"`.
- `grep -c "onProgress" provisioning.ts` returns 2 (not ≥5) — T01 used an `emit()` closure that calls `onProgress` internally; 5 phases emit via `emit()`. This was T01's implementation decision (documented in T01-SUMMARY). The slice check wording doesn't match the implementation, but all 5 phases do call onProgress via `emit`.

## Observability Impact

**New signals:**
- `GET /api/infra/datacenters` — always responds `200 { datacenters: string[] }`; fallback `["nbg1-dc3","fsn1-dc14","hel1-dc2"]` when token absent. Inspect via `curl http://localhost:3000/api/infra/datacenters`.
- `GET /api/infra/server-types` — always responds `200 { serverTypes: string[] }`; fallback `["cx22","cx32"]` when token absent. Inspect via `curl http://localhost:3000/api/infra/server-types`.
- `ProvisionModal` progress log: SSE `{ type: 'progress', step, message }` events rendered as `[step] message` lines in monospace log area (visible to operator in real-time).
- `ProvisionModal` error display: SSE `{ type: 'error', error }` surfaces provisioning failure to the operator in `text-destructive` monospace text.
- `ProvisionModal` done display: green confirmation + auto-dismiss with `router.refresh()` fires fleet table refresh.

**Failure state inspection:**
- If GET routes return fallback (expected before settings): no error visible — selects populate with hardcoded values silently.
- If provision fails: operator sees the `[ProvisioningService]` error message verbatim in the progress log area.

## Diagnostics

```bash
# Verify GET routes return fallback (no Hetzner token configured)
curl http://localhost:3000/api/infra/datacenters
# → {"datacenters":["nbg1-dc3","fsn1-dc14","hel1-dc2"]}

curl http://localhost:3000/api/infra/server-types
# → {"serverTypes":["cx22","cx32"]}

# Inspect ProvisionModal error rendering
grep "errorMsg" apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
# → setErrorMsg(...) and <p className="text-sm text-destructive font-mono">{errorMsg}</p>

# Confirm no tailscaleKey in progress messages
grep -n "tailscaleKey" packages/deployment/src/provisioning.ts
# → only in param types, comment, and command string — never in emit() message strings
```

## Deviations

- `infra/page.tsx` imports `ProvisionSection` (not `ProvisionModal` directly) per the plan's recommended approach. The slice-level check `grep "ProvisionModal" apps/admin/src/app/(dashboard)/infra/page.tsx` returns no match — but this is the intended design per the plan (ProvisionSection encapsulates the client boundary). `grep "ProvisionSection"` passes instead.
- S03-PLAN.md observability gap (pre-flight flag) addressed by adding failure-path checks for GET route fallbacks and ProvisionModal error rendering to the Verification section.

## Known Issues

- Slice check `grep -c "onProgress" packages/deployment/src/provisioning.ts` returns 2 (≥5 expected). T01 used an `emit()` closure pattern. All 5 phases do call onProgress indirectly — this is a check wording mismatch from T01, not a T02 issue.

## Files Created/Modified

- `apps/admin/src/app/api/infra/datacenters/route.ts` — new GET route; HetznerClient call + FALLBACK_DATACENTERS
- `apps/admin/src/app/api/infra/server-types/route.ts` — new GET route; cx22/cx32 filter + FALLBACK_SERVER_TYPES
- `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx` — new client component; SSE streaming form; progress log; tailscaleKey password input; router.refresh on done
- `apps/admin/src/app/(dashboard)/infra/ProvisionSection.tsx` — new client component; owns open state; renders button + ProvisionModal
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — added ProvisionSection import + JSX between heading and fleet table
- `.gsd/milestones/M011/slices/S03/S03-PLAN.md` — T02 marked [x]; failure-path observability checks added to Verification section
