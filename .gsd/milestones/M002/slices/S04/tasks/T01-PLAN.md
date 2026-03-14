---
estimated_steps: 3
estimated_files: 3
---

# T01: `addCost` server action + `CostForm` client component + `/finances/page.tsx`

**Slice:** S04 — Finances Shell
**Milestone:** M002

## Description

Wire the complete data path for the Finances page: server action that validates and inserts cost entries, a `'use client'` form component that uses `useActionState` for inline errors and success feedback, and a server component page that fetches costs/categories/sites in parallel and renders everything together. This is the same established pattern from S01 (`SiteForm` + `createSite`) and S03 (`SettingsForm` + `saveSettings`) applied to the `costs` table.

## Steps

1. **Create `actions.ts`** — `'use server'` at file level. Define `AddCostSchema`:
   - `category_slug`: `z.string().min(1, 'Category is required')`
   - `amount`: `z.coerce.number().positive('Amount must be positive')`
   - `date`: `z.string().min(1, 'Date is required')`
   - `currency`: `z.string().default('EUR')`
   - `period`: `z.string().optional()` — map empty string to undefined/null before insert
   - `site_id`: `z.string().optional()` — map empty string to null before insert
   - `description`: `z.string().optional()` — map empty string to null before insert

   Export `addCost(prevState: unknown, formData: FormData)` async function:
   - Extract fields from FormData (use `|| null` pattern for nullable fields)
   - `safeParse` → return `{ errors: result.error.flatten().fieldErrors }` on failure
   - `createServiceClient().from('costs').insert({ category_slug, amount, date, currency, period: period || null, site_id: site_id || null, description: description || null })`
   - On DB error: throw `new Error(\`Failed to add cost: \${error.message}\`)`
   - `revalidatePath('/finances')`
   - Return `{ success: true }`

2. **Create `cost-form.tsx`** — `'use client'` component. Props: `categories: { slug: string; name: string }[]`, `sites: { id: string; name: string }[]`. Use `useActionState(addCost, {})` — imports action from `./actions`. Form fields (all using native HTML elements — no shadcn Select):
   - Category: native `<select name="category_slug">` populated from `categories` prop; required
   - Amount: `<input type="number" name="amount" step="0.01" min="0" required>`
   - Date: `<input type="date" name="date" required>` (YYYY-MM-DD string → Postgres `date` column directly)
   - Currency: native `<select name="currency">` with EUR/USD/GBP, defaultValue "EUR"
   - Period: native `<select name="period">` with empty option ("One-time or N/A") + one-time/monthly/annual
   - Site: native `<select name="site_id">` with first option value="" label "Portfolio-wide" + sites from prop
   - Description: `<textarea name="description">` optional

   Show success banner ("Cost entry added") when `state.success`. Show per-field errors using `FieldError` pattern from `settings-form.tsx` (`state.errors?.field?.[0]`). Submit button labeled "Add Cost Entry".

   Wrap form in a `Card` with `CardHeader` ("Add Cost Entry") and `CardContent`.

3. **Create/replace `page.tsx`** — async server component. Fetch in parallel:
   ```ts
   const [costsResult, categoriesResult, sitesResult] = await Promise.all([
     supabase.from('costs').select('*').order('created_at', { ascending: false }),
     supabase.from('cost_categories').select('slug, name'),
     supabase.from('sites').select('id, name').order('name'),
   ])
   ```
   Throw on any DB error. Pass `categories` and `sites` to `<CostForm>`. Render cost list table and revenue placeholder below (inline in the page component — no separate component file needed).

   Cost list: `Card` with "Cost History" header, shadcn `Table` with columns Date / Category / Site / Amount / Notes. Map `costs` rows to `TableRow`s. Amount: `row.amount.toLocaleString('en', { style: 'currency', currency: row.currency })`. Site: find site name by `site_id` from sitesResult or show "Portfolio-wide". Empty state: single `TableRow` with a `TableCell colSpan={5}` centered "No cost entries yet."

   Revenue placeholder: `Card` with "Revenue" heading and a muted paragraph about CSV import coming soon.

## Must-Haves

- [ ] `addCost` uses `createServiceClient()` from `@/lib/supabase/service` — never `@monster/db` directly
- [ ] `addCost` file has `'use server'` at file level and exports only async functions (D034)
- [ ] `amount` parsed with `z.coerce.number()` not `z.number()` (FormData values are always strings)
- [ ] `site_id`, `period`, `description` map empty string → null before DB insert (not empty string in nullable columns)
- [ ] All `<select>` elements are native HTML, not shadcn Select (FormData compatibility — S01 lesson)
- [ ] `CostForm` uses `useActionState(addCost, {})` with `(prevState, formData)` action signature
- [ ] `revalidatePath('/finances')` called before returning `{ success: true }` — not inside catch
- [ ] No redirect after successful insert — user stays on page (per D030 scope, same as settings pattern)
- [ ] Page fetches `cost_categories` from DB, not from a hardcoded array
- [ ] `pnpm --filter @monster/admin tsc --noEmit` exits 0
- [ ] `pnpm -r build` exits 0 with `/finances` in route table
- [ ] `grep -r "from '@monster/db'" apps/admin/src/app/` returns nothing new

## Verification

- `pnpm --filter @monster/admin tsc --noEmit` → exits 0, no output
- `pnpm -r build` → exits 0; route table includes `○ /finances`
- `grep -r "from '@monster/db'" apps/admin/src/app/` → empty (no violations)

## Observability Impact

- DB insert errors → thrown with `Failed to add cost: {message}` → surfaced in pm2 logs `monster-admin`
- Zod validation errors → returned as `{ errors }`, rendered inline — no server log entry (expected)
- Page-level fetch errors → thrown `Failed to fetch costs/categories/sites: {message}` → Next.js error boundary → pm2 logs

## Inputs

- `apps/admin/src/app/(dashboard)/settings/actions.ts` — canonical `'use server'` action pattern to copy (prevState/formData signature, return shape, revalidatePath placement)
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — `useActionState` + success banner + `FieldError` pattern to copy verbatim
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `NativeSelect` Tailwind styling pattern for native `<select>` elements
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — `Promise.all` pattern for parallel Supabase queries
- `packages/db/src/types/supabase.ts` — `Tables<'costs'>`, `Tables<'cost_categories'>` types
- `apps/admin/src/lib/supabase/service.ts` — canonical service client import

## Expected Output

- `apps/admin/src/app/(dashboard)/finances/actions.ts` — new: `addCost` server action with Zod validation + DB insert
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — new: `'use client'` form with `useActionState`, all cost fields, success banner, per-field errors
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — replaced: server component fetching costs + categories + sites in parallel, rendering `CostForm` + cost list table + revenue placeholder
