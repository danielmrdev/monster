import { Worker } from 'bullmq';
import { createServiceClient } from '@monster/db';
import { createRedisConnection, createProductRefreshQueue, generateQueue } from '../queue.js';
import { DataForSEOClient } from '../clients/dataforseo.js';
import { diffProducts, type DbProduct, type DfsProduct } from '../diff-engine.js';

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
    .select('id, niche, market, language, refresh_interval_hours, status')
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

  // ── Step 3: Fetch existing DB products for diff ────────────────────────
  const { data: dbProductRows } = await supabase
    .from('tsa_products')
    .select('asin, current_price, availability, source_image_url, rating, price_history')
    .eq('site_id', siteId);

  const dbProducts: DbProduct[] = (dbProductRows ?? []).map((row) => ({
    asin: row.asin,
    current_price: row.current_price ?? null,
    availability: row.availability ?? null,
    source_image_url: row.source_image_url ?? null,
    rating: row.rating ?? null,
  }));

  // Raw DB rows map (includes price_history) for O(1) access during upsert
  type DbProductRow = NonNullable<typeof dbProductRows>[number];
  const dbRowMap = new Map<string, DbProductRow>(
    (dbProductRows ?? []).map((r) => [r.asin, r]),
  );

  // ── Step 4: Diff fetched products against DB state ─────────────────────
  console.log(`[ProductRefreshJob] site ${siteId} phase=diff_products started`);

  const dfsProducts: DfsProduct[] = products.map((p) => ({
    asin: p.asin,
    price: p.price ?? null,
    imageUrl: p.imageUrl ?? null,
    rating: p.rating,
  }));

  const diffResult = diffProducts(dbProducts, dfsProducts);

  console.log(
    `[ProductRefreshJob] site ${siteId} changes=${diffResult.changes.length} rebuild=${diffResult.shouldRebuild} serpAbsent=${diffResult.serpAbsentAsins.length}`,
  );

  // ── Step 5: Upsert tsa_products for fetched (SERP-present) products ────
  const now = new Date().toISOString();

  type PriceHistoryEntry = { price: number; date: string };

  const fetchedUpsertRows = products.map((p) => {
    const existing = dbRowMap.get(p.asin);
    const rawHistory = existing?.price_history ?? null;
    const history = (Array.isArray(rawHistory) ? rawHistory : []) as PriceHistoryEntry[];

    let updatedHistory = history;
    if (p.price !== null) {
      updatedHistory = [{ price: p.price, date: now }, ...history].slice(0, 30);
    }

    return {
      site_id: siteId,
      asin: p.asin,
      current_price: p.price ?? null,
      availability: 'available' as const,
      source_image_url: p.imageUrl ?? null,
      price_history: updatedHistory,
      last_checked_at: now,
    };
  });

  const { error: fetchedUpsertError } = await supabase
    .from('tsa_products')
    .upsert(fetchedUpsertRows, {
      onConflict: 'site_id,asin',
      ignoreDuplicates: false,
    });

  if (fetchedUpsertError) {
    console.error(
      `[ProductRefreshJob] site ${siteId} tsa_products upsert (fetched) failed: ${fetchedUpsertError.message}`,
    );
    throw new Error(`tsa_products upsert (fetched): ${fetchedUpsertError.message}`);
  }

  // ── Step 6: Upsert SERP-absent products — availability=limited only ────
  if (diffResult.serpAbsentAsins.length > 0) {
    const absentUpsertRows = diffResult.serpAbsentAsins.map((asin) => ({
      site_id: siteId,
      asin,
      availability: 'limited' as const,
      last_checked_at: now,
    }));

    const { error: absentUpsertError } = await supabase
      .from('tsa_products')
      .upsert(absentUpsertRows, {
        onConflict: 'site_id,asin',
        ignoreDuplicates: false,
      });

    if (absentUpsertError) {
      console.error(
        `[ProductRefreshJob] site ${siteId} tsa_products upsert (absent) failed: ${absentUpsertError.message}`,
      );
      throw new Error(`tsa_products upsert (absent): ${absentUpsertError.message}`);
    }
  }

  console.log(`[ProductRefreshJob] site ${siteId} phase=diff_products complete`);

  // ── Step 7: Enqueue GenerateSiteJob if rebuild warranted ──────────────
  if (diffResult.shouldRebuild) {
    if (site.status === 'live') {
      await generateQueue().add(
        'generate-site',
        { siteId },
        { removeOnComplete: false, removeOnFail: false },
      );
      console.log(
        `[ProductRefreshJob] site ${siteId} rebuild enqueued reason=${diffResult.rebuildReason}`,
      );
    } else {
      console.log(
        `[ProductRefreshJob] site ${siteId} rebuild skipped — site status=${site.status}`,
      );
    }
  }

  // ── Step 8: Create product alerts (with deduplication) ───────────────
  console.log(`[ProductRefreshJob] site ${siteId} phase=create_alerts started`);

  // 8a. Per-product alerts — SERP-absent ASINs → alert_type='unavailable'
  if (diffResult.serpAbsentAsins.length > 0) {
    // Fetch tsa_products UUIDs for absent ASINs (rows exist after T02 upsert)
    const { data: absentRows } = await supabase
      .from('tsa_products')
      .select('id, asin')
      .eq('site_id', siteId)
      .in('asin', diffResult.serpAbsentAsins);

    for (const absentProduct of absentRows ?? []) {
      // Check-before-insert dedup: one open 'unavailable' alert per product
      const { data: existingAlert } = await supabase
        .from('product_alerts')
        .select('id')
        .eq('site_id', siteId)
        .eq('product_id', absentProduct.id)
        .eq('alert_type', 'unavailable')
        .eq('status', 'open')
        .limit(1)
        .maybeSingle();

      if (existingAlert) {
        console.log(
          `[ProductRefreshJob] site ${siteId} alert dedup skipped type=unavailable asin=${absentProduct.asin}`,
        );
        continue;
      }

      const { error: alertInsertError } = await supabase
        .from('product_alerts')
        .insert({
          site_id: siteId,
          product_id: absentProduct.id,
          alert_type: 'unavailable',
          severity: 'warning',
          status: 'open',
          details: { reason: 'serp_absent', asin: absentProduct.asin },
        });

      if (alertInsertError) {
        console.error(
          `[ProductRefreshJob] site ${siteId} alert insert failed type=unavailable asin=${absentProduct.asin}: ${alertInsertError.message}`,
        );
        throw new Error(`product_alerts insert (unavailable): ${alertInsertError.message}`);
      }

      console.log(
        `[ProductRefreshJob] site ${siteId} alert created type=unavailable asin=${absentProduct.asin}`,
      );
    }
  }

  // 8b. Category empty check — re-query DB after all product updates
  // Supabase client doesn't support GROUP BY; compute counts in JS from two queries.
  // Fetch all site products with id+availability for category empty check and degraded check
  const { data: siteProductsForAlerts } = await supabase
    .from('tsa_products')
    .select('id, availability')
    .eq('site_id', siteId);

  const productIdList = (siteProductsForAlerts ?? []).map((r) => r.id);

  const { data: categoryProductLinks } = productIdList.length > 0
    ? await supabase
        .from('category_products')
        .select('category_id, product_id')
        .in('product_id', productIdList)
    : { data: [] };

  if (categoryProductLinks && categoryProductLinks.length > 0) {
    const availByProductId = new Map<string, string | null>(
      (siteProductsForAlerts ?? []).map((p) => [p.id, p.availability]),
    );

    // Group category_products by category_id, count available products per category
    const availableCountByCategory = new Map<string, number>();
    for (const link of categoryProductLinks) {
      const avail = availByProductId.get(link.product_id);
      const current = availableCountByCategory.get(link.category_id) ?? 0;
      availableCountByCategory.set(
        link.category_id,
        current + (avail === 'available' ? 1 : 0),
      );
    }

    // Alert for each category with zero available products
    for (const [categoryId, availCount] of availableCountByCategory) {
      if (availCount === 0) {
        // Dedup on (site_id, NULL product_id, 'category_empty') — one open alert per site
        const { data: existingCatAlert } = await supabase
          .from('product_alerts')
          .select('id')
          .eq('site_id', siteId)
          .is('product_id', null)
          .eq('alert_type', 'category_empty')
          .eq('status', 'open')
          .limit(1)
          .maybeSingle();

        if (existingCatAlert) {
          console.log(
            `[ProductRefreshJob] site ${siteId} alert dedup skipped type=category_empty`,
          );
          // Only one open category_empty alert per site — stop checking further categories
          break;
        }

        const { error: catAlertError } = await supabase
          .from('product_alerts')
          .insert({
            site_id: siteId,
            product_id: null,
            alert_type: 'category_empty',
            severity: 'critical',
            status: 'open',
            details: { category_id: categoryId },
          });

        if (catAlertError) {
          console.error(
            `[ProductRefreshJob] site ${siteId} alert insert failed type=category_empty: ${catAlertError.message}`,
          );
          throw new Error(`product_alerts insert (category_empty): ${catAlertError.message}`);
        }

        console.log(`[ProductRefreshJob] site ${siteId} alert created type=category_empty`);
        // One alert per site — stop after first insert
        break;
      }
    }
  }

  // 8c. Site degraded check — >30% products limited/unavailable
  // Reuse siteProductsForAlerts fetched above (same data, no extra query)
  const totalProds = siteProductsForAlerts?.length ?? 0;
  const degradedProds =
    siteProductsForAlerts?.filter(
      (p) => p.availability === 'limited' || p.availability === 'unavailable',
    ).length ?? 0;
  const degradedPct = totalProds > 0 ? degradedProds / totalProds : 0;

  if (degradedPct > 0.30) {
    // Check-before-insert dedup
    const { data: existingSiteDegraded } = await supabase
      .from('product_alerts')
      .select('id')
      .eq('site_id', siteId)
      .is('product_id', null)
      .eq('alert_type', 'site_degraded')
      .eq('status', 'open')
      .limit(1)
      .maybeSingle();

    if (existingSiteDegraded) {
      console.log(`[ProductRefreshJob] site ${siteId} alert dedup skipped type=site_degraded`);
    } else {
      const { error: siteAlertError } = await supabase
        .from('product_alerts')
        .insert({
          site_id: siteId,
          product_id: null,
          alert_type: 'site_degraded',
          severity: 'critical',
          status: 'open',
          details: {
            degraded_count: degradedProds,
            total: totalProds,
            pct: Math.round(degradedPct * 100),
          },
        });

      if (siteAlertError) {
        console.error(
          `[ProductRefreshJob] site ${siteId} alert insert failed type=site_degraded: ${siteAlertError.message}`,
        );
        throw new Error(`product_alerts insert (site_degraded): ${siteAlertError.message}`);
      }

      console.log(
        `[ProductRefreshJob] site ${siteId} alert created type=site_degraded pct=${Math.round(degradedPct * 100)}%`,
      );
    }
  }

  console.log(`[ProductRefreshJob] site ${siteId} phase=create_alerts complete`);

  // ── Step 9: Write sites.last_refreshed_at + sites.next_refresh_at ─────
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
