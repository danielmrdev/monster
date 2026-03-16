# S04 UAT — Amazon Product Scraper

**When to run:** After deploying S04 changes. Requires internet access from VPS1 to amazon.es.

---

## Test 1: Product search returns real Amazon results

1. Navigate to any site's product add page (`/sites/<id>/products/new`)
2. In the search field, type a keyword like "freidora de aire"
3. Click Search
4. **Expected:** Results appear with real Amazon product titles, prices, and thumbnails (not DataForSEO)
5. **Expected:** ASIN codes are 10 characters, titles are real Amazon product names
6. **Pass if:** At least 5 results appear with valid ASINs and titles

---

## Test 2: Amazon block handling

1. If Amazon blocks the request (503 response):
2. **Expected:** Search UI shows a clear error message: "Amazon is blocking requests. Try again in a few minutes."
3. **Pass if:** Error is shown gracefully; UI doesn't crash

---

## Test 3: ASIN lookup still works (DFS unchanged)

1. From product search results, click "Add" on a product
2. **Expected:** DFS ASIN lookup enriches the product with detailed data
3. Navigate to the product form — data should be pre-populated
4. **Pass if:** ASIN lookup returns data from DataForSEO (not the scraper)

---

## Test 4: Already-added products flagged

1. Add a product to the site
2. Search again with the same keyword
3. **Expected:** The product just added shows as "Already added" in search results
4. **Pass if:** `alreadyAdded` flag correctly prevents duplicate adds
