---
id: S04
parent: M012
milestone: M012
uat_mode: artifact-driven
written: 2026-03-17
---

# S04: Settings Tabs + Visible Prompts — UAT

**Milestone:** M012
**Written:** 2026-03-17

## UAT Type

- UAT mode: live-runtime
- Why this mode is sufficient: S04 is a pure UI restructure — the deliverable is three tabs visible in the browser with non-empty textareas on first load. Static build verification (exit 0) confirms TypeScript correctness; live browser check confirms the tab rendering and fallback chain work end-to-end. No DB schema changes. No new server actions. The one pre-existing risk (empty textareas) is directly observable in the UI.

## Preconditions

1. Admin panel running on port 3004 (`pm2 status` shows `monster-admin` online, or `pnpm --filter @monster/admin dev` in terminal).
2. Supabase configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in `.env` or `.env.local`).
3. `agent_prompts` table exists in Supabase (created in M002/S03 — already present).
4. Browser with DevTools available.

## Smoke Test

Navigate to `/settings` → three tab labels appear: **API Keys**, **AI Prompts**, **Deployment**. Click **AI Prompts** → at least one textarea is non-empty (shows system prompt text). Build passes: `pnpm --filter @monster/admin build` exits 0.

---

## Test Cases

### 1. Three tabs render with correct labels

1. Navigate to `/settings`.
2. Observe the tab bar at the top of the page.
3. **Expected:** Three tabs visible: **API Keys**, **AI Prompts**, **Deployment** — in that order.
4. **Expected:** Default active tab is **API Keys** (first tab is selected/highlighted on page load without any user interaction).

### 2. API Keys tab contains all API key fields

1. On `/settings`, ensure **API Keys** tab is active (default on load).
2. Scroll through the tab content.
3. **Expected:** The following input groups are present:
   - Spaceship API Key
   - Spaceship API Secret
   - Spaceship Contact ID
   - DataForSEO API Key
   - Hetzner API Token
   - Cloudflare API Token
4. **Expected:** A **Save Settings** button is present and submittable.
5. **Expected:** No VPS2 / deployment fields appear in this tab.

### 3. AI Prompts tab textareas are non-empty on first load (no DB overrides)

1. Confirm the `agent_prompts` Supabase table is empty: `SELECT count(*) FROM agent_prompts;` → 0 rows.
2. Navigate to `/settings`.
3. Click **AI Prompts** tab.
4. **Expected:** Three labelled textareas appear (one per agent: Niche Researcher, Content Generator, Monster Chat).
5. **Expected:** All three textareas show non-empty text — the hardcoded DEFAULT_PROMPTS values.
6. **Expected:** Niche Researcher textarea begins with "You are a niche research agent for an Amazon affiliate site portfolio."
7. **Expected:** No textarea shows an empty/blank field.

### 4. AI Prompts save and reload with override

1. Click **AI Prompts** tab.
2. Find the **Niche Researcher** textarea.
3. Clear it and type: `Custom niche researcher prompt for testing.`
4. Click **Save Agent Prompts**.
5. **Expected:** A green success banner appears ("Agent prompts saved" or similar).
6. Hard-reload the page (Cmd+Shift+R / Ctrl+Shift+R).
7. Click **AI Prompts** tab again.
8. **Expected:** Niche Researcher textarea shows `Custom niche researcher prompt for testing.` (the DB override, not the default).
9. **Expected:** Admin server stdout shows `[settings] agentPrompts loaded: 1 overrides`.

### 5. Clearing an override restores the hardcoded default

1. Starting from Test Case 4 state (1 override in `agent_prompts` for niche_researcher).
2. Click **AI Prompts** tab.
3. Clear the Niche Researcher textarea completely (select all, delete).
4. Click **Save Agent Prompts**.
5. **Expected:** Success banner appears.
6. Verify in Supabase: `SELECT count(*) FROM agent_prompts WHERE agent_key = 'niche_researcher';` → 0 rows (DB row deleted).
7. Hard-reload `/settings`.
8. Click **AI Prompts** tab.
9. **Expected:** Niche Researcher textarea shows the full hardcoded DEFAULT_PROMPTS text again (not empty).

### 6. Deployment tab renders with VPS2 scaffolding

1. Click **Deployment** tab.
2. **Expected:** Three input fields visible: **VPS2 Host**, **SSH User**, **Sites Root Path**.
3. **Expected:** A UI note or placeholder text explains that save functionality is pending / coming soon.
4. **Expected:** No crash or blank white page.
5. Note: Clicking Save in this tab does nothing (intentional scaffolding — not a bug to fix here).

### 7. Build verification

```bash
pnpm --filter @monster/admin build
```
**Expected:** Exits 0. `/settings` page listed in route output (~12.9 kB). No TypeScript errors. No "Module not found: @/components/ui/tabs" error.

---

## Edge Cases

### Partial DB overrides (some agents overridden, others not)

1. Insert one row into `agent_prompts` for `content_generator` only.
2. Navigate to `/settings` → click **AI Prompts**.
3. **Expected:** Content Generator textarea shows the DB override text. Niche Researcher and Monster Chat textareas show DEFAULT_PROMPTS values (not empty).
4. **Expected:** Server stdout: `[settings] agentPrompts loaded: 1 overrides`.

### DB connection failure on agent_prompts fetch

1. Temporarily misconfigure `SUPABASE_SERVICE_ROLE_KEY` to an invalid value.
2. Navigate to `/settings`.
3. **Expected:** Page still renders (server component handles error gracefully). AI Prompts textareas fall back to DEFAULT_PROMPTS — not empty.
4. **Expected:** Server stdout shows `[settings] agent_prompts fetch error: <msg>` (or similar structured error log).

---

## Failure Signals

- **Three tabs not visible** → shadcn `tabs` component not installed; run `pnpm dlx shadcn@latest add tabs --cwd apps/admin`
- **AI Prompts textareas empty on first load** → `DEFAULT_PROMPTS[key]` missing for that agent key, or `defaultPrompts` prop not passed from `page.tsx` to `SettingsForm`
- **Save Agent Prompts does nothing** → `saveAgentPrompts` server action not wired to the AI Prompts tab form
- **Build error: Module not found: @/components/ui/tabs** → reinstall shadcn tabs
- **TypeScript error on `defaultPrompts` prop** → `SettingsFormProps` interface missing `defaultPrompts: Record<string, string>`
- **Deployment tab crashes** → check that Deployment tab inputs don't reference settings keys that don't exist in `maskedDisplay` (undefined access)

---

## Requirements Proved By This UAT

- None explicitly tracked — S04 is a UX improvement. Indirectly proves admin operability (R013): Settings page is navigable and informative.

## Not Proven By This UAT

- Deployment tab save functionality (deferred — tab is display-only scaffolding).
- Saving empty string → DB row deletion round-trip (depends on pre-existing `saveAgentPrompts` server action behavior from M002/S03).
- Mobile rendering of the tabs component (tested only on desktop viewport here).

## Notes for Tester

- The Deployment tab is intentionally non-functional for save — this is documented in the slice as deferred work. Don't file a bug if clicking Save there does nothing.
- The `monster` agent (Monster Chat) has no actual SYSTEM_PROMPT in the Agent SDK code — the DEFAULT_PROMPTS entry for it is a descriptive placeholder that makes the UI useful, not a reflection of runtime behavior. If you save a custom monster prompt, it won't affect the Monster Chat agent until the SDK client is wired to read from `agent_prompts`.
- Admin server stdout is the primary diagnostic surface: `[settings] agentPrompts loaded: N overrides` appears on every page render of `/settings`.
