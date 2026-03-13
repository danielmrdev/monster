---
estimated_steps: 3
estimated_files: 1
---

# T01: Collect Supabase credentials and document env vars

**Slice:** S02 — Supabase Schema
**Milestone:** M001

## Description

Nothing in S02 can run until a real Supabase Cloud project exists and its credentials are in `.env`. This task gates the slice: collect all four Supabase env vars using `secure_env_collect`, then add `SUPABASE_DB_URL` to `.env.example` so future devs know it's required.

The user must have already created a Supabase Cloud project. If they haven't, this task is the natural place to pause and ask them to do so. The critical detail: `SUPABASE_DB_URL` must use the **direct connection** (`db.[ref].supabase.co:5432`), NOT the pooler URL (`pooler.supabase.com:6543`). The pooler URL breaks `supabase db push` migration tracking.

## Steps

1. Use `secure_env_collect` with `destination: "dotenv"` to collect: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`. Include guidance for each key pointing the user to the Supabase dashboard: Project Settings → API (for the first three), Project Settings → Database → Connection string → URI → direct (for `SUPABASE_DB_URL`). Emphasize port 5432, not 6543.
2. Add `SUPABASE_DB_URL=` to `.env.example` with a comment explaining it's the direct connection URL needed for migrations.
3. Verify the `.env` file contains all four Supabase variables.

## Must-Haves

- [ ] `.env` file contains `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`
- [ ] `SUPABASE_DB_URL` uses port 5432 (direct connection), not 6543 (pooler)
- [ ] `.env.example` documents `SUPABASE_DB_URL`

## Verification

- `grep "SUPABASE_DB_URL" .env.example` — should print the documented key
- `grep "SUPABASE_DB_URL" .env` — should be populated (value masked, just confirm key exists)
- `echo $SUPABASE_DB_URL | grep ':5432'` — port 5432 confirms direct connection

## Observability Impact

- **Signal added:** `.env` now contains all four Supabase credentials — a future agent can detect presence with `grep -c "^NEXT_PUBLIC_SUPABASE_URL=\|^NEXT_PUBLIC_SUPABASE_ANON_KEY=\|^SUPABASE_SERVICE_ROLE_KEY=\|^SUPABASE_DB_URL=" .env` (should return 4).
- **Port guard:** `grep "SUPABASE_DB_URL" .env | grep -c ":5432"` confirms direct connection (non-zero = good; zero = pooler URL was entered by mistake).
- **Failure state:** If T02/T03 fail with `connection refused` or `authentication failed`, the root cause is here — wrong URL format, wrong password, or missing env var. Check `.env` key presence first, then port, then attempt `psql $SUPABASE_DB_URL -c "SELECT 1;"` to isolate connectivity from auth.
- **Redaction:** `SUPABASE_DB_URL` embeds the DB password — never echo, log, or print it. Verify only by key presence and port grep.

## Inputs

- `.env.example` — existing file to update with `SUPABASE_DB_URL`

## Expected Output

- `.env` — populated with all four Supabase credentials
- `.env.example` — updated to document `SUPABASE_DB_URL`
