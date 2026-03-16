# T01: Settings cleanup — remove vps2_* keys, add hetzner_api_token

**Slice:** S02 — Services migration + Settings cleanup  
**Estimate:** 20m  
**Status:** pending

## Description

Remove the 4 hardcoded VPS2 settings keys (`vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`) from the settings constants, Zod schema, error type, and form UI. Add `hetzner_api_token` in their place. This task is independent of T02/T03 — it touches only the admin settings layer, no deployment package.

## Why

The `servers` table (created in S01) is now the authoritative source for VPS connection details. The `vps2_*` settings keys are obsolete. `hetzner_api_token` is needed in the Settings UI so operators can configure the Hetzner API token (used by `HetznerClient` via the D028 pattern).

## Inputs

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — current `SETTINGS_KEYS` includes `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — `SaveSettingsSchema` and `SaveSettingsErrors` include `vps2_*` fields
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — has "VPS2 Deployment" card (3 fields) + `vps2_ip` in Cloudflare card

## Steps

### 1. Update `constants.ts`

Remove `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip` from the `SETTINGS_KEYS` array.  
Add `hetzner_api_token` (place it logically with other API keys — e.g. after `dataforseo_api_key`).

Result should be:
```ts
export const SETTINGS_KEYS = [
  'spaceship_api_key',
  'spaceship_api_secret',
  'spaceship_contact_id',
  'dataforseo_api_key',
  'hetzner_api_token',
  'cloudflare_api_token',
] as const
```

### 2. Update `actions.ts`

In `SaveSettingsSchema`:
- Remove: `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`
- Add: `hetzner_api_token: z.string().optional()`

In `SaveSettingsErrors` type:
- Remove: `vps2_host?: string[]`, `vps2_user?: string[]`, `vps2_sites_root?: string[]`, `vps2_ip?: string[]`
- Add: `hetzner_api_token?: string[]`

The `saveSettings` function loop (`for (const key of SETTINGS_KEYS)`) needs no changes — it iterates `SETTINGS_KEYS` automatically.

### 3. Update `settings-form.tsx`

**Remove entirely:**
- The entire "VPS2 Deployment" `<Card>` block (CardHeader "VPS2 Deployment", the hint paragraph, and the 3 field divs: `vps2_host`, `vps2_user`, `vps2_sites_root`)
- The `vps2_ip` field div inside the Cloudflare card (including its Label, Input, MaskedIndicator, FieldError)
- Any `errors?.vps2_*` references and `maskedDisplay['vps2_*']` references

**Add** inside the "API Keys" `<Card>`, after the DataForSEO field:
```tsx
{/* Hetzner API Token */}
<div className="space-y-1.5">
  <Label htmlFor="hetzner_api_token">Hetzner API Token</Label>
  <Input
    id="hetzner_api_token"
    name="hetzner_api_token"
    type="password"
    autoComplete="off"
    placeholder="Enter new token to update"
    defaultValue=""
    aria-invalid={!!errors?.hetzner_api_token}
  />
  <MaskedIndicator last4={maskedDisplay['hetzner_api_token']} />
  <p className="text-xs text-muted-foreground mt-1">
    Used to provision new VPS servers via the Hetzner Cloud API.
  </p>
  <FieldError messages={errors?.hetzner_api_token} />
</div>
```

## Must-Haves

- `SETTINGS_KEYS` contains `hetzner_api_token` and does NOT contain any of `vps2_host`, `vps2_user`, `vps2_sites_root`, `vps2_ip`
- `SaveSettingsSchema` and `SaveSettingsErrors` are consistent with the updated `SETTINGS_KEYS`
- No `vps2_*` references remain in any of the three files
- `hetzner_api_token` is a `type="password"` field in the form (same pattern as `cloudflare_api_token`)

## Verification

```bash
cd /home/daniel/monster/.gsd/worktrees/M011

# hetzner_api_token is present in constants
grep "hetzner_api_token" apps/admin/src/app/(dashboard)/settings/constants.ts

# no vps2_* remain in any of the three files
grep -c "vps2_" apps/admin/src/app/(dashboard)/settings/constants.ts   # expect: 0
grep -c "vps2_" apps/admin/src/app/(dashboard)/settings/actions.ts      # expect: 0
grep -c "vps2_" apps/admin/src/app/(dashboard)/settings/settings-form.tsx  # expect: 0
```

## Done When

All three files updated; `grep -c "vps2_"` on each returns 0; `hetzner_api_token` appears in constants, schema, error type, and form UI.

## Expected Output

- `constants.ts`: `SETTINGS_KEYS` with 6 keys (spaceship_api_key, spaceship_api_secret, spaceship_contact_id, dataforseo_api_key, hetzner_api_token, cloudflare_api_token)
- `actions.ts`: schema and errors type with `hetzner_api_token`, no `vps2_*`
- `settings-form.tsx`: API Keys card with 5 fields (spaceship_api_key, spaceship_api_secret, spaceship_contact_id, dataforseo_api_key, hetzner_api_token); no VPS2 Deployment card; Cloudflare card with only `cloudflare_api_token`
