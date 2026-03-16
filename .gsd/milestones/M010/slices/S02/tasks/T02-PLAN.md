---
estimated_steps: 6
estimated_files: 4
---

# T02: Infra API routes and nav item

**Slice:** S02 — Admin Infra Health Page
**Milestone:** M010

## Description

Add the `/api/infra/test-connection` POST route handler and a `/infra` nav item to `NavSidebar`. Ensure `@monster/deployment` is listed in `serverExternalPackages` in `next.config.ts` so node-ssh is not bundled by webpack.

## Steps

1. Read `apps/admin/next.config.ts` — check `serverExternalPackages` list.
2. Add `'@monster/deployment'` to `serverExternalPackages` if not already present (it likely is from M004; verify).
3. Create `apps/admin/src/app/api/infra/test-connection/route.ts`. Export `async function POST()`: instantiate `new InfraService()`, call `testDeployConnection()`, return `NextResponse.json(result)`. Wrap in try/catch returning `{ ok: false, error: string }` on unexpected failure.
4. Read `apps/admin/src/components/nav-sidebar.tsx` — find the nav items list.
5. Add `/infra` nav item: label "Infrastructure" (or "Infra"), href `/infra`, icon `Server` from lucide-react. Place after "Settings" in the list.
6. Run `pnpm -r build` — verify 0 errors.

## Must-Haves

- [ ] `POST /api/infra/test-connection` exists and returns `{ ok: boolean, error?: string }`
- [ ] `/infra` nav item appears in NavSidebar
- [ ] `pnpm build` exits 0

## Verification

- `pnpm build` exits 0
- Visual check: NavSidebar renders `/infra` link (via build output or browser)

## Inputs

- `apps/admin/src/components/nav-sidebar.tsx` — nav items list pattern
- `apps/admin/next.config.ts` — serverExternalPackages
- `packages/deployment/src/infra.ts` — from T01

## Expected Output

- `apps/admin/src/app/api/infra/test-connection/route.ts` (new)
- `apps/admin/src/components/nav-sidebar.tsx` (modified — `/infra` nav item)
- `apps/admin/next.config.ts` (possibly modified — serverExternalPackages)
