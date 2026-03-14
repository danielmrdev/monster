'use server';

import { redirect } from 'next/navigation';
import { createServiceClient } from '@/lib/supabase/service';
import { nicheResearchQueue } from '@monster/agents';
import type { EnqueueResearchState } from './constants';

// Re-export type so callers can import from actions.ts directly
// 'export type' is erased at runtime and does not violate 'use server' — D034 permits type-only exports
export type { EnqueueResearchState } from './constants';

/**
 * Create a research_sessions row and enqueue a NicheResearcherJob.
 *
 * Creates the DB row BEFORE enqueuing so the worker can find the session on startup.
 * On success, redirects to /research?session=<id> (Next.js redirect throws NEXT_REDIRECT —
 * this is expected; callers must not catch Error broadly).
 *
 * Compatible with useActionState — returns EnqueueResearchState on error, redirects on success.
 *
 * Observability:
 *  - DB row creation: SELECT id, status, niche_idea FROM research_sessions ORDER BY created_at DESC LIMIT 3;
 *  - BullMQ job: KEYS bull:niche-research:waiting:* — job should appear immediately after submission
 *  - Worker picks up and logs: [niche-researcher] session=<id> phase=start
 *  - If enqueue fails after row creation: session row persists with status='pending' but no job in Redis
 *    Orphaned detection: SELECT id FROM research_sessions WHERE status='pending' AND created_at < NOW() - INTERVAL '10 minutes';
 */
export async function enqueueResearch(
  _prevState: EnqueueResearchState,
  formData: FormData,
): Promise<EnqueueResearchState> {
  const rawIdea = formData.get('nicheIdea');
  const rawMarket = formData.get('market');

  const nicheIdea = typeof rawIdea === 'string' ? rawIdea.trim() : '';
  const market = typeof rawMarket === 'string' && rawMarket.length > 0 ? rawMarket : 'ES';

  if (nicheIdea.length < 3) {
    return { error: 'Niche idea must be at least 3 characters.' };
  }

  const supabase = createServiceClient();

  // 1. Create session row first — job must find it on startup
  const { data: session, error: insertError } = await supabase
    .from('research_sessions')
    .insert({ niche_idea: nicheIdea, market, status: 'pending' })
    .select('id')
    .single();

  if (insertError || !session) {
    return { error: insertError?.message ?? 'Failed to create research session.' };
  }

  const sessionId = session.id;

  // 2. Enqueue the job
  try {
    const queue = nicheResearchQueue();
    await queue.add(
      'research',
      { sessionId, nicheIdea, market },
      { removeOnComplete: true, removeOnFail: false },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Session row exists but job failed to enqueue — mark as failed so it's not orphaned
    await supabase
      .from('research_sessions')
      .update({
        status: 'failed',
        progress: [
          {
            turn: 0,
            phase: 'failed',
            summary: `Enqueue error: ${message}`,
            timestamp: new Date().toISOString(),
          },
        ],
      })
      .eq('id', sessionId);
    return { error: `Failed to enqueue research job: ${message}` };
  }

  // 3. Redirect to the session status page (throws NEXT_REDIRECT — must not be caught)
  redirect(`/research?session=${sessionId}`);
}

/**
 * Fetch the 10 most recent research sessions for the session list.
 *
 * Observability: if this returns empty, check research_sessions table in Supabase.
 */
export async function getResearchSessions(): Promise<
  { id: string; niche_idea: string | null; market: string | null; status: string; created_at: string }[]
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('research_sessions')
    .select('id, niche_idea, market, status, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('[research] getResearchSessions error:', error.message);
    return [];
  }

  return data ?? [];
}

/**
 * Fetch status + progress + report for a single session (used by polling component).
 * Returns null if session not found.
 *
 * Observability:
 *  - Returns null → sessionId is invalid or row was deleted
 *  - progress is jsonb array of { turn, phase, summary, timestamp } objects
 *  - report is non-null only when status='completed'
 */
export async function getResearchSessionStatus(sessionId: string): Promise<{
  status: string;
  progress: unknown;
  report: unknown;
} | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('research_sessions')
    .select('status, progress, report')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  return { status: data.status, progress: data.progress, report: data.report };
}
