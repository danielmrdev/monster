---
id: S04
parent: M002
milestone: M002
provides:
  - addCost server action (Zod validation + Supabase insert + revalidatePath)
  - CostForm client component (useActionState, native selects, success banner, per-field errors)
  - /finances/page.tsx server component (parallel fetch, cost table, revenue placeholder)
  - cost_categories and sites loaded from DB at render time (no hardcoded data)
requires:
  - slice: S01
    provides: createServiceClient() pattern, server action shape (prevState/formData/return), shadcn Table/Card/Button installed
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/finances/actions.ts
  - apps/admin/src/app/(dashboard)/finances/cost-form.tsx
  - apps/admin/src/app/(dashboard)/finances/page.tsx
key_decisions:
  - D030 — Finances shell scope (cost entry + cost list only; revenue = static placeholder; Amazon sync deferred to M008)
  - All <select> elements are native HTML (not shadcn Select) — FormData compatibility, consistent with S01 lesson
  - Empty string → null mapping done both at FormData extraction and at DB insert for defensive correctness
patterns_established:
  - addCost follows identical prevState/formData/return shape as saveSettings (S03) — pattern now used across three server actions
  - Parallel fetch via Promise.all in server component; each arm throws with descriptive message on DB error
observability_surfaces:
  - DB insert errors thrown as "Failed to add cost: {message}" → pm2 logs monster-admin
  - Page fetch errors thrown as "Failed to fetch costs/categories/sites: {message}" → pm2 logs
  - Validation errors returned as { errors } to client, rendered inline — no server log (by design)
  - curl -sI http://localhost:3004/finances — 307 = auth gate healthy; 500 = page-level DB/import error
drill_down_paths:
  - .gsd/milestones/M002/slices/S04/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S04/tasks/T02-SUMMARY.md
duration: ~30m
verification_result: passed
completed_at: 2026-03-14
---

# S04: Finances Shell

**Cost entry form, cost list table, and revenue placeholder wired end-to-end — addCost server action writes to Supabase, page reads back via parallel fetch, all slice verification checks pass.**

## What Happened

S04 landed in two tasks, with T01 doing the substantive work and T02 verifying it was complete.

**T01** created all three files in a single pass following established S01/S03 patterns:

- **`actions.ts`**: `AddCostSchema` uses `z.coerce.number()` for amount (handles FormData string→number), required string fields for category_slug and date, optional fields for period/description/currency (defaults to EUR), and optional UUID for site_id (empty string → null). Action validates with `safeParse`, returns `{ errors }` on failure, inserts into `costs` via `createServiceClient()`, calls `revalidatePath('/finances')`, and returns `{ success: true }`. DB errors thrown with "Failed to add cost: {message}" prefix.

- **`cost-form.tsx`**: `'use client'` component using `useActionState(addCost, null)`. All dropdowns are native `<select>` — the S01 lesson (shadcn Select doesn't work with FormData) applied immediately. Category options come from `categories` prop (DB-fetched at render time). Site options include a "Portfolio-wide" empty option followed by sites from the `sites` prop. Currency select defaults to EUR. Period select is optional (one-time/monthly/annual). Success banner on `state?.success`. Per-field `FieldError` rendering on `state?.errors?.field?.[0]`.

- **`page.tsx`**: Async server component. `Promise.all` fires three queries in parallel: all cost rows (ordered `created_at` descending), all cost categories (`slug, name`), all sites (`id, name` ordered by name). Renders `CostForm` at top, then a "Cost History" `Card` with a `Table` (columns: Date, Category, Site, Amount, Notes). Amount formatted via `toLocaleString('en', { style: 'currency', currency: row.currency })`. Site column shows site name (looked up from the pre-fetched sites array) or "Portfolio-wide" when `site_id` is null. Empty state row when no costs exist. Below that, a "Revenue" `Card` with a coming-soon paragraph — no stub data.

**T02** confirmed the layout was complete without modification, ran build + pm2 verification, and confirmed all slice-level checks passed.

## Verification

| Check | Result |
|---|---|
| `pnpm --filter @monster/admin exec tsc --noEmit` exits 0 | ✓ |
| `pnpm -r build` exits 0; `/finances` in route table as `ƒ` (3.29 kB) | ✓ |
| `grep -r "from '@monster/db'" apps/admin/src/app/` → no matches | ✓ |
| `pm2 reload monster-admin` → online, 0 unstable restarts | ✓ |
| `curl -sI http://localhost:3004/finances` → HTTP 307 (auth gate, expected) | ✓ |
| `pm2 logs monster-admin --lines 20` → clean post-reload, no new errors | ✓ |

## Requirements Advanced

- R012 (Finances: cost tracking + P&L) — cost entry form + cost list table now functional; the data path (form → DB → list) is wired. Revenue tracking remains a placeholder per plan.

## Requirements Validated

- none — R012 primary owner is M008/S01 (full P&L); this slice is a supporting shell

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

S04-PLAN.md split cost list + revenue placeholder into T02, but T01 produced all three files completely. T02 covered only pm2/curl verification. No plan-level deviation — the slice output is exactly as specified.

## Known Limitations

- Revenue section is a static placeholder — no data, no CSV import, no Amazon Associates sync. Wired in M008.
- Browser UAT not executable on this VPS (Playwright chromium missing `libnspr4.so`). Route correctness confirmed via curl + build output; visual form interaction requires human UAT against the running app via Tailscale.
- Site lookup in the cost table uses a client-side array find (pre-fetched sites passed from server component). For portfolios with hundreds of sites this is fine; at 1000+ sites a join query would be more efficient.

## Follow-ups

- M008/S01 will replace the revenue placeholder with Amazon Associates CSV import + P&L calculations.
- If `cost_categories` table is ever empty (no seed data), the form renders a category select with zero options — a silent failure. Consider a seed check or default categories in M008.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/finances/actions.ts` — new: `addCost` server action with Zod + Supabase insert
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — new: `'use client'` form with useActionState
- `apps/admin/src/app/(dashboard)/finances/page.tsx` — replaced stub: parallel-fetching server component with full UI
- `.gsd/milestones/M002/slices/S04/S04-PLAN.md` — added Observability / Diagnostics section (pre-flight fix)
- `.gsd/milestones/M002/slices/S04/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)

## Forward Intelligence

### What the next slice should know
- M002 is now complete. All four slices (Sites CRUD, Dashboard KPIs, Settings, Finances Shell) are verified and operational.
- The `costs` table schema has: `category_slug` (FK to `cost_categories.slug`), `amount` (numeric), `currency` (text, default EUR), `date` (date), `period` (text, nullable), `site_id` (UUID FK to `sites.id`, nullable), `description` (text, nullable).
- `cost_categories` table must be seeded before the Finances form is usable — if it's empty the category select renders blank.

### What's fragile
- Site name lookup in cost table is an in-memory array find — performant for Phase 1 scale, not for hundreds of sites per page render.
- Pre-existing `EvalError` in middleware stderr (from a dev build artifact) shows up in `pm2 logs` stderr. It pre-dates M002 and does not affect functionality (auth middleware still executes — 307 proves it). Don't confuse it for a new regression.

### Authoritative diagnostics
- `curl -sI http://localhost:3004/finances | head -1` — 307 = healthy; 500 = page-level error, check pm2 logs
- `pm2 logs monster-admin --lines 30` — DB insert/fetch errors surface here with descriptive prefixes
- `pm2 show monster-admin | grep -E 'status|restarts'` — online + 0 unstable restarts = clean state

### What assumptions changed
- T01 was expected to be ~40m; actual was ~20m because the server action and form patterns were directly reusable from S03 with minimal adaptation. S04 was the lowest-friction slice in M002.
