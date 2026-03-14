---
id: T01
parent: S03
milestone: M003
provides:
  - ContentGenerator class with structured Claude API output
  - CategoryContentSchema and ProductContentSchema (Zod v4)
  - Idempotent generateCategoryContent() and generateProductContent() methods
key_files:
  - packages/agents/src/content-generator.ts
  - packages/agents/package.json
key_decisions:
  - D060: zodOutputFormat imported from @anthropic-ai/sdk/helpers/zod (not main index)
patterns_established:
  - Zod v4 schemas in packages/agents only — never imported from @monster/shared (v3 pinned)
  - ContentGenerator NOT exported from index.ts — worker-internal only (D048 pattern)
  - Idempotency via alreadyHasFocusKeyword param — skip path returns null, no API call made
  - sleep(1500) called only after successful generation, not on skipped calls
observability_surfaces:
  - "[ContentGenerator] initialised — ANTHROPIC_API_KEY present" at startup
  - "[ContentGenerator] category \"<name>\" — skipped (already generated)" on idempotent skip
  - "[ContentGenerator] category \"<name>\" — generated focus_keyword=\"<kw>\"" on generation
  - "[ContentGenerator] product \"<asin>\" — skipped (already generated)" on idempotent skip
  - "[ContentGenerator] product \"<asin>\" — generated focus_keyword=\"<kw>\"" on generation
  - Constructor throws with descriptive message if ANTHROPIC_API_KEY missing (fail-fast)
duration: 30m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Implement ContentGenerator class with Zod v4 schemas

**Installed `@anthropic-ai/sdk@0.78.x` + `zod@4.3.x` in `packages/agents` and implemented `ContentGenerator` with idempotent category/product content generation via structured Claude API output.**

## What Happened

1. Pre-flight fix: Added a failure-path diagnostic verification step (step 6) to `S03-PLAN.md`'s Verification section — verifying that the ContentGenerator constructor throws on missing `ANTHROPIC_API_KEY`.

2. Installed `@anthropic-ai/sdk@^0.78.0` and `zod@^4.0.0` into `packages/agents` dependencies (not devDependencies) via `pnpm --filter @monster/agents add`.

3. Key deviation from plan: `zodOutputFormat` is **not** exported from `@anthropic-ai/sdk` main index. It lives at `@anthropic-ai/sdk/helpers/zod`. Verified by inspecting the installed SDK's `index.d.ts`. The function signature is `zodOutputFormat(schema)` — no second "name" argument as the plan implied. Updated D060 in DECISIONS.md.

4. The SDK uses `output_config.format` (not `output_config` directly at the top level) to pass the structured output format to `messages.parse()`.

5. Implemented `content-generator.ts` with:
   - `CategoryContentSchema`: seo_text, focus_keyword, meta_description
   - `ProductContentSchema`: detailed_description, pros, cons, user_opinions_summary, focus_keyword, meta_description
   - Both schemas and inferred types exported
   - `ContentGenerator` class with constructor fail-fast on missing API key
   - Idempotency: returns null immediately when `alreadyHasFocusKeyword === true`
   - `sleep(1500)` after each successful API call only
   - Language-driven system prompt: `Generate all content in the following language: ${language}`
   - `max_tokens: 1024` on every `messages.parse()` call
   - `maxRetries: 5` on Anthropic client

## Verification

```
pnpm --filter @monster/agents typecheck  → exit 0 (clean)
pnpm --filter @monster/agents build      → exit 0 (dist/worker.js 492KB)
grep ContentGenerator packages/agents/src/index.ts  → no output (correct)
cat packages/agents/package.json | grep 'zod\|anthropic'
  → "@anthropic-ai/sdk": "^0.78.0"
  → "zod": "^4.3.6"
Zod v4 verified: node -e "import('zod').then(m => console.log(m.z?.object ? 'v4' : 'other'))"
  → v4
sleep(1500) count: 2 (one per method, after successful generation)
Language system prompt: present × 2 (category + product methods)
max_tokens: 1024 × 2 (category + product calls)
null return on skip: 2 paths verified via grep
```

## Diagnostics

- grep worker stdout for `[ContentGenerator]` lines to trace generation progress
- Constructor throws `Error: [ContentGenerator] ANTHROPIC_API_KEY is not set...` on missing key — caught and written to `ai_jobs.error` by existing `worker.on('failed')` handler
- SDK throws descriptive errors on auth failure (401) and rate limit exhaustion (after 5 retries) — these propagate to `GenerateSiteJob` error handler
- Schema mismatch surfaces as `AnthropicError: Failed to parse structured output` from `zodOutputFormat`'s parse function

## Deviations

1. `zodOutputFormat` import path: `@anthropic-ai/sdk/helpers/zod` not `@anthropic-ai/sdk`. The task plan's import path was wrong — the function is a helper, not a main export. Recorded as D060.
2. No second argument to `zodOutputFormat(schema)` — the plan said `zodOutputFormat(CategoryContentSchema, 'content')` but the function signature is unary. Inspected SDK source to confirm.
3. Format passed via `output_config.format` property (not as a standalone parameter) — matches actual SDK API shape discovered from `lib/parser.d.ts`.

## Known Issues

None.

## Files Created/Modified

- `packages/agents/src/content-generator.ts` — new: `ContentGenerator` class + `CategoryContentSchema` + `ProductContentSchema` + inferred types
- `packages/agents/package.json` — added `@anthropic-ai/sdk@^0.78.0` and `zod@^4.3.6` to dependencies
- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — added failure-path diagnostic verification step (pre-flight fix)
- `.gsd/DECISIONS.md` — appended D060 (zodOutputFormat import path)
