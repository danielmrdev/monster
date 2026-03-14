# S02: Diff Engine + Conditional Rebuild + Alert Creation — UAT

**Milestone:** M006
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven for unit tests + live-runtime for dedup proof + human-experience for end-to-end flow)
- Why this mode is sufficient: The diff engine categorization rules are fully proven by 10 unit tests (artifact-driven). The dedup invariant and conditional rebuild require two live refresh runs against a real site (live-runtime). The human-experience check confirms the BullMQ queue state is observable from the admin panel.

## Preconditions

1. `monster-worker` is running: `pm2 status` shows `monster-worker` online with 0 restarts
2. At least one site exists in the DB with `status = 'live'` and has products in `tsa_products`
3. BullMQ admin UI accessible (or Redis CLI available to inspect queues)
4. `SUPABASE_DB_URL` available in environment for direct psql queries
5. Admin panel running: `pm2 status` shows `monster-admin` online, accessible at `http://localhost:3004`
6. DataForSEO credentials configured in admin Settings (for live refresh trigger)

## Smoke Test

Run the unit tests — all must pass before proceeding to live-runtime tests:

```bash
pnpm --filter @monster/agents test
# Expected: 10/10 tests pass, exit 0
```

## Test Cases

### 1. Diff engine — price change triggers rebuild

**Purpose:** Confirms the diff engine's core categorization rule for the most common rebuild trigger.

1. Open `packages/agents/src/diff-engine.test.ts` — verify test "triggers rebuild when price changes beyond epsilon" exists
2. Run `pnpm --filter @monster/agents test --reporter verbose`
3. **Expected:** Test `price changes > triggers rebuild when price changes beyond epsilon` passes; `shouldRebuild = true`; `changes[0].type = 'price'`; `serpAbsentAsins = []`

### 2. Diff engine — rating change does NOT trigger rebuild

**Purpose:** Confirms deferred-change handling (rating changes should not cause a rebuild).

1. Run `pnpm --filter @monster/agents test --reporter verbose`
2. **Expected:** Test `rating changes > does NOT trigger rebuild when only rating changes` passes; `shouldRebuild = false`; `changes = []`

### 3. Diff engine — SERP-absent product goes to serpAbsentAsins, not changes

**Purpose:** Confirms SERP-absence produces no ProductChange entries and no rebuild trigger from absence alone.

1. Run `pnpm --filter @monster/agents test --reporter verbose`
2. **Expected:** Test `SERP-absent products > puts SERP-absent ASIN in serpAbsentAsins, not in changes` passes; `serpAbsentAsins = ['B001']`; `changes = []`; `shouldRebuild = false`

### 4. Diff engine — image URL diff respects null guard

**Purpose:** Confirms no false-positive rebuild when source_image_url is null (product hasn't been through download pipeline yet).

1. Run `pnpm --filter @monster/agents test --reporter verbose`
2. **Expected:** Test `image changes > skips image diff when source_image_url is null in DB` passes; `shouldRebuild = false`

### 5. Live refresh — price change in DB triggers GenerateSiteJob enqueue

**Purpose:** End-to-end proof that diff engine detects a simulated price change and the job handler enqueues a rebuild.

**Preconditions:** A live site exists with at least 1 product in `tsa_products`.

1. Choose a product ASIN from a live site. Note its current `current_price`:
   ```sql
   SELECT asin, current_price FROM tsa_products
   WHERE site_id = '<live_site_id>' LIMIT 1;
   ```
2. Set its price to a clearly different value (simulate stale DB price):
   ```sql
   UPDATE tsa_products SET current_price = 999.99
   WHERE site_id = '<live_site_id>' AND asin = '<asin>';
   ```
3. In the admin panel, navigate to the site detail page → click **Refresh Now**
4. Wait ~10 seconds for the job to run
5. Check pm2 logs for diff phase output:
   ```bash
   pm2 logs monster-worker --nostream --lines 50 | grep "diff_products\|rebuild"
   ```
6. **Expected:**
   - Log line: `[ProductRefreshJob] site <id> phase=diff_products started`
   - Log line: `[ProductRefreshJob] site <id> changes=1 rebuild=true serpAbsent=0` (or similar)
   - Log line: `[ProductRefreshJob] site <id> rebuild enqueued reason=price`
   - A `GenerateSiteJob` entry appears in the BullMQ `generate` queue (visible in BullMQ admin UI or via Redis: `redis-cli LLEN bull:generate:wait`)

### 6. Live refresh — no GenerateSiteJob when site is not live

**Purpose:** Confirms the `site.status === 'live'` guard prevents unnecessary rebuilds for draft/deploying sites.

1. Find or create a site with `status != 'live'` (e.g., `status = 'draft'`):
   ```sql
   UPDATE sites SET status = 'draft' WHERE id = '<site_id>';
   ```
2. Manually update a product price in the DB (same as TC5, step 2)
3. Trigger a refresh via admin panel **Refresh Now** button
4. Wait ~10 seconds
5. Check pm2 logs:
   ```bash
   pm2 logs monster-worker --nostream --lines 50 | grep "rebuild"
   ```
6. **Expected:** Log line: `[ProductRefreshJob] site <id> rebuild skipped — site status=draft`; no `GenerateSiteJob` in generate queue
7. Restore site status: `UPDATE sites SET status = 'live' WHERE id = '<site_id>';`

### 7. Alert creation — SERP-absent product creates open unavailable alert

**Purpose:** Confirms the create_alerts phase inserts an `unavailable` alert for SERP-absent products.

**Preconditions:** DataForSEO search for the site's keywords returns results that do NOT include one of the site's stored ASINs (SERP-absent scenario). Easiest to simulate: update a product's ASIN to a value DataForSEO won't return.

1. Pick a product from a live site. Note its ASIN. Temporarily change it to a fake ASIN:
   ```sql
   UPDATE tsa_products SET asin = 'FAKE_ASIN_001'
   WHERE site_id = '<live_site_id>' AND asin = '<real_asin>';
   ```
2. Trigger a refresh via admin panel **Refresh Now**
3. Wait ~15 seconds
4. Check pm2 logs:
   ```bash
   pm2 logs monster-worker --nostream --lines 50 | grep "create_alerts\|alert created\|alert dedup"
   ```
5. Query the alerts table:
   ```sql
   SELECT alert_type, severity, status, details
   FROM product_alerts
   WHERE site_id = '<live_site_id>' AND status = 'open'
   ORDER BY created_at DESC LIMIT 5;
   ```
6. **Expected:**
   - Log line: `[ProductRefreshJob] site <id> phase=create_alerts started`
   - Log line: `[ProductRefreshJob] site <id> alert created type=unavailable asin=FAKE_ASIN_001`
   - One open `product_alerts` row with `alert_type='unavailable'`, `severity='warning'`, `details={"reason":"serp_absent","asin":"FAKE_ASIN_001"}`
7. Restore ASIN: `UPDATE tsa_products SET asin = '<real_asin>' WHERE asin = 'FAKE_ASIN_001';`

### 8. Alert deduplication — second refresh does NOT create a second open alert

**Purpose:** Proves the dedup invariant: exactly one open alert per (site_id, product_id, alert_type) regardless of how many refresh cycles run while the problem persists.

**Preconditions:** TC7 completed — one open `unavailable` alert exists for a SERP-absent product (fake ASIN in place).

1. Count open alerts before second refresh:
   ```sql
   SELECT COUNT(*) FROM product_alerts
   WHERE site_id = '<live_site_id>' AND status = 'open' AND alert_type = 'unavailable';
   -- Expected: 1
   ```
2. Trigger a second refresh via admin panel **Refresh Now**
3. Wait ~15 seconds
4. Check pm2 logs:
   ```bash
   pm2 logs monster-worker --nostream --lines 50 | grep "alert dedup"
   ```
5. Count open alerts after second refresh:
   ```sql
   SELECT COUNT(*) FROM product_alerts
   WHERE site_id = '<live_site_id>' AND status = 'open' AND alert_type = 'unavailable';
   ```
6. **Expected:**
   - Log line: `[ProductRefreshJob] site <id> alert dedup skipped type=unavailable asin=FAKE_ASIN_001`
   - Alert count remains **1** (not 2)
7. Restore ASIN: `UPDATE tsa_products SET asin = '<real_asin>' WHERE asin = 'FAKE_ASIN_001';`

### 9. Price history — rolling window written on refresh

**Purpose:** Confirms price_history JSONB is updated with each refresh cycle (prepend + slice to 30).

1. After any successful live refresh, query:
   ```sql
   SELECT asin, current_price,
          jsonb_array_length(price_history::jsonb) AS history_entries,
          price_history -> 0 AS latest_entry
   FROM tsa_products
   WHERE site_id = '<live_site_id>'
   LIMIT 3;
   ```
2. **Expected:** `history_entries >= 1`; `latest_entry` has shape `{"price": <number>, "date": "<ISO date string>"}`. Run a second refresh and confirm `history_entries` increments by 1 (up to max 30).

### 10. source_image_url baseline written by GenerateSiteJob

**Purpose:** Confirms that after a site generation run, `source_image_url` is populated — required for future image diff in ProductRefreshJob.

1. After any GenerateSiteJob completes for a site, query:
   ```sql
   SELECT asin, source_image_url
   FROM tsa_products
   WHERE site_id = '<live_site_id>'
   LIMIT 5;
   ```
2. **Expected:** `source_image_url` is non-null for products that have images (Amazon CDN URL). Null is acceptable for products with no `imageUrl` in DataForSEO.

## Edge Cases

### category_empty alert — all products in a category become unavailable

1. Update all products in one category to `availability='limited'`:
   ```sql
   UPDATE tsa_products SET availability = 'limited'
   WHERE site_id = '<live_site_id>'
   AND category_id = (SELECT id FROM tsa_categories WHERE site_id='<live_site_id>' LIMIT 1);
   ```
2. Trigger a refresh (note: DataForSEO will return current data and overwrite — this test requires mocking or accepting that real DFS data will restore availability)
3. **Expected:** If any products remain `limited` after DFS fetch, a `category_empty` alert (severity=critical) should appear in `product_alerts`
4. **Note:** This edge case is hard to test with live DataForSEO data. Best verified by reading the create_alerts code path directly or via a future integration test with a mock DFS response.

### site_degraded alert — >30% of products limited/unavailable

1. Same pattern as category_empty but across multiple categories. Set >30% of site products to `availability='limited'` and confirm `site_degraded` alert is created after a refresh that doesn't restore those products.
2. **Expected:** Log line: `[ProductRefreshJob] site <id> alert created type=site_degraded pct=<N>%`; one open `site_degraded` row with severity=critical.

### Alert re-creation after resolution

1. Resolve the open `unavailable` alert from TC7/TC8:
   ```sql
   UPDATE product_alerts SET status = 'resolved'
   WHERE site_id = '<live_site_id>' AND status = 'open' AND alert_type = 'unavailable';
   ```
2. Keep the fake ASIN in place. Trigger another refresh.
3. **Expected:** A NEW open `unavailable` alert is created (not skipped by dedup, because the previous alert is now `resolved`, not `open`). This confirms the dedup only guards against duplicate open alerts, not re-alerting after resolution.

### Worker crash mid-refresh (price_history partial state)

1. This edge case is informational only — do not deliberately crash the worker. Instead, verify that after any worker restart, re-running a refresh produces consistent `price_history` state (no duplicate entries for the same date, no missing entries).
2. **Expected:** price_history JSONB is idempotent on re-run for the same day (since prepend + slice is deterministic given the same input).

## Failure Signals

- `pnpm --filter @monster/agents test` exits non-zero — diff engine regression, check test output
- `pm2 logs monster-worker` shows ERR_MODULE_NOT_FOUND — dependency issue in agents package; run `pnpm install` in monorepo root
- `pm2 logs monster-worker` shows a job failed event with Supabase error — likely a schema mismatch; verify `product_alerts.severity` constraint and `tsa_products.source_image_url` column exist via `psql $SUPABASE_DB_URL -c "\d product_alerts"` and `"\d tsa_products"`
- `product_alerts` count doubles on consecutive refresh runs — dedup check is not running; grep logs for `alert dedup` to confirm; check `product_alerts` table for `status` column presence
- `generate` queue empty after a price-change refresh on a live site — check pm2 logs for `rebuild skipped`; verify site `status = 'live'`; verify `generateQueue()` env var (UPSTASH_REDIS_REST_URL) is set
- `source_image_url` null after GenerateSiteJob — check DataForSEO product response for `imageUrl` field; null is expected for products with no images

## Requirements Proved By This UAT

- R007 (product refresh pipeline) — TC5 proves: diff detects DB price change + enqueues GenerateSiteJob on live site; TC6 proves: status guard prevents unnecessary rebuilds
- R008 (product availability alerts) — TC7 proves: SERP-absent product creates unavailable alert; TC8 proves: dedup invariant holds across consecutive refreshes

## Not Proven By This UAT

- True unavailability detection (ASIN-level lookup via DataForSEO Merchant API) — SERP-absence only marks `limited`, not hard `unavailable` (D092). Phase 2.
- `category_empty` and `site_degraded` alerts under live DataForSEO conditions — hard to induce without mocking DFS responses. Edge cases TC (category_empty / site_degraded) require controlled test data.
- Price history cap at 30 entries — requires 30 consecutive refresh cycles. Readable from code inspection + TC9 incremental verification.
- Alert re-alerting after resolution (edge case) — functional path exists in code; rarely reachable in a single UAT session.

## Notes for Tester

- TC5–TC9 require a live site with real DataForSEO credentials. If DataForSEO is not configured, TC5 will still trigger the diff phase but `dfsProducts` will be empty — all site products appear as `serpAbsentAsins`, which exercises TC7/TC8 without a price-change scenario.
- The fake ASIN technique (TC7/TC8) is the most reliable way to induce a SERP-absent condition. Always restore the real ASIN after testing.
- `pm2 logs monster-worker --nostream --lines 100` is the primary diagnostic. Filter by `grep "diff_products\|create_alerts\|alert created\|alert dedup\|rebuild"` to see the S02 phases.
- BullMQ admin UI (if configured) shows the `generate` queue visually — use it instead of Redis CLI if available.
- The dedup proof (TC8) is the most important runtime verification for this slice — it directly validates the R008 invariant and the D093 architectural decision.
