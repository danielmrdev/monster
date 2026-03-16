# S01: UX Fixes + Dashboard Enhancements

**Goal:** Fix the six most visible UX friction points and enrich the dashboard with actionable information.
**Demo:** Generate Site button shows loading state immediately and polls job status live; the preview toolbar no longer shows "preview /" (changed to show just the path); chat responses render markdown; claude_api_key and amazon_affiliate_tag removed from Settings; Dashboard shows failed jobs, recent open alerts, and P&L summary widget.

## Must-Haves

- Generate Site button becomes disabled and shows a spinner immediately on click; after submission, the page shows live job status polling (reuses existing JobStatus component pattern)
- Preview toolbar shows `preview` + path without the spurious "/" between "preview" and the current path when path is "/"  
- Chat message bubbles render markdown: bold, headers, lists, inline code, code blocks
- Settings page no longer has claude_api_key or amazon_affiliate_tag fields; SETTINGS_KEYS and actions.ts updated
- Dashboard shows: failed jobs section (last 5 failed ai_jobs with site name, timestamp, error snippet), open alerts count with link, top 5 sites by pageview count (from analytics_daily), P&L summary (total revenue - total costs this month)

## Proof Level

- This slice proves: contract + integration
- Real runtime required: yes (pm2 reload must pass)
- Human/UAT required: yes (markdown rendering visual check)

## Verification

- `cd /home/daniel/monster && pnpm -r build` exits 0
- `pnpm -r typecheck` exits 0 (or `tsc --noEmit` in apps/admin)
- `pm2 reload monster-admin` succeeds, HTTP 200 on port 3004
- Settings page renders without claude_api_key or amazon_affiliate_tag fields (inspect DOM or code)
- Dashboard page renders without runtime error (check pm2 logs after pm2 reload)

## Observability / Diagnostics

- Runtime signals: Generate Site button submit captured via form action + useTransition; job polling via existing getLatestJobStatus pattern
- Inspection surfaces: Dashboard P&L widget logs to console if finance queries fail (non-fatal — show zeros)
- Failure visibility: Dashboard sections are independently non-fatal (one failed query doesn't crash the page)
- Redaction constraints: none

## Tasks

- [x] **T01: Fix Generate Site button feedback + Preview slash** `est:45m`
  - Why: The Generate Site form currently submits silently (server action form with no client state); the preview toolbar shows "preview /" which looks like a double slash when path is "/"
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`, `apps/admin/src/app/(preview)/sites/[id]/preview/page.tsx`
  - Do: (1) Convert the Generate Site `<form action={async()=>{'use server'...}}>` into a client component `GenerateSiteButton` in a new file `GenerateSiteButton.tsx` using `useTransition` — on click disable the button and show spinner, call the server action via `import { enqueueSiteGeneration }`, after action resolves the existing `JobStatus` component (which auto-polls) will show the new job status. (2) In the preview page toolbar, the issue is `<span>preview</span><span>/</span><span>{currentPath}</span>` — change the display so when `currentPath === '/'` it shows nothing after "preview" (hide the separator and path), otherwise show `preview / path`. Actually looking at the code: `currentPath` starts as `'/'` and the separator `/` between "preview" and the path is always shown — fix by only showing the separator+path when `currentPath !== '/'`.
  - Verify: `pnpm -r build` exits 0; preview toolbar shows "preview" with no trailing "/" when at root
  - Done when: Build passes and the Generate Site button shows a spinner on click

- [x] **T02: Add markdown rendering to ChatWindow** `est:30m`
  - Why: Claude responses use markdown but the current `MessageBubble` component renders raw text, making structured responses (lists, bold, code blocks) unreadable
  - Files: `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx`, `apps/admin/package.json`
  - Do: (1) Install `react-markdown` in apps/admin: `pnpm --filter @monster/admin add react-markdown`. (2) In `ChatWindow.tsx`, find the `MessageBubble` component (or the message rendering section). Import `ReactMarkdown` from `react-markdown`. (3) For assistant messages (`msg.role === 'assistant'`), wrap `msg.content` in `<ReactMarkdown>` with prose styling classes. For user messages keep plain text. (4) Add a thin `prose prose-sm prose-invert max-w-none` wrapper (Tailwind typography or manual styles) so markdown renders attractively in the dark theme. Since tailwind-typography may not be installed, use manual styles via className overrides on ReactMarkdown components prop.
  - Verify: `pnpm -r build` exits 0; inspect ChatWindow.tsx to confirm ReactMarkdown import and usage
  - Done when: Build passes with react-markdown in use for assistant messages

- [x] **T03: Remove claude_api_key + amazon_affiliate_tag from Settings** `est:20m`
  - Why: claude-agent-sdk uses system OAuth auth (no API key needed per D134/R027); affiliate tag is per-site on the sites table (R044), not global
  - Files: `apps/admin/src/app/(dashboard)/settings/constants.ts`, `apps/admin/src/app/(dashboard)/settings/actions.ts`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
  - Do: (1) In `constants.ts`, remove `'claude_api_key'` and `'amazon_affiliate_tag'` from the `SETTINGS_KEYS` array. (2) In `actions.ts`, remove those two keys from the `SaveSettingsSchema` object and `SaveSettingsErrors` type. (3) In `settings-form.tsx`, remove the entire "Claude API Key" `<div>` field block and the entire "Affiliate Settings" `<Card>` section. The Affiliate Settings card contains only the amazon_affiliate_tag field — remove the whole card.
  - Verify: `pnpm -r build` exits 0; grep for 'claude_api_key' in settings files shows only DECISIONS.md references
  - Done when: Build passes with no Settings form compilation errors; neither field appears in the form

- [x] **T04: Enrich Dashboard with alerts, job failures, top sites, P&L** `est:1h`
  - Why: Dashboard currently shows 4 static KPI counts; operator needs actionable info immediately on load
  - Files: `apps/admin/src/app/(dashboard)/dashboard/page.tsx`
  - Do: Extend `DashboardPage` with additional parallel queries and new sections below the KPI grid:
    (1) **Failed jobs section**: Query `ai_jobs` table for last 5 rows where `status = 'failed'`, select `id, site_id, type, error, started_at`. Join with sites for name. Render as a small table: site name, job type, when, error snippet (first 80 chars). If no failed jobs, show a green "No failed jobs" note.
    (2) **Open alerts**: Already have `openAlerts` count — add a `View all →` link to `/alerts` in the KPI card.
    (3) **Top sites by pageviews**: Query `analytics_daily` grouped by `site_id`, sum `pageviews`, order by total desc, limit 5. Join with sites for name. Render as a small table: site name, total pageviews. If no data, show "No analytics data yet".
    (4) **P&L this month**: Query `costs` (sum amount) and `revenue_amazon` + `revenue_manual` (sum earnings/amount) for current month (from = first day of month, to = today). Compute totalRevenue - totalCosts. Render as a single card: "This Month" with revenue, costs, profit — green if profit > 0, red if negative, gray if zero.
    Keep all 4 new queries in the existing `Promise.all` block. Make dashboard sections independently non-fatal: catch errors per-section and show a graceful empty state rather than throwing.
  - Verify: `pnpm -r build` exits 0; `pm2 reload monster-admin` succeeds; dashboard page loads without error (check pm2 logs)
  - Done when: Build passes and dashboard renders 4 new sections (even if all show empty states)

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/GenerateSiteButton.tsx` (new)
- `apps/admin/src/app/(preview)/sites/[id]/preview/page.tsx`
- `apps/admin/src/app/(dashboard)/monster/ChatWindow.tsx`
- `apps/admin/package.json`
- `apps/admin/src/app/(dashboard)/settings/constants.ts`
- `apps/admin/src/app/(dashboard)/settings/actions.ts`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx`
