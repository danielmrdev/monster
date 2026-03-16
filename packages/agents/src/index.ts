// Public API for @monster/agents
// Only exports what the admin panel needs: the queue factory.
// GenerateSiteJob is NOT exported here — it's only used by the standalone worker process.

export { generateQueue, createGenerateQueue, deployQueue, createDeployQueue, createRedisOptions, createRedisConnection, analyticsAggregationQueue, createAnalyticsAggregationQueue, productRefreshQueue, createProductRefreshQueue, nicheResearchQueue, createNicheResearchQueue } from './queue.js';
import { nicheResearchQueue } from './queue.js';

// NicheResearcher — enqueue helper (NicheResearcherJob itself stays internal to worker — D048 pattern)
export type { NicheResearchPayload } from './jobs/niche-researcher.js';

export async function enqueueNicheResearch(sessionId: string, nicheIdea: string, market: string): Promise<string | undefined> {
  const queue = nicheResearchQueue();
  const job = await queue.add(
    'research',
    { sessionId, nicheIdea, market },
    { removeOnComplete: true, removeOnFail: false },
  );
  return job.id;
}

// DataForSEO client — used by the worker internally, exported for tooling and smoke tests.
export type { DataForSEOProduct } from './clients/dataforseo.js';
export { DataForSEOClient } from './clients/dataforseo.js';

// Monster Chat — Agent SDK streaming client + MCP server
export type { StreamEvent, StreamOptions } from './clients/claude-sdk.js';
export { ClaudeSDKClient } from './clients/claude-sdk.js';
export { createMonsterMcpServer } from './mcp/monster-server.js';

// Agent prompt helpers — DB-backed prompt overrides
export { getAgentPrompt, AGENT_KEYS } from './agent-prompts.js';
export type { AgentKey } from './agent-prompts.js';

// Amazon scraper — product search without DataForSEO
export { AmazonScraper, AmazonBlockedError } from './clients/amazon-scraper.js';
export type { ScrapedProduct } from './clients/amazon-scraper.js';
