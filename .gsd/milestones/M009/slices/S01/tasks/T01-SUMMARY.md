---
id: T01-T04
parent: S01
milestone: M009
provides:
  - GenerateSiteButton client component with useTransition spinner — replaces silent form action
  - Preview toolbar shows "preview" with no spurious "/" when at root path
  - ChatWindow assistant messages render markdown via react-markdown
  - Settings: claude_api_key and amazon_affiliate_tag removed from SETTINGS_KEYS, schema, and form
  - Dashboard: P&L widget, top 5 sites by pageviews, failed jobs table, open alerts KPI with link
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/GenerateSiteButton.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(preview)/sites/[id]/preview/page.tsx
  - apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
key_decisions:
  - "GenerateSiteButton uses useTransition (not useFormStatus/form) because enqueueSiteGeneration returns {jobId, error?} — not a void server action"
  - "Preview slash: conditional render — only show '/' + path when currentPath !== '/'"
  - "react-markdown used for assistant messages only; user messages stay as plain whitespace-pre-wrap text"
  - "Dashboard queries are all parallel; finance queries use first-day-of-month to today range"
patterns_established:
  - "Client button wrapping async server action with useTransition — GenerateSiteButton.tsx pattern"
  - "Dashboard non-fatal sections pattern: each data section shows graceful empty state if query fails or returns empty"
drill_down_paths:
  - .gsd/milestones/M009/slices/S01/S01-PLAN.md
duration: 1.5h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# T01-T04: UX Fixes + Dashboard Enhancements (S01)

**Generate Site button now shows a spinner on click; preview toolbar fixed; chat renders markdown; Settings cleaned up; Dashboard enriched with P&L, top sites, and failed jobs.**

## What Happened

All four S01 tasks executed in a single pass:

**T01 — Generate Site button + Preview slash:** Created `GenerateSiteButton.tsx` as a `'use client'` component using `useTransition` to show a spinner while `enqueueSiteGeneration` runs. The existing `JobStatus` polling component handles live status after submission. Preview toolbar fixed by conditionally showing the separator+path only when `currentPath !== '/'`.

**T02 — Chat markdown:** Added `react-markdown` to apps/admin. Updated `MessageBubble` in `ChatWindow.tsx` to render assistant messages through `ReactMarkdown` with inline `components` overrides for prose styling in the dark theme. User messages and error messages remain plain text.

**T03 — Settings cleanup:** Removed `claude_api_key` and `amazon_affiliate_tag` from `SETTINGS_KEYS`, `SaveSettingsSchema`, `SaveSettingsErrors`, and the settings form. The Affiliate Settings card was removed entirely.

**T04 — Dashboard:** Rewrote `dashboard/page.tsx` with 10 parallel Supabase queries. Added: P&L this month (revenue minus costs), top 5 sites by total pageviews (in-memory aggregate from analytics_daily), failed jobs table (last 5 failed ai_jobs with site link, type, timestamp, error snippet), open alerts KPI with "View all →" link.

## Deviations

None. All tasks completed as planned.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/sites/[id]/GenerateSiteButton.tsx` — new client component
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — uses GenerateSiteButton, removed inline form
- `apps/admin/src/app/(preview)/sites/[id]/preview/page.tsx` — conditional path display
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx` — react-markdown for assistant bubbles
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — 2 keys removed
- `apps/admin/src/app/(dashboard)/settings/actions.ts` — schema + types updated
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — fields removed
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — full rewrite with enriched sections
