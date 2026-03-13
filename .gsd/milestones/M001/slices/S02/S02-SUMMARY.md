---
id: S02
parent: M001
milestone: M001
provides:
  - Full Phase 1 schema applied to Supabase Cloud (21 tables across 7 migration files)
  - Generated TypeScript types in packages/db/src/types/supabase.ts (1218 lines, committed)
  - RLS enabled on all 21 tables; analytics_events is the sole anon-accessible table
  - site_types seeded (tsa), site_templates seeded (classic/modern/minimal), cost_categories seeded (5 rows)
requires:
  - slice: S01
    provides: packages/db/ scaffold with package.json, tsconfig.json, supabase/migrations/ directory
affects:
  - S03 (imports packages/db/src/types/supabase.ts for typed client)
  - S04 (uses SUPABASE_DB_URL + NEXT_PUBLIC_SUPABASE_* env vars)
key_files:
  - packages/db/supabase/migrations/20260313000001_core.sql
  - packages/db/supabase/migrations/20260313000002_tsa.sql
  - packages/db/supabase/migrations/20260313000003_analytics.sql
  - packages/db/supabase/migrations/20260313000004_seo.sql
  - packages/db/supabase/migrations/20260313000005_ai.sql
  - packages/db/supabase/migrations/20260313000006_finances.sql
  - packages/db/supabase/migrations/20260313000007_alerts.sql
  - packages/db/src/types/supabase.ts
  - .env.example
key_decisions:
  - analytics_events partitioning deferred: regular table + cron cleanup (Phase 2)
  - updated_at not auto-maintained via trigger — set in application code (S03 client layer)
  - product_alerts status enum includes 'acknowledged' (open → acknowledged → resolved)
  - revenue_amazon UNIQUE key includes market column for Phase 2 multi-market support
patterns_established:
  - uuid PKs with gen_random_uuid() throughout
  - timestamptz for all timestamps
  - text (not varchar) for all string columns
  - text[] for simple string arrays; jsonb for nested structured data
  - RLS enabled on every table; anon INSERT policy only on analytics_events
  - Seed data uses ON CONFLICT DO NOTHING for idempotency
  - SUPABASE_DB_URL always port 5432 (direct), never 6543 (pooler)
observability_surfaces:
  - supabase gen types --db-url $SUPABASE_DB_URL — regenerate types on schema change
  - npx supabase db push --db-url $SUPABASE_DB_URL — prints per-migration result
  - Supabase dashboard Table Editor — shows all 21 tables with RLS badges
drill_down_paths:
  - .gsd/milestones/M001/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S02/tasks/T03-SUMMARY.md
duration: ~2h total (T01: 20m, T02: 45m, T03: blocked then 30m on resume)
verification_result: passed
completed_at: 2026-03-13
---

# S02: Supabase Schema

**Full Phase 1 schema pushed to Supabase Cloud — 21 tables across 7 migrations, TypeScript types generated (1218 lines) and committed.**

## What Happened

**T01** collected three of four Supabase credentials via `secure_env_collect`. `SUPABASE_DB_URL` was stored with a `[YOUR-PASSWORD]` placeholder — the user provided only the project URL format at that stage, not the real password. `SUPABASE_SERVICE_ROLE_KEY` was collected during T03 instead.

**T02** wrote all 7 migration files as plain SQL. Key design choices made: `sites` table has zero TSA-specific columns (extensibility proof via D001), `analytics_events` gets the only anon INSERT policy (RLS on all 21 tables, only this one opens to public), seed data is idempotent via `ON CONFLICT DO NOTHING`. `site_templates` seeded with 3 rows (classic/modern/minimal) as FK target. `product_alerts` status enum extended to include `acknowledged` for richer state tracking. All FK ordering verified — no forward references between migration files.

**T03** was initially blocked: `SUPABASE_DB_URL` still contained `[YOUR-PASSWORD]` from T01. On resume, the real DB password was collected, the full URL reconstructed (user had pasted only the password string, not the full URI), and the URL written to `.env`. All 7 migrations pushed successfully via `npx supabase db push --db-url`. Types generated via `npx supabase gen types typescript --db-url`, producing 1218 lines covering all 21 tables. Committed as `feat(S02): apply Phase 1 schema + generate types`.

## Verification

```
# 7 migration files
ls packages/db/supabase/migrations/*.sql | wc -l  → 7

# All 7 concern areas in generated types (19 matches across tsa_categories, tsa_products,
# analytics_events, seo_scores, ai_jobs, costs, product_alerts)
grep -c "tsa_categories\|tsa_products\|analytics_events\|seo_scores\|ai_jobs\|costs\|product_alerts" \
  packages/db/src/types/supabase.ts  → 19

# SUPABASE_DB_URL documented
grep "SUPABASE_DB_URL" .env.example  → SUPABASE_DB_URL=

# sites table clean (no TSA columns)
grep -i "asin\|product_id" packages/db/supabase/migrations/20260313000001_core.sql  → (empty)

# analytics_events anon INSERT policy
grep "WITH CHECK (true)" packages/db/supabase/migrations/20260313000003_analytics.sql  → match

# types file > 100 lines
wc -l packages/db/src/types/supabase.ts  → 1218

# committed
git show HEAD --stat | grep supabase.ts  → packages/db/src/types/supabase.ts | 1218 +++
```

## Requirements Advanced

- R002 (extensible site type architecture) — proven: `sites` table has zero TSA-specific columns; TSA data lives in `tsa_categories`, `tsa_products`, `category_products`. A second site type needs only new type-specific tables, not structural changes to `sites`.

## Requirements Validated

- none — R002 is advanced but not fully validated until a second site type is actually added (Phase 2)

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- `site_templates` seeded with 3 rows (classic/modern/minimal) — not in the plan's explicit must-haves but logically required as FK target for `sites.template_slug`. Zero downstream impact.
- `product_alerts` status enum includes `acknowledged` (open → acknowledged → resolved) — richer than plan's implicit open/resolved. No downstream impact.
- `revenue_amazon` UNIQUE constraint includes `market` column — anticipates Phase 2 multi-market without schema change. No downstream impact.
- `SUPABASE_SERVICE_ROLE_KEY` collected in T03 (not T01) — user skipped it twice during T01.
- `SUPABASE_DB_URL` reconstructed from user-provided password — user pasted only the password string; full URI was rebuilt from the known project ref (`iygjgkproeuhcvbrwloo`).
- `updated_at` not auto-maintained via trigger — decided against `moddatetime` extension; application code sets it. Simpler and consistent with the S03 client pattern.

## Known Limitations

- `updated_at` requires application code to maintain — if a row is updated via raw SQL or the Supabase dashboard, `updated_at` won't auto-update. Document this for S03 client and any admin tooling.
- `analytics_events` has no partitioning — implemented as regular table. At high event volumes (millions/day) query performance will degrade without a cron cleanup job. Deferred to Phase 2.
- `SUPABASE_SERVICE_ROLE_KEY` now in `.env` but was missing through T01 and T02. Any tooling that ran before T03 resume would have lacked it.

## Follow-ups

- S03: wrap generated types in typed client factory; implement `updated_at` maintenance pattern in client layer
- Phase 2: add `analytics_events` partitioning or cron cleanup when event volume warrants
- Phase 2: add second site type tables to prove R002 validated (not just advanced)

## Files Created/Modified

- `packages/db/supabase/migrations/20260313000001_core.sql` — site_types, site_templates, sites, settings, domains, deployments (6 tables, seeded)
- `packages/db/supabase/migrations/20260313000002_tsa.sql` — tsa_categories, tsa_products, category_products (3 tables)
- `packages/db/supabase/migrations/20260313000003_analytics.sql` — analytics_events (anon INSERT), analytics_daily (2 tables)
- `packages/db/supabase/migrations/20260313000004_seo.sql` — seo_scores (1 table)
- `packages/db/supabase/migrations/20260313000005_ai.sql` — research_sessions, research_results, chat_conversations, chat_messages, ai_jobs (5 tables)
- `packages/db/supabase/migrations/20260313000006_finances.sql` — cost_categories, costs, revenue_amazon, revenue_adsense, revenue_manual, revenue_daily (6 tables, cost_categories seeded)
- `packages/db/supabase/migrations/20260313000007_alerts.sql` — product_alerts (1 table)
- `packages/db/src/types/supabase.ts` — 1218-line generated TypeScript types (committed)
- `.env` — all 4 Supabase credentials applied (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL)
- `.env.example` — SUPABASE_DB_URL documented with direct-connection comment

## Forward Intelligence

### What the next slice should know
- `packages/db/src/types/supabase.ts` is generated — do not hand-edit it. Regenerate with `npx supabase gen types typescript --db-url $SUPABASE_DB_URL > src/types/supabase.ts` after any schema change.
- `updated_at` is NOT auto-maintained. S03 client must explicitly set it on every update. Establish this as a pattern in the client layer or it will silently be wrong everywhere.
- `SUPABASE_DB_URL` contains the DB password — never log, echo, or commit it. Use `sed 's/:[^:]*@/:***@/'` when displaying it.
- All 4 Supabase env vars are in `.env`. All are required for the typed client and server-side auth.
- The `supabase gen types` command needs direct DB access (port 5432, not pooler at 6543) — same URL as `db push`.
- `SUPABASE_SERVICE_ROLE_KEY` is needed for server-side operations that bypass RLS. `NEXT_PUBLIC_SUPABASE_ANON_KEY` is for browser-side (anon) access. Both are needed in the admin panel.

### What's fragile
- `updated_at` discipline — if S03 doesn't establish a consistent update pattern in the client, timestamps will silently stall. This is the most likely thing to go wrong in downstream code.
- `analytics_events` anon policy — it uses `WITH CHECK (true)` which allows ANY insert by anon. The only protection is that the site_id must be a valid UUID; there's no FK enforcement from the public to `sites`. Spam inserts are possible. Mitigate with Supabase rate limiting or an Edge Function validator in Phase 2.

### Authoritative diagnostics
- `npx supabase db push --db-url $SUPABASE_DB_URL` — prints per-migration result with failing statement context; most reliable signal for migration failures
- Supabase dashboard → Table Editor — visual confirmation of all 21 tables and RLS status badges
- `npx supabase gen types typescript --db-url $SUPABASE_DB_URL | head -50` — quick sanity check on schema after changes

### What assumptions changed
- Original assumption: `SUPABASE_DB_URL` would be collected in T01 with a real password. Actual: user provided a placeholder in T01, collected the actual password only when re-prompted at T03 resume.
- Original assumption: user would provide the full URI. Actual: user pasted only the password; the full URI had to be reconstructed from the known project ref.
