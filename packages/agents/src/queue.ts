import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { RedisOptions } from 'ioredis';

/**
 * Build Redis connection options from REDIS_URL.
 * Supports both local (redis://) and TLS (rediss://) URLs.
 * Reads env vars at call time — not at module scope (D021).
 */
export function createRedisOptions(): RedisOptions {
  const url = process.env.REDIS_URL;

  if (!url) {
    throw new Error('Missing required environment variable: REDIS_URL');
  }

  const parsed = new URL(url);
  const isTls = parsed.protocol === 'rediss:';

  const options: RedisOptions = {
    host: parsed.hostname,
    port: parseInt(parsed.port || (isTls ? '6380' : '6379'), 10),
    // BullMQ requirement: never queue commands when disconnected
    enableOfflineQueue: false,
    maxRetriesPerRequest: null,
  };

  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }
  if (parsed.username && parsed.username !== 'default') {
    options.username = parsed.username;
  }
  if (isTls) {
    options.tls = { rejectUnauthorized: false };
  }

  return options;
}

/**
 * Create a new IORedis connection.
 * Each worker/queue should call this independently.
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

/**
 * BullMQ Queue for niche research jobs (one per research session, fire-and-forget).
 * Named 'niche-research' — matches the Worker name in NicheResearcherJob.
 */
export function createNicheResearchQueue(): Queue {
  const connection = createRedisConnection();
  return new Queue('niche-research', { connection });
}

let _nicheResearchQueue: Queue | null = null;

export function nicheResearchQueue(): Queue {
  if (!_nicheResearchQueue) {
    _nicheResearchQueue = createNicheResearchQueue();
  }
  return _nicheResearchQueue;
}
