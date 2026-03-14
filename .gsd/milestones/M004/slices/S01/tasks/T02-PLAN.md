---
estimated_steps: 4
estimated_files: 3
---

# T02: Extend Settings UI with VPS2 keys + workspace build validation

**Slice:** S01 — rsync + Caddy Deployment Service
**Milestone:** M004

## Description

The S02 deploy phase will read `vps2_host`, `vps2_user`, and `vps2_sites_root` from the Supabase `settings` table at runtime. These three keys must be configurable from the admin Settings UI before S02 can wire them. This task extends the existing Settings pattern (constants → schema → form → action) with a new "VPS2 Deployment" card section.

These are plain text config values (not secrets), so form fields use `type="text"` not `type="password"`. The `MaskedIndicator` component is still appropriate for showing whether a value has been set — it shows last-4 chars as a "is configured" signal rather than a secret mask.

After the UI extension, validate all affected workspace packages build cleanly as the S01 completion gate.

## Steps

1. **`constants.ts`:** Add `'vps2_host'`, `'vps2_user'`, `'vps2_sites_root'` to `SETTINGS_KEYS` array (append after existing keys).

2. **`actions.ts`:** Add three optional string fields to `SaveSettingsSchema`. Add matching optional error keys to `SaveSettingsErrors` type. The existing loop over `SETTINGS_KEYS` already handles new keys automatically — no action body changes needed.

3. **`settings-form.tsx`:** Add a "VPS2 Deployment" `<Card>` section after the Affiliate Settings card. Inside: three `<Input>` fields (`type="text"`) for `vps2_host` (placeholder: `e.g. 192.168.x.x or tailscale-hostname`), `vps2_user` (placeholder: `e.g. daniel`), `vps2_sites_root` (placeholder: `e.g. /var/www/sites`). Each with `<Label>`, `<MaskedIndicator>`, and `<FieldError>` following the established pattern. Add a `<p className="text-xs text-muted-foreground">` note inside the card explaining: "VPS2 must be reachable via Tailscale SSH. Ensure `import sites/*` is in VPS2's global Caddyfile."

4. **Build validation:** Run `pnpm --filter @monster/admin build` and `pnpm --filter @monster/deployment build` and `pnpm --filter @monster/agents build`. Fix any type errors introduced by the new settings keys. All three must exit 0.

## Must-Haves

- [ ] `vps2_host`, `vps2_user`, `vps2_sites_root` appear in `SETTINGS_KEYS`
- [ ] `SaveSettingsSchema` and `SaveSettingsErrors` include the three new keys
- [ ] Settings form renders a "VPS2 Deployment" card with three labeled input fields
- [ ] Form fields follow the established pattern: Label + Input + MaskedIndicator + FieldError
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `pnpm --filter @monster/deployment build` exits 0
- [ ] `pnpm --filter @monster/agents build` exits 0

## Verification

- `pnpm --filter @monster/admin build` exits 0
- `pnpm --filter @monster/deployment build` exits 0
- `pnpm --filter @monster/agents build` exits 0
- Browser: Settings page renders without React errors; VPS2 Deployment card visible with three fields; submitting with values shows "Settings saved successfully" banner

## Observability Impact

**What changes:** Three new keys (`vps2_host`, `vps2_user`, `vps2_sites_root`) are now readable from the Supabase `settings` table and visible in the admin UI. Downstream services (`RsyncService`, `CaddyService`) can now load their config from the DB at runtime.

**Inspection surfaces:**
- Admin Settings UI at `/settings` — "VPS2 Deployment" card shows current values via `MaskedIndicator` (last-4 chars when set)
- Supabase `settings` table — rows with `key IN ('vps2_host','vps2_user','vps2_sites_root')` confirm persistence
- `next build` type-check (`Compiled successfully` in build output) confirms schema consistency

**Failure state:**
- If a VPS2 key is absent from DB, `MaskedIndicator` renders nothing; form placeholder shows expected format
- If schema/type mismatch causes build failure, `next build` exits non-zero with TypeScript diagnostic identifying the mismatched key

## Inputs

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — existing `SETTINGS_KEYS` array; extend it
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — existing schema and errors type; extend both
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — existing form; add new card section
- T01 output: `packages/deployment/dist/` must exist (build already run) so workspace resolution works

## Expected Output

- `constants.ts` — `SETTINGS_KEYS` has 7 entries (4 existing + 3 new VPS2 keys)
- `actions.ts` — schema and error type include all 7 keys
- `settings-form.tsx` — "VPS2 Deployment" card section rendered with correct fields and helper text
- All three workspace package builds exit 0
