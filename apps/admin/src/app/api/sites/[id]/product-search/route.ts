import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DataForSEOClient } from "@monster/agents";
import { enqueueProductSeo } from "@/app/(dashboard)/sites/[id]/seo/actions";

// DataForSEO Merchant API uses async task flow (task_post → poll → task_get).
// Allow up to 60s for the polling to complete.
export const maxDuration = 60;

// Cache TTL: 7 days
const CACHE_TTL_DAYS = 7;

interface Params {
  params: Promise<{ id: string }>;
}

export interface SearchResultItem {
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
  /** Whether this ASIN already exists in the site */
  alreadyAdded: boolean;
}

// Shape stored in dfs_search_cache.results (without alreadyAdded — that's per-site)
type CachedProduct = Omit<SearchResultItem, "alreadyAdded">;

/**
 * GET /api/sites/[id]/product-search?q=<keyword>&depth=<100|200|300|400>
 *
 * Searches Amazon via DataForSEO Merchant API with a 7-day cache keyed by
 * (keyword, market). If the cache has >= requested depth, returns immediately
 * without hitting DFS. Otherwise calls DFS and updates the cache.
 *
 * depth is 100–400 in steps of 100 (default 100).
 * Returns { results, market, depth, fromCache: boolean }.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const depthParam = parseInt(request.nextUrl.searchParams.get("depth") ?? "100", 10);
  const depth = Math.min(
    400,
    Math.max(100, isNaN(depthParam) ? 100 : Math.ceil(depthParam / 100) * 100),
  );

  if (!q) {
    return NextResponse.json({ error: "q query param required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: site, error: siteError } = await supabase
    .from("sites")
    .select("market")
    .eq("id", siteId)
    .single();

  if (siteError || !site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const market = (site.market ?? "ES").toUpperCase();

  // ── Cache lookup ────────────────────────────────────────────────────────────
  const { data: cacheRow } = await supabase
    .from("dfs_search_cache")
    .select("depth, results, expires_at")
    .eq("keyword", q.toLowerCase())
    .eq("market", market)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  let cachedProducts: CachedProduct[] | null = null;
  let fromCache = false;

  if (cacheRow && cacheRow.depth >= depth) {
    // Cache hit — slice to requested depth
    cachedProducts = (cacheRow.results as CachedProduct[]).slice(0, depth);
    fromCache = true;
    console.log(
      `[product-search] CACHE HIT siteId=${siteId} q="${q}" market=${market} depth=${depth} cached_depth=${cacheRow.depth}`,
    );
  }

  // ── DFS fetch (cache miss or stale) ────────────────────────────────────────
  if (!cachedProducts) {
    try {
      const client = new DataForSEOClient();
      const dfsProducts = await client.searchProducts(q, market, depth);

      cachedProducts = dfsProducts.map((p) => ({
        asin: p.asin,
        title: p.title,
        imageUrl: p.imageUrl,
        price: p.price,
        rating: p.rating ?? 0,
        reviewCount: p.reviewCount ?? 0,
        isPrime: p.isPrime,
        isBestSeller: p.isBestSeller,
        isAmazonChoice: p.isAmazonChoice,
        boughtPastMonth: p.boughtPastMonth,
        specialOffers: p.specialOffers,
        rankPosition: p.rankPosition,
      }));

      // Upsert cache (update if keyword+market exists with more depth, insert otherwise)
      const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 86_400_000).toISOString();
      if (cacheRow) {
        // Existing row but stale/shallower — replace results and reset TTL
        await supabase
          .from("dfs_search_cache")
          .update({ depth, results: cachedProducts, expires_at: expiresAt })
          .eq("keyword", q.toLowerCase())
          .eq("market", market);
      } else {
        await supabase.from("dfs_search_cache").insert({
          keyword: q.toLowerCase(),
          market,
          depth,
          results: cachedProducts,
          expires_at: expiresAt,
        });
      }

      console.log(
        `[product-search] DFS FETCH siteId=${siteId} q="${q}" market=${market} depth=${depth} results=${cachedProducts.length}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[product-search] siteId=${siteId} q="${q}" error=${message}`);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // ── Merge alreadyAdded (always per-site, never cached) ─────────────────────
  const { data: existing } = await supabase
    .from("tsa_products")
    .select("asin")
    .eq("site_id", siteId);

  const existingAsins = new Set((existing ?? []).map((r) => r.asin));

  const results: SearchResultItem[] = cachedProducts.map((p) => ({
    ...p,
    alreadyAdded: existingAsins.has(p.asin),
  }));

  return NextResponse.json({ results, market, depth, fromCache });
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

interface BulkAddBody {
  products: SearchResultItem[];
  categoryIds: string[];
}

/**
 * POST /api/sites/[id]/product-search
 *
 * Bulk-inserts an array of products from search results.
 * Skips ASINs that already exist (no error — idempotent).
 * Optionally links to categories via category_products.
 * Auto-enqueues seo_product BullMQ job for each inserted product.
 *
 * Body: { products: SearchResultItem[], categoryIds: string[] }
 * Returns: { added: number, skipped: number, seoJobsQueued: number }
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;

  let body: BulkAddBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { products, categoryIds = [] } = body;

  if (!Array.isArray(products) || products.length === 0) {
    return NextResponse.json({ error: "products array required" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: site } = await supabase.from("sites").select("id").eq("id", siteId).single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const { data: existing } = await supabase
    .from("tsa_products")
    .select("asin")
    .eq("site_id", siteId);

  const existingAsins = new Set((existing ?? []).map((r) => r.asin));
  const toInsert = products.filter((p) => !existingAsins.has(p.asin));
  let added = 0;
  const skipped = products.length - toInsert.length;

  if (toInsert.length === 0) {
    return NextResponse.json({ added: 0, skipped, seoJobsQueued: 0 });
  }

  const insertedIds: string[] = [];

  for (const p of toInsert) {
    const slug = slugify(p.title || p.asin);
    const { data: row, error } = await supabase
      .from("tsa_products")
      .insert({
        site_id: siteId,
        asin: p.asin,
        title: p.title,
        slug,
        current_price: p.price,
        rating: p.rating,
        review_count: p.reviewCount,
        is_prime: p.isPrime,
        source_image_url: p.imageUrl,
        is_amazon_choice: p.isAmazonChoice,
        bought_past_month: p.boughtPastMonth,
        special_offers: p.specialOffers,
        rank_position: p.rankPosition,
      })
      .select("id")
      .single();

    if (!error && row) {
      insertedIds.push(row.id);
      added++;
    } else if (error?.code === "23505") {
      // Race condition — skip silently
    } else if (error) {
      console.error(`[product-search/bulk-add] ASIN=${p.asin} error=${error.message}`);
    }
  }

  if (categoryIds.length > 0 && insertedIds.length > 0) {
    const links = insertedIds.flatMap((productId, pIdx) =>
      categoryIds.map((categoryId, cIdx) => ({
        category_id: categoryId,
        product_id: productId,
        position: pIdx * categoryIds.length + cIdx,
      })),
    );
    await supabase.from("category_products").insert(links);
  }

  const primaryCategoryId = categoryIds[0] ?? "";
  if (insertedIds.length > 0) {
    for (const productId of insertedIds) {
      enqueueProductSeo(siteId, productId, primaryCategoryId).catch((err) => {
        console.error(
          `[product-search/bulk-add] SEO enqueue failed productId=${productId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    console.log(`[product-search/bulk-add] enqueued SEO jobs for ${insertedIds.length} products`);
  }

  return NextResponse.json({ added, skipped, seoJobsQueued: insertedIds.length });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
