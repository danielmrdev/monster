# S03: Infra Fleet Dashboard + Provision UI

**Goal:** Replace the `POST /api/infra/provision` 501 stub with a real SSE handler; add a `ProvisionModal` client component to `/infra` so operators can provision a new Hetzner server from the admin panel and watch live progress.

**Demo:** Operator navigates to `/infra`, clicks "Provision New Server", fills the form (name, datacenter, server type, Tailscale key, SSH public key), submits — and sees a live progress log of each bootstrap phase. On completion the modal closes, `router.refresh()` fires, and the new server appears in the fleet table.

## Must-Haves

- `ProvisioningService.provision()` accepts an optional `onProgress?: (step: string, message: string) => void` callback; calls it at each of the 5 phases; callback is optional (existing callers unaffected).
- `POST /api/infra/provision` is a real SSE handler: parses + validates `{ name, datacenter, serverType, tailscaleKey, sshPublicKey }`, emits `{ type: 'progress', step, message }` events per phase, then `{ type: 'done', ok: true, serverId }` or `{ type: 'error', error }` on finish.
- `tailscaleKey` never appears in any SSE event, console.log, or progress message (D147).
- `GET /api/infra/datacenters` returns `{ datacenters: string[] }` — calls `HetznerClient.listDatacenters()`, returns name strings; on error returns hardcoded fallback list.
- `GET /api/infra/server-types` returns `{ serverTypes: string[] }` — filtered to cx22/cx32; on error returns hardcoded fallback.
- `ProvisionModal` client component: form with 5 fields, submits via `fetch` with streaming body reader, displays progress log, calls `router.refresh()` on done, shows error on failure.
- `/infra` page renders a "Provision New Server" button that toggles the modal.
- `pnpm --filter @monster/deployment typecheck` and `pnpm --filter @monster/admin build` exit 0 after all changes.

## Proof Level

- This slice proves: final-assembly (last S03 wires the route stub to real provisioning logic and connects the UI)
- Real runtime required: no (SSE route verified by curl; no live Hetzner call needed for acceptance)
- Human/UAT required: yes (live provisioning a real CX22 from the panel — deferred post-merge)

## Verification

```bash
# After T01
pnpm --filter @monster/deployment typecheck
# → exit 0

pnpm --filter @monster/deployment build
# → exit 0

# Stub is gone; ProvisioningService is imported
grep -c "not implemented" apps/admin/src/app/api/infra/provision/route.ts
# → 0
grep "ProvisioningService" apps/admin/src/app/api/infra/provision/route.ts
# → line with import

# onProgress callback wired at each of 5 phases in provisioning.ts
grep -c "onProgress" packages/deployment/src/provisioning.ts
# → >= 5 (one call per phase)

# After T02
pnpm --filter @monster/admin build
# → exit 0; /infra, /api/infra/provision, /api/infra/datacenters, /api/infra/server-types all in route list

grep "ProvisionModal" apps/admin/src/app/(dashboard)/infra/page.tsx
# → line with import and usage

grep -c "Provision New Server" apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
# → >= 1

# tailscaleKey never in a progress message
grep -c "tailscaleKey" packages/deployment/src/provisioning.ts
# → 0 uses in onProgress message strings (only in function signature + command string)

# Failure-path diagnostics: SSE error event shape is visible in route dist bundle
# (confirms { type: 'error', error } event is emitted on provision failure)
grep "type.*error" apps/admin/src/app/api/infra/provision/route.ts
# → line with: send({ type: 'error', error });

# Failure-path: 400 validation path is present (missing fields return non-streaming JSON)
grep -c "status: 400" apps/admin/src/app/api/infra/provision/route.ts
# → >= 1

# Failure-path: [infra/provision] failed prefix is logged on errors
grep "infra/provision.*failed" apps/admin/src/app/api/infra/provision/route.ts
# → line with console.error

# Failure-path: GET routes return fallback when token absent (KN005)
# Simulate by calling the route in isolation — no Hetzner token = fallback arrays returned
# curl http://localhost:3000/api/infra/datacenters  → {"datacenters":["nbg1-dc3","fsn1-dc14","hel1-dc2"]}
# curl http://localhost:3000/api/infra/server-types → {"serverTypes":["cx22","cx32"]}
grep "FALLBACK_DATACENTERS" apps/admin/src/app/api/infra/datacenters/route.ts
# → const FALLBACK_DATACENTERS and return line
grep "FALLBACK_SERVER_TYPES" apps/admin/src/app/api/infra/server-types/route.ts
# → const FALLBACK_SERVER_TYPES and return line

# Failure-path: ProvisionModal renders errorMsg from SSE { type: 'error', error } in red
grep "errorMsg" apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx
# → setErrorMsg and JSX render lines — confirms error surfaces to operator
```

## Observability / Diagnostics

- Runtime signals: SSE event stream — `{ type: 'progress', step, message }` per phase; `{ type: 'done', ok: true, serverId }` on success; `{ type: 'error', error }` on failure; `closed` boolean guards against post-disconnect enqueue errors (D108).
- Inspection surfaces: pm2 logs — `[ProvisioningService]` prefix lines trace every phase; `[infra/provision]` prefix in route logs parse/validate errors.
- Failure visibility: SSE `{ type: 'error', error: '<message>' }` surfaces the `[ProvisioningService]` structured error to the browser; modal renders it in the progress log.
- Redaction constraints: `tailscaleKey` must never appear in any log or SSE event (D147). `onProgress` message strings are caller-visible — `ProvisioningService` is responsible for never passing `opts.tailscaleKey` in message text.

## Integration Closure

- Upstream surfaces consumed: `ProvisioningService.provision()` from `@monster/deployment`; `HetznerClient.listDatacenters()` + `listServerTypes()` from `@monster/deployment`; `InfraService.getFleetHealth()` (already in `infra/page.tsx` from S02 — no change needed).
- New wiring introduced: `POST /api/infra/provision` route → `ProvisioningService.provision()` (SSE handler); two new GET routes → `HetznerClient` with fallback; `ProvisionModal` → fetch SSE stream; `infra/page.tsx` → `ProvisionModal`.
- What remains before the milestone is truly usable end-to-end: human UAT — operator must provision a real server and verify fleet table reflects it with healthy status.

## Tasks

- [x] **T01: Implement `POST /api/infra/provision` SSE route + add `onProgress` to `ProvisioningService`** `est:30m`
  - Why: Replaces the 501 stub with the real provisioning handler; the `onProgress` callback threads progress from the service through the SSE response to the browser.
  - Files: `packages/deployment/src/provisioning.ts`, `apps/admin/src/app/api/infra/provision/route.ts`
  - Do: See T01-PLAN.md
  - Verify: `grep -c "not implemented" .../route.ts` → 0; `pnpm --filter @monster/deployment typecheck` → 0; `grep -c "onProgress" provisioning.ts` ≥ 5
  - Done when: deployment package typechecks clean; provision route no longer returns 501; onProgress emits at each phase

- [x] **T02: Build `ProvisionModal` + GET helper routes + wire into `/infra`** `est:45m`
  - Why: Closes the user-facing loop — operator can fill the provision form, watch live progress, and see the new server appear in the fleet table without leaving the admin panel.
  - Files: `apps/admin/src/app/api/infra/datacenters/route.ts`, `apps/admin/src/app/api/infra/server-types/route.ts`, `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx`, `apps/admin/src/app/(dashboard)/infra/page.tsx`
  - Do: See T02-PLAN.md
  - Verify: `pnpm --filter @monster/admin build` → exit 0; all 4 routes in build output; `ProvisionModal` import in `page.tsx`
  - Done when: admin builds clean; `/infra` shows "Provision New Server" button; ProvisionModal renders form + progress log; GET routes return arrays with fallbacks

## Files Likely Touched

- `packages/deployment/src/provisioning.ts` — add `onProgress` optional callback param
- `packages/deployment/src/index.ts` — re-export `ProvisionOpts` if onProgress needs to be typed for callers (already exported; may not need changes)
- `apps/admin/src/app/api/infra/provision/route.ts` — replace 501 stub with SSE handler
- `apps/admin/src/app/api/infra/datacenters/route.ts` — new GET route
- `apps/admin/src/app/api/infra/server-types/route.ts` — new GET route
- `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx` — new client component
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — add ProvisionModal + Provision button
