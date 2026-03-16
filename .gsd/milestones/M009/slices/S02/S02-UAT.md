# S02 UAT — AI SEO Generation + Prompt Editor

**When to run:** After deploying S02 changes and applying the agent_prompts migration to Supabase.

---

## Pre-requisite: Apply DB migration

Run on the remote Supabase project:
```sql
CREATE TABLE IF NOT EXISTS agent_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  prompt_type text NOT NULL DEFAULT 'system',
  content text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_key, prompt_type)
);
ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
```

---

## Test 1: Generate with AI — Category SEO text

1. Open a site, navigate to an existing category (edit mode: `/sites/<id>/categories/<catId>/edit`)
2. Look for the "Generate with AI" button next to the SEO Text label
3. Click it
4. **Expected:** Button shows spinner + "Generating…"; the SEO text textarea streams in content (~400 words)
5. After generation completes, edit the text and click Save Changes
6. **Pass if:** Text streams in progressively; saved text appears in the category on refresh

---

## Test 2: Generate with AI — Product description preview

1. Open a site, navigate to an existing product (edit mode: `/sites/<id>/products/<prodId>/edit`)
2. Scroll to the "AI Description Preview" section below Focus Keyword
3. Click "Generate with AI"
4. **Expected:** Preview textarea streams in a 150-250 word product description
5. **Pass if:** Text streams in; the note "Preview only — run 'Generate Site' to apply AI content" is visible

---

## Test 3: Agent Prompts editor in Settings

1. Navigate to **Settings** (`/settings`)
2. Scroll to the "Agent System Prompts" section
3. Enter a custom system prompt for Content Generator (e.g. "Always write in Spanish. Keep all descriptions under 200 words.")
4. Click **Save Agent Prompts**
5. **Expected:** Green "Agent prompts saved." banner appears
6. Reload the page — the custom prompt should still be in the textarea
7. **Pass if:** Prompt persists across page reload; banner shows on save

---

## Test 4: Clear a prompt (restore default)

1. In Settings, clear the Content Generator prompt textarea
2. Click Save Agent Prompts
3. **Expected:** The DB row is deleted; the placeholder hint appears again on reload
4. **Pass if:** Empty field after save shows the placeholder text
