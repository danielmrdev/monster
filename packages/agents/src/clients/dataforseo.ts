import { createServiceClient } from "@monster/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataForSEOProduct {
  asin: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  /** Original (before-discount) price derived from percentage_discount on ASIN lookup. Null from keyword search. */
  originalPrice: number | null;
  rating: number;
  reviewCount: number;
  isPrime: boolean;
  isBestSeller: boolean;
  isAmazonChoice: boolean;
  /** Estimated units bought in the past month. Null if not reported by Amazon. */
  boughtPastMonth: number | null;
  /** Active promotions/coupons, e.g. ["Ahorra 10,00 € con un cupón"]. Empty array if none. */
  specialOffers: string[];
  /** 1-based position in the organic SERP. Useful for ranking context. */
  rankPosition: number | null;
}

interface MarketConfig {
  location_code: number;
  language_code: string;
  se_domain: string;
}

// ---------------------------------------------------------------------------
// Market config lookup
// DataForSEO location/language codes for each Amazon market.
// Source: S02-RESEARCH.md, DataForSEO docs.
// ---------------------------------------------------------------------------

const MARKET_CONFIG: Record<string, MarketConfig> = {
  ES: { location_code: 2724, language_code: "es_ES", se_domain: "amazon.es" },
  US: { location_code: 2840, language_code: "en_US", se_domain: "amazon.com" },
  UK: { location_code: 2826, language_code: "en_GB", se_domain: "amazon.co.uk" },
  DE: { location_code: 2158, language_code: "de_DE", se_domain: "amazon.de" },
  FR: { location_code: 2250, language_code: "fr_FR", se_domain: "amazon.fr" },
  IT: { location_code: 2380, language_code: "it_IT", se_domain: "amazon.it" },
};

// ---------------------------------------------------------------------------
// Labs language codes — 2-letter codes required by DataForSEO Labs/SERP APIs.
// IMPORTANT: Labs endpoints reject 4-letter codes like 'es_ES' (Merchant format).
// Always use this map for keywordIdeas / serpCompetitors / googleSerpResults.
// ---------------------------------------------------------------------------
const LABS_LANGUAGE_CODE: Record<string, string> = {
  ES: "es",
  US: "en",
  UK: "en",
  DE: "de",
  FR: "fr",
  IT: "it",
};

// ---------------------------------------------------------------------------
// Labs / SERP response types (local — not exported; consumers get typed arrays)
// ---------------------------------------------------------------------------

export interface KeywordIdea {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null; // 0–1
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

// ---------------------------------------------------------------------------
// DataForSEO raw response shape (typed minimally — all fields nullable)
// ---------------------------------------------------------------------------

interface DFSRawRating {
  value?: string | null;
  votes_count?: number | null;
}

interface DFSRawDeliveryInfo {
  is_free_delivery?: boolean | null;
}

interface DFSRawItem {
  type?: string | null;
  rank_group?: number | null;
  data_asin?: string | null;
  title?: string | null;
  image_url?: string | null;
  price_from?: number | null;
  rating?: DFSRawRating | null;
  is_prime?: boolean | null;
  delivery_info?: DFSRawDeliveryInfo | null;
  is_best_seller?: boolean | null;
  is_amazon_choice?: boolean | null;
  bought_past_month?: number | null;
  special_offers?: string[] | null;
}

interface DFSRawResult {
  items?: DFSRawItem[] | null;
}

interface DFSRawTask {
  id?: string | null;
  result?: DFSRawResult[] | null;
}

interface DFSRawResponse {
  tasks?: DFSRawTask[] | null;
}

// Flag so raw items[0] is logged only once per process lifetime.
let _rawItemsLogged = false;

// ---------------------------------------------------------------------------
// DataForSEOClient
// ---------------------------------------------------------------------------

export class DataForSEOClient {
  private static readonly BASE_URL = "https://api.dataforseo.com/v3";
  private static readonly MAX_POLL_ATTEMPTS = 12;

  // ── Credentials ──────────────────────────────────────────────────────────

  /**
   * Reads DataForSEO credentials from Supabase `settings` table (D028 pattern).
   * Stored as `{ value: "email:password" }`.
   * Returns the base64-encoded value suitable for `Authorization: Basic <token>`.
   * Throws descriptively if not configured.
   */
  private async fetchAuthHeader(): Promise<string> {
    const db = createServiceClient();
    const { data, error } = await db
      .from("settings")
      .select("value")
      .eq("key", "dataforseo_api_key")
      .single();

    if (error || !data) {
      throw new Error(
        "DataForSEO credentials not configured — add dataforseo_api_key in admin Settings",
      );
    }

    const creds = (data.value as { value: string }).value;
    if (!creds || typeof creds !== "string" || !creds.includes(":")) {
      throw new Error(
        'DataForSEO credentials malformed — expected "email:password" format in dataforseo_api_key settings value',
      );
    }

    const token = Buffer.from(creds).toString("base64");
    return `Basic ${token}`;
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  private async apiPost<T>(path: string, auth: string, body: unknown): Promise<T> {
    const res = await fetch(`${DataForSEOClient.BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DataForSEO POST ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private async apiGet<T>(path: string, auth: string): Promise<T> {
    const res = await fetch(`${DataForSEOClient.BASE_URL}${path}`, {
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`DataForSEO GET ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Sleep helper ─────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Poll tasks_ready until taskId appears ─────────────────────────────────

  /**
   * Polls a tasks_ready endpoint until `taskId` appears or max attempts exceeded.
   * Shared by searchProducts (products/tasks_ready) and lookupAsin (asin/tasks_ready).
   */
  private async awaitTask(
    tasksReadyPath: string,
    auth: string,
    taskId: string,
    label: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < DataForSEOClient.MAX_POLL_ATTEMPTS; attempt++) {
      const delay = 5000 * Math.pow(2, Math.min(attempt, 3));
      await this.sleep(delay);

      const readyResponse = await this.apiGet<DFSRawResponse>(tasksReadyPath, auth);
      const readyTasks = readyResponse?.tasks ?? [];

      for (const task of readyTasks) {
        for (const result of task.result ?? []) {
          if ((result as unknown as { id?: string }).id === taskId) {
            console.log(`[DataForSEO] task ready after ${attempt + 1} attempt(s) ${label}`);
            return;
          }
        }
      }
    }

    throw new Error(
      `DataForSEO task ${taskId} did not complete within timeout (${DataForSEOClient.MAX_POLL_ATTEMPTS} attempts) ${label}`,
    );
  }

  // ── Core search ──────────────────────────────────────────────────────────

  /**
   * Search Amazon products for a keyword in the given market.
   *
   * Full async flow: task_post → poll tasks_ready → task_get/advanced.
   * Credentials read from Supabase at call time (not cached — D028).
   *
   * @param keyword - The search keyword (e.g. "freidoras de aire")
   * @param market  - AMAZON_MARKETS slug (e.g. "ES", "US")
   * @returns Array of mapped DataForSEOProduct. Throws if zero usable results.
   */
  async searchProducts(keyword: string, market: string, depth = 30): Promise<DataForSEOProduct[]> {
    const config = MARKET_CONFIG[market];
    if (!config) {
      throw new Error(
        `DataForSEO: unknown market "${market}". Supported: ${Object.keys(MARKET_CONFIG).join(", ")}`,
      );
    }

    const auth = await this.fetchAuthHeader();

    // ── Step 1: task_post ──────────────────────────────────────────────────
    const postBody = [
      {
        keyword,
        location_code: config.location_code,
        language_code: config.language_code,
        se_domain: config.se_domain,
        depth,
      },
    ];

    const postResponse = await this.apiPost<DFSRawResponse>(
      "/merchant/amazon/products/task_post",
      auth,
      postBody,
    );

    const taskId = postResponse?.tasks?.[0]?.id;
    if (!taskId) {
      throw new Error(`DataForSEO task_post did not return a task ID for keyword: "${keyword}"`);
    }

    console.log(`[DataForSEO] task_post id=${taskId} keyword="${keyword}"`);

    // ── Step 2: poll tasks_ready ───────────────────────────────────────────
    await this.awaitTask(
      "/merchant/amazon/products/tasks_ready",
      auth,
      taskId,
      `keyword="${keyword}"`,
    );

    // ── Step 3: task_get/advanced ──────────────────────────────────────────
    const getResponse = await this.apiGet<DFSRawResponse>(
      `/merchant/amazon/products/task_get/advanced/${taskId}`,
      auth,
    );

    const rawItems: DFSRawItem[] = getResponse?.tasks?.[0]?.result?.[0]?.items ?? [];

    // Log raw items[0] once per process for shape validation (D035 observability)
    if (!_rawItemsLogged && rawItems.length > 0) {
      _rawItemsLogged = true;
      console.log(
        "[DataForSEO] items[0] shape (first call only):",
        JSON.stringify(rawItems[0], null, 2),
      );
    }

    // ── Step 4: filter + map ───────────────────────────────────────────────
    const products: DataForSEOProduct[] = [];

    for (const item of rawItems) {
      // Only organic Amazon SERP results — skip paid, editorial, related_searches
      if (item.type !== "amazon_serp") continue;

      const asin = item.data_asin ?? "";
      if (!asin) continue; // skip items with no ASIN

      products.push({
        asin,
        title: item.title ?? "",
        imageUrl: item.image_url ?? null,
        price: item.price_from ?? null,
        originalPrice: null, // not available from keyword search — populated by lookupAsin()
        rating: parseFloat(String(item.rating?.value ?? "0")),
        reviewCount: item.rating?.votes_count ?? 0,
        isPrime: item.is_prime ?? item.delivery_info?.is_free_delivery ?? false,
        isBestSeller: item.is_best_seller ?? false,
        isAmazonChoice: item.is_amazon_choice ?? false,
        boughtPastMonth: item.bought_past_month ?? null,
        specialOffers: item.special_offers ?? [],
        rankPosition: item.rank_group ?? null,
      });
    }

    if (products.length === 0) {
      throw new Error(`DataForSEO returned zero usable products for keyword: "${keyword}"`);
    }

    return products;
  }

  // ── ASIN lookup (individual product detail) ──────────────────────────────

  /**
   * Look up a single ASIN on the Amazon Merchant API to get price and percentage_discount.
   *
   * Uses async task flow: asin/task_post → poll tasks_ready → asin/task_get/advanced.
   * The ASIN endpoint returns `percentage_discount` which the keyword-search endpoint does not.
   * We derive originalPrice = price / (1 - pct/100) when discount > 0.
   *
   * Returns null if the ASIN is not found or DFS returns no item.
   * Does NOT throw on not-found — callers should handle null gracefully.
   */
  async lookupAsin(
    asin: string,
    market: string,
  ): Promise<{ price: number | null; originalPrice: number | null } | null> {
    const config = MARKET_CONFIG[market];
    if (!config) {
      throw new Error(`DataForSEO: unknown market "${market}"`);
    }

    const auth = await this.fetchAuthHeader();

    // Step 1: POST task
    interface AsinTaskResponse {
      tasks?: Array<{ id?: string | null }> | null;
    }
    const postBody = [
      {
        asin,
        location_code: config.location_code,
        language_code: config.language_code,
        se_domain: config.se_domain,
      },
    ];
    const postResp = await this.apiPost<AsinTaskResponse>(
      "/merchant/amazon/asin/task_post",
      auth,
      postBody,
    );
    const taskId = postResp?.tasks?.[0]?.id;
    if (!taskId) throw new Error(`[DataForSEO] lookupAsin(${asin}): no task_id in response`);

    // Step 2: Poll tasks_ready
    await this.awaitTask("/merchant/amazon/asin/tasks_ready", auth, taskId, `asin=${asin}`);

    // Step 3: GET results
    interface AsinItem {
      price_from?: number | null;
      price_to?: number | null;
      percentage_discount?: number | null;
    }
    interface AsinGetResponse {
      tasks?: Array<{ result?: Array<{ items?: AsinItem[] | null }> | null }> | null;
    }
    const getResp = await this.apiGet<AsinGetResponse>(
      `/merchant/amazon/asin/task_get/advanced/${taskId}`,
      auth,
    );
    const item = getResp?.tasks?.[0]?.result?.[0]?.items?.[0] ?? null;

    if (!item) {
      console.log(`[DataForSEO] lookupAsin(${asin}) market=${market}: no item returned`);
      return null;
    }

    const price = item.price_from ?? null;
    const pct = item.percentage_discount ?? null;

    // Derive original price: if discount % known and price exists, back-calculate
    let originalPrice: number | null = null;
    if (price !== null && pct !== null && pct > 0) {
      originalPrice = Math.round((price / (1 - pct / 100)) * 100) / 100;
    }

    return { price, originalPrice };
  }

  // ── Labs: keyword ideas (live endpoint) ─────────────────────────────────

  /**
   * Fetch keyword ideas for a seed keyword via DataForSEO Labs (live endpoint).
   *
   * Uses 2-letter language code from LABS_LANGUAGE_CODE — NOT MARKET_CONFIG.language_code.
   * Returns up to 20 keyword ideas with search_volume, cpc, competition.
   * Returns [] on empty/missing items without throwing.
   *
   * @param keyword - Seed keyword (e.g. "freidoras de aire")
   * @param market  - AMAZON_MARKETS slug (e.g. "ES")
   */
  async keywordIdeas(keyword: string, market: string): Promise<KeywordIdea[]> {
    const config = MARKET_CONFIG[market];
    const langCode = LABS_LANGUAGE_CODE[market];
    if (!config || !langCode) {
      throw new Error(`DataForSEO: unknown market "${market}" for Labs keywordIdeas`);
    }

    const auth = await this.fetchAuthHeader();
    const body = [
      {
        keywords: [keyword],
        location_code: config.location_code,
        language_code: langCode,
        limit: 20,
      },
    ];

    const response = await this.apiPost<DFSRawResponse>(
      "/dataforseo_labs/google/keyword_ideas/live",
      auth,
      body,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawItems: any[] = (response as any)?.tasks?.[0]?.result?.[0]?.items ?? [];

    if (rawItems.length === 0) {
      console.log(`[dataforseo] keywordIdeas empty result keyword="${keyword}" market=${market}`);
      return [];
    }

    const ideas: KeywordIdea[] = rawItems.map((item: Record<string, unknown>) => ({
      keyword: String(item["keyword"] ?? ""),
      search_volume:
        ((item["keyword_info"] as Record<string, unknown> | null)?.["search_volume"] as
          | number
          | null) ?? null,
      cpc:
        ((item["keyword_info"] as Record<string, unknown> | null)?.["cpc"] as number | null) ??
        null,
      competition:
        ((item["keyword_info"] as Record<string, unknown> | null)?.["competition"] as
          | number
          | null) ?? null,
    }));

    console.log(
      `[dataforseo] keywordIdeas keyword="${keyword}" market=${market} items=${ideas.length}`,
    );
    return ideas;
  }

  // ── Labs: SERP competitors (live endpoint) ───────────────────────────────

  /**
   * Fetch top SERP competitor domains for a set of keywords (live endpoint).
   *
   * @param keywords - Array of seed keywords
   * @param market   - AMAZON_MARKETS slug (e.g. "ES")
   */
  async serpCompetitors(keywords: string[], market: string): Promise<SerpCompetitor[]> {
    const config = MARKET_CONFIG[market];
    const langCode = LABS_LANGUAGE_CODE[market];
    if (!config || !langCode) {
      throw new Error(`DataForSEO: unknown market "${market}" for Labs serpCompetitors`);
    }

    const auth = await this.fetchAuthHeader();
    const body = [
      {
        keywords,
        location_code: config.location_code,
        language_code: langCode,
        limit: 10,
      },
    ];

    const response = await this.apiPost<DFSRawResponse>(
      "/dataforseo_labs/google/serp_competitors/live",
      auth,
      body,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawItems: any[] = (response as any)?.tasks?.[0]?.result?.[0]?.items ?? [];

    if (rawItems.length === 0) {
      console.log(`[dataforseo] serpCompetitors empty result market=${market}`);
      return [];
    }

    const competitors: SerpCompetitor[] = rawItems.map((item: Record<string, unknown>) => ({
      domain: String(item["domain"] ?? ""),
      median_position: (item["median_position"] as number | null) ?? null,
      avg_position: (item["avg_position"] as number | null) ?? null,
      competitor_metrics: (item["competitor_metrics"] as Record<string, unknown> | null) ?? null,
    }));

    console.log(`[dataforseo] serpCompetitors market=${market} items=${competitors.length}`);
    return competitors;
  }

  // ── SERP: Google organic results (live endpoint) ─────────────────────────

  /**
   * Fetch top 10 Google organic SERP results for a keyword (live endpoint).
   *
   * Filters by type === 'organic'. Returns [] on empty/missing items.
   *
   * @param keyword - Search keyword
   * @param market  - AMAZON_MARKETS slug (e.g. "ES")
   */
  async googleSerpResults(keyword: string, market: string): Promise<SerpResult[]> {
    const config = MARKET_CONFIG[market];
    const langCode = LABS_LANGUAGE_CODE[market];
    if (!config || !langCode) {
      throw new Error(`DataForSEO: unknown market "${market}" for SERP googleSerpResults`);
    }

    const auth = await this.fetchAuthHeader();
    const body = [
      {
        keyword,
        location_code: config.location_code,
        language_code: langCode,
        os: "desktop",
        depth: 10,
      },
    ];

    const response = await this.apiPost<DFSRawResponse>(
      "/serp/google/organic/live/regular",
      auth,
      body,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allItems: any[] = (response as any)?.tasks?.[0]?.result?.[0]?.items ?? [];
    const rawItems = allItems.filter((item: Record<string, unknown>) => item["type"] === "organic");

    if (rawItems.length === 0) {
      console.log(
        `[dataforseo] googleSerpResults empty result keyword="${keyword}" market=${market}`,
      );
      return [];
    }

    const results: SerpResult[] = rawItems.map((item: Record<string, unknown>) => ({
      domain: String(item["domain"] ?? ""),
      url: String(item["url"] ?? ""),
      title: String(item["title"] ?? ""),
      description: (item["description"] as string | null) ?? null,
      rank_group: (item["rank_group"] as number) ?? 0,
    }));

    console.log(
      `[dataforseo] googleSerpResults keyword="${keyword}" market=${market} items=${results.length}`,
    );
    return results;
  }
}
