---
estimated_steps: 6
estimated_files: 1
---

# T02: Wire generate_content phase into GenerateSiteJob

**Slice:** S03 — ContentGenerator
**Milestone:** M003

## Description

Insert the `generate_content` phase into `GenerateSiteJob.process()` between `process_images` completion and the DB fetch for `SiteData` assembly. This phase calls `ContentGenerator` sequentially for each category then each product, writes content fields to Supabase after each call, and updates `ai_jobs.payload` with progress. Also sets `lockDuration: 300000` on the BullMQ Worker so the 60s+ content generation doesn't lose the job lock (default is 30s).

Insertion point: between the final `ai_jobs.payload` update at end of `process_images` phase (~line 280 in current file) and the `// ── 6. Assemble SiteData from DB` block. The existing `dbCategories`/`dbProducts` fetch after this insertion automatically picks up the written content fields — no change to the assembly block needed (D056 pattern).

Content writes per entity:
- Category: `seo_text`, `focus_keyword`, `description` (= `meta_description`)
- Product: `detailed_description`, `pros_cons` (JSON: `{pros, cons}`), `user_opinions_summary`, `focus_keyword`
- Product `meta_description` stored only in-memory in a `Map<productId, string>` — injected into `SiteData` assembly at the end of the block

## Steps

1. Add `lockDuration: 300000` to the `Worker` options object in `GenerateSiteJob.register()`:
   ```typescript
   const worker = new Worker<GenerateSitePayload>(
     'generate',
     async (job) => { ... },
     { connection, lockDuration: 300000 }
   );
   ```

2. Import `ContentGenerator` at top of `generate-site.ts`:
   ```typescript
   import { ContentGenerator } from '../content-generator.js';
   ```

3. After the `process_images` `ai_jobs.payload` update and before `// ── 6. Assemble SiteData` — insert the `generate_content` phase:

   ```typescript
   // ── generate_content phase ────────────────────────────────────────────
   const contentGenerator = new ContentGenerator();
   const language = (site.language ?? 'en') as string;
   const totalContentItems = categories.length + allProducts.length;
   let contentDone = 0;

   await supabase.from('ai_jobs')
     .update({ payload: { phase: 'generate_content', done: 0, total: totalContentItems } })
     .eq('bull_job_id', job.id ?? '');

   // Re-fetch categories to check current focus_keyword (idempotency)
   const { data: currentCategories } = await supabase
     .from('tsa_categories').select('id, name, slug, keywords, focus_keyword').eq('site_id', siteId);

   for (const cat of currentCategories ?? []) {
     const keyword = (cat.keywords as string[])?.[0] ?? cat.name;
     const result = await contentGenerator.generateCategoryContent({
       name: cat.name, keyword, language,
       alreadyHasFocusKeyword: cat.focus_keyword !== null,
     });
     if (result) {
       await supabase.from('tsa_categories').update({
         focus_keyword: result.focus_keyword,
         seo_text: result.seo_text,
         description: result.meta_description,
         updated_at: new Date().toISOString(),
       }).eq('id', cat.id);
     }
     contentDone++;
     await supabase.from('ai_jobs')
       .update({ payload: { phase: 'generate_content', done: contentDone, total: totalContentItems } })
       .eq('bull_job_id', job.id ?? '');
   }

   // Re-fetch products to check current focus_keyword (idempotency)
   const { data: currentProducts } = await supabase
     .from('tsa_products').select('id, asin, title, current_price, focus_keyword').eq('site_id', siteId);

   const productMetaDescriptions = new Map<string, string>(); // product id → meta_description

   for (const prod of currentProducts ?? []) {
     const result = await contentGenerator.generateProductContent({
       asin: prod.asin, title: prod.title ?? prod.asin,
       price: prod.current_price ?? 0, language,
       alreadyHasFocusKeyword: prod.focus_keyword !== null,
     });
     if (result) {
       await supabase.from('tsa_products').update({
         focus_keyword: result.focus_keyword,
         detailed_description: result.detailed_description,
         pros_cons: { pros: result.pros, cons: result.cons },
         user_opinions_summary: result.user_opinions_summary,
         updated_at: new Date().toISOString(),
       }).eq('id', prod.id);
       productMetaDescriptions.set(prod.id, result.meta_description);
     }
     contentDone++;
     await supabase.from('ai_jobs')
       .update({ payload: { phase: 'generate_content', done: contentDone, total: totalContentItems } })
       .eq('bull_job_id', job.id ?? '');
   }
   console.log(`[GenerateSiteJob] generate_content: ${contentDone}/${totalContentItems} items generated`);
   ```

4. In the `SiteData` assembly block (the `products:` array `.map()`), add `meta_description: productMetaDescriptions.get(p.id) ?? null` to each product object. Also add `meta_description: cat.description ?? null` and `focus_keyword: cat.focus_keyword ?? null` to each category object, and `focus_keyword: p.focus_keyword ?? null`, `user_opinions_summary: p.user_opinions_summary ?? null` to each product object. (These fields don't exist in `ProductData`/`CategoryData` yet — T03 adds them; put placeholder comments if T03 hasn't run, or implement both in same pass.)

   **Note:** T03 must complete before the assembly additions type-check. Run T02 typecheck after T03 if doing them in sequence, or add the assembly changes in T03 (preferred — T03 owns the data contract).

5. Run `pnpm --filter @monster/agents typecheck` — must exit 0

6. Run `pnpm --filter @monster/agents build` — must exit 0; verify `dist/worker.js` size increases (ContentGenerator bundled)

## Must-Haves

- [ ] `lockDuration: 300000` set on the `Worker` in `register()`
- [ ] `ContentGenerator` imported from `'../content-generator.js'`
- [ ] `generate_content` phase block present between `process_images` completion and `SiteData` assembly
- [ ] Category loop re-fetches from DB (not in-memory `categories` array) to get current `focus_keyword` for idempotency check
- [ ] Product loop re-fetches from DB (not in-memory `allProducts` array) for same reason
- [ ] `ai_jobs.payload` updated at phase start and after each item (`done` increments per item)
- [ ] Category Supabase update writes `focus_keyword` + `seo_text` + `description`
- [ ] Product Supabase update writes `focus_keyword` + `detailed_description` + `pros_cons` + `user_opinions_summary`
- [ ] `productMetaDescriptions` Map available for T03's `SiteData` assembly additions
- [ ] `[GenerateSiteJob] generate_content: N/total items generated` log line present
- [ ] `pnpm --filter @monster/agents typecheck` exits 0 (after T03 completes data contract)
- [ ] `pnpm --filter @monster/agents build` exits 0

## Verification

```bash
cd /home/daniel/monster

# lockDuration present
grep "lockDuration" packages/agents/src/jobs/generate-site.ts

# generate_content phase present
grep "generate_content" packages/agents/src/jobs/generate-site.ts

# ContentGenerator import present
grep "ContentGenerator" packages/agents/src/jobs/generate-site.ts

# TypeCheck (run after T03 for full pass)
pnpm --filter @monster/agents typecheck

# Build
pnpm --filter @monster/agents build
```

## Observability Impact

- Signals added: `[GenerateSiteJob] generate_content: N/total items generated`; `ai_jobs.payload` now cycles through `{phase: "generate_content", done: N, total: M}` incrementally (one update per item)
- How a future agent inspects this: `ai_jobs.payload` in Supabase shows per-item progress; `tsa_categories.focus_keyword` and `tsa_products.focus_keyword` non-null after phase completes
- Failure state exposed: if Claude throws (auth error, rate limit exhaustion), exception propagates to BullMQ `worker.on('failed')` which writes to `ai_jobs.error`; partial progress (some items generated) is preserved in DB since writes are incremental

## Inputs

- `packages/agents/src/content-generator.ts` — `ContentGenerator` class from T01
- `packages/agents/src/jobs/generate-site.ts` — current file; insertion point between lines ~280 (end of process_images) and ~290 (start of SiteData assembly)

## Expected Output

- `packages/agents/src/jobs/generate-site.ts` — modified: `lockDuration: 300000` on Worker, `ContentGenerator` import, `generate_content` phase block, `productMetaDescriptions` Map
- `packages/agents/dist/worker.js` — rebuilt; `ContentGenerator` bundled in worker output
