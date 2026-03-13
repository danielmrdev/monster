# S03: Settings — API Key Management

**Goal:** Replace the 4-line "Coming soon" stub at `/settings` with a fully functional page where the user can save and retrieve API keys (Spaceship, DataForSEO, Claude, Amazon affiliate tag) persisted in the `settings` table via Supabase upsert.
**Demo:** User navigates to `/settings`, sees a "currently set" indicator for any already-stored keys (masked: `••••••XXXX`), types a new key into any field and submits — page reloads, the indicator updates. All four keys round-trip correctly through Supabase. No full key value appears anywhere in the HTML source.

## Must-Haves

- Settings page reads existing keys from `settings` table via service client on every load
- Each key shows a "Currently set (ends in XXXX)" indicator when the DB row exists — never the raw value
- Submitting the form upserts only the fields that have a non-empty value; empty fields are skipped (no-change semantics)
- `upsert` uses `{ onConflict: 'key' }` and stores `{ value: "actual-key" }` JSON per D028
- `updated_at` is set explicitly in application code (not relying on DB DEFAULT) per D016
- `revalidatePath('/settings')` called before returning from the action so the server component re-fetches
- No `redirect()` call — stay on `/settings` after save; action returns `{ success: true }` or `{ errors: {...} }`
- Real key value is never placed in any input's `defaultValue` or `value` — not in server-rendered HTML, not in hydrated state
- `tsc --noEmit` exits 0 after the task completes
- `pm2 reload monster-admin` → `curl -sI http://localhost:3004/settings` returns 307 (auth guard = route resolves, no 500)

## Observability / Diagnostics

- **Upsert failure:** `saveSettings` throws `Failed to upsert setting '${key}': ${message} (code: ${code})` — visible in pm2 logs (`pm2 logs monster-admin --lines 50`), surfaced as Next.js error boundary in browser
- **Fetch failure:** page throws `Failed to fetch settings: ${message}` — Next.js error boundary; inspect pm2 logs
- **Value masking audit:** `view-source` on `/settings` after saving a key — the full API key value must not appear anywhere in the HTML; only `••••` prefix + last-4 visible
- **DB ground truth:** Supabase dashboard → `settings` table → `value` column must contain `{ "value": "..." }` JSON object (not a raw string) after a successful save
- **No-op audit:** submit with all fields empty → no upsert calls, no Supabase writes; row `updated_at` must not change

## Verification

```bash
# Type check
cd /home/daniel/monster && pnpm --filter admin tsc --noEmit

# Build succeeds (confirms no import or export issues)
pnpm -r build 2>&1 | grep -E "(error|Route)" | head -20

# Route resolves (307 = auth guard fires = no 500)
pm2 reload monster-admin && sleep 3 && curl -sI http://localhost:3004/settings | head -3

# Key masking: full value must not appear in server-rendered HTML
# (Manual check after saving a key in the browser: view-source must show no raw key)

# Failure-path diagnostic: trigger a Supabase error by temporarily unsetting service key,
# then check pm2 logs for the structured error message:
#   pm2 logs monster-admin --lines 20
```

Manual verification (browser UAT):
1. Navigate to `/settings` — page renders 4 fields, no errors
2. Enter a test API key in the Claude field, submit — success state shown
3. Reload page — "Currently set (ends in XXXX)" indicator appears; input is empty
4. Check Supabase dashboard `settings` table — row has `{ "value": "sk-ant-test..." }` JSON in `value` column

## Tasks

- [x] **T01: Build settings page, action, and form** `est:45m`
  - Why: Entire slice is one coherent unit — server component (reads + masks), server action (upserts), client form wrapper (useActionState + display). No infrastructure, no new dependencies. Splitting would create a useless intermediate state.
  - Files: `apps/admin/src/app/(dashboard)/settings/page.tsx`, `apps/admin/src/app/(dashboard)/settings/actions.ts`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
  - Do: See T01-PLAN.md
  - Verify: `pnpm --filter admin tsc --noEmit` exits 0; `curl -sI http://localhost:3004/settings` returns 307 after pm2 reload; manual browser round-trip confirms masked display and DB write
  - Done when: All four API key fields save to Supabase, masked display shows on reload, no raw key in HTML source, typecheck passes

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/settings/page.tsx` — replace stub with server component
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — new: saveSettings server action
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — new: 'use client' form wrapper
