---
estimated_steps: 7
estimated_files: 2
---

# T03: Infra page (server component + TestConnectionButton)

**Slice:** S02 — Admin Infra Health Page
**Milestone:** M010

## Description

Create the `/infra` admin page as an async server component that calls `InfraService.getVps2Health()` and renders a health dashboard with 4 status cards plus a `TestConnectionButton` client component.

## Steps

1. Read `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — note Card/stat patterns used.
2. Create `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` with `'use client'`. `useState` for `loading: boolean`, `result: { ok: boolean, error?: string } | null`. On click: `setLoading(true)`, POST to `/api/infra/test-connection`, `setResult(json)`, `setLoading(false)`. Render: shadcn Button labeled "Test Deploy Connection"; below it a green ✓ or red ✗ badge with error detail if present. Show a spinner (lucide `Loader2 animate-spin`) while loading.
3. Create `apps/admin/src/app/(dashboard)/infra/page.tsx` as `async function Page()`. Import and call `new InfraService().getVps2Health()` inside try/catch. On catch: render an error banner card with the error message.
4. On success: render a page title "Infrastructure" + 4 status cards:
   - "VPS2 Reachability" — green if `health.reachable`, red with `health.error` if not
   - "Caddy Service" — green "active" if `health.caddyActive`, red "inactive" if not
   - "Disk Usage" — gray card with `health.diskUsedPct ?? '—'` percent
   - "Memory" — gray card with `health.memUsedMb ?? '—'` / `health.memTotalMb ?? '—'` MB
5. Below the cards: render `<TestConnectionButton />`.
6. Add `apps/admin/src/app/(dashboard)/infra/` directory (just by creating the files).
7. Run `pnpm build` — verify 0 errors.

## Must-Haves

- [ ] Page renders health cards without crashing when VPS2 is reachable
- [ ] Page renders an error banner (not 500) when VPS2 is unreachable
- [ ] `TestConnectionButton` shows loading state, then pass/fail result
- [ ] `pnpm build` exits 0

## Verification

- `pnpm build` exits 0
- `pnpm typecheck` exits 0
- Human UAT: navigate to /infra → health cards display; click test button → ✓ or ✗ result appears

## Inputs

- `packages/deployment/src/infra.ts` — `InfraService`, `Vps2Health` (from T01)
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — Card pattern reference
- `apps/admin/src/app/api/infra/test-connection/route.ts` — API route to POST to (from T02)

## Expected Output

- `apps/admin/src/app/(dashboard)/infra/page.tsx` — async server component (~80 lines)
- `apps/admin/src/app/(dashboard)/infra/TestConnectionButton.tsx` — client component (~60 lines)
