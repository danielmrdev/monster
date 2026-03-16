---
id: S01
milestone: M009
provides:
  - GenerateSiteButton with useTransition spinner (replaces silent server action form)
  - Preview toolbar: no spurious "/" at root path
  - ChatWindow: react-markdown rendering for assistant messages
  - Settings: claude_api_key + amazon_affiliate_tag removed (9 keys remain)
  - Dashboard: P&L widget, top 5 sites by pageviews, failed jobs table, open alerts KPI with link
key_files:
  - apps/admin/src/app/(dashboard)/sites/[id]/GenerateSiteButton.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/page.tsx
  - apps/admin/src/app/(preview)/sites/[id]/preview/page.tsx
  - apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
  - apps/admin/src/app/(dashboard)/dashboard/page.tsx
key_decisions:
  - "D134 confirmed: react-markdown used for assistant message rendering"
  - "GenerateSiteButton pattern: useTransition client component wrapping async server action"
  - "Dashboard sections are independently non-fatal (empty state per section)"
patterns_established:
  - "Client button wrapping server action with useTransition: see GenerateSiteButton.tsx"
  - "Dashboard non-fatal parallel data pattern: Promise.all + per-section empty states"
drill_down_paths:
  - .gsd/milestones/M009/slices/S01/tasks/T01-SUMMARY.md
duration: 1.5h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S01: UX Fixes + Dashboard Enhancements

**Six UX friction points fixed and dashboard enriched: Generate Site shows live feedback, preview slash removed, chat renders markdown, Settings cleaned of deprecated keys, Dashboard shows P&L + top sites + failed jobs.**

## What Was Built

Four tasks landed as a single execution pass:

1. **GenerateSiteButton** — client component using `useTransition`, shows spinner during `enqueueSiteGeneration`. After submission the existing `JobStatus` polling component shows live job progress. The old inline `<form action={async()=>{'use server'...}}>` is gone.

2. **Preview slash fix** — toolbar conditionally shows path separator only when `currentPath !== '/'`. At root the display shows just "preview".

3. **Chat markdown** — `react-markdown` installed in apps/admin. `MessageBubble` renders assistant messages through `ReactMarkdown` with component overrides for p, ul, ol, code, pre, h1-h3, strong, em, a, blockquote, hr.

4. **Settings cleanup** — `claude_api_key` and `amazon_affiliate_tag` removed from `SETTINGS_KEYS`, Zod schema, error types, and form UI. The Affiliate Settings card removed entirely.

5. **Dashboard** — rewrote with 10 parallel queries: P&L widget (this month revenue - costs), top 5 sites by pageviews, failed jobs table (last 5 with site link + error snippet), open alerts KPI with "View all →" link.

## Verification

- `pnpm --filter @monster/admin build` exits 0 ✓
- `pm2 reload monster-admin` succeeds ✓
- `curl localhost:3004/dashboard` returns HTTP 200 ✓
- Settings form no longer contains claude_api_key or amazon_affiliate_tag fields ✓

## Deviations

None.
