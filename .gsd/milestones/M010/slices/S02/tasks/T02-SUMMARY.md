---
id: T02
parent: S02
milestone: M010
provides:
  - POST /api/infra/test-connection route returning { ok, error? }
  - /infra nav item in NavSidebar (label "Infrastructure", Server icon)
  - @monster/deployment added to admin workspace deps with webpack externals for node-ssh native modules
key_files:
  - apps/admin/src/app/api/infra/test-connection/route.ts
  - apps/admin/src/components/nav-sidebar.tsx
  - apps/admin/next.config.ts
  - apps/admin/package.json
key_decisions:
  - D140: webpack.externals + serverExternalPackages both needed to externalize node-ssh/ssh2/cpu-features when imported via workspace package
patterns_established:
  - Webpack externals for native SSH modules in next.config.ts — any future route importing @monster/deployment is already covered
observability_surfaces:
  - POST /api/infra/test-connection returns { ok: boolean, error?: string } — structured error detail on failure, HTTP 500 with same shape on unexpected exceptions
  - "[API /infra/test-connection] unexpected error:" console log on non-InfraService failures
duration: 25m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Infra API routes and nav item

**Added POST /api/infra/test-connection route, /infra nav item, and webpack externals for node-ssh native modules**

## What Happened

1. **next.config.ts:** Added `@monster/deployment`, `node-ssh`, `ssh2`, `cpu-features` to `serverExternalPackages` AND added explicit `webpack.externals` for `isServer` builds. `serverExternalPackages` alone was insufficient because the import chain from a workspace package (`@monster/deployment/dist/index.js` → `node-ssh` → `ssh2` → `cpu-features.node`) was still being traced by webpack. The explicit `webpack.externals` ensures native `.node` binaries are never bundled.

2. **API route:** Created `apps/admin/src/app/api/infra/test-connection/route.ts`. Instantiates `InfraService`, calls `testDeployConnection()`, returns `NextResponse.json(result)`. Outer try/catch returns `{ ok: false, error }` with HTTP 500 on unexpected failures. Logs `[API /infra/test-connection]` prefix for unexpected errors.

3. **NavSidebar:** Added `Server` icon import from lucide-react. Added `{ href: '/infra', label: 'Infrastructure', icon: Server }` after Settings in the nav items list.

4. **package.json:** Added `"@monster/deployment": "workspace:*"` to admin dependencies (was not present).

## Verification

- ✅ `pnpm --filter @monster/admin build` exits 0 — route appears as `ƒ /api/infra/test-connection` in build output
- ✅ `pnpm --filter @monster/deployment build` exits 0
- ✅ `curl -X POST http://localhost:3014/api/infra/test-connection` returns `{"ok":false,"error":"Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL"}` — correct shape, expected error without Supabase env
- ✅ Nav item in source: `grep` confirms `Infrastructure` label and `Server` icon in nav-sidebar.tsx
- ✅ `pnpm -r build` partially passes — admin and all packages build; generator fails on pre-existing missing `site.json` (unrelated)

### Slice-level verification status (intermediate — T02 of T03):
- ✅ `pnpm --filter @monster/deployment build` exits 0 with InfraService exported
- ✅ `pnpm --filter @monster/admin build` exits 0
- ⬜ `pnpm -r typecheck` — not run (deferred; pre-existing @monster/agents issues in worktree resolved for build but typecheck not attempted)
- ⬜ Human UAT: /infra page loads — deferred to T03 (page.tsx not yet created)

## Diagnostics

- `curl -X POST <admin>/api/infra/test-connection` — returns `{ ok: boolean, error?: string }`. Error field contains InfraService error detail (settings missing, SSH failure, etc.)
- Server logs: `[API /infra/test-connection] unexpected error: ...` on non-InfraService exceptions
- NavSidebar: `/infra` link visible in sidebar navigation

## Deviations

- **Added `@monster/deployment` to admin's package.json** — plan assumed it might already be there from M004; it wasn't.
- **Added webpack.externals config** — plan only mentioned `serverExternalPackages`. That was insufficient for native `.node` modules imported transitively via workspace packages. Both `serverExternalPackages` AND `webpack.externals` are needed. Documented as D140.
- **Added `node-ssh`, `ssh2`, `cpu-features` to externals** — plan only mentioned `@monster/deployment`. The transitive native deps needed explicit externalization.

## Known Issues

- `pnpm -r build` fails on `@monster/generator` due to missing `src/data/default/site.json` — pre-existing, unrelated to this task.
- `@monster/agents` dist/ not present in worktree by default — had to run `pnpm --filter @monster/agents build` manually. Pre-existing worktree setup gap.

## Files Created/Modified

- `apps/admin/src/app/api/infra/test-connection/route.ts` — **new** POST route handler
- `apps/admin/src/components/nav-sidebar.tsx` — added `Server` icon import and `/infra` nav item
- `apps/admin/next.config.ts` — added serverExternalPackages + webpack.externals for SSH native modules
- `apps/admin/package.json` — added `@monster/deployment` workspace dependency
