-- Migration 005: AI agent and job tracking tables.
-- Applies: research_sessions, research_results, chat_conversations, chat_messages, ai_jobs.

-- ---------------------------------------------------------------------------
-- research_sessions — NicheResearcher agent sessions
-- user_id nullable: Phase 1 is single-user, no auth required
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid,                   -- nullable: single-user Phase 1
  niche_idea  text,
  market      text,
  status      text        NOT NULL DEFAULT 'pending',
                                      -- 'pending'|'running'|'completed'|'failed'
  report      jsonb,                  -- structured research output
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_sessions ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- research_results — individual findings within a research session
-- result_type: 'domain_suggestion'|'keyword_analysis'|'competitor'|'summary'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_results (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid        NOT NULL REFERENCES research_sessions(id) ON DELETE CASCADE,
  result_type  text        NOT NULL,
  content      jsonb       NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE research_results ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- chat_conversations — Monster Chat agent conversation threads
-- site_id nullable: conversations can be global (not tied to a specific site)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_conversations (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid,                   -- nullable: single-user Phase 1
  title      text,
  site_id    uuid        REFERENCES sites(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- chat_messages — individual messages within a conversation
-- role: 'user'|'assistant'|'tool'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role            text        NOT NULL,   -- 'user'|'assistant'|'tool'
  content         text        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- ai_jobs — BullMQ job tracking for all async AI work
-- bull_job_id: BullMQ job ID for correlation with queue state
-- site_id nullable: some jobs (niche research) are not site-specific
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_jobs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type      text        NOT NULL,   -- 'content_generation'|'site_build'|'product_refresh'|'niche_research'
  status        text        NOT NULL DEFAULT 'pending',
                                        -- 'pending'|'running'|'completed'|'failed'
  site_id       uuid        REFERENCES sites(id) ON DELETE SET NULL,
  payload       jsonb,                  -- job input (site_id, config, etc.)
  result        jsonb,                  -- job output (nullable until completed)
  error         text,                   -- failure reason (nullable)
  bull_job_id   text,                   -- BullMQ job ID for queue correlation
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_jobs ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_research_sessions_status       ON research_sessions(status);
CREATE INDEX IF NOT EXISTS idx_research_results_session_id    ON research_results(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_site_id     ON chat_conversations(site_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id  ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status                 ON ai_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_site_id                ON ai_jobs(site_id);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_bull_job_id            ON ai_jobs(bull_job_id);
