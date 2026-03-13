---
milestone: M002
slice: S02
title: Dashboard KPIs
date: 2026-03-13
status: complete
---

# S02: Dashboard KPIs — Research

**Date:** 2026-03-13

## Summary

S02 is the simplest slice in M002: replace the one-line "Coming soon" stub in `apps/admin/src/app/(dashboard)/dashboard/page.tsx` with real KPI cards fetched from Supabase. No mutations, no new schemas, no new patterns — pure read path. All patterns are already established and working from S01.

Four KPI counts are needed: total sites, live sites, draft sites, and open alerts. The `sites` and `product_alerts` tables are both typed in `packages/db/src/types/supabase.ts` and accessible via `createServiceClient()`. The supabase-js v2 `.select('*', { count: 'exact', head: true })` API returns a count without fetching rows — correct for KPI cards.

The shadcn `Card` component family (`Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`) is already installed and used in `sites/page.tsx`. Reuse it directly. This slice should take one task and ~20 minutes.

## Recommendation

Single server component, four parallel `count`-only queries, `Card`-based KPI grid. No client components needed — no interactivity required for the initial dashboard. Structure:

```
apps/admin/src/app/(dashboard)/dashboard/page.tsx
```

Four Supabase count queries (can be `Promise.all`-parallelized):
- `sites` total → `select('*', { count: 'exact', head: true })`
- `sites` where `status = 'live'` → filtered count
- `sites` where `status = 'draft'` → filtered count
- `product_alerts` where `status = 'open'` → filtered count

Render as a 4-column KPI card grid using the existing `Card` component. Error handling: if any count query fails, throw with a descriptive message (matches the pattern in `sites/page.tsx`).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| DB access in server component | `createServiceClient()` from `@/lib/supabase/service` | Already established canonical import; RLS bypass via service role key |
| KPI card layout | `Card`, `CardHeader`, `CardTitle`, `CardContent` from `@/components/ui/card` | Already installed; `sites/page.tsx` demonstrates correct usage |
| Status type constants | `SiteStatus` from `@monster/shared` | Type-safe; status strings are a closed union — no hardcoding |
| Parallel async fetches | `Promise.all([...])` | Standard JS; avoids sequential waterfall for 4 independent queries |

## Existing Code and Patterns

- `apps/admin/src/app/(dashboard)/dashboard/page.tsx` — current stub, a 4-line no-op. Replace entirely.
- `apps/admin/src/app/(dashboard)/sites/page.tsx` — canonical server component pattern for this app: `createServiceClient()`, destructure `{ data, error }`, throw on error, render with Card + Table. Follow the same shape.
- `apps/admin/src/lib/supabase/service.ts` — canonical `createServiceClient()` import. Use this path, not `@monster/db` directly.
- `apps/admin/src/components/ui/card.tsx` — `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` all available. No installation needed.
- `apps/admin/src/components/ui/badge.tsx` — available if an alert count badge is useful in the UI.

## Constraints

- **RLS is enabled with zero permissive policies on `sites` and `product_alerts`.** The anon client (used by layout.tsx for auth) returns zero rows. `createServiceClient()` (service role key) bypasses RLS — mandatory for all reads in this server component.
- **`product_alerts` table may be empty** in early Phase 1 (no product refresh jobs have run yet). The count will be 0 — render it gracefully. An open alerts count of 0 is a valid and expected state.
- **`sites` table may also be empty** if no sites were created via the S01 form. Render 0s without error states.
- **`count` property is `number | null` in the supabase-js return type.** Coerce to 0 with `?? 0` before display — never render `null` directly.
- **No `'use client'` needed.** The dashboard page is a server component. No state, no event handlers, no hydration. Keep it fully server-rendered.
- **S02 has no new DB tables, types, or schemas.** Everything it needs exists.

## Common Pitfalls

- **Using `.select('*')` instead of `.select('*', { count: 'exact', head: true })`** — the former fetches all rows and counts client-side (slow, wasteful). The `head: true` flag makes it a `HEAD` request that returns only the `Content-Range` header with the count. Use `head: true` for all four queries.
- **Forgetting `.eq('status', 'live')` filter on the live/draft counts** — the `status` field is a plain `text` column; the filtered count query is: `.from('sites').select('*', { count: 'exact', head: true }).eq('status', 'live')`.
- **`open_alerts` count — filter is `.eq('status', 'open')`** — the `product_alerts` table has three statuses: `open`, `acknowledged`, `resolved`. Dashboard should show only `open` alerts.
- **Waterfall vs parallel** — four sequential awaits take 4× the latency of one. Use `Promise.all` to fire all four queries in parallel. This is a server component so there's no client bundle concern.
- **Throwing a vague error** — if a query fails, throw `new Error('Failed to fetch dashboard KPIs: ' + error.message)` so pm2 logs show exactly which query failed.

## Open Risks

- **`product_alerts` table existence in production** — migration 007 creates `product_alerts`. If the Supabase Cloud DB does not have migration 007 applied (unlikely given M001 verification, but possible if migrations were applied selectively), the query will fail. Mitigation: verify after deploy by checking pm2 logs.
- **4 round-trips on every dashboard load** — with `Promise.all`, all four queries fire in parallel and resolve in one RTT. At Phase 1 scale this is acceptable. If the dashboard becomes a hot path, a Postgres view or RPC could reduce it to one query — premature now.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| supabase-js count API | (built-in knowledge) | no skill needed — standard API |
| shadcn v4 Card | (installed, already in use) | no skill needed |

## Sources

- `apps/admin/src/app/(dashboard)/sites/page.tsx` — canonical server component + service client pattern in this codebase
- `packages/db/src/types/supabase.ts` lines 435–484 — `product_alerts` Row type: `{ id, site_id, product_id, alert_type, status, details, created_at, resolved_at }`
- `packages/db/src/types/supabase.ts` lines 840–900 — `sites` Row type: `{ id, name, domain, status, ... }`
- `node_modules/.pnpm/@supabase+postgrest-js@2.99.1/.../PostgrestQueryBuilder.ts` line 688 — `count: 'exact' | 'planned' | 'estimated'`, `head?: boolean` — count API confirmed at supabase-js v2.99.1
- `packages/db/supabase/migrations/20260313000007_alerts.sql` — `product_alerts` table schema and status enum: `open | acknowledged | resolved`
- Migration 001 `sites` status check: `draft | generating | deploying | dns_pending | ssl_pending | live | paused | error`
