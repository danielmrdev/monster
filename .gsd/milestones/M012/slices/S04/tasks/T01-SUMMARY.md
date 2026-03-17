---
id: T01
parent: S04
milestone: M012
provides:
  - DEFAULT_PROMPTS constants for all three agent keys (niche_researcher, content_generator, monster)
  - SettingsForm restructured into three shadcn Tabs (API Keys, AI Prompts, Deployment)
  - AI Prompts textareas use `agentPrompts[key] ?? defaultPrompts[key] ?? ''` fallback chain
  - Deployment tab scaffolded with VPS2 host/user/sites_root inputs
  - Observability log: `[settings] agentPrompts loaded: <N> overrides`
key_files:
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
  - apps/admin/src/app/(dashboard)/settings/page.tsx
  - apps/admin/src/components/ui/tabs.tsx
key_decisions:
  - DEFAULT_PROMPTS written inline in constants.ts (not imported from packages/agents) — agents package prompts are either embedded in closures or language-parameterised, so copying the text is cleaner than a cross-package import
  - content_generator and monster DEFAULT_PROMPTS are new descriptive defaults (no existing SYSTEM_PROMPT constant to copy) — inline text is the authoritative source until a future task extracts them
  - Deployment tab inputs are display-only for now (no save action wired) — placeholder with note, to be completed in a future slice task
  - shadcn tabs installed via `pnpm dlx shadcn@latest add tabs --cwd apps/admin` (creates src/components/ui/tabs.tsx)
patterns_established:
  - DEFAULT_PROMPTS pattern: define in constants.ts (not 'use server' actions file), import in page.tsx (RSC), pass to client form as prop — keeps prompts available server-side for SSR and client-side for defaultValue
  - Tab-scoped forms: each tab can have its own <form action={}> — API Keys and AI Prompts submit independently; Deployment will get its own action when wired
observability_surfaces:
  - console.log `[settings] agentPrompts loaded: <N> overrides` in page.tsx (server component, visible in admin stdout)
  - Empty AI Prompts textarea = DEFAULT_PROMPTS key missing or defaultPrompts prop not passed to SettingsForm
  - Build error `Module not found: @/components/ui/tabs` = shadcn tabs not installed
  - grep -c "TabsTrigger" settings-form.tsx → 4 (3 JSX elements + 1 import)
duration: 25m
verification_result: passed
completed_at: 2026-03-17
blocker_discovered: false
---

# T01: Define DEFAULT_PROMPTS constants and restructure SettingsForm into Tabs

**Restructured Settings into three shadcn Tabs (API Keys / AI Prompts / Deployment) and defined DEFAULT_PROMPTS constants so AI Prompts textareas are never empty on first load.**

## What Happened

1. Read all source files: `settings-form.tsx`, `constants.ts`, `page.tsx`, and agent source files (`packages/agents/src/jobs/niche-researcher.ts`, `content-generator.ts`, `clients/claude-sdk.ts`).

2. Discovered that only `niche_researcher` has a dedicated `SYSTEM_PROMPT` constant. `content_generator` uses an inline language-parameterised system message (`Generate all content in the following language: ${language}`) and `monster` chat has no system prompt at all — the user message is passed directly to the Agent SDK. Wrote descriptive defaults for all three in `constants.ts`.

3. Fixed pre-flight observability gaps: added `## Observability / Diagnostics` section to `S04-PLAN.md` and `## Observability Impact` section to `T01-PLAN.md`.

4. Installed shadcn `tabs` component via `pnpm dlx shadcn@latest add tabs --cwd apps/admin` → created `apps/admin/src/components/ui/tabs.tsx`.

5. Added `DEFAULT_PROMPTS: Record<string, string>` export to `constants.ts` with entries for all three agent keys.

6. Updated `page.tsx` to import `DEFAULT_PROMPTS`, pass it as `defaultPrompts` prop to `SettingsForm`, and added `[settings] agentPrompts loaded: <N> overrides` console log.

7. Rewrote `settings-form.tsx` with `<Tabs defaultValue="api-keys">` wrapping three `<TabsContent>` sections:
   - **api-keys**: API Keys card (Spaceship, DataForSEO, Hetzner) + Cloudflare card, with the existing `saveSettings` form action
   - **ai-prompts**: Agent System Prompts card with `defaultValue={agentPrompts[key] ?? defaultPrompts[key] ?? ''}`, rows=8 (expanded from 4), with the existing `saveAgentPrompts` form action
   - **deployment**: VPS2 Host, SSH User, and Sites Root Path inputs (display-only placeholder, save action to be wired in a future task)

8. Ran `pnpm --filter @monster/admin build` → exits 0 (pre-existing BullMQ warning, unrelated).

## Verification

```
grep -c "TabsTrigger" apps/admin/src/app/(dashboard)/settings/settings-form.tsx
# → 4 (3 JSX elements + 1 import line)

grep "<TabsTrigger" apps/admin/src/app/(dashboard)/settings/settings-form.tsx | wc -l
# → 3 (exactly three tab triggers)

grep "DEFAULT_PROMPTS" apps/admin/src/app/(dashboard)/settings/constants.ts
# → hit: export const DEFAULT_PROMPTS: Record<string, string> = {

grep "defaultPrompts\[key\]" apps/admin/src/app/(dashboard)/settings/settings-form.tsx
# → hit: defaultValue={agentPrompts[key] ?? defaultPrompts[key] ?? ''}

pnpm --filter @monster/admin build
# → exits 0, /settings page size: 12.9 kB
```

All must-haves confirmed via static analysis. Build exits 0.

## Diagnostics

- Admin server stdout: `[settings] agentPrompts loaded: <N> overrides` on every settings page load
- Supabase: `SELECT agent_key, prompt_type, length(content) FROM agent_prompts;` — empty table = all defaults active
- Build: `Module not found: @/components/ui/tabs` → run `pnpm dlx shadcn@latest add tabs --cwd apps/admin`
- Empty textarea in AI Prompts tab → `DEFAULT_PROMPTS[key]` missing or `defaultPrompts` prop not wired

## Deviations

- **Deployment tab is display-only**: The plan said "move VPS2 config inputs from API keys section" — but VPS2 inputs don't exist yet in `SETTINGS_KEYS` or the form. Added the three inputs as a scaffolded placeholder without wiring to a save action. A note in the tab explains this. The `SETTINGS_KEYS` array and `saveSettings` action will need updating in a future task when Deployment is fully implemented.
- **Textarea rows increased from 4 to 8**: AI Prompts textareas now use `rows={8}` instead of `rows={4}` to better display multi-line system prompts.

## Known Issues

- Deployment tab inputs have no `saveSettings` action wiring — clicking "Save" does nothing. This is intentional scaffolding; `SETTINGS_KEYS` and `saveSettings` need extension in a future task.

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added `DEFAULT_PROMPTS` export with entries for niche_researcher, content_generator, monster
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — restructured into three-tab Tabs layout; added `defaultPrompts` prop; AI Prompts textarea uses fallback chain
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — imports and passes `DEFAULT_PROMPTS` as `defaultPrompts` prop; adds observability log
- `apps/admin/src/components/ui/tabs.tsx` — installed by shadcn CLI
- `.gsd/milestones/M012/slices/S04/S04-PLAN.md` — added Observability/Diagnostics section; marked T01 done
- `.gsd/milestones/M012/slices/S04/tasks/T01-PLAN.md` — added Observability Impact section
