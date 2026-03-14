---
estimated_steps: 6
estimated_files: 2
---

# T01: ResearchReportViewer component + wire into research page

**Slice:** S03 — Research Report UI + Domain Suggestions + Create Site CTA
**Milestone:** M007

## Description

Create the `ResearchReportViewer` server component that renders a completed research report in full, then wire it into `page.tsx` so completed sessions show the report instead of the S02 "report ready for viewing in S03" placeholder. The component handles domain availability freshness (re-checking via Spaceship at render time), parse-failure graceful degradation, and the "Create site" CTA link.

## Steps

1. **Create `ResearchReportViewer.tsx`** as a server component (no `'use client'` directive). Props: `report: ResearchReport`, `domains: { domain: string; available: boolean | null; price?: string }[]`. Import `ResearchReport` from `@monster/shared`.

2. **Render report sections** top-to-bottom:
   - **Header row**: niche idea as `<h2>`, market badge, `generated_at` formatted as locale date
   - **Viability score card**: large number badge; `≥70` → green variant, `40–69` → yellow/secondary, `<40` → red/destructive. Use the `Badge` component from `@/components/ui/badge` with `variant` prop.
   - **Summary**: `<p>` paragraph, leading text "Summary"
   - **Recommendation**: bordered callout box with "Recommendation" label
   - **Keywords table**: `<table>` with columns Keyword / Volume / CPC / Competition. Format competition as percentage (`(val * 100).toFixed(0)%`). Null values → `—`.
   - **Competitors list**: ordered list, domain + median position + relevance label
   - **Amazon products grid**: card grid showing title, price (null → `—`), rating (⭐ prefix), review count, Prime badge if `is_prime`
   - **Domain suggestions**: list with availability badge per domain. Badge states: `available=true` → green "Available", `available=false` → gray "Taken", `available=null` → yellow "Unknown". Show `price` beside "Available" domains.
   - **"Create site from this research" CTA**: `<Link>` to `/sites/new?niche=${encodeURIComponent(report.niche_idea)}&market=${encodeURIComponent(report.market)}` with a `Button`-styled class (or import `Button` and wrap in `asChild` if needed — plain `<Link className="...">` is simpler here).

3. **Wire into `page.tsx`**: When `activeSession?.status === 'completed'`:
   - The `report` field is already returned by `getResearchSessionStatus()` — use that value directly (avoid a second DB round-trip).
   - Run `Promise.allSettled()` over `report.domain_suggestions` calling `new SpaceshipClient().checkAvailability(domain)` for each. Catch errors; map fulfilled results to `{ domain, available, price }`, rejected/error to `{ domain, available: null }`.
   - Call `ResearchReportSchema.safeParse(rawReport)` before rendering. If `!result.success`, render a parse-failure fallback: an error message + `<details><summary>Raw report JSON</summary><pre>{JSON.stringify(rawReport, null, 2)}</pre></details>`.
   - Pass `report={result.data}` and `domains={resolvedDomains}` to `<ResearchReportViewer />`.
   - When not completed, the `ResearchSessionStatus` path is unchanged.

4. **Handle the parse-failure branch** — `rawReport` might be `{ raw: string, error: 'parse_failed' }` (S02 pattern). In this case `safeParse` fails; render graceful fallback (see step 3).

5. **Import cleanup**: Add `import { SpaceshipClient } from '@monster/domains'` and `import { ResearchReportSchema } from '@monster/shared'` and `import ResearchReportViewer from './ResearchReportViewer'` to `page.tsx`. Keep all domain checks inside the server component body — not in a `'use server'` function (no client code calls these checks).

6. **Check for `@monster/domains` import**: `apps/admin` already imports `SpaceshipClient` in `sites/[id]/actions.ts` and the admin build passes — no new `serverExternalPackages` entry needed. Verify with the build step.

## Must-Haves

- [ ] `ResearchReportViewer` is a server component (no `'use client'`) accepting `report: ResearchReport` and `domains` props
- [ ] All 10 report fields rendered (viability_score, summary, keywords, competitors, amazon_products, domain_suggestions, recommendation, niche_idea, market, generated_at)
- [ ] Domain badges: green "Available" / gray "Taken" / yellow "Unknown" for `true` / `false` / `null`
- [ ] `Promise.allSettled()` used — a single Spaceship error never crashes the page
- [ ] `ResearchReportSchema.safeParse()` called before rendering; parse failure renders graceful fallback
- [ ] `page.tsx` renders `ResearchReportViewer` on `status === 'completed'`, `ResearchSessionStatus` otherwise
- [ ] "Create site" CTA uses `encodeURIComponent` on both niche and market params
- [ ] No second DB round-trip for completed sessions (reuse `report` from `getResearchSessionStatus()`)
- [ ] `pnpm --filter @monster/admin build` exits 0
- [ ] `pnpm -r typecheck` exits 0

## Verification

```bash
pnpm -r typecheck
pnpm --filter @monster/admin build

# Confirm viewer is wired in page.tsx
grep -n "ResearchReportViewer" apps/admin/src/app/(dashboard)/research/page.tsx

# Confirm Promise.allSettled is used (not Promise.all)
grep -n "allSettled" apps/admin/src/app/(dashboard)/research/page.tsx

# Confirm safeParse is called
grep -n "safeParse" apps/admin/src/app/(dashboard)/research/page.tsx

# Confirm encodeURIComponent in CTA
grep -n "encodeURIComponent" apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx
```

## Inputs

- `packages/shared/src/types/research-report.ts` — `ResearchReportSchema` + `ResearchReport` type; 10 fields confirmed
- `packages/domains/src/spaceship.ts` — `SpaceshipClient.checkAvailability(domain)` returns `{ available: boolean; price?: string }`, throws on credential error
- `apps/admin/src/app/(dashboard)/research/page.tsx` — existing async server component; `getResearchSessionStatus()` returns `{ status, progress, report }`; `activeSession` already in scope
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — existing polling component to keep unchanged for non-completed sessions
- `apps/admin/src/components/ui/badge.tsx` — `Badge` component with `variant` prop (`default`, `secondary`, `destructive`, `outline`)
- S02 pattern: `report` may be `{ raw: string, error: 'parse_failed' }` when `status === 'completed'` — always safeParse

## Observability Impact

**New signals introduced by this task:**

- **Domain check logs**: Every `checkAvailability()` call emits `[SpaceshipClient] checkAvailability: domain="..."` to Next.js server stdout. A future agent can count these lines to confirm how many domains were checked per page render.
- **Credential failure signal**: If Spaceship credentials are missing, all domain checks resolve to `available: null` and "Unknown" badges render. The server log will contain `[SpaceshipClient] spaceship_api_key not configured`. This is the first signal to check when all domains show "Unknown".
- **Parse-failure surface**: `safeParse()` failure renders a `<details>` block with raw JSON and ZodError issues. A future agent can read this from the DOM or page source without needing database access.
- **No crash surface**: `Promise.allSettled()` guarantees `page.tsx` always renders — individual Spaceship failures are silently absorbed as `available: null`.

**How a future agent inspects this:**
1. Check Next.js server stdout for `[SpaceshipClient]` lines — count = number of domain checks per render.
2. If all badges show "Unknown": look for `[SpaceshipClient] spaceship_api_key not configured` in logs.
3. If parse-failure fallback renders: the `<details>` block contains the raw report JSON and ZodError.issues.
4. SQL: `SELECT report FROM research_sessions WHERE id = '<id>';` — inspect raw JSONB before the render path.

**Redaction constraints:** Spaceship credentials (API key, secret) are never logged. Only domain strings appear in `[SpaceshipClient]` log lines.

## Expected Output

- `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx` — new server component rendering complete formatted report with domain badges and Create site CTA
- `apps/admin/src/app/(dashboard)/research/page.tsx` — modified: completed branch renders `ResearchReportViewer` with domain checks; non-completed path unchanged
