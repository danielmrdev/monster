---
id: S02
milestone: M009
provides:
  - agent_prompts DB table migration (20260316125224_agent_prompts.sql)
  - getAgentPrompt(supabase, agentKey, promptType, fallback) helper in packages/agents
  - AGENT_KEYS constant exported from @monster/agents
  - POST /api/sites/[id]/generate-seo-text — SSE streaming route using ClaudeSDKClient
  - CategoryForm: "Generate with AI" button streams SEO text into seo_text textarea (edit mode)
  - ProductForm: "Generate with AI" button streams AI description preview (edit mode)
  - Settings: Agent Prompts card with 3 editable system prompt textareas + saveAgentPrompts action
key_files:
  - packages/db/supabase/migrations/20260316125224_agent_prompts.sql
  - packages/agents/src/agent-prompts.ts
  - packages/agents/src/index.ts
  - apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts
  - apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx
  - apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx
  - apps/admin/src/app/(dashboard)/settings/page.tsx
  - apps/admin/src/app/(dashboard)/settings/actions.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
key_decisions:
  - "generate-seo-text route uses ClaudeSDKClient from @monster/agents (not direct Anthropic SDK import — not a dep of apps/admin)"
  - "agent_prompts table not yet in Supabase generated types — used (supabase as any).from() workaround until migration applied and types regenerated"
  - "ProductForm AI button generates a preview-only description in a read-only textarea (not saved to DB directly — pipeline job applies it)"
patterns_established:
  - "SSE generation pattern in API route: ClaudeSDKClient.streamQuery with ephemeral conversationId"
  - "Streaming into textarea via ref: buffer SSE, accumulate text, update textarea.value in-place"
drill_down_paths:
  - .gsd/milestones/M009/slices/S02/S02-PLAN.md
duration: 2h
verification_result: pass
completed_at: 2026-03-16T00:00:00Z
---

# S02: AI SEO Generation + Prompt Editor

**generate-seo-text API route streams AI text into category/product form fields via ClaudeSDKClient; agent_prompts table + Settings editor enables runtime prompt overrides.**

## What Was Built

Five tasks in one pass:

1. **DB migration** — `agent_prompts` table with `(agent_key, prompt_type)` unique constraint. Migration file committed; needs `supabase db push` on remote.

2. **getAgentPrompt helper** — `packages/agents/src/agent-prompts.ts` reads DB override for an agent key, falls back to hardcoded default. Exported as `getAgentPrompt` + `AGENT_KEYS` + `AgentKey` type from `@monster/agents`.

3. **generate-seo-text route** — `POST /api/sites/[id]/generate-seo-text` builds a context-aware prompt from site/category/product data, streams via `ClaudeSDKClient.streamQuery` as SSE (same format as /api/monster/chat). Uses ephemeral conversationId — not persisted.

4. **CategoryForm** — Added `categoryId` prop, `useTransition` + `useRef` for the seo_text textarea, "Generate with AI" button (sparkle icon) that appears in edit mode. Streams text directly into the textarea ref.

5. **ProductForm** — Added `productId` prop, AI description preview section below Focus Keyword (edit mode only). Preview is read-only with a note that it's not saved directly — the pipeline applies it.

6. **Settings Agent Prompts card** — `saveAgentPrompts` server action upserts to `agent_prompts` table (empty = delete override). Settings page fetches current prompts. `SettingsForm` extended with separate `<form>` for prompt editing (3 textareas: ContentGenerator, NicheResearcher, Monster Chat).

## Deviations

- `generate-seo-text` route uses `ClaudeSDKClient` instead of direct `@anthropic-ai/sdk` import — the Anthropic SDK is not a direct dep of apps/admin; ClaudeSDKClient is the right abstraction here.
- `(supabase as any)` cast used for `agent_prompts` queries until migration is applied to remote Supabase and types regenerated.
- ProductForm AI button generates a preview textarea (not an editable form field) because product descriptions are managed by the pipeline job, not the form.

## Verification

- `pnpm --filter @monster/agents build` exits 0 ✓
- `pnpm --filter @monster/admin build` exits 0 ✓
- `pm2 reload monster-admin` + HTTP 200 on /settings ✓
