// Hand-written type declarations for @monster/agents public API.
// DTS generation disabled in tsup due to ioredis version conflict (D047).
// Source: packages/agents/types/index.d.ts — copied to dist/index.d.ts by postbuild.
// Update this file when new exports are added to src/index.ts.

// Queue factories
export declare function generateQueue(): import('bullmq').Queue;
export declare function createGenerateQueue(): import('bullmq').Queue;
export declare function deployQueue(): import('bullmq').Queue;
export declare function createDeployQueue(): import('bullmq').Queue;
export declare function analyticsAggregationQueue(): import('bullmq').Queue;
export declare function createAnalyticsAggregationQueue(): import('bullmq').Queue;
export declare function productRefreshQueue(): import('bullmq').Queue;
export declare function createProductRefreshQueue(): import('bullmq').Queue;
export declare function nicheResearchQueue(): import('bullmq').Queue;
export declare function createNicheResearchQueue(): import('bullmq').Queue;
export declare function createRedisOptions(): object;
export declare function createRedisConnection(): import('ioredis').Redis;

// NicheResearcher
export interface NicheResearchPayload {
  sessionId: string;
  nicheIdea: string;
  market: string;
}
export declare function enqueueNicheResearch(
  sessionId: string,
  nicheIdea: string,
  market: string,
): Promise<string | undefined>;

// DataForSEO
export interface DataForSEOProduct {
  asin: string;
  title: string;
  price: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  isPrime: boolean;
  isBestSeller: boolean;
  availability: 'available' | 'limited' | 'unavailable';
}
export declare class DataForSEOClient {
  searchProducts(keyword: string, market: string, depth?: number): Promise<DataForSEOProduct[]>;
  fetchAuthHeader(): Promise<string>;
}

// Monster Chat
export interface StreamEvent {
  type: 'text' | 'done' | 'error';
  text?: string;
  sessionId?: string;
  error?: string;
}
export interface StreamOptions {
  conversationId: string;
  agentSessionId?: string | null;
  mcpServer?: unknown;
}
export declare class ClaudeSDKClient {
  streamQuery(message: string, opts: StreamOptions): AsyncIterable<StreamEvent>;
}
export declare function createMonsterMcpServer(supabase: unknown): unknown;

// Agent prompts
export declare function getAgentPrompt(
  supabase: unknown,
  agentKey: string,
  promptType: string,
  fallback: string,
): Promise<string>;
export declare const AGENT_KEYS: {
  readonly CONTENT_GENERATOR: 'content_generator';
  readonly NICHE_RESEARCHER: 'niche_researcher';
  readonly MONSTER: 'monster';
};
export type AgentKey = 'content_generator' | 'niche_researcher' | 'monster';

// Amazon scraper
export interface ScrapedProduct {
  asin: string;
  title: string;
  price: number | null;
  rating: number | null;
  reviewCount: number | null;
  imageUrl: string | null;
  isPrime: boolean;
}
export declare class AmazonBlockedError extends Error {
  name: 'AmazonBlockedError';
}
export declare class AmazonScraper {
  search(keyword: string, market?: string, page?: number): Promise<ScrapedProduct[]>;
}
