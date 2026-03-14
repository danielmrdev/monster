---
id: T02
parent: S03
milestone: M003
provides:
  - generate_content phase wired into GenerateSiteJob between process_images and SiteData assembly
  - lockDuration 300000 on BullMQ Worker
  - productMetaDescriptions Map available for T03 SiteData assembly
key_files:
  - packages/agents/src/jobs/generate-site.ts
key_decisions:
  - Re-fetch from DB (not in-memory arrays) for idempotency — ensures focus_keyword check reflects DB truth even on retry
  - productMetaDescriptions Map declared before assembly block so T03 can consume it without restructuring
patterns_established:
  - generate_content phase: per-item ai_jobs.payload updates (done/total) for live progress visibility
  - ContentGenerator instantiated once per job, not per item — avoids redundant API key checks
observability_surfaces:
  - "[GenerateSiteJob] generate_content: N/total items generated" console log
  - ai_jobs.payload cycles through {phase: generate_content, done: N, total: M} per item
  - tsa_categories.focus_keyword and tsa_products.focus_keyword non-null after phase completes
  - Worker lockDuration 300000ms prevents BullMQ lock expiry during 60s+ generation
duration: 20m
verification_result: passed
completed_at: 2026-03-13
blocker_discovered: false
---

# T02: Wire generate_content phase into GenerateSiteJob

**Inserted generate_content phase into GenerateSiteJob with per-item Supabase writes, idempotency-safe DB re-fetches, and lockDuration 300000 on the Worker.**

## What Happened

Added the `ContentGenerator` import and `lockDuration: 300000` to the Worker options. Inserted the `generate_content` phase block between the `process_images` final payload update and `// ── 6. Assemble SiteData`. The phase:

1. Instantiates `ContentGenerator` (throws on missing API key — propagates to BullMQ failed handler)
2. Sets `ai_jobs.payload` to `{phase: "generate_content", done: 0, total: N}` at phase start
3. Re-fetches `tsa_categories` from DB (not in-memory `categories` array) to get current `focus_keyword` — idempotency check on retry
4. Calls `generateCategoryContent()` per category; writes `focus_keyword`, `seo_text`, `description` to DB; increments `ai_jobs.payload.done` after each item
5. Re-fetches `tsa_products` from DB for same idempotency reason
6. Calls `generateProductContent()` per product; writes `focus_keyword`, `detailed_description`, `pros_cons`, `user_opinions_summary` to DB; stores `meta_description` in `productMetaDescriptions` Map (id → string) for T03 to consume
7. Logs `[GenerateSiteJob] generate_content: N/total items generated`

`productMetaDescriptions` is declared at line 366 and populated through the product loop — available in the assembly block starting at line 442 for T03's injection.

## Verification

```
grep "lockDuration" packages/agents/src/jobs/generate-site.ts
# → { connection, lockDuration: 300000 }

grep "generate_content" packages/agents/src/jobs/generate-site.ts
# → phase block, payload updates, log line — all present

grep "ContentGenerator" packages/agents/src/jobs/generate-site.ts
# → import + instantiation both present

pnpm --filter @monster/agents typecheck
# → exit 0 (no output)

pnpm --filter @monster/agents build
# → dist/worker.js 498.50 KB — build success

node --input-type=module -e "import('./packages/agents/dist/worker.js').then(() => console.log('worker loads OK'))"
# → [worker] GenerateSiteJob listening on queue "generate" / worker loads OK
```

## Diagnostics

- `[GenerateSiteJob] generate_content: N/total items generated` — grep worker stdout for phase completion
- `ai_jobs.payload` in Supabase: `{phase: "generate_content", done: N, total: M}` updates per item (live progress)
- `tsa_categories.focus_keyword` and `tsa_products.focus_keyword` non-null in DB after phase completes
- Claude auth failure → SDK 401 → propagates to `worker.on('failed')` → `ai_jobs.error` column set
- `ContentGenerator` constructor throws on missing `ANTHROPIC_API_KEY` — same failure path
- Partial progress preserved: DB writes are incremental, so items generated before a crash are not lost

## Deviations

None. Implementation matches plan exactly.

## Known Issues

- `existsSync` imported at top of `generate-site.ts` but unused — pre-existing, not introduced by T02.
- T03 must inject `productMetaDescriptions.get(p.id)` and new `SiteData` interface fields into the assembly block before the full type surface is complete.

## Files Created/Modified

- `packages/agents/src/jobs/generate-site.ts` — ContentGenerator import, lockDuration 300000, generate_content phase block, productMetaDescriptions Map
