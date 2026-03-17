# S04: Settings Tabs + Visible Prompts

**Goal:** Reorganise the Settings page into three shadcn `<Tabs>` (API Keys / AI Prompts / Deployment) and make the AI Prompts tab show the active prompt (DB override or hardcoded default) so the user is never looking at an empty textarea.
**Demo:** Open Settings → three tabs appear. Click "AI Prompts" → three textareas show the active system prompt for each agent (not empty). Edit one, save → the change persists and the tab still shows the updated text next reload. Clearing the textarea and saving restores the hardcoded default.

## Must-Haves

- Settings page renders three tabs: API Keys, AI Prompts, Deployment
- AI Prompts tab: each agent textarea shows `agentPrompts[key] ?? DEFAULT_PROMPTS[key]` as `defaultValue` (never empty)
- Saving a non-empty AI Prompts textarea upserts to `agent_prompts` table
- Saving an empty AI Prompts textarea deletes the `agent_prompts` row (restores default)
- API Keys tab contains all existing API key inputs
- Deployment tab contains VPS2 host/user/sites_root configuration inputs
- `pnpm --filter @monster/admin build` exits 0

## Observability / Diagnostics

**Runtime signals:**
- Settings page server component logs `[settings] agent_prompts fetch error: <msg>` on DB failure — visible in admin server stdout
- `agentPrompts` loaded at page render; fallback to `DEFAULT_PROMPTS[key]` happens silently in the client component (no log needed — it's a UI fallback)
- Build-time: missing shadcn components produce "Module not found" compile errors — immediately visible in `pnpm build` output

**Inspection surfaces:**
- Open Settings → "AI Prompts" tab: if textareas are empty, `DEFAULT_PROMPTS` constants are missing or `defaultPrompts` prop was not wired
- Supabase `agent_prompts` table: `SELECT agent_key, prompt_type, length(content) FROM agent_prompts;` — empty = using default; non-empty = DB override active
- Console log `[settings] agentPrompts loaded: <N> overrides` added in `page.tsx` for observability

**Failure visibility:**
- Empty textarea after page load = `DEFAULT_PROMPTS[key]` is missing or `defaultPrompts` prop not passed
- Tab content not rendering = shadcn `tabs` component missing; install via `pnpm dlx shadcn@latest add tabs`
- Save success banner appears in the active tab after submit; error banner appears on `promptState.error`

**Redaction:** `DEFAULT_PROMPTS` values are plaintext system prompts — no secrets. Safe to log in full.

## Verification

- `pnpm --filter @monster/admin build` exits 0
- Open settings in browser → three tabs visible; "AI Prompts" tab textareas are non-empty on first load
- Failure path check: set `DEFAULT_PROMPTS.monster = ''` temporarily → textarea shows empty → confirms the fallback chain is wired (revert after check)

## Tasks

- [x] **T01: Define DEFAULT_PROMPTS constants and restructure SettingsForm into Tabs** `est:45m`
  - Why: The form is a single long scroll; D161 specifies three tabs. The hardcoded defaults must be defined and passed to the form (D162) so textareas are never empty.
  - Files: `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`, `apps/admin/src/app/(dashboard)/settings/page.tsx`, `apps/admin/src/app/(dashboard)/settings/constants.ts`
  - Do: Define `DEFAULT_PROMPTS: Record<string, string>` constants in `constants.ts` (not in `'use server'` file per D034). Import the three agent system prompts from their source files (`packages/agents/src/jobs/niche-researcher.ts`, `packages/agents/src/jobs/content-generator.ts`, `packages/agents/src/clients/sdk.ts`) to extract their `SYSTEM_PROMPT`/prompt strings, or write them inline as constants — whichever is cleaner. Pass `DEFAULT_PROMPTS` from `page.tsx` to `SettingsForm` as a new prop. In `SettingsForm`, wrap content in shadcn `<Tabs defaultValue="api-keys">` with three `<TabsList>/<TabsTrigger>/<TabsContent>` sections: API Keys (existing API key cards), AI Prompts (existing agent prompt textareas with `defaultValue = agentPrompts[key] ?? defaultPrompts[key]`), Deployment (VPS2 settings inputs extracted from API Keys card). Run `pnpm --filter @monster/admin build`.
  - Verify: `grep -c "TabsTrigger\|TabsContent" apps/admin/src/app/(dashboard)/settings/settings-form.tsx` → ≥3; build exits 0.
  - Done when: Three tabs render; AI Prompts textareas show non-empty content; build exits 0.

## Files Likely Touched

- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx`
- `apps/admin/src/app/(dashboard)/settings/page.tsx`
- `apps/admin/src/app/(dashboard)/settings/constants.ts`
