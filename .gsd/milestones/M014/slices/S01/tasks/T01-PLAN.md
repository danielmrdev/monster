---
estimated_steps: 5
estimated_files: 4
---

# T01: Add deps, extend schema, update action

**Slice:** S01 — Logo & Favicon Upload
**Milestone:** M014

## Description

Pure config/type changes with zero runtime risk. Adds `sharp`, `adm-zip`, and `@types/adm-zip` to `apps/admin`. Extends `SiteCustomizationSchema` with `faviconDir`. Updates `updateSite` action to read `faviconDir` from FormData. Adds `sharp` to `serverExternalPackages`. Everything here must be clean before T02 can implement the Route Handlers.

## Steps

1. In `apps/admin/package.json`: add to `dependencies`: `"sharp": "^0.33.5"`, `"adm-zip": "^0.5.16"`. Add to `devDependencies`: `"@types/adm-zip": "^0.5.8"`. Use exact versions matching what's already in the monorepo (`sharp@0.33.5` prebuilt binary already present in `.pnpm`).

2. Run `pnpm install` from the monorepo root to link the new deps.

3. In `packages/shared/src/types/customization.ts`: add `faviconDir: z.string().optional()` to `SiteCustomizationSchema`. Keep the existing `faviconUrl` field — both coexist; `faviconDir` is the new field for S01+, `faviconUrl` may still be set on old sites.

4. In `apps/admin/src/app/(dashboard)/sites/actions.ts`: in the `rawCustomization` object inside `updateSite`, add `faviconDir: formData.get('faviconDir') as string | null` alongside existing fields. Do not remove `faviconUrl` yet.

5. In `apps/admin/next.config.ts`: add `'sharp'` to the `serverExternalPackages` array. Sharp has a `.node` binary (`@img/sharp-linux-x64/sharp-linux-x64.node`) that webpack cannot bundle — it must be externalized. Pattern is identical to `node-ssh`/`ssh2`/`cpu-features` already in the array.

## Must-Haves

- [ ] `sharp`, `adm-zip` in `apps/admin/package.json` dependencies
- [ ] `@types/adm-zip` in `apps/admin/package.json` devDependencies
- [ ] `faviconDir: z.string().optional()` present in `SiteCustomizationSchema`
- [ ] `faviconDir` read from FormData in `updateSite` action
- [ ] `'sharp'` in `serverExternalPackages` in `next.config.ts`
- [ ] `pnpm --filter @monster/shared build` exits 0
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `pnpm --filter @monster/shared build` — must exit 0 (confirms schema change compiles)
- `pnpm --filter @monster/admin build` — must exit 0 (confirms `next.config.ts` + new deps don't break the build)
- `grep '"sharp"' apps/admin/package.json` — must match
- `grep 'faviconDir' packages/shared/src/types/customization.ts` — must match
- `grep "sharp" apps/admin/next.config.ts` — must appear in `serverExternalPackages`

## Inputs

- `apps/admin/package.json` — current deps (no sharp, no adm-zip)
- `packages/shared/src/types/customization.ts` — current schema (has `faviconUrl`, needs `faviconDir`)
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — current `updateSite` (reads `faviconUrl`, needs `faviconDir` added)
- `apps/admin/next.config.ts` — current config (has `serverExternalPackages` with node-ssh/ssh2/cpu-features)

## Expected Output

- `apps/admin/package.json` — updated with sharp + adm-zip + @types/adm-zip
- `packages/shared/src/types/customization.ts` — `faviconDir` field added to schema
- `apps/admin/src/app/(dashboard)/sites/actions.ts` — `faviconDir` read in `updateSite`
- `apps/admin/next.config.ts` — `sharp` in `serverExternalPackages`
- Both `@monster/shared` and `@monster/admin` build clean

## Observability Impact

This task is pure config/type — no runtime signals are emitted during T01 itself. However it sets up the observable failure surface for T02:

- **Sharp externalization** — if `'sharp'` is missing from `serverExternalPackages`, the Route Handlers in T02 will fail at import time with `Error: Could not load the "sharp" module using the linux-x64 runtime`. The build itself won't catch this — it surfaces only at runtime when the route is first hit. Presence in `serverExternalPackages` can be verified with: `grep 'sharp' apps/admin/next.config.ts`.
- **Schema field** — `faviconDir` in `SiteCustomizationSchema` gates whether `updateSite` accepts and persists the field. If missing, the customization Zod parse strips the value silently and `faviconDir` is never written to DB. Inspect with: `grep 'faviconDir' packages/shared/dist/index.d.ts` after rebuild.
- **FormData read** — if missing from `rawCustomization`, the Route Handler in T02 can return a valid `faviconDir` path but `updateSite` will ignore it. No error is thrown — the field is just absent from the DB record. Inspect with: `grep 'faviconDir' apps/admin/src/app/(dashboard)/sites/actions.ts`.
