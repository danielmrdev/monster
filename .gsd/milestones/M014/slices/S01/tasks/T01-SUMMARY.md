---
id: T01
parent: S01
milestone: M014
provides:
  - sharp and adm-zip deps available in apps/admin
  - faviconDir field in SiteCustomizationSchema
  - faviconDir read from FormData in updateSite action
  - sharp externalized in next.config.ts serverExternalPackages
key_files:
  - apps/admin/package.json
  - packages/shared/src/types/customization.ts
  - apps/admin/src/app/(dashboard)/sites/actions.ts
  - apps/admin/next.config.ts
key_decisions:
  - Keep faviconUrl alongside new faviconDir — old sites may still have faviconUrl set
patterns_established:
  - Native binary deps (sharp, node-ssh, ssh2) go in both serverExternalPackages and webpack.externals
observability_surfaces:
  - Build output confirms sharp appears in Next.js route traces (serverExternalPackages excludes it from bundle)
  - pnpm install output shows exact package counts added (+2)
duration: ~8m
verification_result: passed
completed_at: 2026-03-18
blocker_discovered: false
---

# T01: Add deps, extend schema, update action

**Added sharp + adm-zip deps, extended SiteCustomizationSchema with faviconDir, wired faviconDir into updateSite FormData read, and externalized sharp in Next.js config — both @monster/shared and @monster/admin build clean.**

## What Happened

Straightforward config/type-only task. Applied four edits:

1. `apps/admin/package.json`: added `sharp@^0.33.5` and `adm-zip@^0.5.16` to dependencies, `@types/adm-zip@^0.5.8` to devDependencies.
2. `packages/shared/src/types/customization.ts`: added `faviconDir: z.string().optional()` to `SiteCustomizationSchema`. Left `faviconUrl` in place — both coexist; `faviconUrl` is the legacy field set on older sites.
3. `apps/admin/src/app/(dashboard)/sites/actions.ts`: added `faviconDir: (formData.get('faviconDir') as string) || undefined` to `rawCustomization` inside `updateSite`. The `createSite` action does not need it (no file upload on site creation).
4. `apps/admin/next.config.ts`: added `'sharp'` to `serverExternalPackages`. Sharp ships a prebuilt `.node` binary (`@img/sharp-linux-x64/sharp-linux-x64.node`) that webpack cannot bundle — same pattern as `node-ssh`/`ssh2`/`cpu-features`.

Ran `pnpm install` — two packages resolved (+2: sharp, adm-zip). Both build targets passed with no new errors. The pre-existing BullMQ "critical dependency" warning is unrelated to this task.

## Verification

- `pnpm install` — resolved +2 packages, no errors
- `pnpm --filter @monster/shared build` — exit 0, DTS + ESM built clean
- `pnpm --filter @monster/admin build` — exit 0, all 33 routes generated, sharp appears externalized in bundle traces
- All four grep checks pass (sharp in package.json, faviconDir in schema, sharp in next.config.ts, faviconDir in actions.ts)

## Verification Evidence

| # | Command | Exit Code | Verdict | Duration |
|---|---------|-----------|---------|----------|
| 1 | `pnpm install` | 0 | ✅ pass | 4.1s |
| 2 | `pnpm --filter @monster/shared build` | 0 | ✅ pass | 2.9s |
| 3 | `pnpm --filter @monster/admin build` | 0 | ✅ pass | 64.5s |
| 4 | `grep '"sharp"' apps/admin/package.json` | 0 | ✅ pass | <1s |
| 5 | `grep 'faviconDir' packages/shared/src/types/customization.ts` | 0 | ✅ pass | <1s |
| 6 | `grep 'sharp' apps/admin/next.config.ts` | 0 | ✅ pass | <1s |
| 7 | `grep 'faviconDir' apps/admin/src/app/(dashboard)/sites/actions.ts` | 0 | ✅ pass | <1s |

## Diagnostics

- `pnpm ls --filter @monster/admin sharp adm-zip` — confirms both packages are linked in admin's node_modules
- `grep 'sharp' apps/admin/next.config.ts` — confirms externalization is in place before adding Route Handlers
- If the admin build fails on sharp after T02 adds Route Handlers, check that `serverExternalPackages` still contains `'sharp'` — Next.js 15 can silently drop it during config merges

## Deviations

None. The `createSite` action was intentionally not modified — logo/favicon upload only applies to site editing, not creation.

## Known Issues

None.

## Files Created/Modified

- `apps/admin/package.json` — added sharp, adm-zip, @types/adm-zip
- `packages/shared/src/types/customization.ts` — added faviconDir field to SiteCustomizationSchema
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — added faviconDir read in updateSite rawCustomization
- `apps/admin/next.config.ts` — added sharp to serverExternalPackages
