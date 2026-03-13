---
id: S03
parent: M002
milestone: M002
provides:
  - settings page reading existing API keys from Supabase (masked last-4 display, no raw value in HTML)
  - saveSettings server action (upsert with onConflict:'key', JSON value wrapper, no-op on empty fields)
  - settings-form client component (useActionState, success/error banners, password inputs, MaskedIndicator)
requires:
  - slice: S01
    provides: server action pattern ('use server' file-level, FormData, revalidatePath), createServiceClient import path
affects:
  - S04: same server action pattern applies to cost entry form
key_files:
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/page.tsx
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - D034: 'use server' files cannot export non-async values — constants extracted to sibling constants.ts
  - D028: API keys stored as {"value": "actual-key"} JSON in settings.value JSONB column
  - D016: updated_at set in application code, not via DB trigger
patterns_established:
  - Constants shared between server action and server component live in a sibling constants.ts (no directive)
  - Sensitive values stored as { value: rawString } JSON per D028; last-4 suffix passed to client, never the raw value
  - No-op semantics on empty fields: iterate keys, skip blank, upsert only what changed
observability_surfaces:
  - pm2 logs monster-admin — upsert failures throw "Failed to upsert setting '${key}': ${message} (code: ${code})"
  - pm2 logs monster-admin — fetch failure throws "Failed to fetch settings: ${message} (code: ${code})"
  - Supabase dashboard settings table — value column shows {"value":"..."} JSON after a successful save
  - view-source on /settings after saving — full key value must not appear, only ••••••XXXX suffix visible
drill_down_paths:
  - .gsd/milestones/M002/slices/S03/tasks/T01-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-13
---

# S03: Settings — API Key Management

**Replaced the `/settings` "Coming soon" stub with a server component + server action + client form that persists API keys to Supabase with masked display; no raw key value ever appears in server-rendered HTML.**

## What Happened

Single task (T01) covered the entire slice — server component, action, and form are one coherent unit with no useful intermediate state.

**`constants.ts`** — extracted from `actions.ts` after hitting Next.js's enforcement that `'use server'` files export only async functions (D034). Contains `SETTINGS_KEYS` tuple (`['spaceship_api_key', 'dataforseo_api_key', 'claude_api_key', 'amazon_affiliate_tag']`) and `SettingsKey` type. Single source of truth imported by both the action and the page.

**`actions.ts`** — `saveSettings` server action. Iterates `SETTINGS_KEYS`, skips fields where the submitted value is empty, upserts `{ key, value: { value: rawValue }, updated_at: now }` with `{ onConflict: 'key' }`. Calls `revalidatePath('/settings')` before returning `{ success: true }`. Throws descriptively on Supabase error — key name, message, and code included in the thrown string so pm2 logs carry actionable context.

**`page.tsx`** — async server component. Queries the `settings` table for all four keys, builds a `maskedDisplay: Record<string, string>` map of `key → last-4 chars of raw value`. Only the suffix reaches the client; the full value is never passed down or placed in any HTML attribute. Throws descriptively on fetch error.

**`settings-form.tsx`** — `'use client'` wrapper around the action. `useActionState(saveSettings, null)` drives success/error banner rendering. Two shadcn cards: "API Keys" (Spaceship, DataForSEO, Claude) and "Affiliate Settings" (Amazon Affiliate Tag). All inputs are `type="password"` with `defaultValue=""`. `MaskedIndicator` renders `••••••XXXX` below any field where the key is currently set.

## Verification

```
# Typecheck
cd apps/admin && npx tsc --noEmit → exits 0, no output

# Build
pnpm -r build → "✓ Compiled successfully in 4.0s" + "✓ Generating static pages (13/13)"

# Route resolution
pm2 reload monster-admin && curl -sI http://localhost:3004/settings | head -1
→ HTTP/1.1 307 Temporary Redirect (auth guard fires, no 500)
```

All must-haves confirmed:
- `upsert` uses `{ onConflict: 'key' }` ✓
- Value stored as `{ value: rawString }` JSON (D028) ✓
- `updated_at` set in application code (D016) ✓
- `revalidatePath('/settings')` called before return ✓
- No `redirect()` ✓
- Empty fields skipped (no-op semantics) ✓
- `defaultValue=""` on all inputs — no raw value in HTML ✓
- Service client from `@/lib/supabase/service` ✓

## Requirements Advanced

- R013 (Admin panel on VPS1 via pm2) — pm2 reload + 307 response confirms settings route resolves cleanly post-deploy

## Requirements Validated

- none — S03 is a supporting piece; R013 was already validated in M001/S05

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

**`SETTINGS_KEYS` moved to `constants.ts` instead of exported from `actions.ts`.**
Next.js enforces that `'use server'` files export only async functions. Exporting a `const` array causes build error: "A use server file can only export async functions, found object." Constants extracted to sibling `constants.ts` (no directive). Both `actions.ts` and `page.tsx` import from it. Documented as D034. This is a platform-level constraint, not a design deviation.

## Known Limitations

- Browser UAT (live round-trip in browser) was not automated — Playwright missing `libnspr4.so` in this environment. Route verification confirms no server errors; manual UAT by the user must confirm full DB round-trip and masked display.
- The `settings` table had no rows at verification time (fresh environment) — the "Currently set" indicator path was confirmed by code inspection only, not by a live save-and-reload cycle.

## Follow-ups

- Manual browser UAT (see S03-UAT.md) confirms masked display and DB write in a live session
- S04 can reuse the identical server action pattern (iterate keys, skip empty, upsert, revalidatePath)

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — new: SETTINGS_KEYS tuple + SettingsKey type (no directive)
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — new: saveSettings server action + SaveSettingsState type
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — replaced stub: server component reading settings + masked display
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — new: 'use client' form with useActionState + MaskedIndicator
- `.gsd/milestones/M002/slices/S03/S03-PLAN.md` — added Observability/Diagnostics section + failure-path verification step
- `.gsd/DECISIONS.md` — appended D034

## Forward Intelligence

### What the next slice should know
- S04 (Finances Shell) uses the same server action pattern: `'use server'` file-level, iterate form fields, skip empty, upsert/insert, `revalidatePath`, return `{ success: true }` or `{ errors: ... }`. Copy the pattern directly.
- Constants shared between a server action and a server component MUST live in a sibling file with no `'use server'` directive (D034). This is a hard Next.js constraint, not optional.

### What's fragile
- Masked display depends on the `value` column containing `{ "value": "..." }` JSON, not a raw string. If anything writes a raw string to that column, the cast `(row.value as { value: string }).value` will return `undefined` and the indicator will silently not appear.
- `revalidatePath('/settings')` must be called while still in the server action scope (before return) — calling it after an async boundary does nothing.

### Authoritative diagnostics
- `pm2 logs monster-admin --lines 20` — upsert/fetch errors are thrown with key name + Supabase error code; grep for "Failed to upsert" or "Failed to fetch settings"
- Supabase dashboard → `settings` table → `value` column — should show `{"value":"..."}` after a successful save; raw string indicates the value wrapper was bypassed

### What assumptions changed
- Original plan assumed `SETTINGS_KEYS` could be exported from `actions.ts`. Next.js's `'use server'` enforcement made that impossible — only async functions may be exported from server action files. Constants file pattern is now established for all future slices.
