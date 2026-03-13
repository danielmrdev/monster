---
id: T01
parent: S02
milestone: M001
provides:
  - Supabase credentials in .env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_DB_URL)
  - SUPABASE_DB_URL documented in .env.example with direct-connection warning
key_files:
  - .env
  - .env.example
  - .gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md
  - .gsd/milestones/M001/slices/S02/S02-PLAN.md
key_decisions:
  - none
patterns_established:
  - SUPABASE_DB_URL always uses direct postgres URL (port 5432), never pooler (6543)
observability_surfaces:
  - "grep -c '^NEXT_PUBLIC_SUPABASE_URL=\\|^NEXT_PUBLIC_SUPABASE_ANON_KEY=\\|^SUPABASE_SERVICE_ROLE_KEY=\\|^SUPABASE_DB_URL=' .env — should return 4 (currently 3)"
  - "grep 'SUPABASE_DB_URL' .env | grep -c ':5432' — 1 confirms direct connection"
  - "psql $SUPABASE_DB_URL -c 'SELECT 1;' — connectivity test (redact URL in logs)"
duration: ~20m
verification_result: partial
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: Collect Supabase credentials and document env vars

**3 of 4 Supabase credentials collected; SUPABASE_DB_URL documented in .env.example with direct-connection port guard.**

## What Happened

Ran `secure_env_collect` twice. Three keys were applied successfully: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`. `SUPABASE_SERVICE_ROLE_KEY` was skipped both times (user dismissed/skipped the input). The `SUPABASE_DB_URL` value uses port 5432 (confirmed by grep).

Pre-flight gaps were fixed before credential collection:
- Added a failure-diagnostic verification step to `S02-PLAN.md`
- Added `## Observability Impact` section to `T01-PLAN.md`

`.env.example` was updated to document `SUPABASE_DB_URL` with a comment explaining the direct-connection requirement and the port 5432 vs 6543 distinction.

## Verification

```
# Keys present in .env (returns 3, not 4 — SERVICE_ROLE_KEY missing)
grep -c "^NEXT_PUBLIC_SUPABASE_URL=\|^NEXT_PUBLIC_SUPABASE_ANON_KEY=\|^SUPABASE_SERVICE_ROLE_KEY=\|^SUPABASE_DB_URL=" .env
→ 3

# Port check — direct connection confirmed
grep "SUPABASE_DB_URL" .env | grep -c ":5432"
→ 1

# .env.example documented
grep "SUPABASE_DB_URL" .env.example
→ SUPABASE_DB_URL=
```

## Diagnostics

- Check key presence: `grep -c "^SUPABASE_" .env` — should return 4 when SERVICE_ROLE_KEY is added
- Port guard: `grep "SUPABASE_DB_URL" .env | grep -c ":5432"` — non-zero means direct connection
- Connectivity test: `psql $SUPABASE_DB_URL -c "SELECT 1;"` — isolates network vs auth failures
- If T02/T03 fail with auth errors, check SERVICE_ROLE_KEY is present (needed for `supabase gen types`)
- Never echo or log `SUPABASE_DB_URL` — it contains the DB password

## Deviations

- `SUPABASE_SERVICE_ROLE_KEY` was skipped by the user during `secure_env_collect` (twice). T03 (`supabase gen types`) may work without it using the DB URL directly, but the admin panel (S03+) will fail at runtime without it. **Must be collected before T03 or S03.**

## Known Issues

- **SUPABASE_SERVICE_ROLE_KEY is missing from `.env`.** This key is required for server-side Supabase operations (bypassing RLS). T02 (SQL migrations) does not need it. T03 (`supabase db push` + `supabase gen types`) uses `SUPABASE_DB_URL` directly and may succeed without it, but S03 typed client will fail at runtime. Resume T01 or collect this key at the start of T03.

## Files Created/Modified

- `.env` — applied NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_DB_URL (SERVICE_ROLE_KEY missing)
- `.env.example` — added SUPABASE_DB_URL with direct-connection comment
- `.gsd/milestones/M001/slices/S02/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M001/slices/S02/S02-PLAN.md` — added failure-diagnostic verification step (pre-flight fix)
