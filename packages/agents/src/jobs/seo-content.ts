import { Worker } from 'bullmq';
import { createRedisConnection } from '../queue.js';

// ---------------------------------------------------------------------------
// SeoContentPayload
// ---------------------------------------------------------------------------

export interface SeoContentPayload {
  siteId: string;
  jobType: 'seo_homepage' | 'seo_category' | 'seo_product' | 'seo_products_batch';
  categoryId?: string; // for category/product/batch jobs
  productId?: string;  // for single product job
}

// ---------------------------------------------------------------------------
// SeoContentJob
//
// Queue: 'seo-content'
// lockDuration: 120000ms (2 min) — Agent SDK query with maxTurns:3 + scoring is short
// Handler stub in S01: logs payload, returns. Full logic added in S02–S04.
// ---------------------------------------------------------------------------

export class SeoContentJob {
  /**
   * Creates a BullMQ Worker on queue 'seo-content'.
   * Returns the Worker so the caller can add it to the shutdown array.
   */
  register(): Worker {
    const connection = createRedisConnection();

    const worker = new Worker<SeoContentPayload>(
      'seo-content',
      handler,
      {
        connection,
        lockDuration: 120000, // 2 min — maxTurns:3 scoring loop
      },
    );

    worker.on('failed', (job, err) => {
      console.error(`[SeoContentJob] Job ${job?.id} type=${job?.data?.jobType} siteId=${job?.data?.siteId} failed: ${err.message}`);
    });

    return worker;
  }
}

// ---------------------------------------------------------------------------
// Handler stub — full logic added in S02–S04
// ---------------------------------------------------------------------------

async function handler(job: import('bullmq').Job<SeoContentPayload>): Promise<void> {
  const { siteId, jobType, categoryId, productId } = job.data;
  console.log(`[seo-content] jobId=${job.id} jobType=${jobType} siteId=${siteId} categoryId=${categoryId ?? 'none'} productId=${productId ?? 'none'} status=stub`);
  // TODO S02: implement 'seo_homepage' case
  // TODO S03: implement 'seo_category' case
  // TODO S04: implement 'seo_product' and 'seo_products_batch' cases
}
