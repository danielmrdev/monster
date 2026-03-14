# S02: Analytics Dashboard — Research

**Date:** 2026-03-13
**Milestone:** M005

## Summary

S02 is a server-component Next.js page that reads from `analytics_events` (raw, always populated after S01 UAT) and `analytics_daily` (aggregated, populated by S03). The pattern is already established across `dashboard/page.tsx`, `finances/page.tsx`, and `sites/[id]/page.tsx` — `createServiceClient()` + `Promise.all` + typed rows + Card/Table/Badge UI. No new infrastructure is needed.

The key architectural decision is **where to aggregate**: Supabase's REST API (supabase-js) does not support `GROUP BY`. For site-level totals, we fetch all events in the selected date range and aggregate in application code (JS). At Phase 1 volumes (hundreds of events total), fetching `SELECT site_id, event_type, page_path, visitor_hash` for a 30-day range is well within Supabase's 1MB row limit and negligible server compute. When `analytics_daily` is populated (after S03 ships), the same dashboard gains a secondary "Daily Aggregates" section for free — rendering pre-aggregated rows with no extra computation.

The filter UI (site selector + date range: today / 7d / 30d) is driven by URL search params. Next.js 15 server components receive `searchParams: Promise<{ site?: string; range?: string }>`, which the page awaits to compute the date range and optional site filter. A small `'use client'` filter component updates the URL via a native `<form method="GET">` — the simplest approach, no `useRouter` import needed, works without JavaScript enabled (progressive enhancement).

**Country breakdown will always be empty in Phase 1** (D081 — `country` is always `null`). Render a graceful "No country data yet" state rather than an empty table or 0-row breakdown.

## Recommendation

One server component (`analytics/page.tsx`) + one client component (`analytics/AnalyticsFilters.tsx`). Server component reads `searchParams`, computes date range (default: 7d), fetches `analytics_events` rows for range, aggregates in JS to produce per-site metrics and top-pages list, also fetches `analytics_daily` rows for a secondary aggregate section (may be empty). Passes aggregated data as props to pure UI rendering — no client-side data fetching needed.

Do not introduce chart libraries in S02. The roadmap specifies visits, pageviews, affiliate clicks per site + top pages + country breakdown — this is a table/card layout, not a chart. shadcn's existing `Card`, `Table`, `Badge` components are sufficient.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Service role client | `createServiceClient()` from `@/lib/supabase/service` | Pattern established in every dashboard page. One re-export, all service-role reads go through it. |
| Date range filtering in Supabase queries | `.gte('created_at', startISO).lte('created_at', endISO)` (supabase-js v2) | Already available in the `@supabase/supabase-js` version installed. No library needed. Use `toISOString()` for UTC timestamps. |
| Date arithmetic (7 days ago, 30 days ago) | Native `Date` | No date library in the project. `new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()` is clear and zero-dep. |
| Site-level aggregation from raw events | JS `Array.reduce` over fetched rows | supabase-js REST has no GROUP BY. Fetch minimal columns (`site_id, event_type, page_path, visitor_hash`) and reduce in app code. Phase 1 volumes make this trivial. |
| searchParams in Next.js 15 server components | `searchParams: Promise<{ site?: string; range?: string }>`, `const params = await searchParams` | Identical pattern to `apps/admin/src/app/(auth)/login/page.tsx`. Must be awaited in Next.js 15. |
| Filter UI that updates URL | Native `<form method="GET">` with `<select>` elements | No `useRouter` or `useSearchParams` needed. Native form GET submits to the same route with query params. Works without JS. Follows D024 pattern (prefer native form constructs). |
| UI components | `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow`, `Badge` | All installed and used in `finances/page.tsx` and `sites/[id]/page.tsx`. Copy the import block. |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/finances/page.tsx` — **primary pattern to follow**: `Promise.all` parallel fetch, `if (error) throw`, typed rows, Card wrapper with Table inside. Identical structure needed in analytics page.
- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — KPI card pattern (`count: 'exact', head: true` for cheap counts). Can be used for total events across all sites as a top-level KPI.
- `apps/admin/src/app/(dashboard)/sites/[id]/page.tsx` — `scoreColor` and `gradeBadgeVariant` helpers show how to do conditional styling on numeric values. Same approach for "highlight high-traffic pages".
- `apps/admin/src/app/(auth)/login/page.tsx` — `searchParams: Promise<{ error?: string }>` with `await searchParams` — exact typing pattern for Next.js 15 server component with URL params.
- `apps/admin/src/app/(dashboard)/finances/cost-form.tsx` — `NativeSelect` component (inline styled `<select>`) + `'use client'` boundary pattern. The filter form will be simpler (no form actions, just GET submit).
- `apps/admin/src/lib/supabase/service.ts` — canonical import: `export { createServiceClient } from '@monster/db'`. Always import from here.
- `packages/db/src/types/supabase.ts` — typed rows available: `analytics_events.Row` and `analytics_daily.Row`. Use these for typed array operations during aggregation.

## Constraints

- **`analytics_daily` has no `top_pages` column** — the M005-ROADMAP S03 boundary map mentions `top_pages jsonb`, but the actual migration (`20260313000003_analytics.sql`) does not have it. `analytics_daily` PK is `(site_id, date, page_path)` — each row IS one page's daily metrics. "Top pages" is derived by ordering `analytics_daily` rows (or aggregated `analytics_events` rows) by `pageviews DESC`. No schema migration needed.
- **`analytics_daily` is empty until S03 runs** — S02 ships before S03. The dashboard must handle an empty `analytics_daily` table gracefully (show a "Aggregated data will appear after the daily cron runs" note, not an error).
- **Country is always `null`** (D081) — `analytics_events.country` is null for all Phase 1 events. Country breakdown section should show a "No country data in Phase 1" placeholder, not an empty table.
- **No GROUP BY in supabase-js** — all site-level aggregation happens in application code. Minimize the SELECT columns to reduce payload: `site_id, event_type, page_path, visitor_hash` is sufficient (no `referrer`, `language`, `created_at` needed for the KPIs). Language breakdown is a stretch goal — omit from S02.
- **Service role bypasses RLS** — reads from both `analytics_events` (INSERT-only for anon, no SELECT policy) and `analytics_daily` (no policies at all) work fine via service role. No extra policies needed.
- **Next.js 15 `searchParams` must be awaited** — `Promise<Record<string, string | string[] | undefined>>`. Type it explicitly to avoid implicit `any`. The range param is one of `'today' | '7d' | '30d'`; default to `'7d'` if absent or unrecognized.
- **No client-side data fetching in S02** — the dashboard is a pure server component (except the filter control). All aggregation happens server-side. No `useEffect`, no `fetch` in client code.
- **`analytics_events` query payload size** — fetching 4 columns for 30 days of events at Phase 1 volume (<<10k rows) is well within the 1MB supabase-js limit. If row count grows past 10k, the query needs pagination or a switch to `analytics_daily`. Add a comment in the code documenting this threshold.
- **Date range uses UTC** — `analytics_events.created_at` is `timestamptz` stored in UTC. Date range boundaries must be UTC ISO strings. `new Date().toISOString()` is always UTC.

## Common Pitfalls

- **`searchParams` not awaited** — in Next.js 15, `searchParams` is a Promise. Accessing `searchParams.site` directly (without await) returns undefined silently. Always `const { site, range } = await searchParams`.
- **`analytics_daily` empty-state crash** — if `analytics_daily` returns 0 rows and the code tries to read `data[0].site_id`, it throws. Always check `data.length === 0` before accessing rows.
- **KPI card counts wrong for "All Sites"** — when no site filter is active, total pageviews = sum across all sites. When a site is filtered, counts are for that site only. The query condition must be conditional: `.eq('site_id', siteId)` only when `siteId` is set.
- **Unique visitors double-counted** — `visitor_hash` from `analytics_events` is a daily hash (SHA-256 of date+userAgent). Counting `new Set(events.map(e => e.visitor_hash)).size` gives approximate unique visitors for the selected period (may undercount if a user visited on multiple days with the same hash). Document this in a comment — it's a known Phase 1 limitation (D080).
- **"top pages" includes legal pages** — `analytics_events` fires on every page load including `/aviso-legal`, `/privacidad`, etc. The top-pages list will include legal pages. This is correct behavior — do not filter them out. The user can see which pages get traffic.
- **Native `<form method="GET">` resets on submit** — native form GET submit loses the non-submitted fields if not present in the form. Both `site` and `range` selects must be in the same form so both params are preserved on submit.
- **`visitor_hash` may be null** — the fallback `Math.random()` 16-char hex in the tracker still produces a non-null string. But `visitor_hash` column is nullable in the schema. Guard against null: `events.filter(e => e.visitor_hash).map(e => e.visitor_hash!)` before `new Set(...)`.

## Open Risks

- **Large `analytics_events` scans** — once a site has thousands of daily events, fetching all rows for a 30-day range becomes a slow query. The existing indexes cover `(site_id)` and `(created_at)` but not the composite `(site_id, created_at)` needed for the filtered range scan. Add a note in the analytics page code: if the query becomes slow, the fix is a composite index (not code-level). Don't add the index now — it's premature at Phase 1 volumes.
- **`analytics_daily.top_countries` is a JSONB object `{country_code: count}`** — the schema stores countries as a map, not an array. Rendering requires `Object.entries(top_countries).sort(([,a],[,b]) => b - a)`. But since country is always null in Phase 1, this code path never executes. Write it defensively anyway for when Phase 2 populates it.
- **No loading state for filter changes** — the filter form does a full page navigation (GET). Between submit and page render there's no visible loading indicator. This is acceptable for Phase 1 (server renders fast). If it feels sluggish, add a `loading.tsx` in the analytics route (Next.js app router streaming).
- **`analytics_events` SELECT payload with no `created_at`** — if the date range computation is correct, we don't need `created_at` in the SELECT. But if we ever want to render a "events over time" chart, we'd need it. Fetch it for future-proofing even if not rendered in S02 — adds only ~16 bytes/row.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Next.js 15 App Router | (none searched) | not needed — well understood from M001-M004 patterns |
| Supabase JS filtering | (none searched) | not needed — `.gte()/.lte()` is standard supabase-js v2 API |

## Sources

- `apps/admin/src/app/(dashboard)/finances/page.tsx` — primary pattern: parallel fetch + error throw + Card/Table UI
- `apps/admin/src/app/(auth)/login/page.tsx` — `searchParams: Promise<...>` await pattern (Next.js 15)
- `packages/db/supabase/migrations/20260313000003_analytics.sql` — actual schema: `analytics_daily` has `page_path` in composite unique key (not a `top_pages` jsonb column), `analytics_events.country` nullable
- `packages/db/src/types/supabase.ts` — typed `analytics_events.Row` and `analytics_daily.Row` available for use in aggregation code
- `apps/admin/src/components/ui/` — available UI primitives: Card, Table, Badge, Button, Input, Label, Select, Separator (no chart library)
- M005-ROADMAP S02 boundary map — "sourced from analytics_events and analytics_daily via service role client"
- D080, D081 — visitor_hash is approximate (no IP), country always null in Phase 1
- D083 — full-day atomic aggregation in analytics_daily (S03 concern, but shapes how S02 reads it)
