---
id: T01
parent: S03
milestone: M007
provides:
  - ResearchReportViewer server component rendering all 10 ResearchReport fields
  - Completed session branch in research page.tsx with domain availability checks
  - Parse-failure graceful fallback with raw JSON disclosure
  - "Create site from this research" CTA linking to /sites/new with pre-filled params
key_files:
  - apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx
  - apps/admin/src/app/(dashboard)/research/page.tsx
key_decisions:
  - renderCompletedSession() extracted as a named async function in page.tsx to keep the main component body readable while isolating the discriminated-union result type
  - domainLookup Map built in ResearchReportViewer for O(1) domain→availability resolution; domain_suggestions from report used as the canonical ordered list
  - Badge variant for availability uses inline className strings (not the shadcn Badge variant) to support green/gray/yellow — shadcn Badge only has default/secondary/destructive/outline
  - ctaHref built directly in ResearchReportViewer using encodeURIComponent; plain <Link className="..."> used (not Button asChild) as noted in task plan
patterns_established:
  - page.tsx async server component runs Promise.allSettled() domain checks inline before render, returns discriminated union; no second DB round-trip
  - safeParse before render pattern: rawReport → ResearchReportSchema.safeParse → ok branch renders viewer, error branch renders <details> with ZodError.issues
observability_surfaces:
  - "[SpaceshipClient] checkAvailability: domain=..." logged per domain check to Next.js server stdout"
  - All-Unknown badge state → indicates Spaceship credential issue; check server logs for [SpaceshipClient] spaceship_api_key not configured
  - Parse-failure fallback renders ZodError.issues in browser (safe, no credentials) + raw JSON in <details> block
  - SQL inspection: SELECT report FROM research_sessions WHERE id = '<id>' to see raw JSONB before render
duration: 35m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: ResearchReportViewer component + wire into research page

**Shipped `ResearchReportViewer` server component rendering all 10 report fields and wired completed sessions in `page.tsx` with live Spaceship domain checks and parse-failure fallback.**

## What Happened

Created `ResearchReportViewer.tsx` as a pure server component (no `'use client'`) that accepts a validated `ResearchReport` and pre-resolved domain availability array. Renders: header (niche idea + market badge + date), viability score card with color-coded badge (≥70 primary/green, 40–69 secondary, <40 destructive), summary paragraph, recommendation callout, keywords table with competition formatted as percentage, competitors ordered list, Amazon products grid with Prime badges, domain suggestions list with availability badges (green Available / gray Taken / yellow Unknown + price for available domains), and a styled "Create site from this research" CTA link.

Modified `page.tsx` to branch on `activeSession?.status === 'completed'`: calls `renderCompletedSession()` which runs `ResearchReportSchema.safeParse()` and `Promise.allSettled()` domain checks, returns a discriminated union `{ type: 'ok', report, domains }` or `{ type: 'parse_error', raw, zodIssues }`. The non-completed path (`ResearchSessionStatus` polling component) is unchanged.

Also fixed the pre-flight observability gaps: added `## Observability / Diagnostics` and failure-path diagnostic verification step to `S03-PLAN.md`, and `## Observability Impact` to `T01-PLAN.md`.

## Verification

```
pnpm -r typecheck          → all packages: Done (no errors)
pnpm --filter @monster/admin build → exit 0, /research route builds as ƒ Dynamic

grep -n "ResearchReportViewer" page.tsx → line 5 (import), line 76 (render)
grep -n "allSettled" page.tsx          → line 210 (Promise.allSettled call)
grep -n "safeParse" page.tsx           → line 197
grep -n "encodeURIComponent" ResearchReportViewer.tsx → line 62

curl http://localhost:3004/research  → 307
curl http://localhost:3004/sites/new → 307
```

## Diagnostics

- **Domain badges all "Unknown"**: Check Next.js server stdout for `[SpaceshipClient] spaceship_api_key not configured`. Credential missing from admin Settings.
- **Parse-failure fallback visible in browser**: `<details>` block contains ZodError.issues and raw JSON. Copy JSON to validate schema manually.
- **SQL**: `SELECT report FROM research_sessions WHERE id = '<id>';` — inspect raw JSONB before render path executes.
- **`renderCompletedSession()` never throws**: `Promise.allSettled()` + `safeParse()` both absorb errors gracefully; the only way the page fails is if `getResearchSessionStatus()` itself fails.

## Deviations

- Domain suggestion availability badges use inline `className` strings (not the shadcn `Badge` `variant` prop) because shadcn Badge variants don't include green or yellow — this is consistent with other badge usage in the codebase (BADGE constant in page.tsx and ResearchSessionStatus.tsx use inline classes).

## Known Issues

None. All must-haves verified.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx` — new server component, ~200 lines, renders all 10 report fields + CTA
- `apps/admin/src/app/(dashboard)/research/page.tsx` — modified: added completed branch with `renderCompletedSession()`, imports for `ResearchReportSchema`, `SpaceshipClient`, `ResearchReportViewer`
- `.gsd/milestones/M007/slices/S03/S03-PLAN.md` — added `## Observability / Diagnostics` section and failure-path diagnostic verification step (pre-flight fix)
- `.gsd/milestones/M007/slices/S03/tasks/T01-PLAN.md` — added `## Observability Impact` section (pre-flight fix)
