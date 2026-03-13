# M006: Product Refresh Pipeline — Context

**Gathered:** 2026-03-13
**Status:** Provisional — detail-plan when M005 is complete

## Why This Milestone

Static Astro sites freeze product data at build time. Without refresh, prices go stale, unavailable products remain visible, and the site degrades silently. M006 delivers the autonomous maintenance loop: scheduled BullMQ jobs fetch updated product data from DataForSEO, diff against DB, and trigger conditional rebuilds + redeployments only when relevant changes are detected.

## User-Visible Outcome

### When this milestone is complete, the user can:
- See "Last refreshed: X hours ago" in site detail view
- Receive alerts when products become unavailable (warning: 1 product, critical: category empty or >30% degraded)
- Configure refresh frequency per site (default: every 2-3 days)
- See price history for products (jsonb in DB)
- Know that price/availability changes on Amazon propagate to live sites within the configured window

### Entry point / environment
- Entry point: BullMQ scheduled jobs (cron) + admin panel alert surface
- Environment: VPS1 workers, DataForSEO API, Supabase Cloud, VPS2 (redeploy target)
- Live dependencies: DataForSEO Merchant API, BullMQ/Upstash Redis, VPS2

## Completion Class

- Contract complete means: diff logic correctly categorizes changes by rebuild priority
- Integration complete means: real DataForSEO API call detects a real price change, triggers rebuild + redeploy
- Operational complete means: cron runs on schedule without manual intervention; alerts appear in dashboard

## Final Integrated Acceptance

- Manually trigger a refresh for a live TSA site
- Simulate a price change (edit DB directly) → verify rebuild is triggered
- Simulate product unavailability → verify alert created, product excluded from rebuilt site
- Cron schedule fires automatically (verify via pm2 logs)

## Risks and Unknowns

- **DataForSEO rate limits** — refreshing 100 sites in parallel would hammer the API. Jobs must be staggered. BullMQ concurrency limits + rate limiter needed.
- **Astro build times at scale** — with 100+ sites, sequential builds could take hours. Need build concurrency strategy (BullMQ concurrency setting).
- **Rebuild cost** — each rebuild = DataForSEO API calls + Astro build CPU time + rsync. Must monitor cost per site per month to stay within projections.

## Existing Codebase / Prior Art

- M003: Astro generator, BullMQ job patterns
- M004: deployment service (rsync + Caddy)
- M001 DB schema: `product_alerts` table, `products.last_checked_at`, `products.price_history`
- `docs/PRD.md`: product refresh pipeline section, hybrid strategy, alert types
- D008 in DECISIONS.md: rebuild trigger strategy (price/availability/image = immediate, ratings = deferred)

## Relevant Requirements

- R007 — Product refresh pipeline
- R008 — Product availability alerts

## Scope

### In Scope
- BullMQ scheduled job: `product-refresh` per site (configurable frequency)
- DataForSEO fetch: hybrid strategy (keyword search + selective ASIN lookup)
- Diff engine: compare fetched data against DB, categorize changes by priority
- Conditional rebuild trigger: immediate for price/availability/image, deferred for ratings
- Alert creation: `product_alerts` table, three severity levels
- Dashboard alert surface: active alerts count, alert list, resolve action
- Site detail: last_refreshed timestamp, product availability status

### Out of Scope
- ContentOptimizer (R022, deferred to Phase 2)
- PerformanceMonitor (R023, deferred to Phase 2)
- Manual product editing UI (Phase 2)

## Technical Constraints

- Hybrid refresh strategy: keyword search ($0.001/SERP) for broad detection + ASIN lookup ($0.0015/req) for selective validation
- BullMQ concurrency: max 3 concurrent site refreshes to avoid DataForSEO rate limits
- Rebuild only if `changes.length > 0` (no unnecessary builds)
- `product_alerts` status: `open → acknowledged → resolved`
- Price history stored as JSONB array: `[{price, date}, ...]`, max 30 entries rolling

## Integration Points

- DataForSEO Merchant API: Amazon product search + ASIN detail
- BullMQ + Upstash Redis: job scheduling and concurrency
- M003 generator: programmatic Astro build
- M004 deployment: rsync + Caddy update after rebuild
- Supabase: product data, alerts, job status
