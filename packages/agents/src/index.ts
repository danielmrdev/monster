// Public API for @monster/agents
// Only exports what the admin panel needs: the queue factory.
// GenerateSiteJob is NOT exported here — it's only used by the standalone worker process.

export { generateQueue, createGenerateQueue, deployQueue, createDeployQueue, createRedisOptions, createRedisConnection, analyticsAggregationQueue, createAnalyticsAggregationQueue, productRefreshQueue, createProductRefreshQueue } from './queue.js';

// DataForSEO client — used by the worker internally, exported for tooling and smoke tests.
export type { DataForSEOProduct } from './clients/dataforseo.js';
export { DataForSEOClient } from './clients/dataforseo.js';

// Monster Chat — Agent SDK streaming client + MCP server
export type { StreamEvent, StreamOptions } from './clients/claude-sdk.js';
export { ClaudeSDKClient } from './clients/claude-sdk.js';
export { createMonsterMcpServer } from './mcp/monster-server.js';
