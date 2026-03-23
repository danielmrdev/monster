// Hand-written type declarations for @monster/agents public API.
// DTS generation disabled in tsup due to ioredis version conflict (D047).
// Source: packages/agents/types/index.d.ts — copied to dist/index.d.ts by postbuild.
// Update this file when new exports are added to src/index.ts.

// Queue factories
export declare function generateQueue(): import("bullmq").Queue;
export declare function createGenerateQueue(): import("bullmq").Queue;
export declare function deployQueue(): import("bullmq").Queue;
export declare function createDeployQueue(): import("bullmq").Queue;
export declare function analyticsAggregationQueue(): import("bullmq").Queue;
export declare function createAnalyticsAggregationQueue(): import("bullmq").Queue;
export declare function productRefreshQueue(): import("bullmq").Queue;
export declare function createProductRefreshQueue(): import("bullmq").Queue;
export declare function nicheResearchQueue(): import("bullmq").Queue;
export declare function createNicheResearchQueue(): import("bullmq").Queue;
export declare function seoContentQueue(): import("bullmq").Queue;
export declare function createSeoContentQueue(): import("bullmq").Queue;
export declare function createRedisOptions(): object;
export declare function createRedisConnection(): import("ioredis").Redis;

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
export interface DFSRawItem {
  type?: string | null;
  rank_group?: number | null;
  data_asin?: string | null;
  title?: string | null;
  image_url?: string | null;
  price_from?: number | null;
  rating?: { value?: string | null; votes_count?: number | null } | null;
  is_prime?: boolean | null;
  delivery_info?: { is_free_delivery?: boolean | null } | null;
  is_best_seller?: boolean | null;
  is_amazon_choice?: boolean | null;
  bought_past_month?: number | null;
  special_offers?: string[] | null;
  rank_position?: number | null;
}

export interface KeywordIdea {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
}

export interface SerpCompetitor {
  domain: string;
  median_position: number | null;
  avg_position: number | null;
  competitor_metrics: Record<string, unknown> | null;
}

export interface SerpResult {
  domain: string;
  url: string;
  title: string;
  description: string | null;
  rank_group: number;
}

export interface DataForSEOProduct {
  asin: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  originalPrice: number | null;
  rating: number;
  reviewCount: number;
  isPrime: boolean;
  isBestSeller: boolean;
  isAmazonChoice: boolean;
  boughtPastMonth: number | null;
  specialOffers: string[];
  rankPosition: number | null;
}
export declare class DataForSEOClient {
  searchProducts(
    keyword: string,
    market: string,
    depth?: number,
    siteId?: string | null,
  ): Promise<DataForSEOProduct[]>;
  postSearchTask(
    keyword: string,
    market: string,
    depth?: number,
    siteId?: string | null,
  ): Promise<{ taskId: string }>;
  pollSearchTask(
    taskId: string,
    keyword: string,
    market: string,
    timeoutMs?: number,
  ): Promise<DataForSEOProduct[] | null>;
  searchProductsInline(
    keyword: string,
    market: string,
    depth?: number,
    timeoutMs?: number,
    siteId?: string | null,
  ): Promise<{ taskId: string; products: DataForSEOProduct[] | null }>;
  collectReadyTask(
    dfsTaskId: string,
  ): Promise<{ items: DFSRawItem[]; keyword: string; seDomain: string } | null>;
  lookupAsin(
    asin: string,
    market: string,
    siteId?: string | null,
  ): Promise<{ price: number | null; originalPrice: number | null } | null>;
  getAccountBalance(): Promise<number | null>;
  keywordIdeas(keyword: string, market: string): Promise<KeywordIdea[]>;
  serpCompetitors(keywords: string[], market: string): Promise<SerpCompetitor[]>;
  googleSerpResults(keyword: string, market: string): Promise<SerpResult[]>;
}

// Monster Chat
export interface StreamEvent {
  type: "text" | "done" | "error";
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
  readonly CONTENT_GENERATOR: "content_generator";
  readonly NICHE_RESEARCHER: "niche_researcher";
  readonly MONSTER: "monster";
};
export type AgentKey = "content_generator" | "niche_researcher" | "monster";

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
  name: "AmazonBlockedError";
}
export declare class AmazonScraper {
  search(keyword: string, market?: string, page?: number): Promise<ScrapedProduct[]>;
}

// SEO Content Job
export interface SeoContentPayload {
  siteId: string;
  jobType: "seo_homepage" | "seo_category" | "seo_product" | "seo_products_batch";
  categoryId?: string;
  productId?: string;
}
export declare function enqueueSeoContent(
  siteId: string,
  jobType: SeoContentPayload["jobType"],
  opts?: { categoryId?: string; productId?: string },
): Promise<string | undefined>;

// SEO Scorer wrapper
export declare function scoreMarkdown(text: string, keyword: string, pageType: string): number;
