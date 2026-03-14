import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';

/**
 * Build the Upstash Redis connection options.
 * Reads env vars at call time — not at module scope (D021).
 * Upstash requires enableOfflineQueue:false + maxRetriesPerRequest:null.
 */
export function createRedisOptions(): RedisOptions {
  const url = process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_TOKEN;

  if (!url) {
    throw new Error('Missing required environment variable: UPSTASH_REDIS_URL');
  }
  if (!token) {
    throw new Error('Missing required environment variable: UPSTASH_REDIS_TOKEN');
  }

  // Expected format: rediss://:TOKEN@HOST:PORT
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6380', 10),
    password: token,
    tls: { rejectUnauthorized: false },
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
  };
}

/**
 * Create a new IORedis connection to Upstash.
 * Each worker should call this independently.
 */
export function createRedisConnection(): Redis {
  return new Redis(createRedisOptions());
}

/**
 * BullMQ Queue for site generation jobs.
 * Named 'generate' — matches the Worker name in GenerateSiteJob.
 */
export function createGenerateQueue(): Queue {
  const connection = createRedisConnection();
  return new Queue('generate', { connection });
}

// Singleton for use in the admin server action (short-lived Next.js process).
// The worker creates its own connection and does not use this.
let _queue: Queue | null = null;

export function generateQueue(): Queue {
  if (!_queue) {
    _queue = createGenerateQueue();
  }
  return _queue;
}

/**
 * BullMQ Queue for standalone site deploy jobs (re-deploys without regeneration).
 * Named 'deploy' — matches the Worker name in DeploySiteJob.
 */
export function createDeployQueue(): Queue {
  const connection = createRedisConnection();
  return new Queue('deploy', { connection });
}

let _deployQueue: Queue | null = null;

export function deployQueue(): Queue {
  if (!_deployQueue) {
    _deployQueue = createDeployQueue();
  }
  return _deployQueue;
}

/**
 * BullMQ Queue for SSL polling jobs (delayed re-enqueues, short-lived workers).
 * Named 'ssl-poller' — matches the Worker name in SslPollerJob.
 */
export function createSslPollerQueue(): Queue {
  const connection = createRedisConnection();
  return new Queue('ssl-poller', { connection });
}

let _sslPollerQueue: Queue | null = null;

export function sslPollerQueue(): Queue {
  if (!_sslPollerQueue) {
    _sslPollerQueue = createSslPollerQueue();
  }
  return _sslPollerQueue;
}

/**
 * BullMQ Queue for daily analytics aggregation jobs.
 * Named 'analytics-aggregation' — matches the Worker name in AnalyticsAggregationJob.
 */
export function createAnalyticsAggregationQueue(): Queue {
  const connection = createRedisConnection();
  return new Queue('analytics-aggregation', { connection });
}

let _analyticsAggregationQueue: Queue | null = null;

export function analyticsAggregationQueue(): Queue {
  if (!_analyticsAggregationQueue) {
    _analyticsAggregationQueue = createAnalyticsAggregationQueue();
  }
  return _analyticsAggregationQueue;
}

/**
 * BullMQ Queue for product refresh jobs (per-site, on configurable schedule).
 * Named 'product-refresh' — matches the Worker name in ProductRefreshJob.
 */
export function createProductRefreshQueue(): Queue {
  const connection = createRedisConnection();
  return new Queue('product-refresh', { connection });
}

let _productRefreshQueue: Queue | null = null;

export function productRefreshQueue(): Queue {
  if (!_productRefreshQueue) {
    _productRefreshQueue = createProductRefreshQueue();
  }
  return _productRefreshQueue;
}
