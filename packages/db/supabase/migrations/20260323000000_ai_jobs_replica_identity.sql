-- Enable Realtime on ai_jobs for job notification system.
-- REPLICA IDENTITY FULL so old row is available (detect status transitions).
ALTER TABLE ai_jobs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE ai_jobs;

-- RLS: allow anon key SELECT for Realtime subscriptions from browser
CREATE POLICY "Allow public read ai_jobs" ON ai_jobs FOR SELECT USING (true);
