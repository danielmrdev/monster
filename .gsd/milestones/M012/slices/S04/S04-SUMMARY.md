---
id: S04
parent: M012
milestone: M012
provides:
  - DEFAULT_PROMPTS constants (niche_researcher, content_generator, monster) in constants.ts
  - SettingsForm restructured into three shadcn Tabs (API Keys / AI Prompts / Deployment)
  - AI Prompts textareas use `agentPrompts[key] ?? defaultPrompts[key] ?? ''` — never empty on first load
  - Deployment tab scaffolded with VPS2 host/user/sites_root inputs (display-only placeholder)
  - Observability log: `[settings] agentPrompts loaded: <N> overrides` on page render
requires:
  - slice: none
    provides: nothing (S04 depends on nothing — settings table already exists)
affects:
  - S05: no hard dependency, but establishes the DEFAULT_PROMPTS + constants.ts pattern for future settings additions
key_files:
  - apps/admin/src/app/(dashboard)/settings/constants.ts
  - apps/admin/src/app/(dashboard)/settings/settings-form.tsx
  - apps/admin/src/app/(dashboard)/settings/page.tsx
  - apps/admin/src/components/ui/tabs.tsx
key_decisions:
  - D161: Settings page uses three shadcn Tabs (API Keys / AI Prompts / Deployment) — single page, no route split
  - D162: Agent system prompt defaultValue = DB override ?? hardcoded constant — user edits the full active prompt
  - DEFAULT_PROMPTS written inline in constants.ts (not imported from packages/agents) — agents package prompts are language-parameterised closures; copying text inline is cleaner
  - Deployment tab inputs are display-only scaffolding — SETTINGS_KEYS and saveSettings wiring deferred to a future task
patterns_established:
  - DEFAULT_PROMPTS pattern: define in constants.ts (not 'use server' actions file), import in page.tsx (RSC), pass to client form as prop
  - Tab-scoped forms: each tab has its own <form action={}> — API Keys and AI Prompts submit independently
observability_surfaces:
  - console.log `[settings] agentPrompts loaded: <N> overrides` in page.tsx (server component, visible in admin stdout)
  - Empty AI Prompts textarea = DEFAULT_PROMPTS key missing or defaultPrompts prop not passed
  - Build error `Module not found: @/components/ui/tabs` = shadcn tabs not installed
drill_down_paths:
  - .gsd/milestones/M012/slices/S04/tasks/T01-SUMMARY.md
duration: 25m
verification_result: passed
completed_at: 2026-03-17
---

# S04: Settings Tabs + Visible Prompts

**Restructured the Settings page into three shadcn Tabs (API Keys / AI Prompts / Deployment) and wired DEFAULT_PROMPTS constants so AI Prompts textareas always show the active system prompt — never an empty textarea.**

## What Happened

T01 (the single task in this slice) delivered all must-haves:

1. **Source investigation:** Examined all three agent source files to find extractable SYSTEM_PROMPT constants. Only `niche_researcher` had a dedicated constant. `content_generator` uses an inline language-parameterised system message; `monster` (Agent SDK) has no hardcoded system prompt at all. Decision: write three descriptive defaults inline in `constants.ts` rather than create a fragile cross-package import.

2. **shadcn Tabs installed:** `pnpm dlx shadcn@latest add tabs --cwd apps/admin` created `apps/admin/src/components/ui/tabs.tsx`.

3. **DEFAULT_PROMPTS defined:** Three entries in `constants.ts` for `niche_researcher`, `content_generator`, and `monster`. The niche_researcher default mirrors the actual SYSTEM_PROMPT from the agent job. The other two are new descriptive defaults that document what each agent is for and how it should behave.

4. **page.tsx updated:** Imports `DEFAULT_PROMPTS`, passes it as `defaultPrompts` prop to `SettingsForm`, adds `[settings] agentPrompts loaded: <N> overrides` console log for observability.

5. **SettingsForm restructured:** Wrapped in `<Tabs defaultValue="api-keys">` with three `<TabsContent>` sections:
   - **api-keys**: All existing API key cards (Spaceship, DataForSEO, Hetzner, Cloudflare), each with their own `saveSettings` form action.
   - **ai-prompts**: Agent System Prompts card; textareas expanded to `rows={8}`; `defaultValue={agentPrompts[key] ?? defaultPrompts[key] ?? ''}` — the full fallback chain.
   - **deployment**: VPS2 Host, SSH User, Sites Root Path inputs — scaffolded display-only with a UI note explaining the save action is pending.

6. **Build verified:** `pnpm --filter @monster/admin build` exits 0; `/settings` page is 12.9 kB.

## Verification

```bash
# Three tab triggers present
grep "<TabsTrigger" apps/admin/src/app/(dashboard)/settings/settings-form.tsx | wc -l
# → 3

# Fallback chain wired
grep "defaultPrompts\[key\]" apps/admin/src/app/(dashboard)/settings/settings-form.tsx
# → defaultValue={agentPrompts[key] ?? defaultPrompts[key] ?? ''}

# DEFAULT_PROMPTS export present
grep "DEFAULT_PROMPTS" apps/admin/src/app/(dashboard)/settings/constants.ts
# → export const DEFAULT_PROMPTS: Record<string, string> = {

# Observability log wired
grep "agentPrompts loaded" apps/admin/src/app/(dashboard)/settings/page.tsx
# → console.log(`[settings] agentPrompts loaded: ...`)

# Build clean
pnpm --filter @monster/admin build
# → exits 0; /settings 12.9 kB
```

## Requirements Advanced

- None directly — S04 is a UX improvement (settings usability) without a dedicated requirement ID. Indirectly supports R013 (admin operability) by making settings more accessible and transparent.

## Requirements Validated

- None newly validated by this slice alone.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- **Deployment tab is display-only:** The plan said "move VPS2 config inputs from API keys section." But VPS2 inputs were never in `SETTINGS_KEYS` or the form (they were migrated to the `servers` table in M011/S02). The Deployment tab was scaffolded with the three VPS2 inputs as a placeholder, but no save action was wired. A note in the tab UI explains this. `SETTINGS_KEYS` and `saveSettings` action extension are deferred to a future slice.
- **Textarea rows increased from 4 to 8:** AI Prompts textareas use `rows={8}` to better display multi-line system prompts. Not in the original plan — a quality improvement discovered during implementation.
- **content_generator and monster DEFAULT_PROMPTS are new text (not extracted):** No existing SYSTEM_PROMPT constant existed for these agents. Inline text in `constants.ts` is the authoritative source until a future refactor extracts them from the agents package.

## Known Limitations

- Deployment tab inputs have no `saveSettings` action — clicking Save in that tab does nothing. This is intentional scaffolding. `SETTINGS_KEYS` must be extended and a new `saveDeploymentSettings` action wired in a future task.
- Saving an empty AI Prompts textarea should delete the DB row (restores default) — this behavior depends on the existing `saveAgentPrompts` server action already handling empty values as deletions. Not verified in this slice; was pre-existing behavior from M002/S03.

## Follow-ups

- Wire Deployment tab: extend `SETTINGS_KEYS` with `vps2_host`, `vps2_user`, `vps2_sites_root` (or decide to use the `servers` table directly), add `saveDeploymentSettings` action.
- Verify empty-string save → DB row deletion behavior for AI Prompts (test the clearing/restoring-default flow end-to-end).

## Files Created/Modified

- `apps/admin/src/app/(dashboard)/settings/constants.ts` — added `DEFAULT_PROMPTS` export with entries for all three agent keys
- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — restructured into three-tab Tabs layout; `defaultPrompts` prop added; AI Prompts fallback chain wired
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — imports and passes `DEFAULT_PROMPTS` as `defaultPrompts` prop; observability log added
- `apps/admin/src/components/ui/tabs.tsx` — installed by shadcn CLI

## Forward Intelligence

### What the next slice should know
- `DEFAULT_PROMPTS` in `constants.ts` is the single source of truth for agent default prompts. If you need to add a new agent, add an entry here — the fallback chain in `settings-form.tsx` picks it up automatically via `Object.entries(DEFAULT_PROMPTS)`.
- The `agentKeys` prop (array of `{ key, label }`) controls which agent rows appear in the AI Prompts tab. Currently hardcoded in `page.tsx`. Adding a new agent requires adding an entry there too.
- shadcn `tabs` is now installed at `apps/admin/src/components/ui/tabs.tsx` — no need to reinstall.

### What's fragile
- **Deployment tab save wiring is absent** — if a future task adds VPS2 settings to `SETTINGS_KEYS` without also updating the Deployment tab form inputs to use the right `name` attributes, the tab will render but not save. The `name` attribute on each input must match the `SETTINGS_KEYS` entry.
- **content_generator DEFAULT_PROMPTS** — the actual generator uses `Generate all content in the following language: ${language}` injected at call time. The DEFAULT_PROMPTS entry is a descriptive stand-in. If the real system prompt is ever standardized, update `constants.ts` to match.

### Authoritative diagnostics
- Admin stdout: `[settings] agentPrompts loaded: <N> overrides` on every `/settings` page load — tells you how many DB overrides are active vs defaults.
- Supabase: `SELECT agent_key, prompt_type, length(content) FROM agent_prompts;` — empty = all defaults active; rows present = override active for that agent_key.
- Empty textarea in AI Prompts tab after page load → check that `DEFAULT_PROMPTS[key]` is defined and `defaultPrompts` prop is being passed from `page.tsx` to `SettingsForm`.

### What assumptions changed
- **"VPS2 settings are in SETTINGS_KEYS"** — they were removed in M011/S02 (migrated to `servers` table). The Deployment tab is scaffolded but not functional as a result. Future work must decide whether to re-add vps2_* to settings or pull from the servers table.
- **"monster agent has a hardcoded SYSTEM_PROMPT"** — it doesn't. The Agent SDK receives the user message directly with no system prompt. The `monster` DEFAULT_PROMPTS entry is a descriptive default to make the UI useful, not a reflection of runtime behavior.
