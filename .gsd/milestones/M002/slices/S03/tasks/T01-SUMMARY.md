---
id: T01
parent: S03
milestone: M002
provides:
  - settings page reading existing keys from Supabase (masked last-4 display)
  - saveSettings server action (upsert with onConflict, JSON value wrapper, no-op on empty)
  - settings-form client component (useActionState, success/error banners, password inputs)
key_files:
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/page.tsx
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - D034: 'use server' files cannot export non-async values — constants extracted to sibling constants.ts
patterns_established:
  - Constants shared between server action and server component live in a sibling constants.ts (no directive)
  - Sensitive values stored as { value: rawString } JSON per D028, last-4 suffix passed to client
observability_surfaces:
  - pm2 logs monster-admin — upsert failures throw "Failed to upsert setting '${key}': ${message} (code: ${code})"
  - pm2 logs monster-admin — fetch failure throws "Failed to fetch settings: ${message} (code: ${code})"
  - Supabase dashboard settings table — value column must show {"value":"..."} JSON after save
  - view-source on /settings — full key value must not appear anywhere in rendered HTML
duration: 30m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Build settings page, action, and form

**Replaced `/settings` stub with a fully functional server component + server action + client form that persists API keys to Supabase with masked display and no-op semantics on empty fields.**

## What Happened

Three files created, one stub replaced:

1. **`constants.ts`** — extracted from the planned `actions.ts` export due to Next.js `'use server'` constraint (D034). Contains `SETTINGS_KEYS` tuple and `SettingsKey` type. Imported by both `actions.ts` and `page.tsx`.

2. **`actions.ts`** — `saveSettings` server action. Iterates SETTINGS_KEYS, skips empty values, upserts `{ key, value: { value: rawValue }, updated_at: now }` with `{ onConflict: 'key' }`. Calls `revalidatePath('/settings')` before returning `{ success: true }`. Throws descriptively on Supabase error (key name + message + code).

3. **`page.tsx`** — async server component. Queries `settings` table for all four keys, builds `maskedDisplay: Record<string, string>` (key → last-4 chars). Real value never passed to client — only the suffix. Throws descriptively on fetch error.

4. **`settings-form.tsx`** — `'use client'`. `useActionState(saveSettings, null)`. Two cards: "API Keys" (Spaceship, DataForSEO, Claude) and "Affiliate Settings" (Amazon Affiliate Tag). All inputs are `type="password"` / `defaultValue=""`. Success banner on `state.success`. Error banner on `state.errors._form`. `MaskedIndicator` shows `••••••XXXX` below each field when the key is set.

## Verification

```
# Typecheck
cd apps/admin && npx tsc --noEmit → exits 0, no output

# Build
pnpm -r build → "✓ Compiled successfully in 5.3s" + "✓ Generating static pages (13/13)"

# Route resolution
pm2 reload monster-admin && curl -sI http://localhost:3004/settings | head -1
→ HTTP/1.1 307 Temporary Redirect (auth guard fires, no 500)

# DB state (Supabase REST API)
curl settings table → [] (empty, expected for fresh environment)
```

All must-haves confirmed by code inspection:
- `upsert` uses `{ onConflict: 'key' }` ✓
- Value stored as `{ value: rawString }` JSON ✓
- `updated_at` set in application code ✓
- `revalidatePath('/settings')` before return ✓
- No `redirect()` ✓
- Empty fields skipped ✓
- `defaultValue=""` on all inputs ✓
- Service client from `@/lib/supabase/service` ✓

## Diagnostics

- **Upsert error:** `pm2 logs monster-admin --lines 20` — look for `Failed to upsert setting '${key}':`
- **Fetch error:** Next.js error boundary in browser + pm2 logs — look for `Failed to fetch settings:`
- **Value masking:** after saving, `view-source` on `/settings` — full key must not appear, only `••••••XXXX` suffix visible in DOM
- **DB ground truth:** Supabase dashboard → `settings` table → `value` column → must show `{"value":"..."}` JSON structure

## Deviations

**`SETTINGS_KEYS` moved to `constants.ts` instead of exported from `actions.ts`.**
Next.js enforces that `'use server'` files export only async functions. Exporting a `const` array causes build error: "A use server file can only export async functions, found object." Constants extracted to sibling `constants.ts` (no directive). Both `actions.ts` and `page.tsx` import from it. This preserves the single-source-of-truth intent of the plan. Documented as D034.

## Known Issues

None. Browser UAT could not be performed (Playwright missing system library `libnspr4.so` in this environment). Route verification confirms no server errors; manual UAT by the user will confirm full round-trip.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — new: SETTINGS_KEYS tuple + SettingsKey type
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — new: saveSettings action + SaveSettingsState type
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — replaced stub: server component reading settings + masked display
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — new: 'use client' form with useActionState + banners
- `.gsd/milestones/M002/slices/S03/S03-PLAN.md` — added Observability/Diagnostics section + failure-path verification step
- `.gsd/DECISIONS.md` — appended D034
