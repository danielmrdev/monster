/**
 * Standalone worker entrypoint.
 * Run with: node packages/agents/dist/worker.js
 *
 * Reads env vars from process.env — caller is responsible for
 * loading .env before starting this process (e.g. via dotenv or pm2 env_file).
 */
import 'dotenv/config';
import { GenerateSiteJob } from './jobs/generate-site.js';
import { DeploySiteJob } from './jobs/deploy-site.js';
import { SslPollerJob } from './jobs/ssl-poller.js';
import { AnalyticsAggregationJob } from './jobs/analytics-aggregation.js';

const generateJob = new GenerateSiteJob();
const generateWorker = generateJob.register();

const deployJob = new DeploySiteJob();
const deployWorker = deployJob.register();

const sslPollerJob = new SslPollerJob();
const sslPollerWorker = sslPollerJob.register();

const analyticsJob = new AnalyticsAggregationJob();
await analyticsJob.registerScheduler();
const analyticsWorker = analyticsJob.register();

console.log('[worker] GenerateSiteJob listening on queue "generate"');
console.log('[worker] DeploySiteJob listening on queue "deploy"');
console.log('[worker] SslPollerJob listening on queue "ssl-poller"');
console.log('[worker] AnalyticsAggregationJob listening on queue "analytics-aggregation"');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received — closing workers');
  await Promise.all([
    generateWorker.close(),
    deployWorker.close(),
    sslPollerWorker.close(),
    analyticsWorker.close(),
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
  ]);
  process.exit(0);
});
