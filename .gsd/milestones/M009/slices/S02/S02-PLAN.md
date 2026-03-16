# S02: AI SEO Generation + Prompt Editor

**Goal:** Add "Generate with AI" buttons to CategoryForm and ProductForm that stream AI-generated SEO text with site/category context; add a system prompt editor to Settings backed by a new agent_prompts DB table.
**Demo:** User opens a category edit form, clicks "Generate with AI" next to the SEO text field, and sees AI-generated ~400-word SEO text stream into the textarea in real time. User navigates to Settings and edits the system prompt for the ContentGenerator agent — the new prompt is saved to DB and will be used in the next generation job.

## Must-Haves

- DB migration adds `agent_prompts` table (id, agent_key, prompt_type, content, updated_at); migration applies cleanly
- `POST /api/sites/[id]/generate-seo-text` route exists and streams SSE tokens
- "Generate with AI" button in CategoryForm streams text into the `seo_text` textarea
- "Generate with AI" button in ProductForm streams text into the description / seo fields
- Settings page has a new "Agent Prompts" card showing editable prompts for each agent
- `getAgentPrompt(agentKey)` helper in packages/agents reads DB override, falls back to hardcoded default

## Proof Level

- This slice proves: contract + integration
- Real runtime required: yes (pm2 reload passes; SSE route callable)
- Human/UAT required: yes (AI generation quality; streaming UX feel)

## Verification

- `pnpm --filter @monster/admin build` exits 0
- `pnpm -r typecheck` passes
- `pm2 reload monster-admin` succeeds, HTTP 200 on /settings
- DB migration file exists and is valid SQL
- grep confirms `/api/sites/[id]/generate-seo-text` route file exists
- CategoryForm renders a "Generate with AI" button (static code inspection)

## Tasks

- [x] **T01: DB migration + getAgentPrompt helper** `est:30m`
  - Why: The agent_prompts table is the foundation for prompt storage; getAgentPrompt is shared by all agents
  - Files: `packages/db/supabase/migrations/<timestamp>_agent_prompts.sql`, `packages/agents/src/content-generator.ts`
  - Do: (1) Write migration SQL: `CREATE TABLE agent_prompts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), agent_key text NOT NULL, prompt_type text NOT NULL DEFAULT 'system', content text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(agent_key, prompt_type))`. (2) Apply migration to local Supabase with `supabase db push` or add directly as a migration file. (3) Add `getAgentPrompt(supabase, agentKey: string, promptType: string, fallback: string): Promise<string>` helper in a new file `packages/agents/src/agent-prompts.ts` — queries agent_prompts table, returns content if found, else returns fallback. (4) Export from packages/agents index. (5) Wire into ContentGenerator constructor: accept optional `systemPrompt` param; if provided, use it instead of the hardcoded string.
  - Verify: Migration file exists; `pnpm --filter @monster/agents build` exits 0
  - Done when: agent-prompts.ts exports getAgentPrompt; packages/agents builds clean

- [x] **T02: POST /api/sites/[id]/generate-seo-text route** `est:45m`
  - Why: The UI buttons need a streaming endpoint that generates SEO text with site + context
  - Files: `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts`
  - Do: Create a new POST route. Body: `{ field: 'category_seo_text' | 'product_description', contextId: string, siteId: string }`. Steps: (1) Validate body params. (2) Fetch site row (language, niche) from Supabase. (3) If field=category_seo_text, fetch category row by contextId (name, focus_keyword, keywords). If field=product_description, fetch product row by contextId (title, current_price). (4) Build a prompt string with the context. (5) Use ClaudeSDKClient OR direct Anthropic API call — but since we removed claude_api_key, use the claude-agent-sdk `query()` for generation. Actually: the SDK is for chat sessions; for single-shot generation use the `@anthropic-ai/sdk` Anthropic client BUT it reads ANTHROPIC_API_KEY from env (not settings). Since the worker already uses this pattern (ContentGenerator), reuse it here. (6) Stream the generated text back as SSE `data: {"type":"text","text":"..."}` events. Keep the same SSE format as /api/monster/chat.
  - Verify: `pnpm --filter @monster/admin build` exits 0; route file exists
  - Done when: Route compiles; SSE format matches existing chat route convention

- [x] **T03: AI generate button in CategoryForm** `est:30m`
  - Why: Users need one-click AI generation for the SEO text field in the category edit form
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx`
  - Do: (1) Add a `categoryId` optional prop (present in edit mode, absent in create mode). (2) Add `useState` for `isGenerating` and a `textareaRef` on the seo_text Textarea. (3) Add a small "Generate with AI" button (sparkle icon + text) next to the SEO Text label — only show in edit mode (when categoryId is present and name/focus_keyword have values). (4) On click: fetch POST `/api/sites/${siteId}/generate-seo-text` with `{ field: 'category_seo_text', contextId: categoryId, siteId }`, read SSE stream, accumulate text, update the textarea value via ref. (5) Show spinner while generating; disable button during generation. (6) On completion, the textarea contains the generated text — user can edit before saving.
  - Verify: Build passes; CategoryForm renders the button in edit mode (inspect JSX)
  - Done when: Build clean; button renders with correct disabled/loading states

- [x] **T04: AI generate button in ProductForm** `est:30m`
  - Why: Same pattern as CategoryForm but for product description field
  - Files: `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx`
  - Do: Same pattern as T03. ProductForm is already a client component with useTransition. Add "Generate with AI" button next to the Focus Keyword or Description section. POST to `/api/sites/${siteId}/generate-seo-text` with `{ field: 'product_description', contextId: productId, siteId }`. Stream text into the appropriate field. Show in edit mode only (when productId is available via defaultValues or a new prop).
  - Verify: Build passes; ProductForm renders the button in edit mode
  - Done when: Build clean; button wired to the SSE route

- [x] **T05: Agent Prompts editor in Settings** `est:45m`
  - Why: Operator needs to edit system prompts without a code deploy
  - Files: `apps/admin/src/app/(dashboard)/settings/page.tsx`, `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`, `apps/admin/src/app/(dashboard)/settings/actions.ts`
  - Do: (1) In settings/page.tsx, fetch current agent_prompts rows from Supabase for the 3 known agent keys: 'content_generator', 'niche_researcher', 'monster'. (2) Add a new `saveAgentPrompts` server action in settings/actions.ts that upserts rows into agent_prompts with onConflict: 'agent_key,prompt_type'. (3) Add an "Agent Prompts" card to settings-form.tsx with a Textarea per agent key, showing current value (or placeholder hint if no DB override). Separate form or add fields to existing form — simplest: separate `<form action={agentPromptAction}>` inside the same page. (4) Show hint text: "Leave empty to use the built-in default prompt."
  - Verify: Build passes; settings page renders Agent Prompts card; `pm2 reload monster-admin` succeeds
  - Done when: Build clean; Agent Prompts card visible in /settings with 3 textarea fields

## Files Likely Touched

- `packages/db/supabase/migrations/<timestamp>_agent_prompts.sql`
- `packages/agents/src/agent-prompts.ts` (new)
- `packages/agents/src/index.ts`
- `packages/agents/src/content-generator.ts`
- `apps/admin/src/app/api/sites/[id]/generate-seo-text/route.ts` (new)
- `apps/admin/src/app/(dashboard)/sites/[id]/categories/CategoryForm.tsx`
- `apps/admin/src/app/(dashboard)/sites/[id]/products/ProductForm.tsx`
- `apps/admin/src/app/(dashboard)/settings/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/actions.ts`
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
