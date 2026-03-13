---
slice: S03
parent: M002
title: Settings — API Key Management
date: 2026-03-13
status: complete
---

# S03: Settings — API Key Management — Research

**Date:** 2026-03-13

## Summary

S03 is straightforward: replace the 4-line "Coming soon" stub at `/settings` with a page that saves and retrieves API keys (Spaceship, DataForSEO, Claude, Amazon affiliate tag) to/from the `settings` table. All patterns needed exist verbatim from S01. The `settings` table is already migrated and accessible via the service client. The only non-trivial design decision is the masked display — implemented in the page server component (last 4 chars of the stored value), not in the DB or the action.

No new UI components are needed. All installed components (`Card`, `Input`, `Label`, `Button`) cover the requirements. No new types to define — settings are untyped key/value pairs by design (D028). The action is simpler than `createSite` because there's no Zod schema for the stored values (just `z.string().min(1)` per field) and no redirect on save — stay on the page, show success/error state inline.

The two risk areas are: (1) the `upsert` pattern for the settings table, which has `key text PRIMARY KEY` — Supabase JS `upsert()` with `onConflict: 'key'` handles this correctly; and (2) the masked display not leaking the full value in server-rendered HTML — the masking must happen before the value is passed as a `defaultValue` to the input. The input must show `••••••••XXXX` (masked), not the real key, while still allowing the user to re-enter and save a new value.

## Recommendation

Single-task slice. The settings page is a server component that reads all relevant keys from the `settings` table in one query (`in(['spaceship_api_key', 'dataforseo_api_key', 'claude_api_key', 'amazon_affiliate_tag'])`), builds a record keyed by `key`, passes the masked display value to the form. The form is a `'use client'` wrapper following the exact `useActionState` pattern from S01. The action does a Supabase `upsert` per key that has a non-empty value submitted.

**Key definition choices:**
- `spaceship_api_key` — Spaceship REST API key
- `dataforseo_api_key` — DataForSEO API login (format: `login:password`)
- `claude_api_key` — Anthropic API key (starts with `sk-ant-`)
- `amazon_affiliate_tag` — Default Amazon affiliate tag (per-site tags live on the site record)

Do not add a "description" column value — the table schema supports it but it adds noise with no consumer yet.

The masked display strategy: if a key exists in DB, show `••••••••` + last 4 chars as the input placeholder (not defaultValue — the input stays empty so the user types a new key to update). A "currently set" indicator (e.g. a green dot or "Set" badge) communicates that the key is already stored without revealing the value or putting it in the DOM.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Settings table upsert | `supabase.from('settings').upsert({key, value: {value: raw}, updated_at: ...}, {onConflict: 'key'})` | PK is `key text`, upsert merges on conflict — correct pattern for key/value store |
| Service client in server action | `createServiceClient()` from `@/lib/supabase/service` | Canonical import path, bypasses RLS (no policies on settings table) |
| `useActionState` form pattern | Copy from `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` | Inline validation errors, pending state, consistent with all S01 forms |
| Input / Label / Button | Already in `apps/admin/src/components/ui/` | All needed components installed in S01 |
| Card layout | Already in `apps/admin/src/components/ui/card.tsx` | Use to group related API keys into sections |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/sites/actions.ts` — canonical server action pattern: `'use server'` file-level, `useActionState`-compatible `(prevState, formData)` signature, return `{ errors }` on validation failure, throw on DB error. S03 action follows this exactly.
- `apps/admin/src/lib/supabase/service.ts` — single re-export of `createServiceClient`. Import from here, never from `@monster/db` directly in `apps/admin/src/app/`.
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `'use client'` form wrapper with `useActionState`, `FieldError` component, pending state in submit button. Copy/adapt this pattern for the settings form.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — server component that reads from Supabase, passes data to JSX. Same structure for the settings page server component.
- `packages/db/src/types/supabase.ts` — `settings` Row: `{ key: string; value: Json; description: string | null; updated_at: string }`. `value` is typed `Json` — the `{ value: string }` wrapper object is a valid `Json` subtype.

## Constraints

- **RLS on settings table with no policies.** `ALTER TABLE settings ENABLE ROW LEVEL SECURITY` is in migration 001; no `CREATE POLICY` follows. Service role client bypasses RLS — `createServiceClient()` is mandatory for both reads and writes.
- **`value` column is `jsonb`, not `text`.** Must store as `{ value: "actual-key" }` (D028). Read back with `(row.value as { value: string }).value`. Do not store raw strings — the JSONB type would accept them but breaks the explicit read/write contract.
- **Key masking must not put the real value in the DOM.** The input's `defaultValue` must be empty (or the masked display string for a read-only indicator). The real key must never appear in the rendered HTML — even server-rendered HTML is visible in view-source. Use a separate `<p>` or `<Badge>` to show "Currently set (ends in XXXX)" and leave the input empty for new entry.
- **`redirect()` must not be called for settings save.** Settings have multiple fields; redirect would lose context. Stay on `/settings` after save. Use `revalidatePath('/settings')` inside the action to bust the server component cache so the page re-fetches and shows the updated "currently set" indicators.
- **`upsert` updates `updated_at` manually.** The `settings` table has `updated_at timestamptz NOT NULL DEFAULT now()` but the `DEFAULT` only fires on `INSERT`, not `UPDATE`. On upsert (conflict → update path), set `updated_at: new Date().toISOString()` explicitly — same pattern as `updateSite` in S01.
- **Zod v4 API in use.** `"zod": "^4.3.6"` in `apps/admin/package.json`. Use `z.string().min(1, '...')` — not `.nonempty()` which was removed in v4.
- **Settings action saves only non-empty submitted values.** If the user submits an empty field, skip upsert for that key — treat empty = "no change". This lets the user update one key without clearing others.
- **No redirect after save.** Unlike site create/edit, settings stay on the same page. The action returns `{ success: true }` or `{ errors: {...} }`. The form wrapper shows a success message or inline errors.

## Common Pitfalls

- **Storing raw string in JSONB.** `supabase.from('settings').upsert({ key: 'claude_api_key', value: 'sk-ant-...' })` will store a JSON string (valid JSONB), but reading it back with `(row.value as { value: string }).value` will return `undefined` — the value is the string itself, not an object property. Always wrap: `value: { value: rawApiKey }`.
- **Putting the real key in the input's `defaultValue`.** Server-rendered `defaultValue` appears verbatim in the HTML source. Show the masked display separately; keep the input empty.
- **Calling `redirect()` in the action.** Settings save should return state, not redirect. `redirect()` throws internally and breaks `useActionState` — the client won't receive the returned state.
- **Missing `revalidatePath('/settings')`before returning.** Without it, the server component re-renders with stale data from the Next.js cache; the "currently set" indicators won't update until the cache expires. Call `revalidatePath('/settings')` before `return { success: true }`.
- **Using anon session client.** `lib/supabase/server.ts` → anon client. RLS blocks all operations on `settings` for anon. Always use `createServiceClient()` from `@/lib/supabase/service`.
- **`upsert` without `onConflict`.** The Supabase JS client v2 requires `{ onConflict: 'key' }` option for upsert to correctly identify the conflict target. Without it, behavior is undefined. The `key` column is the PK — this is the correct conflict target.

## Open Risks

- **`upsert` in Supabase JS v2 behavior confirmation.** The `supabase.from('settings').upsert(data, { onConflict: 'key' })` pattern is documented for Supabase JS v2 but not yet exercised in this codebase (S01/S02 used insert/update on sites). Low risk — standard Supabase pattern — but the first settings write should be verified via Supabase dashboard row inspection, same as S01's DB round-trip confirmation.
- **Multiple key save atomicity.** If the action saves 4 keys sequentially (one upsert per key), a partial failure leaves some keys saved and some not. For Phase 1 with 4 keys on a managed Supabase instance, this risk is acceptable — no atomic transaction needed. If any upsert fails, the action throws (same as S01 DB error pattern) and the error boundary catches it.
- **`dataforseo_api_key` format is `login:password`.** DataForSEO uses HTTP Basic auth with login and password as a colon-separated string. The settings form stores this as a single value — the input label should clarify this format to avoid user confusion. Risk: minor UX, not a technical blocker.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js server actions | (pattern established in S01) | installed via S01 patterns — no skill needed |
| Supabase JS v2 | (pattern established in S01/S02) | installed via S01/S02 patterns — no skill needed |

No new skills needed. All patterns are established and verified in S01/S02.

## Sources

- `settings` table schema: `packages/db/supabase/migrations/20260313000001_core.sql` — `key text PRIMARY KEY`, `value jsonb NOT NULL`, RLS enabled, no policies
- `settings` generated types: `packages/db/src/types/supabase.ts` — `Row.value: Json`, `Insert.value: Json`
- Storage format D028: `DECISIONS.md` — API keys stored as `{"value": "actual-key-here"}` in JSONB column
- Server action pattern: `apps/admin/src/app/(dashboard)/sites/actions.ts` — canonical S01 pattern
- Service client import: `apps/admin/src/lib/supabase/service.ts` — canonical re-export
- S01 Forward Intelligence: shadcn Select unusable in server action forms; `useActionState` required from the start for inline errors
- Supabase JS upsert: standard v2 API — `upsert(data, { onConflict: 'column' })` (source: Supabase docs pattern, confirmed by `@supabase/supabase-js: ^2.0.0` in package.json)
