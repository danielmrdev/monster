# S01: Astro Templates + Build Pipeline — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime + human-experience)
- Why this mode is sufficient: S01 proves the Astro build API end-to-end. Artifact verification (file existence, HTML content assertions) proves the build pipeline; browser verification proves templates render correctly; live admin interaction proves the BullMQ → ai_jobs flow.

## Preconditions

1. Worker is **not** running (will be started in Test 3)
2. Admin panel is running: `pm2 list` shows `monster-admin` online (or run `pnpm --filter @monster/admin dev` locally)
3. At least one `sites` row exists in Supabase with a valid `id`, `domain` (e.g. `test.example.com`), `affiliate_tag`, and `market = 'ES'`
4. `.env` contains `UPSTASH_REDIS_URL` (rediss:// scheme) and `UPSTASH_REDIS_TOKEN`
5. `pnpm --filter @monster/agents build` has been run — `packages/agents/dist/worker.js` exists
6. The `apps/generator` project is installed (`pnpm install` with filter or workspace install run)

## Smoke Test

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
```
Expected: `[build] 11 page(s) built` and `[build] Complete!` in stdout within 5 seconds. If this fails, the generator is broken and no further tests are meaningful.

---

## Test Cases

### 1. Fixture build produces all 11 routes

**Purpose:** Confirm the Astro build pipeline produces a complete, correct dist/ for all page types.

```bash
SITE_SLUG=fixture pnpm --filter @monster/generator build
```

1. Verify exit code 0 and `[build] Complete!` in stdout.
2. Check route presence:
   ```bash
   DIST=apps/generator/.generated-sites/fixture/dist
   ls $DIST/index.html                                         # homepage
   ls $DIST/categories/freidoras-de-aire/index.html            # category page
   ls $DIST/categories/hornos-de-conveccion/index.html         # second category
   ls $DIST/products/philips-hd9252-90/index.html              # product page
   ls $DIST/privacidad/index.html                              # legal: privacy
   ls $DIST/aviso-legal/index.html                             # legal: legal notice
   ls $DIST/cookies/index.html                                 # legal: cookies
   ls $DIST/contacto/index.html                                # legal: contact
   ```
3. **Expected:** All 8 paths above exist; no command returns a non-zero exit.

---

### 2. Affiliate link structure is correct in product pages

**Purpose:** Confirm `buildAffiliateUrl()` wires the `?tag=` param correctly from site.json.

```bash
DIST=apps/generator/.generated-sites/fixture/dist
grep "?tag=test-fixture-20" $DIST/products/philips-hd9252-90/index.html
grep "amazon.es/dp/" $DIST/products/philips-hd9252-90/index.html
```

1. **Expected:** Both greps return at least one match.
2. Open `$DIST/products/philips-hd9252-90/index.html` in a browser (via `file://` or `npx serve $DIST`).
3. Locate the affiliate CTA button/link.
4. Right-click → Copy link address.
5. **Expected:** URL format is `https://www.amazon.es/dp/B08Z7RGQPK?tag=test-fixture-20`. No `ssl-images-amazon.com` or other hotlinked Amazon URLs in the page source.

---

### 3. No hotlinked Amazon image URLs anywhere in dist/

**Purpose:** Confirm S01 data isolation — all images are Unsplash placeholders or empty, never hotlinked.

```bash
grep -rq "ssl-images-amazon.com" apps/generator/.generated-sites/fixture/dist/ \
  && echo "FAIL: hotlink found" || echo "PASS: images OK"
grep -rq "images-na.ssl-images-amazon.com" apps/generator/.generated-sites/fixture/dist/ \
  && echo "FAIL: hotlink found" || echo "PASS: images OK"
```

1. **Expected:** Both commands print `PASS: images OK`.

---

### 4. Three templates render distinct visual styles

**Purpose:** Confirm each template produces a noticeably different layout.

**Setup:** Build the same content three times with different `template_slug` values.

1. Edit `apps/generator/src/data/fixture/site.json` — change `"template_slug"` to `"classic"`. Run build. Open `dist/index.html` in browser. Note: white nav bar, standard `max-w-6xl` content column.
2. Change `"template_slug"` to `"modern"`. Run build. Open `dist/index.html`. Note: sticky colored header (uses `--primary` color), wider content, hero section slot.
3. Change `"template_slug"` to `"minimal"`. Run build. Open `dist/index.html`. Note: narrow `max-w-4xl` centered column, hairline borders, uppercase navigation labels.
4. Restore `"template_slug"` to `"classic"` after verification.
5. **Expected:** All three templates render without errors; each is visually distinct in layout structure and navigation style; footer shows affiliate disclosure text on all three.

---

### 5. CSS custom properties are applied from customization

**Purpose:** Confirm `define:vars` wiring passes `primaryColor`, `accentColor`, `fontFamily` through to rendered HTML.

1. Open any page from the fixture build in browser.
2. Open browser DevTools → Elements.
3. Inspect the `<body>` element.
4. **Expected:** `style` attribute contains `--primary: #2563eb; --accent: #f59e0b; --font: Inter, sans-serif` (or the values from `fixture/site.json`'s `customization` block).
5. Alternatively: `grep "style=\"--primary" apps/generator/.generated-sites/fixture/dist/index.html` should return a match.

---

### 6. Astro type check passes clean

**Purpose:** Confirm all Astro components are type-valid — no silently broken props.

```bash
cd apps/generator && npx astro check
```

1. **Expected:** `Result (10 files): 0 errors, 0 warnings, 0 hints`

---

### 7. packages/agents builds and type-checks clean

**Purpose:** Confirm the BullMQ worker package compiles without errors.

```bash
pnpm --filter @monster/agents build
cd packages/agents && npx tsc --noEmit; echo "exit: $?"
```

1. **Expected:** tsup prints `Build success` for both `dist/index.js` and `dist/worker.js`; tsc exits 0.

---

### 8. Admin "Generate Site" button → job enqueued → ai_jobs created

**Purpose:** Confirm the admin → BullMQ → Supabase flow works from the UI.

**Setup:** Worker is NOT running yet (simulates enqueue-only scenario).

1. Navigate to admin panel → Sites → click on a real site row.
2. Scroll to the "Generate Site" section.
3. Click "Generate Site".
4. **Expected:** Button does not error; page shows a "Job Status" section with status badge showing `Pending` or `Running`.
5. Open Supabase dashboard → `ai_jobs` table. Filter by `site_id = <the site's UUID>`.
6. **Expected:** A new row exists with `status = pending` and a non-null `bull_job_id`.

---

### 9. Worker processes the job → ai_jobs transitions to completed

**Purpose:** Confirm the full click-to-build flow completes successfully.

**Setup:** Continue from Test 8 (job enqueued but worker not running).

1. Start the worker:
   ```bash
   node packages/agents/dist/worker.js
   ```
2. Watch stdout for `[GenerateSiteJob] Starting job <id>` → `Wrote site.json` → `Running Astro build` → `Astro build complete` → `Job <id> completed`.
3. Return to admin panel → site detail page. Wait up to 15 seconds for auto-poll.
4. **Expected:** Job Status section shows `Completed` badge with non-null `started_at` and `completed_at`.
5. In Supabase `ai_jobs`: `status = completed`, `error = null`, `started_at` and `completed_at` both set.
6. Check filesystem:
   ```bash
   ls apps/generator/.generated-sites/<site-slug>/dist/index.html
   ```
7. **Expected:** File exists. Built site is the fixture data (S01 uses fixture products, not real DataForSEO data).

---

### 10. Admin panel JobStatus auto-polls during running state

**Purpose:** Confirm 5-second polling keeps UI live without manual refresh.

1. Repeat Test 9 but keep the admin panel site detail open in browser.
2. Start the worker.
3. **Expected:** Without any manual page refresh, the Job Status badge transitions from `Pending` → `Running` → `Completed` automatically within ~15 seconds of the worker processing the job.

---

## Edge Cases

### Failed job writes error to ai_jobs

**Scenario:** Worker encounters an error (e.g. site row doesn't exist in Supabase).

1. Enqueue a job for a `siteId` that does not exist in the `sites` table:
   ```bash
   # Temporarily call enqueueSiteGeneration with a fake UUID via the server action
   # or: node -e "require('./packages/agents/dist/index.js').generateQueue().add('generate-site', { siteId: '00000000-0000-0000-0000-000000000000' })"
   ```
2. Start the worker.
3. **Expected:** Worker stdout shows `[GenerateSiteJob] Job <id> failed: <error message>`. `ai_jobs` row shows `status = failed`, `error` column contains the failure reason.
4. Admin panel Job Status section shows `Failed` badge.

---

### Build with unknown template_slug falls back to Classic

**Scenario:** `site.template_slug` contains an unrecognized value.

1. Edit `apps/generator/src/data/fixture/site.json` → set `"template_slug": "nonexistent"`.
2. Run `SITE_SLUG=fixture pnpm --filter @monster/generator build`.
3. **Expected:** Build succeeds (exit 0); homepage uses Classic layout (the default branch in the template switch).
4. Restore fixture to `"classic"` after verification.

---

### SITE_SLUG not set — falls back to "default" slug

**Scenario:** Worker fails to set SITE_SLUG before calling build().

```bash
pnpm --filter @monster/generator build   # no SITE_SLUG prefix
ls apps/generator/.generated-sites/
```

1. **Expected:** Build succeeds; output lands in `.generated-sites/default/dist/`. This is a safe fallback — no crash, but the slug is wrong. Observable from directory listing.

---

## Failure Signals

- `astro check` reports errors → template component props are mismatched; check Astro.props types in affected component
- `[build] 0 page(s) built` → `getStaticPaths()` returned empty array; check `process.cwd()` path in `loadSiteData()`; run `ls apps/generator/src/data/` to confirm slug dir exists
- `ai_jobs.status` stuck at `running` → worker crashed mid-build; check worker stdout; check `apps/generator/.generated-sites/<slug>/dist/` for partial output
- Admin panel shows no Job Status section → `getLatestJobStatus()` server action returned null; check `ai_jobs` table has a row for this site_id
- Worker startup fails with `Error: connect ECONNREFUSED` → `UPSTASH_REDIS_URL` is wrong scheme (must be `rediss://` not `redis://`) or token is invalid
- `Cannot find module 'astro'` in worker → astro not installed in monorepo node_modules; run `pnpm install` from root
- `dist/index.js` imports crash in Next.js admin → `GenerateSiteJob` was accidentally added to `packages/agents/src/index.ts`; it must stay worker-only

## Requirements Proved By This UAT

- R015 — Three TSA Astro templates (Classic, Modern, Minimal) each render homepage, category, product, and 4 legal pages with distinct visual styles and correct CSS custom property theming
- R001 (partial) — Generator pipeline works end-to-end from admin trigger to built static dist/; full validation requires real product data (S02+)

## Not Proven By This UAT

- R001 — Full end-to-end pipeline: real DataForSEO product data (S02), real AI content (S03), SEO scores (S04), deployment (M004)
- R004 — AI content generation (S03)
- R005 — SEO Scorer (S04)
- Images loading in product pages — S01 fixture has empty `images[]`; all product images will be broken placeholders. Expected and documented.
- Legal page i18n slug variants — only ES slugs are hardcoded in S01; other languages handled in S02+

## Notes for Tester

- Product image `<img>` tags will show broken image icons in the browser for S01 — this is expected. The `images[]` array is empty in the fixture. S02 downloads real images.
- The worker process must be started manually (`node packages/agents/dist/worker.js`). There is no pm2 config yet — that's S04.
- Test 4 (three templates) requires manually editing `fixture/site.json` — restore `"template_slug": "classic"` when done, or the remaining tests may see the wrong template.
- `ai_jobs` accumulates one row per "Generate Site" click — this is normal. Rows are not cleaned up in S01. The admin panel always shows the most recent job (ORDER BY created_at DESC LIMIT 1).
- If the worker was already running from a previous test, kill it before Test 8 to test the enqueue-without-worker scenario cleanly.
