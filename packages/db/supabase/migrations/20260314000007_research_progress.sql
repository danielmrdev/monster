-- Migration 007: Add progress jsonb column to research_sessions.
-- Tracks per-turn NicheResearcher agent progress (array of { turn, phase, summary }).
-- Applied via service-role client; column is nullable — existing rows unaffected.

ALTER TABLE research_sessions ADD COLUMN IF NOT EXISTS progress jsonb;
