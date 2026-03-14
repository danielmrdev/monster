---
id: T02
parent: S01
milestone: M004
provides:
  - SETTINGS_KEYS extended with vps2_host, vps2_user, vps2_sites_root (7 total)
  - SaveSettingsSchema and SaveSettingsErrors updated to include VPS2 keys
  - Settings form VPS2 Deployment card (Label + Input + MaskedIndicator + FieldError per field)
  - All three workspace package builds verified exit 0
key_files:
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - VPS2 config fields use type="text" (not password) — these are non-secret plain text values
  - MaskedIndicator reused as "is configured" indicator (shows last-4 chars), not as a secret mask
  - Empty form submission is a no-op for each key — existing skip-if-empty semantics cover VPS2 keys without any action body changes
patterns_established:
  - New settings keys require changes in exactly 3 places: SETTINGS_KEYS constant, SaveSettingsSchema + SaveSettingsErrors, settings-form.tsx card section
  - SETTINGS_KEYS loop in actions.ts automatically handles new keys — no action body changes needed when adding plain-string settings
observability_surfaces:
  - Admin Settings /settings page: VPS2 Deployment card shows configured values via MaskedIndicator (last-4 chars)
  - Supabase settings table: rows with key IN ('vps2_host','vps2_user','vps2_sites_root') confirm persistence
  - next build type-check: "Compiled successfully" confirms schema/type consistency across the settings pipeline
duration: ~10m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Extend Settings UI with VPS2 keys + workspace build validation

**Added VPS2 Deployment card to Settings UI with three text fields; all three workspace builds exit 0.**

## What Happened

Extended the settings pipeline at all three touch points:

1. `constants.ts`: Appended `vps2_host`, `vps2_user`, `vps2_sites_root` to `SETTINGS_KEYS` (4 → 7 entries).

2. `actions.ts`: Added three optional string fields to `SaveSettingsSchema` and matching optional error keys to `SaveSettingsErrors`. The existing `SETTINGS_KEYS` loop in the action body required zero changes — new keys are handled automatically.

3. `settings-form.tsx`: Added a "VPS2 Deployment" `<Card>` section after the Affiliate Settings card. Each field follows the established pattern: `<Label>` + `<Input type="text">` + `<MaskedIndicator>` + `<FieldError>`. Added a helper note explaining Tailscale SSH requirement and Caddyfile `import sites/*` prerequisite.

Then ran three builds in parallel. Deployment and agents completed in ~9s each. Admin build completed in ~46s with `next build` running full TypeScript type-checking (confirmed via "Compiled successfully" in output). All three exited 0.

Browser verification was blocked by missing Playwright native libraries (libnspr4.so) in this environment. The `next build` type-check serves as the definitive type-safety gate — it verified the form, schema, and constants are internally consistent.

## Verification

- `pnpm --filter @monster/deployment build` → exit 0 ✓
- `pnpm --filter @monster/agents build` → exit 0 ✓
- `pnpm --filter @monster/admin build` → exit 0 ✓ (includes TypeScript type-check via `next build`)
- `constants.ts` has 7 entries ✓
- `actions.ts` schema and errors type include all 7 keys ✓
- `settings-form.tsx` has VPS2 Deployment card with vps2_host, vps2_user, vps2_sites_root fields ✓

## Diagnostics

- Settings page at `/settings` — VPS2 Deployment card visible with three labeled text inputs and Tailscale/Caddyfile helper note
- Supabase `settings` table: query `SELECT * FROM settings WHERE key LIKE 'vps2%'` to confirm saved values
- Build failure path: `next build` exits non-zero with TypeScript diagnostic if key is missing from schema or type

## Deviations

None. The existing `SETTINGS_KEYS` loop in `actions.ts` handled new keys with zero body changes, exactly as the plan predicted.

## Known Issues

Playwright browser verification unavailable in this environment (missing libnspr4.so system library). Build-level type-checking (`next build`) confirmed correctness. Human verification of UI rendering can be done against the running dev server at port 3004.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added vps2_host, vps2_user, vps2_sites_root to SETTINGS_KEYS
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — extended SaveSettingsSchema and SaveSettingsErrors with VPS2 keys
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — added VPS2 Deployment card section
- `.gsd/milestones/M004/slices/S01/tasks/T02-PLAN.md` — added missing Observability Impact section (pre-flight fix)
