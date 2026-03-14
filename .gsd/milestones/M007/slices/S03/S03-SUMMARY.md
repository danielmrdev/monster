---
id: S03
parent: M007
milestone: M007
provides:
  - ResearchReportViewer server component rendering all 10 ResearchReport fields with live Spaceship domain availability checks
  - research/page.tsx completed-session branch with safeParse validation and Promise.allSettled() domain checks
  - Parse-failure graceful fallback (raw JSON in <details> block with ZodError.issues)
  - "Create site from this research" CTA linking to /sites/new?niche=...&market=...
  - SiteForm defaultValues prop (niche textarea + market NativeSelect pre-fill)
  - /sites/new async page reading searchParams.niche and searchParams.market
requires:
  - slice: S02
    provides: research_sessions.report jsonb in ResearchReport shape; SpaceshipClient.checkAvailability() implemented
affects: []
key_files:
  - apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
  - apps/admin/src/app/(dashboard)/sites/new/site-form.tsx
  - apps/admin/src/app/(dashboard)/sites/new/page.tsx
key_decisions:
  - D117 — renderCompletedSession() extracted as named async function returning discriminated union
  - D118 — availability badges use inline className strings (not shadcn Badge variant) — consistent with codebase
  - D119 — defaultValue (uncontrolled) on Textarea and NativeSelect, not value (controlled)
  - D120 — Next.js 15 async searchParams: Promise<{...}> + await in async server component
patterns_established:
  - page.tsx async server component discriminated union: renderCompletedSession() returns { type: 'ok', report, domains } | { type: 'parse_error', raw, zodIssues }
  - safeParse before render: rawReport → ResearchReportSchema.safeParse → ok branch renders viewer, error branch renders <details> fallback
  - Promise.allSettled() for per-domain Spaceship checks — single failure never crashes the page
  - domainLookup Map for O(1) domain→availability resolution in ResearchReportViewer
  - Next.js 15 async searchParams pattern: interface PageProps { searchParams: Promise<{...}> } → await → pass as props
observability_surfaces:
  - "[SpaceshipClient] checkAvailability: domain=..." logged per domain check to Next.js server stdout"
  - All-Unknown badge state → indicates Spaceship credential issue; check server logs for [SpaceshipClient] spaceship_api_key not configured
  - Parse-failure fallback renders ZodError.issues in browser (safe, no credentials) + raw JSON in <details> block
  - SQL: SELECT report FROM research_sessions WHERE id = '<id>' — inspect raw JSONB before render path
  - Navigate to /sites/new?niche=camping+gear&market=US — niche and market pre-filled confirms full CTA loop
drill_down_paths:
  - .gsd/milestones/M007/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M007/slices/S03/tasks/T02-SUMMARY.md
duration: ~50m (T01: 35m, T02: 15m)
verification_result: passed
completed_at: 2026-03-13
---

# S03: Research Report UI + Domain Suggestions + Create Site CTA

**Completed research sessions now render a full structured report in the admin panel — keyword table, competitors, Amazon products, domain suggestions with live Spaceship availability badges, viability score, and a "Create site from this research" CTA that pre-fills `/sites/new` from the report's niche and market.**

## What Happened

**T01** created `ResearchReportViewer.tsx` as a pure server component accepting a validated `ResearchReport` and pre-resolved domain availability array. It renders all 10 `ResearchReport` fields: a header (niche idea, market badge, date), a viability score card with color-coded badge (≥70 green/primary, 40–69 secondary/yellow, <40 destructive/red), summary paragraph, recommendation callout, keywords table (keyword / search_volume / cpc / competition formatted as percentage), ordered competitor list, Amazon products grid with Prime badges, domain suggestions with availability badges (green "Available" + price / gray "Taken" / yellow "Unknown"), and a styled "Create site from this research" CTA `<Link>` to `/sites/new?niche=...&market=...`.

`page.tsx` was modified to branch on `activeSession?.status === 'completed'`. The completed branch calls a named async function `renderCompletedSession()` which runs `ResearchReportSchema.safeParse()` first. On parse success it runs `Promise.allSettled()` over all domain suggestions via `new SpaceshipClient().checkAvailability(domain)` and renders `ResearchReportViewer`. On parse failure it renders a graceful fallback with `ZodError.issues` and a `<details>` block containing the raw JSON. The non-completed path (the `ResearchSessionStatus` polling component) is unchanged.

**T02** made two surgical edits to close the CTA pre-fill loop. `SiteForm` gained a `defaultValues?: { niche?: string; market?: string }` prop; the niche `<Textarea>` and market `<NativeSelect>` now accept uncontrolled `defaultValue` pre-fill. `/sites/new/page.tsx` was converted to an `async` server component, declares `searchParams: Promise<{ niche?: string; market?: string }>`, awaits it, and passes the decoded values as `defaultValues` to `SiteForm`.

## Verification

```
pnpm -r typecheck                   → exit 0 (all 9 packages, no errors)
pnpm --filter @monster/admin build  → exit 0; /research = ƒ Dynamic; /sites/new = ƒ Dynamic

grep -n "ResearchReportViewer" page.tsx    → line 5 (import), line 76 (render)
grep -n "allSettled" page.tsx             → line 210 (Promise.allSettled call)
grep -n "safeParse" page.tsx              → line 197
grep -n "encodeURIComponent" ResearchReportViewer.tsx → line 62

grep -n "defaultValues" site-form.tsx     → 3 hits (signature, niche defaultValue, market defaultValue)
grep -n "searchParams" sites/new/page.tsx → Promise type + await

curl http://localhost:3004/research  → 307 ✓
curl http://localhost:3004/sites/new → 307 ✓
```

## Requirements Advanced

- R003 (Autonomous niche research) — S03 closes the full Research Lab loop: submitted niche → background job → structured report → formatted UI with viability score, domain suggestions, and CTA. Combined with S02's structural proof, R003 is now advanced to partial-validated status (human UAT with live DataForSEO credentials is the remaining gap).

## Requirements Validated

- None promoted to fully validated in this slice (R003 human UAT still pending real DataForSEO data).

## New Requirements Surfaced

- None.

## Requirements Invalidated or Re-scoped

- None.

## Deviations

- Domain suggestion availability badges use inline `className` strings (not the shadcn `Badge` `variant` prop) because shadcn Badge variants don't include green or yellow. This is consistent with existing badge usage in `ResearchSessionStatus.tsx` and the BADGE constant in `page.tsx`. Logged as D118.

## Known Limitations

- Domain availability checks run on every page load for a completed session (no caching). For reports with many domain suggestions, this adds latency proportional to the number of Spaceship API calls. Acceptable for Phase 1 (research sessions are loaded infrequently).
- `defaultValue` on market `NativeSelect` pre-fills only when the value exactly matches one of the `AMAZON_MARKETS` codes (e.g. `US`, `ES`). If NicheResearcher stores a different format, the select will not pre-select. Current implementation stores the market code directly from DB — should match.
- Viability score visual scale and thresholds (≥70 green, 40–69 yellow, <40 red) are hardcoded in `ResearchReportViewer`. These thresholds are not user-configurable.

## Follow-ups

- Human UAT of the full Research Lab flow with live DataForSEO credentials to validate R003 completely.
- Consider server-side caching of domain availability checks per completed session (e.g. store availability results in `research_sessions.report` after first check) if page load latency becomes noticeable.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx` — new server component, ~200 lines, renders all 10 report fields + CTA
- `apps/admin/src/app/(dashboard)/research/page.tsx` — added completed branch with `renderCompletedSession()`, `ResearchReportSchema`, `SpaceshipClient`, `ResearchReportViewer` imports
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — added `defaultValues` prop; niche Textarea and market NativeSelect accept pre-fill
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — converted to async, reads `searchParams.niche` and `searchParams.market`, passes to `SiteForm`
- `.gsd/milestones/M007/slices/S03/S03-PLAN.md` — added `## Observability / Diagnostics` section (pre-flight fix in T01)
- `.gsd/milestones/M007/slices/S03/tasks/T01-PLAN.md` — added `## Observability Impact` section (pre-flight fix in T01)
- `.gsd/milestones/M007/slices/S03/tasks/T02-PLAN.md` — added `## Observability Impact` section (pre-flight fix in T02)

## Forward Intelligence

### What the next slice should know
- M007 is now complete. The full Research Lab → Report → Create Site loop is wired end-to-end. The milestone definition of done requires one additional human UAT check: submitted niche → completed report containing real DataForSEO data. This is blocked on DataForSEO credentials being configured in admin Settings.
- Monster Chat (S01) and NicheResearcher (S02) are both complete. The monster-worker must have NicheResearcherJob registered — verify with `pm2 logs monster-worker | grep NicheResearcher` before running the human UAT.
- Domain suggestions in the report come from the NicheResearcher agent's `checkDomainAvailability` MCP tool call during the research job. If a completed session has no domain suggestions, the agent may not have called that tool — inspect `research_sessions.progress` for the tool call history.

### What's fragile
- `Promise.allSettled()` domain checks on every page render — if Spaceship API is slow or rate-limited, the completed session page will be slow to render. No timeout is set on individual `checkAvailability()` calls.
- `SiteForm` market pre-fill depends on value matching `AMAZON_MARKETS` keys exactly — case-sensitive. Passing `'us'` instead of `'US'` will silently fail to pre-select.

### Authoritative diagnostics
- All domain badges "Unknown" → check Next.js server stdout for `[SpaceshipClient] spaceship_api_key not configured`. Credential issue, not a code bug.
- Parse-failure fallback visible in browser → `<details>` block contains `ZodError.issues` and raw JSON. The raw JSON reveals what the NicheResearcher stored vs. what `ResearchReportSchema` expects.
- Market not pre-selected on `/sites/new` → verify the market code in the research report matches an `AMAZON_MARKETS` key exactly.

### What assumptions changed
- No significant assumption changes in S03. All implementation matched the plan exactly.
