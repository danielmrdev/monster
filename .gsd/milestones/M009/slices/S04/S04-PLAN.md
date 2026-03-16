# S04: Amazon Product Scraper

**Goal:** Replace DataForSEO as the product search backend with a Node.js Amazon scraper (cheerio + rotating user agents, ported from tsa-monster PHP). DFS ASIN lookup stays unchanged.
**Demo:** User searches "freidoras de aire" in the product search UI — results appear with titles, prices, and images scraped directly from amazon.es. No DataForSEO credits consumed. Clicking "Add" on a result still triggers DFS ASIN lookup for enriched data.

## Must-Haves

- `AmazonScraper.search(keyword, market)` in `packages/agents/src/clients/amazon-scraper.ts` returns `ScrapedProduct[]`
- Scraper uses rotating user agents and human-like headers (ported from PHP)
- Handles ES market (amazon.es); returns ASIN, title, price, rating, imageUrl
- `/api/sites/[id]/product-search` GET route uses scraper instead of DataForSEOClient
- DFS ASIN lookup route (`/api/sites/[id]/asin-lookup`) is unchanged
- Build passes; `pm2 reload monster-admin` succeeds

## Proof Level

- This slice proves: integration (real scraper against amazon.es)
- Real runtime required: yes — scraper must return real results for a test keyword
- Human/UAT required: yes (verify search results appear with real data)

## Verification

- `pnpm --filter @monster/agents build` exits 0
- `pnpm --filter @monster/admin build` exits 0
- `pm2 reload monster-admin` succeeds
- Product search UI returns results (may require human UAT with real request to amazon.es)

## Tasks

- [x] **T01: AmazonScraper class + cheerio dep** `est:1.5h`
  - Why: Core scraper implementation — Node.js port of the PHP AmazonScraperService
  - Files: `packages/agents/src/clients/amazon-scraper.ts`, `packages/agents/package.json`
  - Do:
    (1) Install cheerio in packages/agents: `pnpm --filter @monster/agents add cheerio`
    (2) Create `amazon-scraper.ts` with:
      - `AMAZON_MARKETS` map: ES→amazon.es, US→amazon.com, UK→amazon.co.uk, DE→amazon.de, FR→amazon.fr
      - `USER_AGENTS[]` array (10+ realistic Chrome/Firefox/Safari UA strings)
      - `ScrapedProduct` type: `{ asin, title, price: number|null, rating: number|null, imageUrl: string|null, isPrime: boolean }`
      - `AmazonScraper` class with `search(keyword, market, page?)` async method:
        - Build search URL: `https://www.${domain}/s?k=${encodeURIComponent(keyword)}&i=aps`
        - Fetch with rotating UA + human-like headers (Accept, Accept-Language from market language, Accept-Encoding, Cache-Control, Sec-Fetch-*)
        - Block detection: check for "captcha", "robot check", "Enter the characters" in response HTML → throw `AmazonBlockedError`
        - Parse with cheerio: select `[data-component-type="s-search-result"][data-asin]` items
        - Extract per item: asin from data-asin attr, title from `h2 a span` or `h2 span`, price from `.a-price .a-offscreen` (handle ES decimal comma), image from `.s-image` src, rating from `.a-icon-alt` aria-label, prime from `[aria-label*="Prime"]` or `.a-icon-prime` presence
        - Filter: skip items without ASIN or title, skip ASINs with length !== 10
        - Return max 20 results
    (3) Export `AmazonScraper` and `ScrapedProduct` from packages/agents index.ts
  - Verify: `pnpm --filter @monster/agents build` exits 0; file exports ScrapedProduct type
  - Done when: Build clean; AmazonScraper.search compiles with correct return type

- [x] **T02: Wire scraper into product-search route** `est:30m`
  - Why: Replace DataForSEO search with AmazonScraper in the GET handler
  - Files: `apps/admin/src/app/api/sites/[id]/product-search/route.ts`
  - Do: In the GET handler, replace `new DataForSEOClient()` and `client.searchProducts()` with `new AmazonScraper()` and `scraper.search(q, market)`. Map `ScrapedProduct` fields to `SearchResultItem`. Handle `AmazonBlockedError` with a 503 response and a clear error message ("Amazon is blocking requests. Try again in a few minutes."). Keep `DataForSEOClient` import removed from this file only — the ASIN lookup route still uses it.
  - Verify: `pnpm --filter @monster/admin build` exits 0; product-search route no longer imports DataForSEOClient
  - Done when: Build clean; GET route uses AmazonScraper

## Files Likely Touched

- `packages/agents/src/clients/amazon-scraper.ts` (new)
- `packages/agents/src/index.ts`
- `packages/agents/package.json`
- `apps/admin/src/app/api/sites/[id]/product-search/route.ts`
