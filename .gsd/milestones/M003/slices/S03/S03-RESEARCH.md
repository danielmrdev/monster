# S03: ContentGenerator — Research

**Date:** 2026-03-14

## Summary

S03 adds AI-generated content to the generation pipeline. It sits between `process_images` and `build` in `GenerateSiteJob`, calls the Claude API with `@anthropic-ai/sdk` to produce SEO texts (~400 words), product descriptions, pros/cons, user opinion summaries, and meta descriptions in the site's language, writes `focus_keyword` back to Supabase for every entity, and persists content incrementally before the Astro build runs. S04 (SEO Scorer) reads `focus_keyword` from DB via `site.json` — if S03 doesn't write it, S04 has nothing to score against.

The work is mechanically straightforward but has three real risks to manage upfront. First: **Zod version split**. The project uses Zod v3 in `packages/shared`, but `@anthropic-ai/sdk`'s `zodOutputFormat` helper internally calls `z.toJSONSchema()` which is Zod v4-only. Correct fix: install `zod@^4.0.0` directly in `packages/agents` (separate from shared — no conflict) and use the SDK's `messages.parse()` + `zodOutputFormat()` API natively. Second: **pacing on Plan Pro**. The SDK auto-retries 429 and 500+ (including 529 overloaded) with exponential backoff by default (2 retries). Bump `maxRetries: 5` and add a `sleep(1500)` inter-call delay. Content written to DB incrementally per entity so a mid-job crash can resume without re-generating already-persisted content. Third: **`meta_description` and `user_opinions_summary` aren't in `SiteData` yet**. Both fields exist in the DB schema but haven't been added to `data.ts` interfaces or `site.json`. S03 must extend the data contract and update `BaseLayout.astro` to emit `<meta name="description">`.

The `generate_content` phase inserts between `process_images` and `build` in `GenerateSiteJob`. Content is written to Supabase before `SiteData` assembly, so the existing post-upsert DB fetch picks up all content fields automatically — no changes needed to the assembly step (D056 pattern).

## Recommendation

Three tasks, smallest to largest:

1. **T01 — ContentGenerator class**: Install `@anthropic-ai/sdk@^0.78.0` + `zod@^4.0.0` in `packages/agents`. Implement `ContentGenerator` in `packages/agents/src/content-generator.ts` with `CategoryContentSchema` and `ProductContentSchema` (Zod v4). One method each: `generateCategoryContent()` and `generateProductContent()`. Use `client.messages.parse()` with `zodOutputFormat`. Pacing: 1.5s sleep between calls + `maxRetries: 5`. Idempotency: check if `focus_keyword` is already populated before calling Claude — skip if already written (re-run safety).

2. **T02 — Wire into GenerateSiteJob**: Insert `generate_content` phase between `process_images` and the existing DB-fetch/assembly block. Read categories and products from Supabase (the same fetch that already happens before `build`). Call `ContentGenerator` sequentially per category then per product. Write content fields to Supabase after each call. Update `ai_jobs.payload` with `{ phase: 'generate_content', done, total }`.

3. **T03 — Extend data contract**: Add `meta_description`, `user_opinions_summary`, and `focus_keyword` to `ProductData` and `CategoryData` interfaces in `apps/generator/src/lib/data.ts`. Add `focus_keyword` to `SiteInfo`. Update `SiteData` assembly in `generate-site.ts` to include new fields. Update `BaseLayout.astro` to accept and render `<meta name="description">`. Update the three template layouts to pass `meta_description` from the page props to `BaseLayout`. Run `tsc --noEmit` + `pnpm -r build` to verify.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Structured output from Claude | `client.messages.parse()` + `zodOutputFormat()` from `@anthropic-ai/sdk` | First-party SDK helper. Converts Zod schema to JSON Schema, sends to API, parses response, validates with `safeParse`. One call, one type. |
| Zod schemas for content shapes | Zod v4 (`zod@^4.0.0`) in `packages/agents` | `zodOutputFormat` calls `z.toJSONSchema()` which is Zod v4 only. Install v4 in agents package independently — no conflict with v3 in `packages/shared`. |
| Rate limit and retry | SDK built-in `maxRetries` option | The SDK retries 429, 429, and 500+ (including 529 overloaded) with exponential backoff by default (2 retries). Set `maxRetries: 5` on the client. Add manual `sleep(1500)` between calls as a courtesy delay. |
| Incremental write idempotency | Check `focus_keyword !== null` before generating | If `focus_keyword` is already set in the DB row, skip re-generation. Safe for re-runs after mid-job crashes. Pattern from S02: check before calling (like `existsSync` in image pipeline). |

## Existing Code and Patterns

- `packages/agents/src/clients/dataforseo.ts` — pattern for reading credentials at call time (D021). For `ContentGenerator`, the Anthropic API key comes from `process.env.ANTHROPIC_API_KEY` (standard env var, not settings table — confirmed in M003-SECRETS.md). Instantiate `Anthropic` client inside the class constructor or method, not at module scope.
- `packages/agents/src/pipeline/images.ts` — idempotency-by-existsSync pattern. Mirror this: before calling Claude, check if `focus_keyword` is already non-null in the DB row. Skip if set.
- `packages/agents/src/jobs/generate-site.ts` — phase transition pattern: `ai_jobs.payload` updated at start and end of each phase with `{ phase, done, total }`. New phase `generate_content` inserts between the `process_images` phase completion (line ~313) and the DB fetch for assembly (line ~320). Categories and products are already re-fetched from Supabase at that point — the `generate_content` phase writes to those same rows, and the existing fetch picks up the new fields automatically.
- `apps/generator/src/lib/data.ts` — `SiteData`, `CategoryData`, `ProductData` interfaces. Three fields need adding: `meta_description: string | null`, `user_opinions_summary: string | null`, `focus_keyword: string | null`. `SiteInfo` also needs `focus_keyword: string | null`. Update the `siteData` assembly block in `generate-site.ts` to include these from DB rows.
- `apps/generator/src/layouts/BaseLayout.astro` — currently emits no `<meta name="description">`. Add `metaDescription?: string` to the `Props` interface and `<meta name="description" content={metaDescription} />` in `<head>` (conditional on non-empty value).
- `packages/db/src/types/supabase.ts` — `tsa_categories.focus_keyword`, `tsa_categories.seo_text`, `tsa_products.focus_keyword`, `tsa_products.detailed_description`, `tsa_products.pros_cons` (JSON), `tsa_products.user_opinions_summary` — all present and nullable. `sites.focus_keyword` also present. No schema migration needed for S03.

## Constraints

- **`@anthropic-ai/sdk` not installed** in `packages/agents/package.json`. Must be added as a `dependency` (not devDependency — it's runtime in the worker). Same for `zod@^4.0.0`.
- **Zod v4 in `packages/agents` must not pollute `packages/shared`** which pins `^3.22.0`. They are independent packages — pnpm installs separate copies. No override needed.
- **tsup `noExternal: [/@monster\/.*/]`** bundles workspace packages but leaves external packages (`@anthropic-ai/sdk`, `zod`, `bullmq`, etc.) as externals. No change to `tsup.config.ts` needed — `@anthropic-ai/sdk` and `zod` will be external and must be in `node_modules` at runtime.
- **`@anthropic-ai/sdk` must NOT be added to `packages/agents` exports** (same constraint as D048 for GenerateSiteJob). The admin bundle cannot import it — webpack cannot handle Anthropic SDK internals (same `data:` import issue). Keep `ContentGenerator` import-only in `worker.ts`.
- **DTS is already disabled** for `packages/agents` (D047). No change needed — `ContentGenerator` follows same pattern as `GenerateSiteJob`.
- **Model name**: CLAUDE.md says `claude-sonnet-4-5` for content generation. Use string literal `'claude-sonnet-4-5-20250929'` (the dated slug known to work) — avoids SDK enum type constraints while allowing forward compatibility. Alternatively use the alias `'claude-sonnet-4-5'` if SDK accepts it.
- **Content language**: All prompts must instruct Claude to generate content in `site.language` (e.g. `es` → Spanish, `en` → English). Pass language as a system prompt parameter. Never hardcode "escribe en español" — drive it from the language field.
- **`process.env.ANTHROPIC_API_KEY` must be set** before the worker starts. Worker already loads `.env` via `import 'dotenv/config'` in `worker.ts`. Key must be present in root `.env`.
- **BullMQ concurrency remains at 1** (D036). ContentGenerator can be called sequentially in the same process — no concurrency concerns.

## Common Pitfalls

- **`zodOutputFormat` requires Zod v4** — `z.toJSONSchema()` is a v4 API. If you accidentally import Zod v3 (e.g., via `@monster/shared`'s transitive dep), `zodOutputFormat` will throw at runtime. Fix: import `z` from `zod` directly in `packages/agents` where Zod v4 is installed, not from any `@monster/shared` re-export.
- **`pros_cons` DB field is `Json | null`** (Supabase type), not `ProsCons | null`. When writing to Supabase, pass the raw object — Supabase accepts it. When reading back for `site.json`, cast with `as ProsCons | null`. The `ProsCons` interface is defined in `apps/generator/src/lib/data.ts`.
- **Content idempotency check on the wrong field** — check `focus_keyword !== null` (NOT `detailed_description !== null`). Focus keyword is the required field for SEO Scorer. A product with a description but no focus keyword is worse than one with neither — it breaks the scorer. Write `focus_keyword` first in the update call.
- **Claude prompt token budget** — Category SEO text (~400 words output) needs ~600 output tokens. Product content (description + pros/cons + opinion + meta) needs ~500 output tokens. Set `max_tokens: 1024` per call — covers both cases with headroom.
- **Language mismatch in prompts** — Do NOT write Spanish instructions for an English site. The site's `language` field drives the output language. The system prompt should say: `"Generate all content in the following language: ${language}"`. The user prompt can be in English (Claude handles cross-language generation well).
- **Sequential generation order matters for rate limits** — generate all categories first (usually 1-2 calls), then products sequentially (10-30 calls). Don't interleave. The `sleep(1500)` between calls gives ~40 calls/minute max, well under Plan Pro limits.
- **`SiteData` assembly already re-fetches from DB** after S02 upserts (D056 pattern). The `generate_content` phase must complete and commit all Supabase writes *before* the existing fetch-for-assembly block. Check line ordering in `generate-site.ts` carefully — the existing `dbCategories`/`dbProducts` fetch at ~line 320 is the pickup point.
- **`meta_description` is NOT a DB column** in `tsa_categories` or `tsa_products`. It exists only in `site.json` as a runtime field. Do NOT add it to DB. Generate it, include it in the Supabase write as a... wait — actually it should be stored. S04 (SEO Scorer) needs to score `<meta name="description">` content quality, and it reads from built HTML, not DB directly. Store `meta_description` in `site.json` via the content fields — but there's no DB column for it. Resolution: add it to `tsa_products` and `tsa_categories` as `description` field (which exists: `tsa_categories.description: string | null`) for categories, and for products there's no existing text field for meta_description. Simplest: generate it and store only in `site.json` (pass through from ContentGenerator to siteData object directly, not DB). **Important:** The `generate_content` phase must store `meta_description` somewhere retrievable — the cleanest solution is to write it to an existing DB text field or include it in a new field. Check: `tsa_categories.description` exists. For products, there's no meta_description column. Pragmatic call: store category meta in `tsa_categories.description`, and product meta_description as part of the in-memory result passed to `siteData` assembly (not persisted to DB — it's regenerated each build). This is acceptable since it's derived from product content that IS persisted.
- **Three template layouts need `meta_description` prop** forwarded to `BaseLayout` — `classic/Layout.astro`, `modern/Layout.astro`, `minimal/Layout.astro` all pass `title` to `BaseLayout`. Add `metaDescription` prop forwarding from the page component through the layout to `BaseLayout`.

## Open Risks

- **`claude-sonnet-4-6` model doesn't exist in SDK 0.78.0** — CLAUDE.md says `claude-sonnet-4-6` but the SDK only knows `claude-sonnet-4-5-20250929` and `claude-sonnet-4-5`. This appears to be a typo. Use `claude-sonnet-4-5-20250929` (dated alias is safer for production). If the API rejects it, the error message will be descriptive.
- **`messages.parse()` typed return** — `message.parsed_output` is typed as `zodInfer<Schema> | undefined`. Always check for `undefined` before use. If structured output fails validation, `parsed_output` is `undefined` and the SDK throws. The `maxRetries: 5` handles transient failures; a persistent schema mismatch (e.g., Claude outputs a field name that doesn't match the Zod schema) needs a fallback or schema relaxation.
- **Upstash Redis latency + BullMQ job timeout** — ContentGenerator adds ~30-60s to job execution (20 products × 1.5s sleep + API roundtrip). BullMQ default job timeout is 30 seconds for a job lock. The worker extends the lock via `job.extendLock()` if needed — but BullMQ does this automatically if `lockDuration` is set. Verify the queue's `lockDuration` (default 30s) is set high enough, or use `lockExtendInterval` to keep it alive during long content generation.
- **Zod v4 in `packages/agents` type bleeding into `packages/shared`** — If any file in `packages/agents` imports from `@monster/shared` AND from Zod v4, and then tries to use a Zod v3 schema from shared in a Zod v4 context, it will silently fail (different class identity). Mitigation: the content schemas (`CategoryContentSchema`, `ProductContentSchema`) are defined exclusively in `packages/agents/src/content-generator.ts` and never imported from shared. Never pass a Zod v3 schema to `zodOutputFormat`.
- **`meta_description` storage approach** — The plan of storing category `meta_description` in `tsa_categories.description` and product `meta_description` in-memory only is pragmatic but makes product meta non-idempotent across runs (regenerated each build). Acceptable for Phase 1 since product content fields (`detailed_description`, `pros_cons`, `user_opinions_summary`) ARE idempotent (checked before generating). Only `meta_description` gets re-generated. If this becomes an issue, add a DB column in a future migration.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| Anthropic SDK | none found | none found |
| BullMQ | none found | none found |

## Zod Schema Design (pre-researched)

```typescript
// CategoryContentSchema
const CategoryContentSchema = z.object({
  seo_text: z.string().describe('SEO text ~400 words for the category page'),
  focus_keyword: z.string().describe('Primary SEO focus keyword (3-5 words)'),
  meta_description: z.string().describe('Meta description 120-155 characters'),
});

// ProductContentSchema
const ProductContentSchema = z.object({
  detailed_description: z.string().describe('Product description 150-250 words'),
  pros: z.array(z.string()).describe('3-5 product advantages'),
  cons: z.array(z.string()).describe('2-4 product disadvantages'),
  user_opinions_summary: z.string().describe('User opinion summary 80-120 words'),
  focus_keyword: z.string().describe('Primary SEO focus keyword for this product (3-5 words)'),
  meta_description: z.string().describe('Meta description 120-155 characters'),
});
```

## SiteData Contract Extensions

Fields to add to `apps/generator/src/lib/data.ts`:

```typescript
// CategoryData: add
meta_description: string | null;
focus_keyword: string | null;

// ProductData: add  
user_opinions_summary: string | null;
meta_description: string | null;
focus_keyword: string | null;

// SiteInfo: add
focus_keyword: string | null;
```

`BaseLayout.astro` needs: `metaDescription?: string` in Props → `<meta name="description" content={metaDescription} />` in `<head>`.

## Sources

- `@anthropic-ai/sdk` 0.78.0 `messages.parse()` API with `output_config.format` (source: SDK source at `/home/daniel/nous/node_modules/.pnpm/@anthropic-ai+sdk@0.78.0_zod@4.3.6/`)
- `zodOutputFormat` uses `z.toJSONSchema()` (Zod v4 only) — confirmed from SDK source inspection
- Rate limit handling: SDK auto-retries 429 + 500+ (including 529) with exponential backoff (source: SDK README)
- Supabase type schema: `tsa_categories.description`, `tsa_products.detailed_description`, `tsa_products.pros_cons`, `tsa_products.user_opinions_summary`, `tsa_products.focus_keyword` (source: `packages/db/src/types/supabase.ts`)
- SiteData assembly pattern from DB post-upsert (source: D056, `generate-site.ts` lines 320-407)
- Phase insertion point: between `process_images` completion (~line 313) and DB fetch for assembly (~line 320) (source: `packages/agents/src/jobs/generate-site.ts`)
- `ANTHROPIC_API_KEY` in `.env` (not settings table) (source: `M003-SECRETS.md`, `.env.example`)
