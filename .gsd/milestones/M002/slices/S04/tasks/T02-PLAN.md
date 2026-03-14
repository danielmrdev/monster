---
estimated_steps: 3
estimated_files: 1
---

# T02: Cost list table + revenue placeholder + pm2 verification

**Slice:** S04 — Finances Shell
**Milestone:** M002

## Description

Complete the Finances page layout by verifying the cost list table and revenue placeholder are correctly rendered in `page.tsx`, then validate operational readiness: `pm2 reload`, `curl`, and log inspection. T01 writes the page code; T02 confirms it works end-to-end in the running process and the slice is shippable.

This task exists because the page layout details (table columns, empty state, revenue card copy) need explicit review after T01, and because pm2/curl verification requires the built artifact — it's a natural checkpoint after the build step in T01.

## Steps

1. **Review `page.tsx` layout completeness** — verify the cost list table has correct columns (Date, Category, Site, Amount, Notes), amount uses `toLocaleString` with the row's currency, site column shows name or "Portfolio-wide", and empty state is rendered when `costs` is empty. Verify revenue placeholder card exists with clear "coming soon" messaging. Fix any gaps.

2. **Build and reload** — run `pnpm -r build`. Confirm `/finances` appears in the Next.js route table with no build errors. Run `pm2 reload monster-admin`. Wait for `online` status.

3. **Verify** — `curl -sI http://localhost:3004/finances` → 200 or 307 (no 500). `pm2 logs monster-admin --lines 20` → no error lines. Confirm `pnpm --filter @monster/admin tsc --noEmit` exits 0.

## Must-Haves

- [ ] Cost list table renders with Date / Category / Site / Amount / Notes columns
- [ ] Amount formatted with `toLocaleString` using the row's `currency` field
- [ ] Site column shows site name (if `site_id` set) or "Portfolio-wide"
- [ ] Empty state row when `costs` array is empty
- [ ] Revenue placeholder card present with "coming soon" text
- [ ] `pm2 reload monster-admin` → process online, 0 restarts
- [ ] `curl -sI http://localhost:3004/finances` → HTTP 200 or 307 (not 500)
- [ ] `pm2 logs monster-admin --lines 20` → no error lines after reload

## Verification

- `pnpm --filter @monster/admin tsc --noEmit` → exits 0
- `pnpm -r build` → exits 0; `/finances` in route table
- `pm2 reload monster-admin && pm2 show monster-admin | grep status` → `online`
- `curl -sI http://localhost:3004/finances | head -1` → `HTTP/1.1 200 OK` or `HTTP/1.1 307`
- `pm2 logs monster-admin --lines 20` → no `Error` or `TypeError` lines

## Inputs

- `apps/admin/src/app/(dashboard)/finances/page.tsx` — produced by T01; this task reviews and finalizes it
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — reference for Table + empty state rendering pattern
- T01 build success (typecheck must pass before pm2 reload)

## Expected Output

- `apps/admin/src/app/(dashboard)/finances/page.tsx` — finalized with correct table layout + revenue placeholder
- Operational verification: pm2 online, curl 200/307, clean pm2 logs
- Slice complete: all S04 must-haves satisfied

## Observability Impact

**Signals this task changes:**
- `pm2 logs monster-admin` — after reload, page-level fetch errors (costs/categories/sites DB failures) surface here with the `Failed to fetch …` prefix established in T01. A clean log after reload confirms the route is healthy.
- HTTP status on `curl -sI http://localhost:3004/finances` — 200/307 = page resolves; 500 = DB or import error visible in pm2 logs.

**How a future agent inspects this task:**
1. `pm2 logs monster-admin --lines 30` — look for `Failed to fetch costs/categories/sites` lines.
2. `curl -sI http://localhost:3004/finances | head -1` — confirm HTTP status.
3. `pm2 show monster-admin | grep status` — confirm process online, 0 unexpected restarts.

**Failure state visibility:**
- Build failure → `pnpm -r build` exits non-zero; error in stdout with file + line.
- DB error at page load → pm2 log shows `Failed to fetch …: {message}` from the Supabase client; Next.js error boundary returns 500.
- TypeScript error → `tsc --noEmit` exits non-zero with file + line; never reaches pm2 reload.
