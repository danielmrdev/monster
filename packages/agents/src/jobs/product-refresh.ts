import { Worker } from 'bullmq';
import { createServiceClient } from '@monster/db';
import { createRedisConnection, createProductRefreshQueue } from '../queue.js';
import { DataForSEOClient } from '../clients/dataforseo.js';

// ---------------------------------------------------------------------------
// ProductRefreshPayload
// ---------------------------------------------------------------------------

export interface ProductRefreshPayload {
  siteId: string;
}

// ---------------------------------------------------------------------------
// ProductRefreshJob
//
// Phase S01: fetch_products only.
//   - Fetches products from DataForSEO for the site's niche+market
//   - Upserts tsa_products.last_checked_at for each ASIN returned
//   - Writes sites.last_refreshed_at + sites.next_refresh_at
//
// Phase S02 (future): diff engine, alert creation, price history writes.
//
// Queue: 'product-refresh'
// Scheduler: one stable scheduler per site — 'product-refresh-scheduler-<siteId>'
// lockDuration: 300000ms (5 min) — DataForSEO calls can take 30-60s including polling (D059)
// ---------------------------------------------------------------------------

export class ProductRefreshJob {
  /**
   * Creates a BullMQ Worker on queue 'product-refresh'.
   * Returns the Worker so the caller can add it to the shutdown array.
   */
  register(): Worker {
    const connection = createRedisConnection();

    const worker = new Worker<ProductRefreshPayload>(
      'product-refresh',
      handler,
      {
        connection,
        lockDuration: 300000, // 5 min — DataForSEO polling can take 30-60s (D059)
      },
    );

    worker.on('failed', (job, err) => {
      console.error(`[ProductRefreshJob] Job ${job?.id} site=${job?.data?.siteId} failed: ${err.message}`);
    });

    return worker;
  }

  /**
   * Registers (or updates) one BullMQ job scheduler per site.
   * Scheduler ID is stable: 'product-refresh-scheduler-<siteId>' — idempotent on repeated calls (D082 pattern).
   * Cron derived from refresh_interval_hours (default 48h = every-2-days cron).
   */
  async registerScheduler(
    sites: Array<{ id: string; refresh_interval_hours: number | null }>,
  ): Promise<void> {
    const queue = createProductRefreshQueue();
    try {
      for (const site of sites) {
        const hours = site.refresh_interval_hours ?? 48;
        const cron = deriveCron(hours);
        await queue.upsertJobScheduler(
          `product-refresh-scheduler-${site.id}`,
          { pattern: cron, tz: 'UTC' },
          { name: 'product-refresh', data: { siteId: site.id } },
        );
      }
    } finally {
      await queue.close();
    }
  }
}

// ---------------------------------------------------------------------------
// Cron derivation — maps refresh_interval_hours to a cron expression
// ---------------------------------------------------------------------------

/**
 * Derive a cron expression from refresh_interval_hours.
 *
 * 24h  -> '0 0 * * *'       (daily at midnight UTC)
 * 48h  -> '0 0 every2 * *'  (every 2 days at midnight UTC)
 * N*24h -> '0 0 everyN * *' (every N days at midnight UTC)
 *
 * This is a simplification for S01: intervals < 24 are clamped to daily.
 * The general pattern handles the common multi-day case.
 */
function deriveCron(hours: number): string {
  const days = Math.max(1, Math.round(hours / 24));
  if (days === 1) {
    return '0 0 * * *';
  }
  return `0 0 */${days} * *`;
}

// ---------------------------------------------------------------------------
// Handler — runs inside the Worker process
// ---------------------------------------------------------------------------

async function handler(job: import('bullmq').Job<ProductRefreshPayload>): Promise<void> {
  const { siteId } = job.data;
  const supabase = createServiceClient();

  // ── Step 1: Fetch site record ──────────────────────────────────────────
  const { data: site, error: siteError } = await supabase
    .from('sites')
    .select('id, niche, market, language, refresh_interval_hours')
    .eq('id', siteId)
    .single();

  if (siteError || !site) {
    // Non-fatal — site may have been deleted between scheduler registration and job execution
    console.log(`[ProductRefreshJob] site ${siteId} not found — skipping (may have been deleted)`);
    return;
  }

  const refreshIntervalHours: number = site.refresh_interval_hours ?? 48;

  console.log(`[ProductRefreshJob] site ${siteId} phase=fetch_products started`);

  // ── Step 2: Fetch products from DataForSEO ───────────────────────────
  const client = new DataForSEOClient();
  const niche: string = site.niche ?? '';
  const market: string = site.market ?? '';

  let products: Awaited<ReturnType<DataForSEOClient['searchProducts']>>;

  try {
    products = await client.searchProducts(niche, market);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ProductRefreshJob] site ${siteId} DataForSEO fetch failed: ${errMsg}`);
    throw err; // Let BullMQ mark the job as failed
  }

  console.log(`[ProductRefreshJob] site ${siteId} fetched ${products.length} products`);

  // ── Step 3: Upsert tsa_products.last_checked_at for each ASIN ─────────
  //
  // S01 constraint: only update last_checked_at — do NOT overwrite title/price/images etc.
  // Diff logic and full field updates are S02.
  const now = new Date().toISOString();

  const upsertRows = products.map((p) => ({
    site_id: siteId,
    asin: p.asin,
    last_checked_at: now,
  }));

  const { error: upsertError } = await supabase
    .from('tsa_products')
    .upsert(upsertRows, {
      onConflict: 'site_id,asin',
      ignoreDuplicates: false,
    });

  if (upsertError) {
    console.error(
      `[ProductRefreshJob] site ${siteId} tsa_products upsert failed: ${upsertError.message}`,
    );
    throw new Error(`tsa_products upsert: ${upsertError.message}`);
  }

  // ── Step 4: Write sites.last_refreshed_at + sites.next_refresh_at ─────
  const nextRefreshAt = new Date(
    Date.now() + refreshIntervalHours * 60 * 60 * 1000,
  ).toISOString();

  const { error: siteUpdateError } = await supabase
    .from('sites')
    .update({
      last_refreshed_at: now,
      next_refresh_at: nextRefreshAt,
    })
    .eq('id', siteId);

  if (siteUpdateError) {
    console.error(
      `[ProductRefreshJob] site ${siteId} sites update failed: ${siteUpdateError.message}`,
    );
    throw new Error(`sites update: ${siteUpdateError.message}`);
  }

  console.log(
    `[ProductRefreshJob] site ${siteId} phase=fetch_products complete, last_refreshed_at updated`,
  );
}
