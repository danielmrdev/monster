import { createServiceClient } from '@monster/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataForSEOProduct {
  asin: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  rating: number;
  reviewCount: number;
  isPrime: boolean;
  isBestSeller: boolean;
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
  ES: { location_code: 2724, language_code: 'es_ES', se_domain: 'amazon.es' },
  US: { location_code: 2840, language_code: 'en_US', se_domain: 'amazon.com' },
  UK: { location_code: 2826, language_code: 'en_GB', se_domain: 'amazon.co.uk' },
  DE: { location_code: 2158, language_code: 'de_DE', se_domain: 'amazon.de' },
  FR: { location_code: 2250, language_code: 'fr_FR', se_domain: 'amazon.fr' },
  IT: { location_code: 2380, language_code: 'it_IT', se_domain: 'amazon.it' },
};

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
  data_asin?: string | null;
  title?: string | null;
  image_url?: string | null;
  price_from?: number | null;
  rating?: DFSRawRating | null;
  is_prime?: boolean | null;
  delivery_info?: DFSRawDeliveryInfo | null;
  is_best_seller?: boolean | null;
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
  private static readonly BASE_URL = 'https://api.dataforseo.com/v3';
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
      .from('settings')
      .select('value')
      .eq('key', 'dataforseo_api_key')
      .single();

    if (error || !data) {
      throw new Error(
        'DataForSEO credentials not configured — add dataforseo_api_key in admin Settings'
      );
    }

    const creds = (data.value as { value: string }).value;
    if (!creds || typeof creds !== 'string' || !creds.includes(':')) {
      throw new Error(
        'DataForSEO credentials malformed — expected "email:password" format in dataforseo_api_key settings value'
      );
    }

    const token = Buffer.from(creds).toString('base64');
    return `Basic ${token}`;
  }

  // ── HTTP helpers ─────────────────────────────────────────────────────────

  private async apiPost<T>(path: string, auth: string, body: unknown): Promise<T> {
    const res = await fetch(`${DataForSEOClient.BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DataForSEO POST ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    return res.json() as Promise<T>;
  }

  private async apiGet<T>(path: string, auth: string): Promise<T> {
    const res = await fetch(`${DataForSEOClient.BASE_URL}${path}`, {
      headers: { Authorization: auth },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`DataForSEO GET ${path} failed: ${res.status} ${res.statusText} — ${text}`);
    }

    return res.json() as Promise<T>;
  }

  // ── Sleep helper ─────────────────────────────────────────────────────────

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
  async searchProducts(keyword: string, market: string): Promise<DataForSEOProduct[]> {
    const config = MARKET_CONFIG[market];
    if (!config) {
      throw new Error(
        `DataForSEO: unknown market "${market}". Supported: ${Object.keys(MARKET_CONFIG).join(', ')}`
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
        depth: 30,
      },
    ];

    const postResponse = await this.apiPost<DFSRawResponse>(
      '/merchant/amazon/products/task_post',
      auth,
      postBody
    );

    const taskId = postResponse?.tasks?.[0]?.id;
    if (!taskId) {
      throw new Error(
        `DataForSEO task_post did not return a task ID for keyword: "${keyword}"`
      );
    }

    console.log(`[DataForSEO] task_post id=${taskId} keyword="${keyword}"`);

    // ── Step 2: poll tasks_ready ───────────────────────────────────────────
    let taskReady = false;

    for (let attempt = 0; attempt < DataForSEOClient.MAX_POLL_ATTEMPTS; attempt++) {
      const delay = 5000 * Math.pow(2, Math.min(attempt, 3));
      await this.sleep(delay);

      const readyResponse = await this.apiGet<DFSRawResponse>(
        '/merchant/amazon/products/tasks_ready',
        auth
      );

      const readyTasks = readyResponse?.tasks ?? [];
      for (const task of readyTasks) {
        for (const result of task.result ?? []) {
          // tasks_ready returns result entries with `id` field
          if ((result as unknown as { id?: string }).id === taskId) {
            taskReady = true;
            break;
          }
        }
        if (taskReady) break;
      }

      if (taskReady) {
        console.log(`[DataForSEO] task ready after ${attempt + 1} attempt(s) keyword="${keyword}"`);
        break;
      }
    }

    if (!taskReady) {
      throw new Error(
        `DataForSEO task ${taskId} did not complete within timeout (${DataForSEOClient.MAX_POLL_ATTEMPTS} attempts)`
      );
    }

    // ── Step 3: task_get/advanced ──────────────────────────────────────────
    const getResponse = await this.apiGet<DFSRawResponse>(
      `/merchant/amazon/products/task_get/advanced/${taskId}`,
      auth
    );

    const rawItems: DFSRawItem[] = getResponse?.tasks?.[0]?.result?.[0]?.items ?? [];

    // Log raw items[0] once per process for shape validation (D035 observability)
    if (!_rawItemsLogged && rawItems.length > 0) {
      _rawItemsLogged = true;
      console.log('[DataForSEO] items[0] shape (first call only):', JSON.stringify(rawItems[0], null, 2));
    }

    // ── Step 4: filter + map ───────────────────────────────────────────────
    const products: DataForSEOProduct[] = [];

    for (const item of rawItems) {
      // Only organic Amazon SERP results — skip paid, editorial, related_searches
      if (item.type !== 'amazon_serp') continue;

      const asin = item.data_asin ?? '';
      if (!asin) continue; // skip items with no ASIN

      products.push({
        asin,
        title: item.title ?? '',
        imageUrl: item.image_url ?? null,
        price: item.price_from ?? null,
        rating: parseFloat(item.rating?.value ?? '0'),
        reviewCount: item.rating?.votes_count ?? 0,
        isPrime: item.is_prime ?? item.delivery_info?.is_free_delivery ?? false,
        isBestSeller: item.is_best_seller ?? false,
      });
    }

    if (products.length === 0) {
      throw new Error(`DataForSEO returned zero usable products for keyword: "${keyword}"`);
    }

    return products;
  }
}
