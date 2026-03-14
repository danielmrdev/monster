# S03: Research Report UI + Domain Suggestions + Create Site CTA

**Goal:** When a research session is `completed`, the Research Lab page renders the full structured report — keyword table, competitor list, Amazon products, domain suggestions with live Spaceship availability badges, viability score, summary, recommendation — plus a "Create site from this research" CTA that navigates to `/sites/new` with niche and market pre-filled.

**Demo:** User clicks a completed session in the Research Lab history list → the page renders a formatted report instead of the "report ready for viewing in S03" placeholder → domain suggestions show available/unavailable/unknown badges reflecting fresh Spaceship API checks → clicking "Create site from this research" opens `/sites/new` with niche and market already filled in.

## Must-Haves

- `ResearchReportViewer` server component renders all 10 `ResearchReport` fields (viability score, summary, keywords table with volume/CPC/competition, competitors list, Amazon products, domain suggestions with live availability badges, recommendation)
- `page.tsx` conditionally renders `ResearchReportViewer` (when `status === 'completed'`) or `ResearchSessionStatus` (when running/pending/failed) — report fetched server-side, domain checks run via `Promise.allSettled()` before render
- `report` field is always validated via `ResearchReportSchema.safeParse()` before rendering — graceful fallback with raw JSON when parse fails
- Spaceship errors caught per-domain — a single failed check never crashes the page; failed checks render as "Unknown" badge
- `SiteForm` accepts `defaultValues?: { niche?: string; market?: string }` and wires them as `defaultValue` on the niche textarea and market select
- `/sites/new/page.tsx` reads `searchParams.niche` and `searchParams.market`, passes to `SiteForm`
- "Create site from this research" CTA is a `<Link>` to `/sites/new?niche=...&market=...` with URL-encoded niche idea
- `pnpm --filter @monster/admin build` exits 0; `pnpm -r typecheck` exits 0

## Observability / Diagnostics

**Domain availability checks (per render of completed session):**
- Each `checkAvailability()` call logs `[SpaceshipClient] checkAvailability: domain="..."` to stdout — visible in the Next.js server process logs.
- If Spaceship credentials are missing/malformed, `checkAvailability()` throws with `[SpaceshipClient] spaceship_api_key not configured`. The `Promise.allSettled()` wrapper catches this and maps the domain to `available: null` (rendered as "Unknown" badge). No page crash.
- Inspect availability outcomes: count of `true`/`false`/`null` domains in the rendered report. All `null` → likely credential issue.

**Parse-failure surface:**
- If `ResearchReportSchema.safeParse()` rejects the stored `report`, the page renders a human-readable error and a `<details>` block with the raw JSON. Copy the raw JSON to validate the schema manually.
- `ZodError.issues` is included in the fallback error message for quick diagnosis without opening DevTools.

**Secrets:** Spaceship credentials are never logged. Only `domain` values appear in `[SpaceshipClient]` log lines.

**Inspection surfaces:**
- Research page in browser: completed session → full report rendered vs. fallback `<details>` block.
- `SELECT report FROM research_sessions WHERE id = '<id>';` — inspect raw JSONB before page renders.
- Next.js server stdout for `[SpaceshipClient]` lines during page render.

## Verification

```bash
# Typecheck — all packages
pnpm -r typecheck

# Admin build — must exit 0
pnpm --filter @monster/admin build

# Smoke check: research page still responds (auth redirect expected)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/research
# → 307

# Smoke check: new site page still responds (auth redirect expected)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3004/sites/new
# → 307

# Failure-path diagnostic: if domain badges all show "Unknown", verify Spaceship credentials
# in admin Settings. Check server logs for: [SpaceshipClient] spaceship_api_key not configured
# Parse-failure path: a non-schema-conforming report JSON in research_sessions.report
# will render fallback UI with ZodError.issues displayed (safe, no credentials exposed)
```

Code inspection verification:
- `page.tsx`: `activeSession?.status === 'completed'` branch renders `ResearchReportViewer`
- `ResearchReportViewer`: `ResearchReportSchema.safeParse()` called before rendering structured fields
- `ResearchReportViewer`: `Promise.allSettled()` used for domain checks
- `site-form.tsx`: `SiteForm({ defaultValues? })` prop added; `Textarea` niche field has `defaultValue={defaultValues?.niche}`
- `/sites/new/page.tsx`: `searchParams: Promise<{ niche?: string; market?: string }>` awaited and passed to `SiteForm`

## Tasks

- [x] **T01: ResearchReportViewer component + wire into research page** `est:45m`
  - Why: Closes the S03 primary deliverable — completed sessions show a full formatted report instead of the placeholder message. Also handles domain availability checks and the "Create site" CTA link.
  - Files: `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx`, `apps/admin/src/app/(dashboard)/research/page.tsx`
  - Do: Create `ResearchReportViewer` as a server component that takes `report: ResearchReport` and `domains: { domain: string; available: boolean | null; price?: string }[]` props. Render viability score with color-coded badge (≥70 green, 40–69 yellow, <40 red), summary paragraph, keywords table (keyword / search_volume / cpc / competition), competitors list, Amazon products grid, domain suggestions with availability badges, recommendation section, and "Create site from this research" CTA as `<Link href="/sites/new?niche=...&market=...">` with URL-encoded values. In `page.tsx`: when `activeSession?.status === 'completed'`, fetch `report` from DB via `getResearchSessionStatus()` (already returns `report`), run `Promise.allSettled()` domain checks via `new SpaceshipClient().checkAvailability(domain)` for each suggestion, `safeParse` the report, then render `ResearchReportViewer`. When not completed, keep existing `ResearchSessionStatus` path unchanged.
  - Verify: `pnpm --filter @monster/admin build` exits 0; `pnpm -r typecheck` exits 0; confirm conditional branch exists in `page.tsx` via `grep -n "ResearchReportViewer" apps/admin/src/app/(dashboard)/research/page.tsx`
  - Done when: Build exits 0, typecheck exits 0, `ResearchReportViewer` is imported and rendered in `page.tsx` on the completed branch, parse-failure fallback renders raw JSON in a `<details>` block, all domain checks use `Promise.allSettled()`

- [x] **T02: SiteForm defaultValues + /sites/new searchParams + CTA wiring** `est:20m`
  - Why: Closes the "Create site from this research" CTA loop — the Link in T01 needs `/sites/new` to actually read and pre-fill the form from query params.
  - Files: `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx`, `apps/admin/src/app/(dashboard)/sites/new/page.tsx`
  - Do: Add `defaultValues?: { niche?: string; market?: string }` prop to `SiteForm`. Wire `defaultValue={defaultValues?.niche ?? ''}` on the niche `Textarea`, and `defaultValue={defaultValues?.market ?? ''}` on the market `NativeSelect`. In `/sites/new/page.tsx`, add `searchParams: Promise<{ niche?: string; market?: string }>` to `PageProps`, await it, and pass to `SiteForm` as `defaultValues`. Values come in URL-decoded from Next.js — pass directly; no manual decode needed.
  - Verify: `pnpm --filter @monster/admin build` exits 0; `pnpm -r typecheck` exits 0; confirm `defaultValues` prop flows via `grep -n "defaultValues" apps/admin/src/app/(dashboard)/sites/new/site-form.tsx`
  - Done when: Build exits 0, typecheck exits 0, `SiteForm` signature includes `defaultValues` prop, `page.tsx` awaits `searchParams` and passes niche+market to form

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx` (new)
- `apps/admin/src/app/(dashboard)/research/page.tsx` (modified — completed branch + domain checks)
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` (modified — `defaultValues` prop)
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` (modified — `searchParams` + pass to form)
