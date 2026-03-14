// Public API for @monster/agents
// Only exports what the admin panel needs: the queue factory.
// GenerateSiteJob is NOT exported here — it's only used by the standalone worker process.

export { generateQueue, createGenerateQueue, createRedisOptions, createRedisConnection } from './queue.js';
