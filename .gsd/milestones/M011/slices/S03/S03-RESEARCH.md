# S03 — Research: Infra fleet dashboard + Provision UI

**Date:** 2026-03-16

## Summary

S03 is straightforward wiring work on top of a fully functional foundation. S01 built `ProvisioningService.provision()` and established the `POST /api/infra/provision` route as a 501 stub. S02 built `InfraService.getFleetHealth()` and rendered the fleet table in `/infra`. This slice replaces the stub with a real SSE handler and adds a `ProvisionModal` client component to the infra page.

No DB migrations, no new packages, no new patterns. The route handler follows the Monster Chat SSE pattern (`D099`). The modal follows the `TestConnectionButton` / `JobStatus` client component pattern. The sole non-trivial decision is how to surface provision progress: an optional `onProgress` callback added to `ProvisioningService.provision()` lets the SSE handler emit per-phase events without breaking the service's single-call API.

After S03, the operator can provision a real CX22/CX32 from the admin panel `/infra` page, watch live progress in a modal, and see the new server appear in the fleet table.

## Recommendation

**Two tasks, sequentially:**

- **T01** — Implement `POST /api/infra/provision` as an SSE route handler. Add an optional `onProgress` callback to `ProvisioningService.provision()`. Route emits `{ type: 'progress', step, message }` events per phase, then `{ type: 'done', ok: true, serverId }` or `{ type: 'error', error }`.

- **T02** — Build `ProvisionModal` client component + update `infra/page.tsx`. Modal fetches datacenter/serverType options from new `GET /api/infra/datacenters` and `GET /api/infra/server-types` routes (or inline from server component props). On form submit: consumes the SSE stream, shows a progress log, closes + calls `router.refresh()` on done.

No Dialog shadcn component needed — build a simple fixed-position overlay with Tailwind (same pattern as the existing chat sidebar). `router.refresh()` is already used in `AlertList.tsx` and `CategoryForm.tsx` for post-action server data refresh.

## Implementation Landscape

### Key Files

**Already exist (no changes needed from S03):**
- `packages/deployment/src/infra.ts` — `InfraService.getFleetHealth()` stable and tested
- `packages/deployment/src/index.ts` — all exports in place including `ProvisioningService`, `HetznerClient`
- `apps/admin/next.config.ts` — `@monster/deployment` already in `serverExternalPackages`; `node-ssh`, `ssh2`, `cpu-features` in webpack externals

**Needs modification:**
- `packages/deployment/src/provisioning.ts` — add optional `onProgress?: (step: string, message: string) => void` param to `provision()`. Call it at each of the 5 phases. Rebuild `@monster/deployment` after.
- `apps/admin/src/app/api/infra/provision/route.ts` — replace 501 stub with real SSE handler. Import `ProvisioningService` from `@monster/deployment`. Parse + validate request body. Create `ReadableStream` with same `closed` guard + try/catch pattern as Monster Chat route (`D108`). Emit progress events via callback.

**New files:**
- `apps/admin/src/app/(dashboard)/infra/ProvisionModal.tsx` — `'use client'` component. Form with 5 fields (name, datacenter, serverType, tailscaleKey, sshPublicKey). Submits as fetch with streaming body reader. Shows progress log. Calls `router.refresh()` on done. Fixed-position overlay or inline expansion — inline card expansion is simpler (no z-index issues).
- `apps/admin/src/app/api/infra/datacenters/route.ts` — `GET` handler: `new HetznerClient().listDatacenters()`, returns `{ datacenters: HetznerDatacenter[] }`. On error (token absent): returns hardcoded fallback list.
- `apps/admin/src/app/api/infra/server-types/route.ts` — `GET` handler: `new HetznerClient().listServerTypes()`, filtered to relevant types (cx22, cx32). On error: returns hardcoded fallback.

**Updated:**
- `apps/admin/src/app/(dashboard)/infra/page.tsx` — add `<ProvisionModal />` below the page header. Optionally add a "Refresh" button (calls `router.refresh()`) on the fleet table card header.

### Build Order

1. **Modify `ProvisioningService`** — add `onProgress` callback. Rebuild `@monster/deployment`.
2. **Implement `POST /api/infra/provision`** — SSE handler. Verify with a `curl -N` test.
3. **Add GET routes** for datacenters/server-types — simple wrappers with fallbacks.
4. **Build `ProvisionModal`** — client component with SSE consumption.
5. **Update `infra/page.tsx`** — add ProvisionModal.
6. **Admin build** — verify `/infra` still in route table; no new type errors.

### Verification Approach

```bash
# T01
pnpm --filter @monster/deployment typecheck           # 0 errors after onProgress addition
pnpm --filter @monster/deployment build               # clean dist
# Check stub is gone: grep -c "not implemented" apps/admin/src/app/api/infra/provision/route.ts
# Confirm ProvisioningService is imported in route

# T02
pnpm --filter @monster/admin build                    # exit 0; /infra + /api/infra/* in route table
# Visual check: /infra page renders "Provision New Server" button
# Check provision/route.ts no longer returns 501
```

Live UAT (post-slice):
- Operator fills form → observes progress events → server appears in fleet table

## Constraints

- `ProvisioningService.provision()` is a single async chain (no built-in progress emission). Adding `onProgress` callback is the minimal change — it keeps the service API clean and backward-compatible (callback is optional).
- `tailscaleKey` must never appear in any `console.log` (D147). The SSE progress events should not include the key either. The callback handler in the route emits the message string from `onProgress(step, message)` — ProvisioningService is responsible for ensuring it never passes `tailscaleKey` in the message argument.
- `@monster/deployment` is in `serverExternalPackages` in `next.config.ts` (already done in M010/S02 — D140). Node-ssh and SSH2 native modules are also externalized via webpack. The provision route handler will work without additional config changes.
- Provisioning takes 5–10 minutes. SSE keeps the browser connection open for this duration. There is no proxy/timeout concern since VPS1 serves the admin directly (no Vercel, no Cloudflare proxy — see R013/D002).
- No Dialog/modal component in shadcn UI folder. `@base-ui/react` has a Dialog primitive installed in `node_modules` but no shadcn wrapper component (`components.json` style `base-nova`). Build the overlay as a fixed-position div with Tailwind. This avoids installing a new component and is consistent with the simple overlay approach used elsewhere.

## Common Pitfalls

- **SSE `closed` guard** — use the same `closed` boolean + try/catch `controller.enqueue()` pattern from `apps/admin/src/app/api/monster/chat/route.ts` (D108). Without it, client disconnect logs spurious errors.
- **`router.refresh()` after provision** — the `/infra` page is `force-dynamic`; `router.refresh()` triggers a fresh server component render that re-calls `getFleetHealth()`. This is the established pattern (`AlertList.tsx`, `CategoryForm.tsx`). Call it inside the modal after receiving `{ type: 'done' }`.
- **Hardcoded fallback for datacenters/server-types** — when `hetzner_api_token` is not yet set, `HetznerClient.listDatacenters()` throws `[HetznerClient] hetzner_api_token not found in settings` (KN005). The GET routes must catch this and return a sensible fallback (e.g. `['nbg1-dc3', 'fsn1-dc14', 'hel1-dc2']` for datacenters; `['cx22', 'cx32']` for server types) so the modal is usable before the token is configured.
- **`onProgress` callback in ProvisioningService must not log tailscaleKey** — the message strings passed to the callback are forwarded as SSE events visible in the browser. Never include `opts.tailscaleKey` in any message string (D147).
- **SSE event format** — use `data: ${JSON.stringify(event)}\n\n` (double newline required). Each event object should have `{ type: 'progress', step: string, message: string }`, `{ type: 'done', ok: true, serverId: string }`, or `{ type: 'error', error: string }`.
