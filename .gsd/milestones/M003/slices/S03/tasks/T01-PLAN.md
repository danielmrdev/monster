---
estimated_steps: 6
estimated_files: 2
---

# T01: Implement ContentGenerator class with Zod v4 schemas

**Slice:** S03 — ContentGenerator
**Milestone:** M003

## Description

Install `@anthropic-ai/sdk` and `zod@^4.0.0` into `packages/agents` and implement the `ContentGenerator` class. This class owns all Claude API calls: structured output via `zodOutputFormat` + `messages.parse()`, pacing (1.5s sleep between calls), `maxRetries: 5`, and idempotency (skip if `focus_keyword` already non-null in the passed DB row). No wiring into `GenerateSiteJob` yet — that's T02.

Key constraints:
- Zod v4 is installed in `packages/agents` only — never imported from `@monster/shared` (which pins v3)
- `@anthropic-ai/sdk` must NOT be added to `packages/agents/src/index.ts` exports (D048 — webpack can't bundle SDK internals)
- Model: `claude-sonnet-4-5-20250929` string literal
- Language driven by `site.language` param — never hardcoded
- `max_tokens: 1024` per call — covers both schema sizes with headroom
- Category `meta_description` stored in `tsa_categories.description` column (exists in DB, `string | null`)
- Product `meta_description` returned in-memory only (no dedicated DB column) — caller stores it separately
- `focus_keyword` written first in every Supabase update call (idempotency anchor)

## Steps

1. Install dependencies: `pnpm --filter @monster/agents add @anthropic-ai/sdk@^0.78.0 zod@^4.0.0`

2. Create `packages/agents/src/content-generator.ts`:
   - Import `Anthropic`, `zodOutputFormat` from `@anthropic-ai/sdk`
   - Import `z` from `zod` (v4, local install — not from shared)
   - Define `CategoryContentSchema` with `seo_text` (~400 words), `focus_keyword` (3-5 words), `meta_description` (120-155 chars)
   - Define `ProductContentSchema` with `detailed_description` (150-250 words), `pros` (array of 3-5 strings), `cons` (array of 2-4 strings), `user_opinions_summary` (80-120 words), `focus_keyword` (3-5 words), `meta_description` (120-155 chars)
   - Export both schemas (`CategoryContentSchema`, `ProductContentSchema`) and their inferred types (`CategoryContent`, `ProductContent`)
   - Implement `ContentGenerator` class:
     - Constructor: instantiate `Anthropic({ maxRetries: 5 })` reading `ANTHROPIC_API_KEY` from env (fail fast with clear error if missing)
     - Private `sleep(ms: number): Promise<void>` — `setTimeout` wrapper
     - `generateCategoryContent(params: { name: string; keyword: string; language: string; alreadyHasFocusKeyword: boolean }): Promise<CategoryContent | null>` — returns `null` if already generated (idempotency); calls `client.messages.parse()` with `zodOutputFormat(CategoryContentSchema, 'content')`, system prompt sets language, user prompt provides category name and keyword; logs `[ContentGenerator] category "<name>" — skipped` or `[ContentGenerator] category "<name>" — generated focus_keyword="<kw>"`
     - `generateProductContent(params: { asin: string; title: string; price: number; language: string; alreadyHasFocusKeyword: boolean }): Promise<ProductContent | null>` — same idempotency pattern; user prompt provides product title and price; logs similarly
     - Both methods call `this.sleep(1500)` after successful generation (not on skip)

3. Verify Zod v4 import is clean: `node -e "import('zod').then(m => console.log('zod version:', m.z?.version ?? 'v4'))"` from `packages/agents/`

4. Run `pnpm --filter @monster/agents typecheck` — must exit 0

5. Run `pnpm --filter @monster/agents build` — must exit 0; check `dist/worker.js` exists

6. Confirm `@anthropic-ai/sdk` is NOT in `packages/agents/src/index.ts`: `grep "anthropic\|ContentGenerator" packages/agents/src/index.ts` — should return nothing

## Must-Haves

- [ ] `packages/agents/package.json` has `@anthropic-ai/sdk` and `zod` (v4) in `dependencies` (not devDependencies)
- [ ] `CategoryContentSchema` and `ProductContentSchema` defined with Zod v4 (`z.object`, `z.string`, `z.array`)
- [ ] Both schemas exported from `content-generator.ts` for use in tests and S04 tooling
- [ ] `generateCategoryContent()` returns `null` when `alreadyHasFocusKeyword === true` (skip path)
- [ ] `generateProductContent()` returns `null` when `alreadyHasFocusKeyword === true` (skip path)
- [ ] System prompt says: `Generate all content in the following language: ${language}` — never hardcoded language name
- [ ] `max_tokens: 1024` set on every `messages.parse()` call
- [ ] `sleep(1500)` called after each successful generation call (not on skipped calls)
- [ ] `ContentGenerator` NOT exported from `packages/agents/src/index.ts`
- [ ] `pnpm --filter @monster/agents typecheck` exits 0
- [ ] `pnpm --filter @monster/agents build` exits 0

## Verification

```bash
cd /home/daniel/monster

# TypeScript clean
pnpm --filter @monster/agents typecheck

# Build clean
pnpm --filter @monster/agents build

# Schema not leaking into admin bundle (not in index.ts)
grep -n "ContentGenerator\|anthropic" packages/agents/src/index.ts
# Expected: no output

# Zod v4 installed in agents
cat packages/agents/package.json | grep -E '"zod"|"@anthropic"'
# Expected: both present
```

## Observability Impact

- Signals added: `[ContentGenerator] category "<name>" — skipped (already generated)` / `[ContentGenerator] category "<name>" — generated focus_keyword="<kw>"` / `[ContentGenerator] product "<asin>" — generated focus_keyword="<kw>"` / `[ContentGenerator] product "<asin>" — skipped (already generated)`
- How a future agent inspects this: grep worker stdout for `[ContentGenerator]` lines
- Failure state exposed: SDK throws descriptive errors on auth failure (`401`), rate limit exhaustion (after 5 retries), and schema mismatch; these propagate to `GenerateSiteJob`'s error handler which writes to `ai_jobs.error`

## Inputs

- `packages/agents/package.json` — add new deps here
- `packages/db/src/types/supabase.ts` — `tsa_categories.description` and `tsa_products.focus_keyword` field names for mental model; no direct import needed

## Expected Output

- `packages/agents/src/content-generator.ts` — new file: `ContentGenerator` class + `CategoryContentSchema` + `ProductContentSchema` + inferred types
- `packages/agents/package.json` — `@anthropic-ai/sdk` and `zod` added to `dependencies`
- `packages/agents/dist/worker.js` — rebuilt (includes ContentGenerator transitively via T02 import — but T01 alone just verifies build passes with the new file present)
