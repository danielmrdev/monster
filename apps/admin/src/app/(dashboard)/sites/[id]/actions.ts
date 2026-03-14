'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { generateQueue } from '@monster/agents';

/**
 * Enqueue a site generation job.
 * Inserts an ai_jobs row with status='pending', then adds to BullMQ queue.
 * The worker upserts the row to 'running' when it picks up the job.
 */
export async function enqueueSiteGeneration(siteId: string): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();

  // Insert pending ai_jobs row first so UI can show 'Pending' immediately
  const { data: jobRow, error: insertErr } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: 'generate_site',
      site_id: siteId,
      status: 'pending',
      payload: { phase: 'queued' },
    })
    .select('id')
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? 'Failed to create job record' };
  }

  try {
    const queue = generateQueue();
    const bullJob = await queue.add('generate-site', { siteId }, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

    // Update the ai_jobs row with the bull_job_id
    await supabase
      .from('ai_jobs')
      .update({ bull_job_id: bullJob.id ?? null })
      .eq('id', jobRow.id);

    return { jobId: jobRow.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('ai_jobs')
      .update({ status: 'failed', error: message, completed_at: new Date().toISOString() })
      .eq('id', jobRow.id);
    return { jobId: jobRow.id, error: message };
  }
}

/**
 * Fetch the latest ai_jobs row for a given site.
 * Used by JobStatus client component on each poll cycle.
 */
export async function getLatestJobStatus(siteId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('ai_jobs')
    .select('id, status, started_at, completed_at, error, payload, created_at')
    .eq('site_id', siteId)
    .eq('job_type', 'generate_site')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}
