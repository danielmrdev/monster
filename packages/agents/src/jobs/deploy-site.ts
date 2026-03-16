import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createServiceClient } from '@monster/db';
import { RsyncService } from '@monster/deployment';
import { CaddyService } from '@monster/deployment';
import type { Server } from '@monster/deployment';
import { CloudflareClient } from '@monster/domains';
import { SITE_STATUS_FLOW } from '@monster/shared';
import type { SiteStatus } from '@monster/shared';
import { createRedisOptions, sslPollerQueue } from '../queue.js';
import { pingIndexNow } from '../index-now.js';

// ---------------------------------------------------------------------------
// DeploySitePayload
// ---------------------------------------------------------------------------

export interface DeploySitePayload {
  siteId: string;
}

// ---------------------------------------------------------------------------
// Shared deploy phase helper
//
// Runs the full deploy sequence:
//   rsync → Caddy virtualhost → CF zone + A record → status transitions →
//   deployments row lifecycle → SslPollerJob enqueue
//
// Callers pass the job's BullMQ job id for ai_jobs tracking, and the
// already-fetched site row. The supabase client is also caller-provided.
// ---------------------------------------------------------------------------

export async function runDeployPhase(
  siteId: string,
  site: { id: string; domain: string | null; name: string | null; status: string | null },
  bullJobId: string | undefined,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<void> {
  if (!site.domain) {
    console.log(`[DeployPhase] site ${siteId} has no domain — skipping deploy phase`);
    return;
  }

  const domain = site.domain;
  const slug = domain.replace(/\./g, '-');
  const deployStart = Date.now();

  // ── Insert deployments row ────────────────────────────────────────────────
  const { data: deployRow, error: deployInsertErr } = await supabase
    .from('deployments')
    .insert({ site_id: siteId, status: 'running' })
    .select('id')
    .single();

  if (deployInsertErr || !deployRow) {
    throw new Error(`[DeployPhase] Failed to insert deployments row: ${deployInsertErr?.message ?? 'null row'}`);
  }
  const deploymentId = deployRow.id;

  console.log(`[DeployPhase] deployment row ${deploymentId} created (running)`);

  // ── Update ai_jobs phase ──────────────────────────────────────────────────
  if (bullJobId) {
    await supabase
      .from('ai_jobs')
      .update({ payload: { phase: 'deploy', done: 0, total: 3 } })
      .eq('bull_job_id', bullJobId);
  }

  try {
    // ── Get first active server for deployment ──────────────────────────────
    const { data: serverRow, error: serverErr } = await supabase
      .from('servers')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (serverErr || !serverRow) {
      throw new Error('[DeployPhase] no active servers found in servers table');
    }

    const server = serverRow as Server;
    const deployHost = server.tailscale_ip ?? server.public_ip;
    if (!deployHost) {
      throw new Error(`[DeployPhase] server "${server.name}" has no IP address`);
    }

    console.log(`[DeployPhase] using server "${server.name}" (${deployHost})`);

    // ── Transition: current → deploying ────────────────────────────────────
    const currentStatus = (site.status ?? 'draft') as SiteStatus;
    const allowedNext = SITE_STATUS_FLOW[currentStatus] ?? [];
    if (!allowedNext.includes('deploying')) {
      throw new Error(
        `[DeployPhase] Invalid status transition: ${currentStatus} → deploying`,
      );
    }
    await supabase.from('sites').update({ status: 'deploying' }).eq('id', siteId);
    console.log(`[DeployPhase] site ${siteId}: ${currentStatus} → deploying`);

    // ── Step 1: rsync ───────────────────────────────────────────────────────
    console.log(`[DeployPhase] rsync: deploying slug "${slug}" to ${deployHost}`);
    const rsync = new RsyncService();
    await rsync.deploy(slug, server);
    console.log(`[DeployPhase] rsync: done`);

    if (bullJobId) {
      await supabase
        .from('ai_jobs')
        .update({ payload: { phase: 'deploy', done: 1, total: 3 } })
        .eq('bull_job_id', bullJobId);
    }

    // ── Step 2: Caddy virtualhost ──────────────────────────────────────────
    console.log(`[DeployPhase] caddy: writing virtualhost for ${domain}`);
    const caddy = new CaddyService();
    await caddy.writeVirtualhost(domain, slug, server);
    console.log(`[DeployPhase] caddy: done`);

    if (bullJobId) {
      await supabase
        .from('ai_jobs')
        .update({ payload: { phase: 'deploy', done: 2, total: 3 } })
        .eq('bull_job_id', bullJobId);
    }

    // ── Step 3: Cloudflare zone + A record ────────────────────────────────
    console.log(`[DeployPhase] cloudflare: ensuring zone for ${domain}`);
    const cf = new CloudflareClient();
    const { zoneId, nameservers } = await cf.ensureZone(domain);
    console.log(`[DeployPhase] cloudflare: zone ${zoneId}, NS: ${nameservers.join(', ')}`);

    // Upsert domains row (domain column has UNIQUE constraint)
    await supabase
      .from('domains')
      .upsert(
        {
          site_id: siteId,
          domain,
          cf_zone_id: zoneId,
          cf_nameservers: nameservers,
          registrar: 'cloudflare',
          dns_status: 'pending',
        },
        { onConflict: 'domain' },
      );

    console.log(`[DeployPhase] cloudflare: ensuring A record ${domain} → ${server.public_ip}`);
    await cf.ensureARecord(zoneId, server.public_ip!, domain);
    console.log(`[DeployPhase] cloudflare: A record done`);

    if (bullJobId) {
      await supabase
        .from('ai_jobs')
        .update({ payload: { phase: 'deploy', done: 3, total: 3 } })
        .eq('bull_job_id', bullJobId);
    }

    // ── Transition: deploying → dns_pending ──────────────────────────────
    await supabase.from('sites').update({ status: 'dns_pending' }).eq('id', siteId);
    console.log(`[DeployPhase] site ${siteId}: deploying → dns_pending`);

    // ── IndexNow ping ─────────────────────────────────────────────────────
    // Non-fatal: failure logged as warning, never throws
    await pingIndexNow(domain);

    // ── Update deployments row: succeeded ────────────────────────────────
    const durationMs = Date.now() - deployStart;
    await supabase
      .from('deployments')
      .update({
        status: 'succeeded',
        deployed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', deploymentId);

    console.log(`[DeployPhase] deployment ${deploymentId}: succeeded in ${durationMs}ms`);

    // ── Enqueue SslPollerJob (60s delay) ─────────────────────────────────
    await sslPollerQueue().add(
      'ssl-poll',
      { siteId, cfZoneId: zoneId, attempt: 0 },
      { delay: 60000 },
    );
    console.log(`[DeployPhase] SslPollerJob enqueued for site ${siteId} (60s delay)`);
  } catch (err) {
    // Persist failure state in deployments row
    const errMsg = err instanceof Error ? err.message : String(err);
    await supabase
      .from('deployments')
      .update({ status: 'failed', error: errMsg })
      .eq('id', deploymentId);

    // Transition site to error
    await supabase.from('sites').update({ status: 'error' }).eq('id', siteId);
    console.error(`[DeployPhase] deploy failed for site ${siteId}: ${errMsg}`);

    throw err; // Re-throw so caller's ai_jobs 'failed' handler fires
  }
}

// ---------------------------------------------------------------------------
// DeploySiteJob
//
// Standalone redeploy job — runs the deploy phase without regenerating content.
// Queue: 'deploy'
// ---------------------------------------------------------------------------

export class DeploySiteJob {
  register(): Worker {
    const connection = new Redis(createRedisOptions());

    const worker = new Worker<DeploySitePayload>(
      'deploy',
      async (job) => {
        const { siteId } = job.data;
        const supabase = createServiceClient();

        console.log(`[DeploySiteJob] Starting job ${job.id} for site ${siteId}`);

        // Fetch site fresh from DB
        const { data: site, error: siteError } = await supabase
          .from('sites')
          .select('*')
          .eq('id', siteId)
          .single();

        if (siteError || !site) {
          throw new Error(`[DeploySiteJob] Site not found: ${siteId} — ${siteError?.message ?? 'null row'}`);
        }

        if (!site.domain) {
          throw new Error(`[DeploySiteJob] Site ${siteId} has no domain — cannot deploy`);
        }

        // Insert ai_jobs row for this standalone deploy
        const { error: insertErr } = await supabase.from('ai_jobs').insert({
          bull_job_id: job.id ?? null,
          job_type: 'deploy_site',
          site_id: siteId,
          status: 'running',
          started_at: new Date().toISOString(),
          payload: { phase: 'deploy', done: 0, total: 3 },
        });

        if (insertErr) {
          console.error(`[DeploySiteJob] Failed to insert ai_jobs: ${insertErr.message}`);
          // Non-fatal — continue deploy; status tracking degrades but deploy should proceed
        }

        await runDeployPhase(siteId, site, job.id, supabase);

        // Mark ai_jobs completed
        await supabase
          .from('ai_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
          })
          .eq('bull_job_id', job.id ?? '');

        console.log(`[DeploySiteJob] Job ${job.id} completed for site ${siteId}`);
      },
      { connection, lockDuration: 300000 },
    );

    worker.on('failed', async (job, err) => {
      console.error(`[DeploySiteJob] Job ${job?.id} failed: ${err.message}`);
      if (!job?.id) return;

      const supabase = createServiceClient();
      await supabase
        .from('ai_jobs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err.message,
        })
        .eq('bull_job_id', job.id);
    });

    return worker;
  }
}
