---
estimated_steps: 5
estimated_files: 3
---

# T03: Research Lab UI — form + server action + polling status

**Slice:** S02 — NicheResearcher — Background Agent + DataForSEO Research
**Milestone:** M007

## Description

Replaces the Research Lab "Coming soon" placeholder with a working niche submission form and a live polling status component. The user submits a niche idea, the server action creates a session and enqueues the job, and the `ResearchSessionStatus` client component polls every 5 seconds to show per-turn progress updates until completion. Session history list gives access to past runs.

This is the T03 in the S01 pattern: close the loop by making everything visible and usable from the UI. No formatting of the final report — that's S03.

## Steps

1. **Create `actions.ts`.** `apps/admin/src/app/(dashboard)/research/actions.ts` with `'use server'` directive. Exports only async functions (D034):
   - `enqueueResearch(formData: FormData)`: reads `nicheIdea` (required, trim, min 3 chars) + `market` (default `'ES'`) from formData. Creates `research_sessions` row via `createServiceClient()` with `status: 'pending'`. Calls `nicheResearchQueue().add('research', { sessionId, nicheIdea, market }, { removeOnComplete: true, removeOnFail: false })`. Returns `{ ok: true, sessionId }` or `{ ok: false, error: string }`. Never throws (form action).
   - `getResearchSessions()`: fetches 10 most recent `research_sessions` rows ordered by `created_at DESC`. Returns `{ id, niche_idea, market, status, created_at }[]`.
   - `getResearchSessionStatus(sessionId: string)`: fetches single session `{ status, progress, report }` for polling. Returns null if not found.

2. **Create `ResearchSessionStatus.tsx`.** `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — `'use client'` file (D089 pattern). Props: `{ sessionId: string, initialStatus: string }`. State: `status`, `progress` (array of turn objects), `isPending` (useTransition). Poll loop (useEffect + setInterval 5000ms): call `getResearchSessionStatus(sessionId)` in `startTransition`; update state; clear interval when `status === 'completed' || status === 'failed'`. Render:
   - Status badge (same BADGE map as JobStatus.tsx: pending/running/completed/failed)
   - Progress log: ordered list of `{ turn, summary, timestamp }` entries from `progress` jsonb, newest first
   - On completed: "✓ Research complete — report ready for viewing in S03" placeholder message
   - On failed: error message from last progress entry
   - On running/pending: subtle pulsing indicator

3. **Rewrite `page.tsx`.** Async server component. Reads `searchParams.session` for active session. Parallel-fetches `getResearchSessions()`. Layout: two-column or stacked depending on whether a session is active.
   - Left/top: niche submission form with `action={enqueueResearch}` server action (native `<form action=...>` pattern, no react-hook-form needed). Fields: niche idea text input (required), market select (ES/US/UK default ES). Submit button. On submit, redirect to `?session=${newSessionId}` via `redirect()` from `next/navigation` inside the server action (on `ok: true`).
   - Sessions list: 10 most recent sessions with status badge, niche idea text, market, relative timestamp, link to `?session=${id}`. Active session highlighted.
   - When `searchParams.session` is set: render `<ResearchSessionStatus sessionId={session} initialStatus={sessionRow.status}>` below the form. Raw `report` JSON shown in a `<details><summary>Raw report JSON</summary><pre>...</pre></details>` block when `status === 'completed'` and `report` is non-null (S03 renders this properly).

4. **Handle redirect from server action.** Inside `enqueueResearch`, after successful enqueue, call `redirect('/research?session=' + sessionId)` from `'next/navigation'`. This navigates the user to the Research Lab page showing the new session status component. If enqueue fails, return `{ ok: false, error }` (page re-renders with error state).

5. **Wire market select options from shared constants.** Market options array defined in `constants.ts` (sibling file, no `'use server'` directive — D034 pattern) and imported in both `page.tsx` and `actions.ts`. Options: `[{ value: 'ES', label: 'Spain (Amazon.es)' }, { value: 'US', label: 'USA (Amazon.com)' }, { value: 'UK', label: 'UK (Amazon.co.uk)' }]`.

## Must-Haves

- [ ] `actions.ts` exports only async functions (no constants alongside `'use server'` — D034)
- [ ] `enqueueResearch` creates the `research_sessions` row BEFORE enqueuing (job must find the session on startup)
- [ ] `enqueueResearch` redirects to `?session=<id>` on success (user immediately sees status)
- [ ] `ResearchSessionStatus` is a separate `'use client'` file (not inlined in page.tsx — D089)
- [ ] Polling stops automatically when `status === 'completed'` or `status === 'failed'`
- [ ] Sessions list shows at most 10 most recent sessions
- [ ] Market constants in a sibling `constants.ts`, not in the `'use server'` file (D034)
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `pnpm -r typecheck` exits 0

## Verification

```bash
# Build
pnpm --filter @monster/admin build   # exit 0
pnpm -r typecheck                    # exit 0

# Browser verification
# 1. Open http://localhost:3004/research
# 2. Type "freidoras de aire" in niche field, select ES market, click Submit
# 3. Page redirects to /research?session=<uuid>
# 4. ResearchSessionStatus shows "Running…" badge + progress log updates every 5s
# 5. Close browser tab mid-run
# 6. Wait 2 min, reopen /research
# 7. Session appears in list with current status (not reset to pending)
# 8. Click session link → ResearchSessionStatus shows completed + raw report JSON in <details>

# Confirm server action creates DB row before enqueue:
psql $SUPABASE_DB_URL -c "SELECT id, status, niche_idea FROM research_sessions ORDER BY created_at DESC LIMIT 3;"
```

## Observability Impact

**New signals introduced by this task:**
- `enqueueResearch` server action logs nothing directly — observable via DB row creation: `SELECT id, status, niche_idea FROM research_sessions ORDER BY created_at DESC LIMIT 3;`
- `ResearchSessionStatus` polling visible in browser DevTools Network tab — `POST /research` action call every 5 seconds while running; stops on terminal status
- Poll termination: when `status === 'completed'` or `status === 'failed'`, `clearInterval` fires — no further network requests emitted

**Failure state surfaces:**
- Server action returns `{ ok: false, error: string }` and renders the error inline in the form (no redirect on failure)
- If DB insert fails before enqueue: session row is NOT created — `research_sessions` table will show no new row; error displayed in form
- If enqueue fails after DB insert: session row exists with `status='pending'` but no job in Redis — detectable via `KEYS bull:niche-research:active:*` returning no matching job while the DB shows `status='pending'`
- `ResearchSessionStatus` with unknown `sessionId`: `getResearchSessionStatus` returns `null` — component shows loading spinner indefinitely (no crash)

**Future-agent inspection:**
- Check if form submission created a session: `SELECT id, status, niche_idea, created_at FROM research_sessions ORDER BY created_at DESC LIMIT 5;`
- Check poll termination worked: if session shows `status='completed'` but UI was never updated, the polling interval may not have cleared — verify browser console for `clearInterval` side-effect via DevTools
- Orphaned pending sessions (enqueue failed): `SELECT id, status FROM research_sessions WHERE status='pending' AND created_at < NOW() - INTERVAL '10 minutes';`

## Inputs

- `packages/agents/src/index.ts` — `nicheResearchQueue()` and `enqueueNicheResearch()` exported by T02
- `packages/db/src/types/supabase.ts` — `research_sessions` Row type with `progress: Json | null` (from T01)
- `apps/admin/src/app/(dashboard)/sites/[id]/JobStatus.tsx` — BADGE map + poll pattern to mirror
- `apps/admin/src/app/(dashboard)/analytics/actions.ts` — server action structure pattern
- S02-RESEARCH.md §Common Pitfalls — D034 (constants in separate file), D089 (client component boundary)

## Expected Output

- `apps/admin/src/app/(dashboard)/research/actions.ts` — new; `enqueueResearch`, `getResearchSessions`, `getResearchSessionStatus`
- `apps/admin/src/app/(dashboard)/research/constants.ts` — new; market options array
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — new; `'use client'` polling component
- `apps/admin/src/app/(dashboard)/research/page.tsx` — rewritten; form + sessions list + status component
- Browser: submitting a niche idea creates a session and shows live progress polling; closing and reopening the tab preserves the session state
