// DataForSEO postback IPs (v3)
// Source: https://dataforseo.com/help-center/pingbacks-postbacks-with-dataforseo-api
const DFS_IPS = new Set([
  "144.76.154.130",
  "144.76.153.113",
  "144.76.153.106",
  "94.130.155.89",
  "178.63.193.217",
  "94.130.93.29",
]);

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// ── CachedProduct shape (matches admin app) ──────────────────────────────────

interface CachedProduct {
  asin: string;
  title: string;
  imageUrl: string | null;
  price: number | null;
  rating: number;
  reviewCount: number;
  isPrime: boolean;
  isBestSeller: boolean;
  isAmazonChoice: boolean;
  boughtPastMonth: number | null;
  specialOffers: string[];
  rankPosition: number | null;
}

function mapItem(item: Record<string, unknown>): CachedProduct | null {
  if ((item.type as string) !== "amazon_serp") return null;
  const rating = item.rating as Record<string, unknown> | null;
  return {
    asin: (item.data_asin as string) ?? "",
    title: (item.title as string) ?? "",
    imageUrl: (item.image_url as string) ?? null,
    price: (item.price_from as number) ?? null,
    rating: (rating?.value as number) ?? 0,
    reviewCount: (rating?.votes_count as number) ?? 0,
    isPrime: !!(item.is_prime ?? item.delivery_info),
    isBestSeller: !!item.is_best_seller,
    isAmazonChoice: !!item.is_amazon_choice,
    boughtPastMonth: (item.bought_past_month as number) ?? null,
    specialOffers: Array.isArray(item.special_offers) ? (item.special_offers as string[]) : [],
    rankPosition: (item.rank_position as number) ?? null,
  };
}

// ── Market derivation from se_domain ─────────────────────────────────────────

function deriveMarket(seDomain: string): string {
  if (seDomain.includes(".es")) return "ES";
  if (seDomain.includes(".co.uk")) return "UK";
  if (seDomain.includes(".de")) return "DE";
  if (seDomain.includes(".fr")) return "FR";
  if (seDomain.includes(".it")) return "IT";
  return "US";
}

// ── Worker handler ───────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Validate source IP (CF-Connecting-IP = real client IP behind Cloudflare)
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "";
    if (!DFS_IPS.has(clientIp)) {
      console.log(`[dfs-postback] rejected IP: ${clientIp}`);
      return new Response("Forbidden", { status: 403 });
    }

    try {
      // DFS sends gzip-compressed JSON — Workers auto-decompress
      const payload = (await request.json()) as Record<string, unknown>;
      const tasks = (payload.tasks ?? []) as Array<Record<string, unknown>>;

      if (tasks.length === 0) {
        return new Response("No tasks in payload", { status: 400 });
      }

      for (const task of tasks) {
        const taskId = task.id as string;
        const tag = (task.tag as string) ?? ""; // tag = siteId
        const result = ((task.result ?? []) as Array<Record<string, unknown>>)[0];
        if (!result) continue;

        const keyword = (result.keyword as string) ?? "";
        const seDomain = (result.se_domain as string) ?? "";
        const items = (result.items ?? []) as Array<Record<string, unknown>>;

        const products = items
          .map(mapItem)
          .filter((p): p is CachedProduct => p !== null && p.asin !== "");

        const market = deriveMarket(seDomain);
        const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

        // Atomic upsert via PostgREST (UNIQUE constraint on keyword,market)
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/dfs_search_cache`, {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            keyword: keyword.toLowerCase(),
            market,
            depth: items.length,
            results: products,
            status: "complete",
            site_id: tag || null,
            expires_at: expiresAt,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`[dfs-postback] upsert failed taskId=${taskId}: ${res.status} ${errText}`);
        } else {
          console.log(
            `[dfs-postback] taskId=${taskId} keyword="${keyword}" market=${market} products=${products.length}`,
          );
        }
      }

      return new Response("OK", { status: 200 });
    } catch (err) {
      console.error("[dfs-postback] error:", err);
      return new Response("Internal error", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
