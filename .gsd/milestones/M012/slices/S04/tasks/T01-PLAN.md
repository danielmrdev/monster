---
estimated_steps: 8
estimated_files: 3
---

# T01: Define DEFAULT_PROMPTS constants and restructure SettingsForm into Tabs

**Slice:** S04 — Settings Tabs + Visible Prompts
**Milestone:** M012

## Description

Restructure the Settings page using shadcn Tabs. Move all existing content into tab sections. Define `DEFAULT_PROMPTS` constants so AI Prompts textareas are never empty (D162).

## Steps

1. Read `settings-form.tsx` completely — understand current structure (single form, API keys cards, agent prompts section).
2. Read `constants.ts` — understand current `SETTINGS_KEYS`.
3. Find the hardcoded agent prompts: grep for `SYSTEM_PROMPT` in `packages/agents/src/`. Extract the prompt strings or define equivalent constants in `settings/constants.ts` as `DEFAULT_PROMPTS` (no direct import from agents needed — just the text).
4. Add `DEFAULT_PROMPTS: Record<string, string>` export to `constants.ts` with entries for `content_generator`, `niche_researcher`, `monster`.
5. In `page.tsx`: import `DEFAULT_PROMPTS` from `constants.ts`; pass as new `defaultPrompts` prop to `SettingsForm`.
6. In `SettingsForm`: add `defaultPrompts: Record<string, string>` to props interface. Add `'use client'` is already there. Import `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs` (add via `pnpm dlx shadcn@latest add tabs` if not installed).
7. Wrap the form body in `<Tabs defaultValue="api-keys">`. Create three `<TabsContent>` sections: `api-keys` (all API key cards), `ai-prompts` (agent prompt textareas with `defaultValue={agentPrompts[cfg.key] ?? defaultPrompts[cfg.key] ?? ''}`), `deployment` (VPS2 config inputs: `vps2_host`, `vps2_user`, `vps2_sites_root` — move from API keys section).
8. Run `pnpm --filter @monster/admin build`. If `tabs` component is missing, install it first.

## Must-Haves

- [ ] `DEFAULT_PROMPTS` exported from `constants.ts` with entries for all three agent keys
- [ ] `SettingsForm` renders shadcn `<Tabs>` with three `<TabsTrigger>` labels
- [ ] AI Prompts tab textareas use `defaultValue={agentPrompts[key] ?? defaultPrompts[key]}`
- [ ] Deployment tab contains VPS2 inputs
- [ ] `pnpm --filter @monster/admin build` exits 0

## Verification

- `grep -c "TabsTrigger" apps/admin/src/app/(dashboard)/settings/settings-form.tsx` → 3
- `grep "DEFAULT_PROMPTS" apps/admin/src/app/(dashboard)/settings/constants.ts` → hit
- `pnpm --filter @monster/admin build` exits 0

## Inputs

- `apps/admin/src/app/(dashboard)/settings/settings-form.tsx` — current full form (read before editing)
- `apps/admin/src/app/(dashboard)/settings/page.tsx` — current page
- `apps/admin/src/app/(dashboard)/settings/constants.ts` — current SETTINGS_KEYS
- `packages/agents/src/jobs/niche-researcher.ts` — SYSTEM_PROMPT constant (source of truth for default)
- `packages/agents/src/jobs/content-generator.ts` — system prompt (if present)

## Expected Output

- `settings/constants.ts` — DEFAULT_PROMPTS added
- `settings/settings-form.tsx` — three-tab Tabs layout
- `settings/page.tsx` — passes defaultPrompts to SettingsForm
