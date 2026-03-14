/**
 * Standalone worker entrypoint.
 * Run with: node packages/agents/dist/worker.js
 *
 * Reads env vars from process.env — caller is responsible for
 * loading .env before starting this process (e.g. via dotenv or pm2 env_file).
 */
import 'dotenv/config';
import { GenerateSiteJob } from './jobs/generate-site.js';

const job = new GenerateSiteJob();
const worker = job.register();

console.log('[worker] GenerateSiteJob listening on queue "generate"');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received — closing worker');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[worker] SIGINT received — closing worker');
  await worker.close();
  process.exit(0);
});
