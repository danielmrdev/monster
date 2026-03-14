/**
 * Standalone worker entrypoint.
 * Run with: node packages/agents/dist/worker.js
 *
 * Reads env vars from process.env — caller is responsible for
 * loading .env before starting this process (e.g. via dotenv or pm2 env_file).
 */
import 'dotenv/config';
import { createServiceClient } from '@monster/db';
import { GenerateSiteJob } from './jobs/generate-site.js';
import { DeploySiteJob } from './jobs/deploy-site.js';
import { SslPollerJob } from './jobs/ssl-poller.js';
import { AnalyticsAggregationJob } from './jobs/analytics-aggregation.js';
import { ProductRefreshJob } from './jobs/product-refresh.js';
import { NicheResearcherJob } from './jobs/niche-researcher.js';

const generateJob = new GenerateSiteJob();
const generateWorker = generateJob.register();

const deployJob = new DeploySiteJob();
const deployWorker = deployJob.register();

const sslPollerJob = new SslPollerJob();
const sslPollerWorker = sslPollerJob.register();

const analyticsJob = new AnalyticsAggregationJob();
await analyticsJob.registerScheduler();
const analyticsWorker = analyticsJob.register();

// ProductRefreshJob: fetch live sites, register per-site schedulers, start worker
const supabase = createServiceClient();
const { data: liveSites, error: liveSitesError } = await supabase
  .from('sites')
  .select('id, refresh_interval_hours')
  .eq('status', 'live');

if (liveSitesError) {
  console.error(`[worker] Failed to fetch live sites for ProductRefreshJob scheduler: ${liveSitesError.message}`);
}

const productRefreshJob = new ProductRefreshJob();
await productRefreshJob.registerScheduler(liveSites ?? []);
const productRefreshWorker = productRefreshJob.register();

const nicheResearcherJob = new NicheResearcherJob();
const nicheResearcherWorker = nicheResearcherJob.register();

console.log('[worker] GenerateSiteJob listening on queue "generate"');
console.log('[worker] DeploySiteJob listening on queue "deploy"');
console.log('[worker] SslPollerJob listening on queue "ssl-poller"');
console.log('[worker] AnalyticsAggregationJob listening on queue "analytics-aggregation"');
console.log(`[worker] ProductRefreshJob scheduler registered (${(liveSites ?? []).length} sites)`);
console.log('[worker] ProductRefreshJob listening on queue "product-refresh"');
console.log('[worker] NicheResearcherJob listening on queue "niche-research"');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received — closing workers');
  await Promise.all([
    generateWorker.close(),
    deployWorker.close(),
    sslPollerWorker.close(),
    analyticsWorker.close(),
    productRefreshWorker.close(),
    nicheResearcherWorker.close(),
  ]);
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[worker] SIGINT received — closing workers');
  await Promise.all([
    generateWorker.close(),
    deployWorker.close(),
    sslPollerWorker.close(),
    analyticsWorker.close(),
    productRefreshWorker.close(),
    nicheResearcherWorker.close(),
  ]);
  process.exit(0);
});
