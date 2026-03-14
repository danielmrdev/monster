# S04: Finances Shell

**Goal:** User can add a cost entry via a form that writes to the `costs` table; the cost list displays existing records fetched from Supabase; revenue section shows a "coming soon" placeholder.
**Demo:** Navigate to `/finances`, fill in the cost form (category, amount, date, optional notes/site), submit — entry appears in the cost list below without a page reload/redirect. Revenue section below shows a static placeholder card.

## Must-Haves

- `addCost` server action validates input with Zod (coerce amount, nullable site_id/period/description), writes to `costs` table via service client, calls `revalidatePath('/finances')`, returns `{ success: true }` (no redirect — stay on page)
- Cost categories loaded from `cost_categories` DB table at render time (not hardcoded)
- Sites list loaded from DB for optional site selector (`id, name` only)
- `CostForm` client component uses `useActionState` pattern from S01/S03; shows success banner after add; per-field inline errors
- Cost list renders all rows from `costs` table (joined with category name) in a shadcn `Table` inside a `Card`; empty state when no rows
- Revenue section: a `Card` with "Coming soon" label — no stub data, no broken UI
- `/finances/page.tsx` is a server component that fetches costs, sites, and cost_categories in parallel via `Promise.all` and passes data as props to `CostForm`
- `pnpm --filter @monster/admin tsc --noEmit` exits 0
- `pnpm -r build` exits 0 with `/finances` route in the output table
- `pm2 reload monster-admin` + `curl -sI http://localhost:3004/finances` returns HTTP 200 (or 307 → /login — route resolves without 500)

## Verification

- `pnpm --filter @monster/admin tsc --noEmit` → exits 0, no output
- `pnpm -r build` → exits 0; `/finances` appears in route table
- `pm2 reload monster-admin` → pm2 shows `monster-admin` online, 0 restarts
- `curl -sI http://localhost:3004/finances` → HTTP 200 or 307 (no 500)
- `pm2 logs monster-admin --lines 20` → no error lines after reload

## Tasks

- [x] **T01: `addCost` server action + `CostForm` client component + `/finances/page.tsx`** `est:40m`
  - Why: Core data path — without this, costs can't be written or read. Establishes the full server component → server action → DB round-trip for this page.
  - Files: `apps/admin/src/app/(dashboard)/finances/actions.ts`, `apps/admin/src/app/(dashboard)/finances/cost-form.tsx`, `apps/admin/src/app/(dashboard)/finances/page.tsx`
  - Do:
    1. Create `actions.ts` with `'use server'` directive. Define `AddCostSchema` with `z.coerce.number().positive()` for amount, `z.string().min(1)` for category_slug and date, optional strings for period/description/currency (default EUR), optional UUID for site_id (map empty string → null). Action signature: `(prevState, formData) => Promise<{ success?: boolean; errors?: Record<string, string[]> }>`. Validate with safeParse, return `{ errors }` on failure. On success: insert into `costs` via `createServiceClient()`, call `revalidatePath('/finances')`, return `{ success: true }`. Throw on DB error with context.
    2. Create `cost-form.tsx` as `'use client'`. Use `useActionState(addCost, {})`. Fields: category_slug (native `<select>` from `categories` prop), amount (`<input type="number" step="0.01" min="0">`), date (`<input type="date">`), currency (native `<select>` with EUR/USD/GBP, default EUR), period (native `<select>` with empty option + one-time/monthly/annual), site_id (native `<select>` with "Portfolio-wide" empty option + sites from prop), description (`<textarea>`). Success banner when `state.success`. Per-field `FieldError` components matching S03 pattern. Submit button.
    3. Create `page.tsx` as async server component. Fetch in parallel: `costs` (all rows, `order('created_at', { ascending: false })`), `cost_categories` (`select('slug, name')`), `sites` (`select('id, name').order('name')`). All via `createServiceClient()`. Pass categories + sites to `CostForm`. Render cost list (Table) and revenue placeholder below the form. Inline the cost list rows directly in the page (no separate component needed for a simple table).
  - Verify: `pnpm --filter @monster/admin tsc --noEmit` exits 0; `pnpm -r build` shows `/finances` in route table
  - Done when: typecheck passes, build succeeds, no DB import violations (`grep -r "from '@monster/db'" apps/admin/src/app/` returns nothing new)

- [x] **T02: Cost list table + revenue placeholder + pm2 verification** `est:20m`
  - Why: Completes the visible UI — form alone isn't sufficient for the slice demo. Revenue placeholder closes the page layout. pm2 verification confirms operational readiness.
  - Files: `apps/admin/src/app/(dashboard)/finances/page.tsx`
  - Do:
    1. In `page.tsx`, below `CostForm`, render a `Card` with `CardHeader` ("Cost History") and `CardContent`. Inside: shadcn `Table` with columns: Date, Category, Site, Amount, Notes. Each `costs` row maps to a `TableRow`. Amount formatted with `toLocaleString('en', { style: 'currency', currency: row.currency })`. Site column shows site name if `site_id` is set, "Portfolio-wide" otherwise. Empty state row ("No cost entries yet") when costs array is empty.
    2. Below the cost history card, render a second `Card` with a "Revenue" heading and a muted paragraph: "Revenue tracking coming soon. Amazon Associates manual CSV import will be available in a future update."
    3. Reload pm2 and verify: `pm2 reload monster-admin`, wait for online status, `curl -sI http://localhost:3004/finances`. Check `pm2 logs monster-admin --lines 20` for errors.
  - Verify: `pm2 reload monster-admin` → online, 0 restarts; `curl -sI http://localhost:3004/finances` → 200 or 307; `pm2 logs` clean
  - Done when: All slice-level verification commands pass (typecheck, build, pm2, curl)

## Observability / Diagnostics

**Runtime signals:**
- DB insert errors → thrown as `Failed to add cost: {message}` → surfaced in `pm2 logs monster-admin`
- Zod validation errors → returned as `{ errors }` to client, rendered inline — no server log entry (by design)
- Page-level fetch errors → thrown as `Failed to fetch costs/categories/sites: {message}` → Next.js error boundary → `pm2 logs monster-admin`

**Inspection surfaces:**
- `pm2 logs monster-admin --lines 20` — primary runtime error surface after deploy
- `curl -sI http://localhost:3004/finances` — HTTP 200 confirms page resolves; 500 indicates a DB or import error
- Browser dev tools → Network tab → server action POST (`/finances`) → response body shows `{ errors }` or `{ success: true }`

**Failure visibility:**
- All DB errors include `error.message` from Supabase client — surfaced in pm2 logs with context string
- Validation failures are client-visible as inline field errors — not logged server-side (expected; no PII in error messages)
- Missing `SUPABASE_SERVICE_ROLE_KEY` → descriptive throw from `createServiceClient()` at first call → pm2 logs

**Redaction:**
- `description` field may contain user-entered notes — never log field values, only error codes/messages
- No secrets or credentials flow through this module

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/finances/actions.ts` — new
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — new
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — replaces stub
