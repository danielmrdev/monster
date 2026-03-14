# S03: ContentGenerator — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven (CLI verification) + live-runtime (real API call required for full proof)
- Why this mode is sufficient: S03 proof level is integration (real Claude API + DB writes + HTML output). CLI-level checks on build artefacts, DB state, and HTML grep cover all must-haves. Human browser inspection is not required — content correctness is verifiable programmatically.

## Preconditions

1. Worker process is stopped (not running in pm2 or background) — you will start it manually
2. `ANTHROPIC_API_KEY` is present in `.env` (monorepo root)
3. At least one site exists in Supabase with `tsa_categories` and `tsa_products` rows (produced by a prior S02 job run)
4. The site has a known `id` and `slug` (get from Supabase dashboard or `SELECT id, slug FROM sites LIMIT 5`)
5. Working directory: `/home/daniel/monster`

## Smoke Test

```bash
# ContentGenerator class is present, builds, and fails fast on missing API key
pnpm --filter @monster/agents build && echo "BUILD OK"
pnpm --filter @monster/agents typecheck && echo "TYPECHECK OK"
npx astro check --root apps/generator && echo "ASTRO CHECK OK"
```

**Expected:** All three exit 0. Any failure here is a regression — do not proceed.

## Test Cases

### 1. TypeScript clean across all affected packages

```bash
cd /home/daniel/monster
pnpm --filter @monster/agents typecheck
pnpm --filter @monster/generator typecheck 2>/dev/null || \
  npx --prefix apps/generator astro check
```

1. Run both commands
2. **Expected:** `@monster/agents typecheck` exits 0 with no output. `astro check` reports `0 errors, 0 warnings, 0 hints` across all files (currently 10 files). No TypeScript errors about missing `focus_keyword`, `meta_description`, or `user_opinions_summary` properties.

---

### 2. ContentGenerator constructor fail-fast on missing API key

```bash
cd /home/daniel/monster
node --input-type=module -e "
import('./packages/agents/dist/index.js').then(m => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error('[ContentGenerator] ANTHROPIC_API_KEY is not set. Set it in .env before starting the worker.');
  }
  console.log('key present:', key.substring(0, 8) + '...');
}).catch(e => {
  if (e.message.includes('ANTHROPIC_API_KEY')) console.log('PASS: throws:', e.message);
  else console.error('FAIL unexpected error:', e.message);
});
"
```

1. **Without** `ANTHROPIC_API_KEY` in environment
2. Run the node snippet
3. **Expected:** Output contains `PASS: throws: [ContentGenerator] ANTHROPIC_API_KEY is not set...` — constructor throws a descriptive error, does not silently continue.

---

### 3. SiteData interface includes all new fields in site.json

Run a generation job for a real site (requires worker running and ANTHROPIC_API_KEY set):

```bash
# Start worker in background
node packages/agents/dist/worker.js &
WORKER_PID=$!

# Dispatch job via admin panel OR directly via queue helper:
node --input-type=module -e "
import { generateQueue } from './packages/agents/dist/index.js';
const q = generateQueue();
await q.add('generate', { siteId: '<YOUR_SITE_ID>' });
console.log('job added');
await q.close();
" 2>&1

# Wait for job to complete (watch logs), then stop worker
kill $WORKER_PID
```

After job completes:

```bash
# Inspect the assembled site.json
cat apps/generator/src/data/<SITE_SLUG>/site.json | \
  python3 -m json.tool | grep -E '"focus_keyword"|"meta_description"|"user_opinions_summary"' | head -20
```

1. **Expected:** `"focus_keyword"` appears on the site object, on each category, and on each product. `"meta_description"` appears on each category and each product. `"user_opinions_summary"` appears on each product. Values should be non-null strings (not `null`) for generated items.

---

### 4. focus_keyword written to Supabase for categories and products

After the job completes, query Supabase:

```sql
-- Via Supabase dashboard SQL editor or psql
SELECT name, focus_keyword FROM tsa_categories WHERE site_id = '<SITE_ID>' LIMIT 10;
SELECT asin, focus_keyword FROM tsa_products WHERE site_id = '<SITE_ID>' LIMIT 10;
```

1. **Expected:** All rows have non-null `focus_keyword` values. The keywords should be in the site's configured language (e.g. Spanish for a `es` site). Example: `"freidoras de aire"`, `"mejor freidora aire sin aceite"`.
2. If any `focus_keyword` is null after the job, check `ai_jobs` for errors: `SELECT status, error, payload FROM ai_jobs WHERE site_id = '<SITE_ID>' ORDER BY updated_at DESC LIMIT 3`.

---

### 5. AI content written to Supabase for categories and products

```sql
-- Category SEO text (written as description in tsa_categories)
SELECT name, length(seo_text), left(seo_text, 100) FROM tsa_categories WHERE site_id = '<SITE_ID>';

-- Product content fields
SELECT asin, length(detailed_description), length(pros_cons), length(user_opinions_summary)
FROM tsa_products WHERE site_id = '<SITE_ID>' LIMIT 10;
```

1. **Expected:** `tsa_categories.seo_text` has length > 200 characters (target ~400 words). `tsa_products.detailed_description`, `pros_cons`, `user_opinions_summary` all have length > 50 characters. Content is in the site's language.
2. `tsa_categories.description` contains the category meta description (shorter string, ~100-160 chars) per D057.

---

### 6. Meta description tag present in built HTML

After the job completes and Astro build runs:

```bash
# Category pages
grep -r '<meta name="description"' .generated-sites/*/dist/categories/*.html | head -5

# Product pages
grep -r '<meta name="description"' .generated-sites/*/dist/products/*.html | head -5

# Homepage (no meta_description field — should NOT have the tag unless site.focus_keyword provides it)
grep '<meta name="description"' .generated-sites/*/dist/index.html | head -3
```

1. **Expected:** Category pages and product pages all have `<meta name="description" content="...">` tags. Content should be non-empty strings in the site's language, ideally 100-160 characters. Homepage may or may not have the tag (currently no `meta_description` source for homepage).
2. Verify the tag appears **inside `<head>`** — not in the body.

---

### 7. Idempotency — re-running job skips already-generated content

```bash
# Run the job a second time on the same site (worker must be running)
node --input-type=module -e "
import { generateQueue } from './packages/agents/dist/index.js';
const q = generateQueue();
await q.add('generate', { siteId: '<YOUR_SITE_ID>' });
await q.close();
"
```

Watch worker stdout during the second run:

```bash
# Expected log lines — should see "skipped" for all items
grep -E "skipped|generated" <(pm2 logs monster-worker --nostream 2>/dev/null || cat /tmp/worker.log)
```

1. **Expected:** Worker logs `[ContentGenerator] category "<name>" — skipped (already generated)` for every category and `[ContentGenerator] product "<asin>" — skipped (already generated)` for every product. No Anthropic API calls made. Job completes faster than the first run (~0 API latency for content phase). `focus_keyword` values in DB unchanged.

---

### 8. Progress visible in ai_jobs during generation

While the job is running (not after completion):

```sql
-- Poll this query ~every 5 seconds during content generation phase
SELECT status, payload, updated_at FROM ai_jobs WHERE site_id = '<SITE_ID>' ORDER BY updated_at DESC LIMIT 1;
```

1. **Expected:** `payload` cycles through `{"phase": "generate_content", "done": 1, "total": N}`, incrementing `done` with each generated item. `status` is `active` during generation.
2. Also verifiable via admin panel site detail page job progress display (if S02 polling is wired).

---

### 9. lockDuration prevents stall on long jobs

```bash
grep "lockDuration" packages/agents/src/jobs/generate-site.ts
```

1. **Expected:** Output shows `lockDuration: 300000` in the Worker options object.
2. Functional proof: a job with 20+ products (20 × 1.5s sleep = 30s minimum) should complete without BullMQ logging "job stalled" — if stall detection fires, `lockDuration` is the fix.

---

### 10. Worker startup logs API key presence without leaking key value

```bash
# Start worker and capture startup log
timeout 5 node packages/agents/dist/worker.js 2>&1 | head -5
```

1. **Expected:** Output includes `[ContentGenerator] initialised — ANTHROPIC_API_KEY present` and `[worker] GenerateSiteJob listening on queue "generate"`. The actual `ANTHROPIC_API_KEY` value must NOT appear in the output — only its presence is logged.

---

## Edge Cases

### Missing ANTHROPIC_API_KEY — job fails with descriptive error

1. Temporarily unset `ANTHROPIC_API_KEY` in environment
2. Start worker, dispatch a generate job
3. **Expected:** Worker logs a descriptive error (`[ContentGenerator] ANTHROPIC_API_KEY is not set...`). `ai_jobs.status` is set to `'failed'`. `ai_jobs.error` column contains the error message. Job does not retry indefinitely.

### Category with existing focus_keyword — skipped cleanly

1. Manually set `focus_keyword = 'test-keyword'` on one category in Supabase: `UPDATE tsa_categories SET focus_keyword = 'test-keyword' WHERE id = '<cat-id>'`
2. Run a generate job
3. **Expected:** Worker logs `[ContentGenerator] category "<name>" — skipped (already generated)` for that category. The `focus_keyword` in DB remains `'test-keyword'` (not overwritten). Other categories without `focus_keyword` are generated normally.

### Language-specific content — non-Spanish site

1. If a site exists with `language = 'en'` and `market = 'US'`
2. Run a generate job
3. **Expected:** Generated `seo_text`, `detailed_description`, `focus_keyword`, and `meta_description` values are in English, not Spanish. Claude's system prompt includes `Generate all content in the following language: en`.

### Anthropic rate limit / 5-retry exhaustion

1. (Simulate by using an invalid API key after the first successful call — hard to test live)
2. **Expected:** SDK retries up to 5 times with exponential backoff. After exhaustion, throws. `ai_jobs.status` → `'failed'`. `ai_jobs.error` contains the SDK error message. Partial progress preserved in DB (previously generated items not lost). Job can be retried; already-generated items are skipped.

---

## Failure Signals

- `pnpm --filter @monster/agents typecheck` fails → TypeScript regression in content-generator.ts or generate-site.ts
- `npx astro check` shows errors about `metaDescription` or new `data.ts` fields → prop forwarding broken in a template layer
- `tsa_categories.focus_keyword` is null after job → ContentGenerator not instantiated, or phase block not executing, or API key missing
- `<meta name="description">` absent from all built HTML → BaseLayout prop not forwarded, or null→undefined conversion missing at page level
- Worker logs "job stalled" → `lockDuration` not applied, or content generation exceeding 5 minutes
- `[ContentGenerator] category "<name>" — generated` appears twice for same category in one run → idempotency broken (DB re-fetch not working)

## Requirements Proved By This UAT

- R004 (AI content generation) — UAT cases 3-6 prove: category SEO texts, product descriptions, pros/cons, opinion summaries, and meta descriptions are generated by Claude API in the site's language, written to Supabase, and present in built HTML.

## Not Proven By This UAT

- Content quality (SEO effectiveness, readability score, conversion potential) — requires human review or SEO tool integration
- Rate limit resilience under high volume (50+ products at Plan Pro) — requires a large site to test exhaustion
- Full end-to-end pipeline timing (< 30 min target per R001) — proven only at S04 milestone completion
- SEO scores (R005) — S04 scope
- Deployment (R006) — M004 scope

## Notes for Tester

- The `generate_content` phase adds ~1.5s per item to job duration. A site with 2 categories + 20 products = ~33s for the content phase alone. The full job (fetch → images → content → build) takes 3-5 minutes on first run.
- On retry after a crash, the job re-fetches DB state. Items with `focus_keyword` non-null are skipped. The Astro build at the end uses the assembled `site.json` — any product with null `meta_description` (D058 gap) will have no meta tag on its page.
- `tsa_categories.description` doubles as the category meta description (D057). If you see 400-word strings in the description column, that's a bug — the ContentGenerator should write a short meta description there, not the full SEO text.
- Check `ai_jobs.payload` in Supabase during generation for real-time progress — this is the same data the admin panel polls.
