# M007/S03 — Research Report UI + Domain Suggestions + Create Site CTA

**Date:** 2026-03-14

## Summary

S03 is the display layer for everything S02 built. The core data is already in the DB — `research_sessions.report` is a validated JSON object matching `ResearchReportSchema` (10 fields: `niche_idea`, `market`, `viability_score`, `summary`, `keywords[]`, `competitors[]`, `amazon_products[]`, `domain_suggestions[]`, `recommendation`, `generated_at`). The job is to render this data as a formatted report, run live Spaceship availability checks on domain suggestions, and wire a "Create site from this research" CTA that pre-fills the new-site form.

Three deliverables: (1) a `ResearchReport` viewer component tree, (2) live domain availability badge resolution at render time, (3) CTA that navigates to `/sites/new?niche=...&market=...` with the form reading those params. There are no new agents, no new queues, no new DB columns. Risk is low — `SpaceshipClient.checkAvailability()` is already working in admin server actions, `ResearchReport` type is already exported from `@monster/shared`, and the admin build is clean.

The key architectural question is where the report viewer lives. The current `/research?session=<id>` shows the `ResearchSessionStatus` polling component. S03 needs to show the full report when a session is `completed`. The cleanest approach is to extend `page.tsx` with a dedicated `/research/[id]` route for the report viewer — keeps the history+form on `/research` and gives completed reports a stable, bookmarkable URL. The `/research?session=<id>` query-param link then redirects or navigates the user to `/research/<id>` when the session completes. Alternatively, the report viewer can live inline on the same `/research?session=<id>` page by replacing the `ResearchSessionStatus` component with a `ResearchReportViewer` when status is `completed`. The inline approach is simpler (fewer files) and consistent with the existing `?session=` pattern already wired in S02.

## Recommendation

**Inline report viewer on the existing `/research?session=<id>` page.** When the session is `completed`, replace the `ResearchSessionStatus` component with a `ResearchReportViewer` server component that fetches the full report. No new route needed, no extra navigation. The history list already links to `?session=<id>` — completed sessions will show the report automatically. This is the minimal change that satisfies the slice: session history + status polling + full report rendering all in one page at one URL pattern. Add a separate `/research/[id]` route only if the report viewer becomes too heavy for the main page (unlikely for a static data display).

For domain availability: resolve all suggestions **server-side at render time** (not client-side). The page is already a server component — call `SpaceshipClient.checkAvailability()` in parallel via `Promise.allSettled()` for each domain suggestion in the report. This avoids a client-side waterfall. Credentials not configured → `checkAvailability` throws → catch and render "Unknown" badge. Never fail the whole page on a Spaceship credential error.

For the "Create site" CTA: add `defaultValues` props to `SiteForm` (niche, market pre-filled). `page.tsx` (server component) reads `?session=<id>`, fetches the report, and passes `niche_idea` and `market` as query params to the new-site URL via a Next.js `<Link>`. The new-site page reads `searchParams` and passes them to `SiteForm` as `defaultValues`. `SiteForm` already has `defaultValue` on `NativeSelect` — just need to wire props through.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Domain availability check | `SpaceshipClient.checkAvailability()` in `packages/domains/src/spaceship.ts` | Already implemented, handles auth from settings, error-returns `{ available, price }`, proven in `/sites/[id]/actions.ts` via `checkDomainAvailability()` wrapper |
| Spaceship call from server action | `checkDomainAvailability()` in `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` | Exact pattern to follow: `new SpaceshipClient()`, `.checkAvailability(domain)`, catch+return |
| Report type access | `ResearchReport` from `@monster/shared` | Already exported; admin already imports from `@monster/shared`; Zod-validated shape |
| Status badge component | `BADGE` map pattern from `ResearchSessionStatus.tsx` | Same shape for `available`/`unavailable`/`unknown` availability badges |
| Polling → terminal → replace | `ResearchSessionStatus.tsx` current `completed` branch | Already renders "report ready" message when `completed` — extend this to pass report data to viewer |
| Pre-filled form defaultValues | `NativeSelect defaultValue` prop + `Input defaultValue` in `site-form.tsx` | Pattern exists — `NativeSelect` accepts `defaultValue` prop already; `Input` uses uncontrolled `defaultValue` |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/research/page.tsx` — async server component with `searchParams: Promise<{ session? }>` pattern; already parallel-fetches sessions + active session; **S03 extends this**: when `activeSession.status === 'completed'`, render `ResearchReportViewer` instead of `ResearchSessionStatus`
- `apps/admin/src/app/(dashboard)/research/ResearchSessionStatus.tsx` — `'use client'` polling component; already has `completed` branch that shows "report ready for viewing in S03" placeholder; **S03 replaces this placeholder** with actual report render or emits an `onComplete(report)` callback so `page.tsx` can conditionally swap in the server-rendered viewer
- `apps/admin/src/app/(dashboard)/research/actions.ts` — `getResearchSessionStatus()` returns `{ status, progress, report }` — report is typed `unknown` but is `ResearchReport | { raw, error }` at runtime; S03 needs a `getResearchReport(sessionId)` server action that fetches report + runs domain checks
- `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` — `checkDomainAvailability(domain)` wrapper around `SpaceshipClient`; S03 calls `SpaceshipClient` directly or reuses this action for batch domain checks (but server actions can't be imported from other server action files — call `SpaceshipClient` directly in the new research action)
- `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — `SiteForm` component uses `useActionState`, `NativeSelect` with `defaultValue` prop, uncontrolled `Input`; accepts no props currently — **S03 adds `defaultValues?: { niche?: string; market?: string }` prop** and passes them as `defaultValue` to relevant inputs
- `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — static server component passing no props to `SiteForm`; **S03 adds `PageProps` with `searchParams`** and passes niche+market params down to `SiteForm`
- `packages/shared/src/types/research-report.ts` — `ResearchReportSchema` + `ResearchReport` type; parse with `ResearchReportSchema.safeParse(report)` at render time (do not trust `completed` status alone — report may be `{ raw, error: 'parse_failed' }`)
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — complex server page with parallel fetches + `Badge` + `Table` components; pattern for rich data display
- `apps/admin/src/components/ui/badge.tsx` — `Badge` component with `variant` prop (`default`/`secondary`/`destructive`/`outline`) — use for domain availability badges and viability score indicator

## Constraints

- **`report` can be `{ raw: string, error: 'parse_failed' }` even when `status === 'completed'`** — always `ResearchReportSchema.safeParse()` before rendering structured fields; render a graceful fallback with the raw JSON when parse fails.
- **Spaceship credentials may not be configured** — `SpaceshipClient.checkAvailability()` throws if `spaceship_api_key`/`spaceship_api_secret` are absent from settings. Catch per-domain, return `{ available: null }` (unknown). Never let a missing credential crash the page. Use `Promise.allSettled()` not `Promise.all()` for concurrent domain checks.
- **Server actions cannot import from other server action files** — `checkDomainAvailability()` lives in `sites/[id]/actions.ts` with `'use server'`. Research page actions can't import it. Call `new SpaceshipClient().checkAvailability()` directly inside the research actions or a new `research/actions.ts` function.
- **`SiteForm` is a `'use client'` component using `useActionState`** — it cannot receive server-side props that change per-render after hydration. Pass `defaultValues` as plain serializable props from the server component (strings, not functions). `defaultValue` on uncontrolled inputs sets the initial value and is never updated reactively — that's fine for pre-fill.
- **Next.js `searchParams` are typed as `Promise<{...}>` in app router pages** — always `await searchParams` in the page component body. Applies to both `/research/page.tsx` and `/sites/new/page.tsx`.
- **`@monster/domains` is already in `apps/admin` dependencies** — no new deps needed. `SpaceshipClient` is safe to use server-side in route handlers and server actions.
- **D034 pattern applies to new research actions** — if adding non-async exports (types, constants) needed by S03 components, put them in `constants.ts` not `actions.ts`.
- **D089 pattern** — any new interactive element (e.g. a "Copy domain to clipboard" button or expandable section) must be a separate `'use client'` file, not inlined in the server page component.
- **Cloudflare package not used here** — `@monster/domains` exports both `CloudflareClient` and `SpaceshipClient`; webpack may try to bundle `cloudflare` npm package into the admin bundle if `@monster/domains` is imported. Current `next.config.ts` has only `@anthropic-ai/claude-agent-sdk` in `serverExternalPackages`. May need to add `cloudflare` to `serverExternalPackages` if a build error appears. Check existing `sites/[id]/actions.ts` — it already imports `SpaceshipClient` from `@monster/domains` and the admin build passes, so this is already resolved.

## Architecture Decision: Where the Report Viewer Lives

**Decision: Hybrid approach.** The `/research?session=<id>` page renders the report inline when completed. The `ResearchSessionStatus.tsx` client component currently renders a placeholder for S03. Two options for wiring:

**Option A (Server-side switch):** `page.tsx` fetches `report` from DB server-side. If `status === 'completed'` and report parses, render `<ResearchReportViewer report={parsedReport} />` (server component) instead of `<ResearchSessionStatus>`. Domain checks run server-side in `page.tsx` before rendering. The polling component is never mounted for completed sessions — they see the report immediately on page load.

**Option B (Client-side complete callback):** `ResearchSessionStatus` polls until `completed`, then triggers a page navigation/refresh to reload the server component. Adds complexity (router.refresh() or page reload) for no benefit.

**Option A is correct.** Server components composing cleanly. The active session section in `page.tsx` becomes:
```
if (status === 'completed') → <ResearchReportViewer report={...} domains={...} />
else → <ResearchSessionStatus sessionId={...} initialStatus={...} />
```

## File Plan

Files to create:
1. `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.tsx` — server component; renders keyword table, competitors, Amazon products, domain badges, viability score, summary, recommendation, "Create site" CTA
2. `apps/admin/src/app/(dashboard)/research/ResearchReportViewer.types.ts` (optional) — or just inline the props type in the viewer

Files to modify:
3. `apps/admin/src/app/(dashboard)/research/page.tsx` — add report fetching + domain availability checks for completed sessions; swap in `ResearchReportViewer` when completed
4. `apps/admin/src/app/(dashboard)/research/actions.ts` — add `getResearchReport(sessionId)` action that returns `{ report: ResearchReport | null, rawReport: unknown }` with Spaceship checks inside; OR keep domain checks in page.tsx directly
5. `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` — add `defaultValues?: { niche?: string; market?: string }` prop; wire to relevant `defaultValue` attributes
6. `apps/admin/src/app/(dashboard)/sites/new/page.tsx` — add `searchParams: Promise<{ niche?: string; market?: string }>` prop; read and pass to `SiteForm`

Domain availability: perform checks directly in `page.tsx` (server component) — no need for a separate server action since it's not called by client code. Keeps the logic co-located with the render.

## Common Pitfalls

- **`ResearchReport.domain_suggestions[].available` is the value stored at agent runtime** — it may be `null` (not checked) or stale `false` (Spaceship credentials not configured during the agent run). Always re-check via `SpaceshipClient.checkAvailability()` at render time for fresh availability status. The stored `available` field should be treated as a cache hint, not ground truth.
- **`report` field is `Json | null` in Supabase types** — cast via `report as unknown as ResearchReport` after `safeParse` succeeds; don't try to use the raw Supabase type. Same pattern as D114 in reverse: parse validates, then use the Zod-inferred type.
- **`SiteForm` uses uncontrolled inputs** — `defaultValue` on an `<Input>` sets the initial DOM value and will not update if the prop changes. That's fine here — the page is server-rendered, so the default value is baked in at render time and never needs to change reactively.
- **Query params must be URL-encoded** — niche ideas can contain spaces and special characters. Use `encodeURIComponent(niche_idea)` when building the `/sites/new?niche=...` URL. Read with `decodeURIComponent` if necessary (Next.js `searchParams` already decodes).
- **`Promise.allSettled` for domain checks** — if any single domain check throws (Spaceship 429, network error), `Promise.all` would reject the whole page render. `allSettled` ensures all others still display.
- **`SpaceshipClient` credential fetch hits Supabase on every call** — for 3-5 domain suggestions, that's 3-5 separate Supabase round-trips for credentials. Acceptable for now (Supabase is fast). If it becomes slow, extract credential fetch once and pass to a shared header. Not worth optimizing in S03.
- **Don't pass `keywords[]` in the URL params** — the roadmap mentioned `?keywords=...` but keywords are a structured array that doesn't map cleanly to query params and the site-form has no keywords field. Pass only `niche` and `market` — the same fields that are meaningful form inputs.

## Open Risks

- **Spaceship rate limit (5 requests per domain per 300s)** — not a concern for the report viewer (each domain is only checked once per page load). But if the user refreshes the page multiple times rapidly, they could hit the rate limit per domain. The `available` field cached in the report could serve as a fallback if the Spaceship call fails on refresh.
- **Report parse failure UI** — when `report.error === 'parse_failed'`, the viewer should degrade gracefully with a "Report could not be parsed" message and a collapsed raw JSON block (same pattern as the current `<details>` in `ResearchSessionStatus`). This path will be exercised in environments without real DataForSEO data — the agent may emit non-compliant JSON.
- **Admin build impact of cloudflare transitive dep** — `apps/admin` already imports `SpaceshipClient` from `@monster/domains` in `sites/[id]/actions.ts` and the admin build is clean. The research page importing `SpaceshipClient` directly follows the same pattern. No new risk here.
- **`SiteForm` defaultValues are not validated** — the `niche` query param comes from the URL; a malicious or malformed value gets pre-filled into the textarea. This is fine — the `createSite` server action validates all fields via Zod. The pre-fill is cosmetic UX only.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js 15 App Router | built-in knowledge | n/a |
| Tailwind v4 + shadcn | built-in knowledge | n/a |
| SpaceshipClient | codebase — `packages/domains/src/spaceship.ts` | n/a |

## Sources

- `ResearchReportSchema` shape confirmed in `packages/shared/src/types/research-report.ts` (codebase)
- `SpaceshipClient.checkAvailability()` usage pattern in `apps/admin/src/app/(dashboard)/sites/[id]/actions.ts` (codebase)
- `SiteForm` `defaultValue` prop pattern in `apps/admin/src/app/(dashboard)/sites/new/site-form.tsx` (codebase)
- `ResearchSessionStatus.tsx` S03 placeholder text confirms contract: "report ready for viewing in S03" (codebase)
- Admin build clean with `@monster/domains` already imported in server actions — no new `serverExternalPackages` needed (build output confirmed)
