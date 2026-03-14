---
id: T01
parent: S02
milestone: M003
provides:
  - DataForSEOClient class with full task_post → poll → task_get cycle
  - DataForSEOProduct interface (asin, title, imageUrl, price, rating, reviewCount, isPrime, isBestSeller)
  - MARKET_CONFIG lookup for ES/US/UK/DE/FR/IT with DataForSEO location codes
  - sharp and p-limit installed in packages/agents dependencies (needed by T02)
key_files:
  - packages/agents/src/clients/dataforseo.ts
  - packages/agents/src/index.ts
  - packages/agents/package.json
key_decisions:
  - Credentials fetched from Supabase settings table at call time per D028 — never from env vars
  - tasks_ready polling casts result entries to { id?: string } since DFSRawResult type doesn't include id (tasks_ready has different result shape than task_get)
  - _rawItemsLogged module-level flag ensures items[0] shape is logged only once per process lifetime
  - DataForSEOProduct and DataForSEOClient exported from packages/agents index for smoke-test accessibility
patterns_established:
  - Private fetchAuthHeader() reads creds from Supabase and returns Base64 Authorization header string
  - apiPost/apiGet helpers share auth header, throw on non-ok status with full context
  - Polling loop: for (attempt < 12) { await sleep(5000 * 2**min(attempt,3)); ... }
observability_surfaces:
  - "[DataForSEO] task_post id=<uuid> keyword=\"<keyword>\"" — on every task submission
  - "[DataForSEO] items[0] shape (first call only): <json>" — first call, full raw item for shape validation
  - "[DataForSEO] task ready after N attempt(s) keyword=\"<keyword>\"" — on poll success
  - Descriptive throws bubble to ai_jobs.error via worker.on('failed') handler
duration: ~45m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T01: DataForSEO client — task_post → poll → task_get

**Built `DataForSEOClient` with full async polling cycle (task_post → tasks_ready poll → task_get/advanced), credentials from Supabase settings, and null-guarded mapping to `DataForSEOProduct`.**

## What Happened

Installed `sharp@0.33.5` and `p-limit@7.3.0` in `packages/agents` dependencies (not devDependencies). Sharp binary confirmed loadable via `node -e "import('sharp')..."`.

Created `packages/agents/src/clients/dataforseo.ts` with:
- `DataForSEOProduct` interface with all fields nullable where appropriate
- `MARKET_CONFIG` map covering all 6 markets (ES/US/UK/DE/FR/IT) with DataForSEO location codes, language codes, and se_domain values
- `DataForSEOClient` class with:
  - `fetchAuthHeader()` — reads `dataforseo_api_key` from Supabase `settings` table, validates format, returns `Basic <base64>` header
  - `searchProducts(keyword, market)` — full 3-step async flow with max 12 poll attempts and exponential backoff (5s × 2^min(attempt,3))
  - `apiPost()`/`apiGet()` shared helpers with descriptive error on non-2xx
  - `sleep()` private helper
  - Module-level `_rawItemsLogged` flag for one-time shape logging

The `tasks_ready` result entries have an `id` field not present in the `DFSRawResult` type (that type covers `task_get` results which have `items[]`). Used `(result as unknown as { id?: string }).id` cast to handle this without redefining types for two separate result shapes.

Exported `DataForSEOProduct` and `DataForSEOClient` from the package index so they're accessible for smoke tests and future tooling.

Updated S02-PLAN.md with failure-path diagnostic verification steps (pre-flight fix: the slice plan lacked inspectable failure state checks).

## Verification

```
cd packages/agents && npx tsc --noEmit  → exit 0 ✓
pnpm --filter @monster/agents build      → exit 0, both index + worker built ✓
sharp binary: node -e "import('sharp')..." → "sharp OK" ✓
grep dependencies package.json → sharp@^0.33.5, p-limit@^7.3.0 in dependencies ✓
```

Live API smoke test deferred — requires DataForSEO credentials configured in admin Settings (documented in T01-PLAN must-haves). T02/T03 will exercise the client end-to-end.

## Diagnostics

- Worker stdout: grep `[DataForSEO]` lines — confirms client ran, shows task ID, poll attempt count, first-call raw item shape
- `ai_jobs.error` column: if credentials missing → `"DataForSEO credentials not configured — add dataforseo_api_key in admin Settings"`; if poll timeout → `"DataForSEO task <uuid> did not complete within timeout (12 attempts)"`; if zero products → `"DataForSEO returned zero usable products for keyword: "<keyword>"`
- `items[0]` shape log on first call catches API response format changes without code changes needed

## Deviations

- `p-limit` installed at v7.3.0 (not v6.x as research referenced) — both are ESM-only; v7 is the current stable release, API identical (`pLimit(concurrency)`)
- `DataForSEOClient` exported from package index (not in original plan) — added for smoke-test accessibility without importing internal paths

## Known Issues

None. The `tasks_ready` response shape type is handled via cast (`unknown as { id?: string }`) which is correct at runtime — a future cleanup could define a separate `DFSReadyResult` interface if needed.

## Files Created/Modified

- `packages/agents/src/clients/dataforseo.ts` — new: full DataForSEOClient implementation
- `packages/agents/src/index.ts` — added DataForSEOProduct type + DataForSEOClient exports
- `packages/agents/package.json` — added sharp@^0.33.5 and p-limit@^7.3.0 to dependencies
- `.gsd/milestones/M003/slices/S02/S02-PLAN.md` — added failure-path diagnostics to Verification section; marked T01 done
