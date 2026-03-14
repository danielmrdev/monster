'use server';

import { createServiceClient } from '@/lib/supabase/service';
import { generateQueue, deployQueue } from '@monster/agents';

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

/**
 * Enqueue a standalone site deploy job (DeploySiteJob).
 * Mirrors enqueueSiteGeneration but targets the 'deploy' queue.
 * Observability: creates ai_jobs row (job_type='deploy_site') visible in Supabase;
 * worker transitions status pending→running→completed/failed; payload.phase tracks
 * rsync/caddy/cloudflare steps and is surfaced in DeployStatus component.
 */
export async function enqueueSiteDeploy(siteId: string): Promise<{ jobId: string | null; error?: string }> {
  const supabase = createServiceClient();

  const { data: jobRow, error: insertErr } = await supabase
    .from('ai_jobs')
    .insert({
      job_type: 'deploy_site',
      site_id: siteId,
      status: 'pending',
      payload: { phase: 'queued' },
    })
    .select('id')
    .single();

  if (insertErr || !jobRow) {
    return { jobId: null, error: insertErr?.message ?? 'Failed to create deploy job record' };
  }

  try {
    const queue = deployQueue();
    const bullJob = await queue.add('deploy-site', { siteId }, {
      jobId: jobRow.id,
      removeOnComplete: false,
      removeOnFail: false,
    });

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
 * Fetch the latest deploy ai_jobs row for a given site.
 * Used by DeployStatus client component on each poll cycle.
 * Filters job_type = 'deploy_site' — separate from generate_site jobs.
 */
export async function getLatestDeployStatus(siteId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('ai_jobs')
    .select('id, status, started_at, completed_at, error, payload, created_at')
    .eq('site_id', siteId)
    .eq('job_type', 'deploy_site')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

/**
 * Fetch all data needed for the Deployment card on the site detail page.
 * Returns: sites.status, latest deployments row, domains row (with cf_nameservers).
 * Called server-side in page.tsx for SSR — DeployStatus polls separately.
 */
export async function getDeploymentCard(siteId: string) {
  const supabase = createServiceClient();

  const [siteResult, deploymentResult, domainResult] = await Promise.all([
    supabase
      .from('sites')
      .select('id, status')
      .eq('id', siteId)
      .single(),
    supabase
      .from('deployments')
      .select('id, status, deployed_at, duration_ms, error, created_at')
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('domains')
      .select('cf_zone_id, cf_nameservers, dns_status')
      .eq('site_id', siteId)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    siteStatus: siteResult.data?.status ?? null,
    latestDeployment: deploymentResult.data ?? null,
    domain: domainResult.data ?? null,
  };
}
