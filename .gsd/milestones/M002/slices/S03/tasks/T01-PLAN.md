---
estimated_steps: 6
estimated_files: 3
---

# T01: Build settings page, action, and form

**Slice:** S03 — Settings — API Key Management
**Milestone:** M002

## Description

Replace the "Coming soon" stub at `/settings` with a working page that reads existing API keys from the `settings` table (masked display), and a form that upserts new values. Three files: server action, server component page, client form wrapper. All patterns are direct copies from S01 — no new concepts introduced.

## Steps

1. **Create `actions.ts`** — `'use server'` file-level. Define `SETTINGS_KEYS` tuple (`spaceship_api_key`, `dataforseo_api_key`, `claude_api_key`, `amazon_affiliate_tag`). Define Zod schema with one optional string per key (empty = skip, non-empty = save). `saveSettings` action signature: `(prevState, formData) => Promise<SaveSettingsState>`. For each key with a non-empty submitted value: `supabase.from('settings').upsert({ key, value: { value: rawValue }, updated_at: new Date().toISOString() }, { onConflict: 'key' })`. After all upserts: `revalidatePath('/settings')`. Return `{ success: true }`. Throw descriptively on Supabase error. No `redirect()`.

2. **Create `page.tsx`** — async server component. Query `settings` table: `.from('settings').select('key, value').in('key', SETTINGS_KEYS)`. Build a `Record<string, string>` of `key → last4` for the masked display (extract `(row.value as { value: string }).value`, take `.slice(-4)`). Pass the record as prop to `SettingsForm`. Throw descriptively if Supabase query fails.

3. **Create `settings-form.tsx`** — `'use client'`. `useActionState(saveSettings, null)` pattern. Four sections (one Card per logical group: "API Keys" + "Affiliate Tags" or group all four in two cards). For each field: if the key is in the masked-display record, render a `<p className="text-sm text-muted-foreground">Currently set (ends in {last4})</p>` below the label — never in the input. Input `defaultValue` is always `""` (empty). Submit button shows "Saving…" when `isPending`. On `state.success`, show a success banner. On `state.errors._form`, show an error banner.

4. **Wire `SETTINGS_KEYS` as a shared constant** — export it from `actions.ts` so `page.tsx` imports it from the same file (avoids duplicating the key list). Both files are in the same directory; no circular dependency.

5. **Verify typecheck** — `cd /home/daniel/monster && pnpm --filter admin tsc --noEmit`. Fix any type errors before proceeding.

6. **Verify route + reload** — `pnpm -r build && pm2 reload monster-admin && sleep 3 && curl -sI http://localhost:3004/settings | head -3`. Confirm 307 (auth guard = no 500).

## Must-Haves

- [ ] `upsert` uses `{ onConflict: 'key' }` — without it, behavior is undefined
- [ ] Value stored as `{ value: rawString }` JSON object, not raw string (D028)
- [ ] `updated_at` set explicitly in application code: `new Date().toISOString()` (D016)
- [ ] `revalidatePath('/settings')` called before `return { success: true }`
- [ ] No `redirect()` call anywhere in the action
- [ ] Empty submitted fields are skipped — only upsert keys with non-empty values
- [ ] Real key value never placed in input `defaultValue`, `value`, or any prop that renders to HTML
- [ ] Service client imported from `@/lib/supabase/service` — never from `@monster/db` directly
- [ ] `tsc --noEmit` exits 0

## Verification

- `pnpm --filter admin tsc --noEmit` → exits 0, no output
- `pnpm -r build` → settings route appears in route table, no build errors
- `pm2 reload monster-admin && sleep 3 && curl -sI http://localhost:3004/settings` → `HTTP/1.1 307`
- Manual browser round-trip: save a key → reload → masked indicator shown → Supabase dashboard confirms `{ "value": "..." }` JSON in `value` column
- `view-source` on the settings page after saving: no raw key value in HTML

## Observability Impact

- Supabase upsert error → thrown with `key` name + Supabase message + code → pm2 logs `monster-admin`
- Settings fetch error → thrown "Failed to fetch settings: {message}" → Next.js error boundary
- Supabase dashboard `settings` table → ground truth: inspect `value` column shape and `updated_at` after save

## Inputs

- `apps/admin/src/app/(dashboard)/sites/actions.ts` — server action pattern to copy (file-level `'use server'`, `useActionState`-compatible signature, return vs throw distinction)
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `useActionState` client form wrapper pattern
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — server component that reads from Supabase and passes data to JSX
- `apps/admin/src/lib/supabase/service.ts` — canonical service client import
- `packages/db/src/types/supabase.ts` — `settings` Row type: `{ key: string; value: Json; description: string | null; updated_at: string }`
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — existing stub to replace

## Expected Output

- `apps/admin/src/app/(dashboard)/settings/actions.ts` — new: `saveSettings` action + `SETTINGS_KEYS` export + `SaveSettingsState` type
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — replaced stub: server component reading settings + passing masked display data to form
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — new: `'use client'` form with `useActionState`, per-field masked display indicators, success/error banners
