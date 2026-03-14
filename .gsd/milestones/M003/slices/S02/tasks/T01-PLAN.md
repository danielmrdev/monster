---
estimated_steps: 6
estimated_files: 2
---

# T01: DataForSEO client — task_post → poll → task_get

**Slice:** S02 — DataForSEO Product Fetch + Image Pipeline
**Milestone:** M003

## Description

Build `DataForSEOClient` — the only new external runtime dependency in S02. The DataForSEO Merchant API is async-only (task_post → poll tasks_ready → task_get), which is different from any existing client in the codebase. This task retires the highest-risk unknown by validating the full polling cycle and actual `items[]` response shape against the live API before T02 or T03 depend on it.

Credentials are fetched from Supabase `settings` table (not from `.env`) — same D028 pattern as other API keys.

Also install `sharp` and `p-limit` here (both needed in T02) so package installs happen once.

## Steps

1. Install `sharp` and `p-limit` in `packages/agents` dependencies:
   ```bash
   cd packages/agents && pnpm add sharp p-limit
   ```
   Verify Sharp binary loads: `node -e "import('sharp').then(m => m.default({width:1}).webp().toBuffer()).then(() => console.log('sharp OK'))"`.

2. Create `packages/agents/src/clients/dataforseo.ts`. Define:
   - `DataForSEOProduct` interface: `{ asin: string; title: string; imageUrl: string | null; price: number | null; rating: number; reviewCount: number; isPrime: boolean; isBestSeller: boolean }`
   - `DataForSEOMarketConfig` lookup map from `AMAZON_MARKETS` (ES→`{location_code: 2724, language_code: 'es_ES', se_domain: 'amazon.es'}`, etc. — include all 6 from research)
   - `DataForSEOClient` class

3. Implement `fetchCredentials(): Promise<string>` — private method. Reads `dataforseo_api_key` from Supabase `settings` table via `createServiceClient().from('settings').select('value').eq('key', 'dataforseo_api_key').single()`. Extracts `(row.value as { value: string }).value`. Throws with clear message if missing: `"DataForSEO credentials not configured — add dataforseo_api_key in admin Settings"`. Computes `Authorization: Basic base64(creds)` using `Buffer.from(creds).toString('base64')`.

4. Implement `searchProducts(keyword: string, market: string): Promise<DataForSEOProduct[]>`:
   - POST task to `https://api.dataforseo.com/v3/merchant/amazon/products/task_post` with `[{ keyword, location_code, language_code, se_domain, depth: 30 }]`
   - Extract `taskId = tasks[0].id` from response. Log `[DataForSEO] task_post id=${taskId} keyword="${keyword}"`
   - Poll `GET /v3/merchant/amazon/products/tasks_ready` with exponential backoff: `for (attempt = 0; attempt < 12; attempt++) { await sleep(5000 * 2**Math.min(attempt,3)); ... }`. Check if `tasks[].result[]` contains an entry with matching `id`. Break when found.
   - If max attempts exceeded, throw: `"DataForSEO task ${taskId} did not complete within timeout"`
   - GET `https://api.dataforseo.com/v3/merchant/amazon/products/task_get/advanced/${taskId}`
   - Extract `items[]` from `tasks[0].result[0].items`. Log raw `items[0]` structure on first call (full JSON, one time only) to help diagnose shape mismatches.
   - Filter: `item.type === 'amazon_serp'` only.
   - Map to `DataForSEOProduct`: `asin = item.data_asin ?? ''`, skip items with empty asin. `rating = parseFloat(item.rating?.value ?? '0')`. `reviewCount = item.rating?.votes_count ?? 0`. `price = item.price_from ?? null`. `isPrime = item.is_prime ?? item.delivery_info?.is_free_delivery ?? false`. `isBestSeller = item.is_best_seller ?? false`.
   - Guard: if filtered products array is empty, throw: `"DataForSEO returned zero usable products for keyword: ${keyword}"`
   - Return mapped array.

5. Add `sleep(ms: number): Promise<void>` private helper (`new Promise(resolve => setTimeout(resolve, ms))`).

6. Export `DataForSEOProduct` type and `DataForSEOClient` class from the module. Run `npx tsc --noEmit` in `packages/agents` — fix all type errors.

## Must-Haves

- [ ] `DataForSEOClient` builds with `npx tsc --noEmit` exit 0
- [ ] `fetchCredentials()` reads from Supabase `settings` table (never from env vars)
- [ ] Polling loop has max 12 attempts with exponential backoff — no infinite loop
- [ ] `items[]` filtered on `type === 'amazon_serp'` — no paid/editorial items
- [ ] `rating.value` parsed with `parseFloat` (it's a string in the API response)
- [ ] Zero usable products → descriptive throw, not silent empty return
- [ ] Raw `items[0]` logged on first real call for shape validation
- [ ] `sharp` and `p-limit` added to `packages/agents` dependencies (not devDependencies)

## Verification

- `cd packages/agents && npx tsc --noEmit` → exit 0
- `pnpm --filter @monster/agents build` → exit 0
- With DataForSEO creds configured in admin Settings: build `dist/`, then:
  ```bash
  node --input-type=module <<'EOF'
  import { DataForSEOClient } from './packages/agents/dist/clients/dataforseo.js';
  const client = new DataForSEOClient();
  const products = await client.searchProducts('freidoras de aire', 'ES');
  console.log(`Got ${products.length} products`);
  console.log('First:', products[0]);
  EOF
  ```
  → ≥1 product logged with real ASIN (starts with B0...), real title, numeric price or null, numeric rating

## Observability Impact

- Signals added: `[DataForSEO] task_post id=<uuid> keyword="<keyword>"` on task submission; raw `items[0]` JSON on first call; `[DataForSEO] task ready after ${attempt+1} attempts` on success
- How a future agent inspects this: check worker stdout for `[DataForSEO]` lines; if missing, DataForSEO client never ran; if poll timeout logged, DataForSEO API is slow/down
- Failure state exposed: descriptive throws bubble to `ai_jobs.error` column via existing `worker.on('failed')` handler

## Inputs

- `packages/agents/src/queue.ts` — `createServiceClient()` pattern (read-only reference for Supabase client usage)
- `packages/db` — `createServiceClient()` for settings query
- `packages/shared/src/constants/index.ts` — `AMAZON_MARKETS` for market config lookup
- Research: DataForSEO location_code/language_code/se_domain table (S02-RESEARCH.md)
- Admin Settings — `dataforseo_api_key` must be configured as `{ value: "email:password" }` before smoke test

## Expected Output

- `packages/agents/src/clients/dataforseo.ts` — complete `DataForSEOClient` class, `DataForSEOProduct` interface, market config map
- `packages/agents/package.json` — `sharp` and `p-limit` in `dependencies`
- `packages/agents` type-checks and builds cleanly
