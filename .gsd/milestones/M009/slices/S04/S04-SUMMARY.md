---
id: S04
milestone: M009
provides:
  - AmazonScraper class (packages/agents/src/clients/amazon-scraper.ts) — cheerio + rotating UA product search
  - ScrapedProduct type, AmazonBlockedError class
  - /api/sites/[id]/product-search GET uses AmazonScraper instead of DataForSEOClient
  - dist/index.d.ts updated with ScrapedProduct, AmazonScraper, AmazonBlockedError exports
key_files:
  - packages/agents/src/clients/amazon-scraper.ts
  - packages/agents/src/index.ts
  - packages/agents/dist/index.d.ts
  - apps/admin/src/app/api/sites/[id]/product-search/route.ts
key_decisions:
  - "dist/index.d.ts is hand-written (DTS disabled per D047) — must be updated manually when new types are exported"
  - "AmazonScraper.search returns max 20 results; primary selector [data-component-type='s-search-result'][data-asin] with fallback to broader [data-asin]"
  - "503 status for AmazonBlockedError (rate limit / CAPTCHA); 500 for other errors"
patterns_established:
  - "Amazon scraper: rotating UA + cheerio parse — see amazon-scraper.ts"
drill_down_paths:
  - .gsd/milestones/M009/slices/S04/S04-PLAN.md
duration: 1.5h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S04: Amazon Product Scraper

**AmazonScraper class with cheerio + rotating user agents replaces DataForSEO for product search; DFS ASIN lookup unchanged.**

## What Was Built

**T01 — AmazonScraper:** `packages/agents/src/clients/amazon-scraper.ts`. Ported the PHP scraper strategy to Node.js. Key aspects: 11 rotating UA strings; market→domain mapping; human-like headers (Accept, Accept-Language by market, Sec-Fetch-*); CAPTCHA/block detection; cheerio parsing using `[data-component-type="s-search-result"][data-asin]` primary selector with fallback; price parsing handles ES decimal comma format; image URL upgrade to 400px. Returns max 20 `ScrapedProduct` items.

**T02 — Route wiring:** `/api/sites/[id]/product-search` GET handler now uses `AmazonScraper.search()`. `AmazonBlockedError` returns 503. `isBestSeller` hardcoded to `false` (not available from scraper).

Updated `dist/index.d.ts` with the new types (hand-written DTS per D047 pattern).

## Verification

- `pnpm --filter @monster/agents build` exits 0 ✓
- `pnpm --filter @monster/admin build` exits 0 ✓
- `pm2 reload monster-admin` + HTTP 200 ✓

## Deviations

- `isBestSeller` is `false` in all scraped results — not available from Amazon search HTML without additional parsing complexity.
- `dist/index.d.ts` needs manual update whenever new public types are added to `src/index.ts`.
