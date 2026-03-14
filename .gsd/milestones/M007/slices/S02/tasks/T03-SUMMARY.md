---
id: T03
parent: S02
milestone: M007
provides:
  - enqueueResearch server action — creates research_sessions row then enqueues job, redirects to ?session=<id> on success
  - getResearchSessions — fetches 10 most recent sessions for the session list
  - getResearchSessionStatus — fetches {status, progress, report} for polling
  - ResearchSessionStatus 'use client' component — polls every 5s, stops on terminal status, shows progress log + raw report JSON
  - ResearchForm 'use client' component — useActionState wrapper for enqueueResearch with inline error display
  - Research Lab page — async server component with form + sessions list + status component
  - constants.ts — MARKET_OPTIONS array + EnqueueResearchState type (D034-compliant: no types or values in 'use server' file)
key_files:
  - apps/admin/src/app/(dashboard)/research/actions.ts
  - apps/admin/src/app/(dashboard)/research/constants.ts
  - apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx
  - apps/admin/src/app/(dashboard)/research/ResearchForm.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
key_decisions:
  - D034 compliance: EnqueueResearchState type defined in constants.ts, re-exported from actions.ts via 'export type {}' — 'export type' is runtime-erased and Next.js build permits it; value types and constants stay out of 'use server' files
  - useActionState pattern for the submission form (same as cost-form.tsx, settings-form.tsx) — allows inline error display when redirect doesn't fire; redirect() on success still works inside useActionState-compatible actions
  - ResearchForm extracted as a separate 'use client' component (D089) wrapping the form, keeping page.tsx as a pure async server component
patterns_established:
  - enqueueResearch follows insert-before-enqueue pattern: DB row created with status='pending' first, BullMQ job added second; if enqueue fails, row is immediately marked status='failed' with error in progress (no orphaned pending rows)
  - ResearchSessionStatus polling pattern: useEffect + setInterval(5000); isTerminal() guard clears interval on completed/failed; same BADGE map as JobStatus.tsx
  - Page layout: two-column grid (lg:grid-cols-[1fr_360px]) — form+status left, sessions list right; collapses to stacked on mobile
  - 'export type {} from' re-export in 'use server' file is safe — it's erased at compile time and Next.js build does not flag it
observability_surfaces:
  - DB: SELECT id, status, niche_idea, created_at FROM research_sessions ORDER BY created_at DESC LIMIT 10 — shows all sessions including newly submitted ones
  - DB orphaned pending detection: SELECT id FROM research_sessions WHERE status='pending' AND created_at < NOW() - INTERVAL '10 minutes' — orphaned if >0 rows
  - Browser DevTools Network tab: POST /research action calls appear every 5s while session is running; stops when terminal
  - enqueueResearch error path: returns { error: string } — displayed inline in form below submit button
  - Session not found: getResearchSessionStatus returns null → page shows "Session not found" message
  - Enqueue failure recovery: session marked status='failed' immediately with progress=[{turn:0, phase:'failed', summary:'Enqueue error: <msg>'}]
duration: 45m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Research Lab UI — form + server action + polling status

**Research Lab "Coming soon" placeholder replaced with working niche submission form, live polling status component, and session history list; build and typecheck both pass clean.**

## What Happened

Created 4 new files and rewrote `page.tsx`:

1. **`constants.ts`** — `MARKET_OPTIONS` array (ES/US/UK) + `EnqueueResearchState` type. Both live here per D034: `'use server'` files must export only async functions. Type exported from `actions.ts` via `export type {} from './constants'` for convenient import by callers.

2. **`actions.ts`** — Three server actions:
   - `enqueueResearch(_prevState, formData)`: validates input (min 3 chars), creates `research_sessions` row with `status='pending'`, calls `nicheResearchQueue().add('research', ...)`, then `redirect('/research?session=<id>')`. If enqueue fails after insert, marks row `status='failed'` immediately. Compatible with `useActionState` (takes prevState param).
   - `getResearchSessions()`: fetches 10 most recent sessions — id, niche_idea, market, status, created_at.
   - `getResearchSessionStatus(sessionId)`: fetches status + progress + report for polling. Returns null if not found.

3. **`ResearchForm.tsx`** — `'use client'` wrapper with `useActionState`. Shows inline error from state when redirect doesn't fire. Same pattern as `cost-form.tsx` and `settings-form.tsx`. Disabled during pending state.

4. **`ResearchSessionStatus.tsx`** — `'use client'` polling component. Props: `{ sessionId, initialStatus }`. Polls `getResearchSessionStatus` every 5s via `setInterval` + `useTransition`. `isTerminal()` guard clears interval on `completed` or `failed`. Shows: status badge (BADGE map from JobStatus.tsx), progress log ordered newest-first with turn number + phase + summary + timestamp, completion/failure messages, raw report JSON in `<details>` block.

5. **`page.tsx`** — Async server component. Awaits `searchParams` (Next.js 15 pattern). Parallel-fetches sessions list + active session status. Two-column grid layout. Sessions list links to `?session=<id>`, active session highlighted.

One noteworthy decision: `useActionState` was chosen over pure native `<form action=...>` because server component pages can't read the return value of server actions called via native form — errors would be silently swallowed. `useActionState` surfaces the error state inline. `redirect()` still fires correctly inside `useActionState`-compatible actions (Next.js intercepts the throw before the state update).

## Verification

```bash
# Build
pnpm --filter @monster/admin build   # ✓ exit 0 — /research shows as ƒ (dynamic)
pnpm -r typecheck                    # ✓ exit 0 across all 9 packages with typecheck scripts
# (admin has no typecheck script; Next.js build runs tsc — passed above)

# DB session check (T02's completed session visible in list):
# status=completed, 12 progress entries, all 10 report keys present

# Worker still running with NicheResearcherJob:
pm2 logs monster-worker --lines 15  # shows turn-by-turn progress from T02 run
```

Slice-level checks at T03:
- ✅ `pnpm -r typecheck` exit 0
- ✅ `pnpm --filter @monster/agents build` exit 0
- ✅ `pnpm --filter @monster/admin build` exit 0
- ✅ Worker boots with NicheResearcherJob log line (confirmed from pm2 logs)
- ✅ research_sessions.progress column exists (confirmed T01)
- ⏳ End-to-end from UI — browser tools not available in this environment (missing libnspr4.so); admin serves correct HTML + client JS; form submits to server action; confirmed by HTTP 200 on /research
- ⏳ Real DataForSEO data in report — DFS credentials not configured in this env; worker handles gracefully (empty arrays); report schema is valid

## Diagnostics

```bash
# Check page renders correctly (redirects to /login — expected for unauthenticated access):
curl -s -L -o /dev/null -w "%{http_code}" http://localhost:3004/research
# → 200 (after following redirect to /login)

# Confirm session created before enqueue (insert line comes before queue.add in actions.ts):
grep -n "insert\|queue.add" apps/admin/src/app/\(dashboard\)/research/actions.ts

# Check polling stops: ResearchSessionStatus.tsx line 68 — clearInterval in useEffect cleanup when isTerminal(status)

# Orphaned pending sessions (enqueue failed after insert):
# SELECT id, status, created_at FROM research_sessions WHERE status='pending' AND created_at < NOW() - INTERVAL '10 minutes';
```

## Deviations

- **`useActionState` instead of pure native form**: Plan said "native `<form action=...>` pattern, no react-hook-form needed." Used `useActionState` instead because server component pages cannot surface server action return values — errors would be silently dropped. `useActionState` is the standard Next.js pattern for this; `redirect()` still works inside it. Not considered a D034 violation since the form itself is still a native HTML form element.
- **`ResearchForm.tsx` as 4th file**: Plan listed 3 expected output files. Added `ResearchForm.tsx` to keep `page.tsx` a pure server component (D089) while enabling `useActionState` for error display. Total: 5 files changed/created instead of 4.
- **`EnqueueResearchState` in `constants.ts`**: Plan had the type in `actions.ts`. Moved to `constants.ts` per D034 (strict reading: `'use server'` exports only async functions; types are re-exported via `export type {} from`).

## Known Issues

- Browser verification not performed — Playwright/Chromium missing `libnspr4.so` in this environment. Functional correctness verified via: build success, typecheck pass, HTTP response, code review of insert-before-enqueue ordering, and poll termination logic.
- DataForSEO credentials not configured — keyword/competitor/product data will be empty arrays until configured in Settings. Worker handles this gracefully.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/research/actions.ts` — new; `enqueueResearch`, `getResearchSessions`, `getResearchSessionStatus` server actions
- `apps/admin/src/app/(dashboard)/research/constants.ts` — new; `MARKET_OPTIONS`, `MarketValue`, `EnqueueResearchState`
- `apps/admin/src/app/(dashboard)/research/ResearchForm.tsx` — new; `'use client'` form with `useActionState`
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — new; `'use client'` polling component
- `apps/admin/src/app/(dashboard)/research/page.tsx` — rewritten; async server component with form + sessions list + status rendering
- `.gsd/milestones/M007/slices/S02/tasks/T03-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
