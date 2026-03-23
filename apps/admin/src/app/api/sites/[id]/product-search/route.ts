import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DataForSEOClient } from "@monster/agents";
import { enqueueProductSeo } from "@/app/(dashboard)/sites/[id]/seo/actions";

export const maxDuration = 55; // Vercel/standalone limit safety margin

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
  alreadyAdded: boolean;
}

type CachedProduct = Omit<SearchResultItem, "alreadyAdded">;

/**
 * GET /api/sites/[id]/product-search?q=<keyword>&depth=100
 *
 * 1. Cache hit (complete) → return results
 * 2. Cache pending → try task_get with stored dfs_task_id → if ready, update cache + return
 * 3. No cache → task_post + inline polling (~45s) → if ready, cache + return
 *    → if timeout, save pending with dfs_task_id, enqueue BullMQ background job
 *
 * Returns: { results, market, status: "complete"|"pending"|"not_found" }
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "q query param required" }, { status: 400 });
  }

  const depthParam = parseInt(request.nextUrl.searchParams.get("depth") ?? "100", 10);
  const depth = Math.min(
    400,
    Math.max(100, Math.ceil((isNaN(depthParam) ? 100 : depthParam) / 100) * 100),
  );

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
  const keyLower = q.toLowerCase();

  // ── 1. Cache lookup ─────────────────────────────────────────────────────────
  const { data: cacheRow } = await supabase
    .from("dfs_search_cache")
    .select("*")
    .eq("keyword", keyLower)
    .eq("market", market)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  // Complete cache hit with enough depth
  if (cacheRow?.status === "complete" && (cacheRow.depth ?? 0) >= depth) {
    const products = (cacheRow.results as CachedProduct[]) ?? [];
    return NextResponse.json({
      results: await mergeAlreadyAdded(products, siteId, supabase),
      market,
      status: "complete",
    });
  }

  // ── 2. Pending row — try to collect via task_get ────────────────────────────
  if (cacheRow?.status === "pending") {
    const dfsTaskId = (cacheRow as Record<string, unknown>).dfs_task_id as string | null;
    if (dfsTaskId) {
      try {
        const client = new DataForSEOClient();
        const ready = await client.collectReadyTask(dfsTaskId);
        if (ready) {
          const products = mapProducts(ready.items);
          await updateCacheComplete(supabase, keyLower, market, ready.items.length, products);
          console.log(
            `[product-search] background task complete: "${keyLower}" ${products.length} products`,
          );
          return NextResponse.json({
            results: await mergeAlreadyAdded(products, siteId, supabase),
            market,
            status: "complete",
          });
        }
      } catch (err) {
        console.error(
          `[product-search] collectReadyTask error: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return NextResponse.json({ results: [], market, status: "pending" });
  }

  // ── 3. No cache — fresh DFS search with inline polling (~40s budget) ────────
  try {
    const client = new DataForSEOClient();

    // Step 3a: task_post only — get taskId
    const { taskId } = await client.postSearchTask(q, market, depth, siteId);

    // Step 3b: immediately save "pending" so duplicate requests reuse this taskId
    await supabase.from("dfs_search_cache").upsert(
      {
        keyword: keyLower,
        market,
        depth,
        results: [],
        status: "pending",
        site_id: siteId,
        dfs_task_id: taskId,
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      },
      { onConflict: "keyword,market", ignoreDuplicates: false },
    );

    // Step 3c: poll tasks_ready with ~40s budget
    const products = await client.pollSearchTask(taskId, q, market, 40_000);

    if (products && products.length > 0) {
      const cached: CachedProduct[] = products.map((p) => ({
        asin: p.asin,
        title: p.title,
        imageUrl: p.imageUrl,
        price: p.price,
        rating: p.rating,
        reviewCount: p.reviewCount,
        isPrime: p.isPrime,
        isBestSeller: p.isBestSeller,
        isAmazonChoice: p.isAmazonChoice,
        boughtPastMonth: p.boughtPastMonth,
        specialOffers: p.specialOffers,
        rankPosition: p.rankPosition,
      }));

      await updateCacheComplete(supabase, keyLower, market, depth, cached);
      console.log(
        `[product-search] DFS inline: "${keyLower}" market=${market} depth=${depth} results=${cached.length}`,
      );

      return NextResponse.json({
        results: await mergeAlreadyAdded(cached, siteId, supabase),
        market,
        status: "complete",
      });
    }

    // Polling timed out — pending row already saved in step 3b
    console.log(`[product-search] timeout → pending: "${keyLower}" taskId=${taskId}`);
    return NextResponse.json({ results: [], market, status: "pending" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[product-search] error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProducts(items: any[]): CachedProduct[] {
  return items
    .filter((i) => i.type === "amazon_serp" && i.data_asin)
    .map((i) => ({
      asin: (i.data_asin as string) ?? "",
      title: (i.title as string) ?? "",
      imageUrl: (i.image_url as string) ?? null,
      price: (i.price_from as number) ?? null,
      rating: (i.rating?.value as number) ?? 0,
      reviewCount: (i.rating?.votes_count as number) ?? 0,
      isPrime: !!(i.is_prime ?? i.delivery_info),
      isBestSeller: !!i.is_best_seller,
      isAmazonChoice: !!i.is_amazon_choice,
      boughtPastMonth: (i.bought_past_month as number) ?? null,
      specialOffers: Array.isArray(i.special_offers) ? (i.special_offers as string[]) : [],
      rankPosition: (i.rank_position as number) ?? null,
    }));
}

async function updateCacheComplete(
  supabase: ReturnType<typeof createServiceClient>,
  keyword: string,
  market: string,
  depth: number,
  products: CachedProduct[],
) {
  await supabase.from("dfs_search_cache").upsert(
    {
      keyword,
      market,
      depth,
      results: JSON.parse(JSON.stringify(products)),
      status: "complete",
      expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
    { onConflict: "keyword,market", ignoreDuplicates: false },
  );
}

async function mergeAlreadyAdded(
  products: CachedProduct[],
  siteId: string,
  supabase: ReturnType<typeof createServiceClient>,
): Promise<SearchResultItem[]> {
  const { data: existing } = await supabase
    .from("tsa_products")
    .select("asin")
    .eq("site_id", siteId);
  const existingAsins = new Set((existing ?? []).map((r) => r.asin));
  return products.map((p) => ({ ...p, alreadyAdded: existingAsins.has(p.asin) }));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ── Bulk add ──────────────────────────────────────────────────────────────────

interface BulkAddBody {
  products: SearchResultItem[];
  categoryIds: string[];
}

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
