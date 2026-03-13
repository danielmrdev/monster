---
id: T03
parent: S02
milestone: M001
provides:
  - nothing yet — task blocked on SUPABASE_DB_URL containing placeholder password
key_files:
  - .env
key_decisions:
  - none
patterns_established:
  - none
observability_surfaces:
  - "grep 'SUPABASE_DB_URL' .env | grep -c 'YOUR-PASSWORD' — returns 1 means still placeholder, 0 means real URL"
duration: ~10m (blocked)
verification_result: failed
completed_at: 2026-03-13
blocker_discovered: false
---

# T03: Push migrations to Supabase Cloud and generate committed types

**Blocked: `SUPABASE_DB_URL` in `.env` still contains `[YOUR-PASSWORD]` placeholder — no migrations applied, no types generated.**

## What Happened

Attempted to execute T03. Confirmed that `SUPABASE_DB_URL` was set in T01 but with a literal `[YOUR-PASSWORD]` placeholder, never the real DB password. `SUPABASE_SERVICE_ROLE_KEY` was collected successfully during this task and is now in `.env`.

`secure_env_collect` was called twice for `SUPABASE_DB_URL` — the user skipped it both times. Without the real DB URL, `supabase db push` cannot connect and no migrations can be applied.

No migrations were pushed. No `packages/db/src/types/supabase.ts` was generated. No commit was made.

## Verification

0 of 5 must-haves met:
- [ ] `npx supabase db push` exits 0 with all 7 migrations applied — NOT RUN (no valid DB URL)
- [ ] Second `db push` run prints "No migrations to apply" — NOT RUN
- [ ] `packages/db/src/types/supabase.ts` exists and is > 100 lines — NOT CREATED
- [ ] Types file contains expected table names — NOT CREATED
- [ ] `supabase.ts` is committed to `gsd/M001/S02` branch — NOT COMMITTED

## Diagnostics

Check placeholder status:
```bash
grep "SUPABASE_DB_URL" .env | grep -c "YOUR-PASSWORD"
# 1 = still placeholder, 0 = real URL
```

Once real URL is in `.env`, verify connectivity:
```bash
source .env && psql "$SUPABASE_DB_URL" -c "SELECT 1;"
```

## Resume Instructions

T03 must be re-run from the top once `SUPABASE_DB_URL` is corrected. Steps to unblock:

1. Go to https://supabase.com/dashboard → your project → Settings → Database → Connection string → URI tab
2. Copy the full connection string (contains real password, port 5432)
3. Update `.env`: replace the placeholder line with the real URL
   - Or re-run `secure_env_collect` for `SUPABASE_DB_URL` with the real value
4. Re-execute T03 from step 1 of the plan

All 7 migration files in `packages/db/supabase/migrations/` are ready and unchanged from T02. `SUPABASE_SERVICE_ROLE_KEY` is now present in `.env`. The only blocker is the DB URL password.

## Deviations

- `SUPABASE_SERVICE_ROLE_KEY` was collected during T03 (not T01) and is now present in `.env`.

## Known Issues

- **SUPABASE_DB_URL placeholder** — `.env` has `postgresql://postgres:[YOUR-PASSWORD]@db.iygjgkproeuhcvbrwloo.supabase.co:5432/postgres`. Must be replaced with real password before any DB operations.

## Files Created/Modified

- `.env` — `SUPABASE_SERVICE_ROLE_KEY` added (was missing from T01)
