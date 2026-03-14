import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { createServiceClient } from '@monster/db';
import { CloudflareClient } from '@monster/domains';
import { SITE_STATUS_FLOW } from '@monster/shared';
import { createRedisOptions, sslPollerQueue } from '../queue.js';

// ---------------------------------------------------------------------------
// SslPollerPayload
// ---------------------------------------------------------------------------

export interface SslPollerPayload {
  siteId: string;
  cfZoneId: string;
  attempt: number;
}

const MAX_ATTEMPTS = 30;

// ---------------------------------------------------------------------------
// SslPollerJob
//
// Polls Cloudflare SSL status for a zone. Runs with a 60s delay between
// re-enqueues. Gives up after MAX_ATTEMPTS (30 = ~30 minutes).
//
// Status transitions:
//   dns_pending → ssl_pending → live
//
// Queue: 'ssl-poller'
// ---------------------------------------------------------------------------

export class SslPollerJob {
  register(): Worker {
    const connection = new Redis(createRedisOptions());

    const worker = new Worker<SslPollerPayload>(
      'ssl-poller',
      async (job) => {
        const { siteId, cfZoneId, attempt } = job.data;
        const supabase = createServiceClient();

        console.log(`[SslPollerJob] attempt ${attempt}/${MAX_ATTEMPTS} for site ${siteId} (zone ${cfZoneId})`);

        const cf = new CloudflareClient();
        let sslStatus: 'active' | 'pending';

        try {
          sslStatus = await cf.pollSslStatus(cfZoneId);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[SslPollerJob] pollSslStatus error on attempt ${attempt}: ${msg}`);
          // Treat as pending — re-enqueue if not at limit
          sslStatus = 'pending';
        }

        console.log(`[SslPollerJob] attempt ${attempt}: ssl_status=${sslStatus}`);

        if (sslStatus === 'active') {
          // Fetch current site status for guarded transition
          const { data: site } = await supabase
            .from('sites')
            .select('status')
            .eq('id', siteId)
            .single();

          const currentStatus = site?.status ?? 'dns_pending';

          // Transition dns_pending → ssl_pending if valid
          if (SITE_STATUS_FLOW[currentStatus as keyof typeof SITE_STATUS_FLOW]?.includes('ssl_pending')) {
            await supabase.from('sites').update({ status: 'ssl_pending' }).eq('id', siteId);
            console.log(`[SslPollerJob] site ${siteId}: ${currentStatus} → ssl_pending`);
          }

          // Transition ssl_pending → live
          await supabase.from('sites').update({ status: 'live' }).eq('id', siteId);
          console.log(`[SslPollerJob] site ${siteId}: ssl_pending → live`);

          // Update domains.dns_status = 'active'
          await supabase
            .from('domains')
            .update({ dns_status: 'active', updated_at: new Date().toISOString() })
            .eq('site_id', siteId);

          console.log(`[SslPollerJob] site ${siteId} is now live — SSL active, DNS active`);
          return;
        }

        // SSL not yet active
        if (attempt >= MAX_ATTEMPTS) {
          console.error(
            `[SslPollerJob] site ${siteId}: SSL still pending after ${MAX_ATTEMPTS} attempts — setting status=error`,
          );
          await supabase.from('sites').update({ status: 'error' }).eq('id', siteId);
          return;
        }

        // Re-enqueue with delay
        await sslPollerQueue().add(
          'ssl-poll',
          { siteId, cfZoneId, attempt: attempt + 1 },
          { delay: 60000 },
        );
        console.log(`[SslPollerJob] re-enqueued attempt ${attempt + 1} for site ${siteId} (60s delay)`);
      },
      { connection },
    );

    worker.on('failed', (job, err) => {
      console.error(`[SslPollerJob] Job ${job?.id} failed: ${err.message}`);
    });

    return worker;
  }
}
