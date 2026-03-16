-- agent_prompts: user-editable system prompts for AI agents
-- Stores per-agent overrides. When present, agents use this instead of hardcoded defaults.
-- Unique constraint on (agent_key, prompt_type) enables idempotent upserts.

CREATE TABLE IF NOT EXISTS agent_prompts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key    text        NOT NULL,
  prompt_type  text        NOT NULL DEFAULT 'system',
  content      text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_key, prompt_type)
);

-- RLS: service role only (admin panel uses service client)
ALTER TABLE agent_prompts ENABLE ROW LEVEL SECURITY;
