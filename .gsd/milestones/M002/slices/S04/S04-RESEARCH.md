---
slice: S04
parent: M002
title: Finances Shell
date: 2026-03-13
status: complete
---

# S04: Finances Shell — Research

**Date:** 2026-03-13

## Summary

S04 is the lowest-risk slice in M002. The `costs` table is already migrated and seeded with five `cost_categories`. All patterns needed — server actions, service client, `useActionState`, `Card`/`Table`/`Badge` components, `NativeSelect` for dropdowns — are fully established by S01/S03. This is a straightforward application of proven patterns to a new data surface.

The slice has two parts: (1) a cost entry form that writes to the `costs` table with full Zod validation, and (2) a cost list that reads all rows back from Supabase with their category name joined. Revenue section is a static "Coming soon" placeholder per D030. No new UI components need installing — everything required is already in `apps/admin/src/components/ui/`.

One non-trivial decision: `costs` has a `site_id` nullable FK. The form needs a site selector (optional), which means fetching all sites for a `<select>`. This is a server component load — the form page fetches both costs and sites from Supabase before render, passes data as props to the `'use client'` form component. This matches the `settings/page.tsx` + `settings-form.tsx` / `sites/[id]/edit/page.tsx` + `edit-form.tsx` pattern exactly.

## Recommendation

Build in two tasks:
1. **T01 — `addCost` server action + Zod schema + form page** — server component page fetches sites list + costs list; passes sites to `CostForm` client component; `addCost` writes to DB, `revalidatePath('/finances')`, no redirect (stay on page to add more). Returns errors for inline display.
2. **T02 — Cost list + layout** — cost list rendered as a `Table` below the form; revenue placeholder section beneath that. Single `/finances/page.tsx` server component owns the layout and data fetching.

No need for a `constants.ts` sibling — there are no shared constants arrays that need to be exported from a `'use server'` file (D034 pitfall applies only when a `'use server'` action file exports non-async values). Cost categories come from the DB at load time, not from a hardcoded array.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Service client for DB reads/writes | `createServiceClient()` from `@/lib/supabase/service` | Canonical import path established in S01. Bypasses RLS. Never import from `@monster/db` directly in `apps/admin/src/app/`. |
| Form with inline validation | `useActionState` + `'use client'` wrapper component pattern | Established in S01 (`SiteForm`, `EditForm`) and S03 (`SettingsForm`). Copy the structure verbatim. |
| Dropdown for category_slug | Native `<select>` with Tailwind | shadcn Select (Base UI) doesn't emit FormData values. NativeSelect pattern established in S01 — same applies to category and period dropdowns. |
| Table for cost list | `Table`, `TableHeader`, `TableBody`, etc. from `@/components/ui/table` | Already installed. Identical to Sites list pattern. |
| Card wrapper | `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card` | Already installed. Use for form sections and list wrapper. |
| Input/Label | `Input`, `Label` from `@/components/ui/input`, `@/components/ui/label` | Already installed. Standard field pattern. |
| Amount field | Native `<input type="number" step="0.01" min="0">` | No special component needed. Zod validates as `z.coerce.number().positive()`. |
| Date field | Native `<input type="date">` | FormData returns string in `YYYY-MM-DD` format — matches `costs.date` (Postgres `date` type). |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/settings/actions.ts` — canonical S03 server action: `'use server'` at file level, `useActionState`-compatible `(prevState, formData)` signature, return `{ success: true }` on success (no redirect — stay on page), throw on DB error, `revalidatePath()` after upsert.
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — canonical pattern for server component that loads data, passes to `'use client'` form. Exactly what the Finances page needs: load costs + sites, pass to form component.
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — `useActionState` + success banner + per-field `FieldError` + form-level error banner. Copy this structure for `CostForm`.
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `NativeSelect` helper component with Tailwind styling. Reuse the exact same pattern for category_slug and period dropdowns.
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — `Table` + `Card` list rendering with empty state. Cost list follows the same layout.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — `Promise.all` for parallel Supabase queries. The Finances page can do this to fetch costs + sites simultaneously.

## Constraints

- **RLS enabled on `costs` with no permissive policies.** Service role client required for all reads and writes. Same constraint as all other admin tables.
- **`cost_categories` is a lookup table seeded with 5 rows.** Load it from DB at render time, not from a hardcoded array. Query: `supabase.from('cost_categories').select('slug, name')`. This makes category changes transparent without code changes.
- **`costs.site_id` is nullable.** Some costs are portfolio-wide (hosting, AI). The site selector in the form must have a "Portfolio-wide" empty option that maps to `null` on insert.
- **`costs.amount` is `numeric` in Postgres, typed as `number` in generated types.** Use `z.coerce.number().positive('Amount must be positive')` to parse the string from FormData.
- **`costs.date` is a Postgres `date`.** FormData returns `YYYY-MM-DD` string from `<input type="date">`. Insert directly as string — Supabase accepts ISO date strings for `date` columns.
- **`costs.currency` defaults to `'EUR'` in the DB.** Form should pre-select EUR but allow override. Keep it simple: `<input name="currency" defaultValue="EUR">` or a small native select with EUR/USD/GBP.
- **`costs.period` is nullable.** Values: `'one-time'`, `'monthly'`, `'annual'`, or null. Native select with empty option → null on insert.
- **`costs.description` is nullable text.** Optional free-text field. Map empty string → null before insert.
- **No `updated_at` on `costs`.** Schema has only `created_at`. D016 (application sets `updated_at`) doesn't apply here — `costs` has no update flow in S04, only insert.
- **No delete in S04 scope.** S04 is a shell: add + list only. Delete/edit deferred to M008 when full finances management is built.
- **`revalidatePath('/finances')` not `redirect()`** — after adding a cost, stay on the page (like settings save). This lets users add multiple costs in sequence. Use success banner pattern from `SettingsForm`.
- **D034 trap is NOT present here.** `addCost` action file exports only async functions — no const arrays. Cost categories come from the DB, not from a constant in the action file. No sibling `constants.ts` needed.

## Common Pitfalls

- **Empty string → null for nullable fields.** `description`, `site_id`, `period` must be converted: `(formData.get('description') as string) || null`. Don't insert empty strings into nullable text/uuid columns.
- **`site_id` must be a valid UUID or null.** An empty string from the select `value=""` must map to `null`, not `""`. Do: `const siteId = (formData.get('site_id') as string) || null`.
- **`amount` comes from FormData as string.** Use `z.coerce.number()` not `z.number()` — FormData values are always strings, and `z.number()` will fail without coercion.
- **`cost_categories` rows should be fetched fresh.** Don't hardcode the 5 category slugs in the form — fetch from DB. If seeding changes, the form stays correct without a code change.
- **`redirect()` inside try/catch swallows it.** S04 doesn't use `redirect()` anyway (stays on page), but document for pattern consistency.
- **`sites` list for the optional site selector.** Fetch only `id, name` — don't fetch full site rows for a selector. Order by name for UX.
- **shadcn Select in the form.** Same trap as S01: Base UI Select is a headless JS component; FormData.get() returns null. Use native `<select>` with the `NativeSelect` Tailwind wrapper pattern.
- **`revalidatePath` placement.** Call before returning `{ success: true }`. Not inside a try/catch that wraps redirect (no redirect here, but habit matters).

## Open Risks

- **`cost_categories` query adding an extra DB roundtrip.** The Finances page will make 3 parallel queries (costs, sites, cost_categories). All are simple selects — no joins, no aggregates. Should complete well within Next.js timeout limits. Not a real risk, just worth noting.
- **Amount display formatting.** The cost list will show raw `amount` numbers from Supabase (e.g. `29.99`). No currency formatting library is installed. Use `toLocaleString('en', {style:'currency', currency: row.currency})` inline. This works without an external package.
- **Revenue section placeholder.** D030 explicitly defers revenue to M008. The placeholder must be clearly labeled "Coming soon" without broken UI. A simple `Card` with a muted message is sufficient — no stub data, no skeleton.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js Server Actions | (established in S01) | no new skill needed — patterns fully established |
| Supabase client | (established in S01) | no new skill needed |
| shadcn/ui + Tailwind v4 | frontend-design skill installed | installed — use if needed for UX polish |

No new skills needed for S04. All patterns are fully established.

## Sources

- `costs` table schema: `packages/db/supabase/migrations/20260313000006_finances.sql` — confirmed fields, types, constraints, nullable columns
- `costs` typed rows: `packages/db/src/types/supabase.ts` — `Tables<'costs'>` Row/Insert/Update types confirmed
- `cost_categories` seeded: migration 006 — 5 slugs: hosting, domains, ai, tools, other
- Server action pattern: `apps/admin/src/app/(dashboard)/settings/actions.ts` — canonical S03 pattern (no redirect, success return, revalidatePath)
- Form pattern: `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — `useActionState`, success banner, FieldError
- NativeSelect pattern: `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — native `<select>` styled with Tailwind
- Table + Card list pattern: `apps/admin/src/app/(dashboard)/sites/page.tsx`
- D030: Finances shell scope — cost entry + list only, revenue = static placeholder (source: DECISIONS.md)
- D034: `'use server'` files can only export async functions (source: DECISIONS.md — confirmed in S03)
- D029/D033: NavItem active state — `/finances` will highlight correctly with the existing `startsWith` logic (source: DECISIONS.md)
