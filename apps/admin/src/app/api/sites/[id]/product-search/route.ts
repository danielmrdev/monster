import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DataForSEOClient } from "@monster/agents";
import { enqueueProductSeo } from "@/app/(dashboard)/sites/[id]/seo/actions";

// DataForSEO Merchant API uses async task flow (task_post → poll → task_get).
// Allow up to 60s for the polling to complete.
export const maxDuration = 60;

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

/**
 * GET /api/sites/[id]/product-search?q=<keyword>&depth=<100|200|300|400>
 *
 * Searches Amazon via DataForSEO Merchant API.
 * depth controls how many results DFS fetches (100–400, default 100).
 * Returns results with `alreadyAdded` flag for ASINs already in tsa_products.
 *
 * Uses async task flow (task_post → poll → task_get/advanced) — expect 15-30s.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;
  const q = request.nextUrl.searchParams.get("q")?.trim();
  const depthParam = parseInt(request.nextUrl.searchParams.get("depth") ?? "100", 10);
  const depth = Math.min(400, Math.max(100, isNaN(depthParam) ? 100 : depthParam));

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

  const market = site.market ?? "ES";

  try {
    const client = new DataForSEOClient();
    const products = await client.searchProducts(q, market, depth);

    // Fetch existing ASINs for this site to flag already-added ones
    const { data: existing } = await supabase
      .from("tsa_products")
      .select("asin")
      .eq("site_id", siteId);

    const existingAsins = new Set((existing ?? []).map((r) => r.asin));

    const results: SearchResultItem[] = products.map((p) => ({
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
      alreadyAdded: existingAsins.has(p.asin),
    }));

    console.log(
      `[product-search] siteId=${siteId} q="${q}" market=${market} depth=${depth} results=${results.length}`,
    );
    return NextResponse.json({ results, market, depth });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[product-search] siteId=${siteId} q="${q}" error=${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
 *
 * Body: { products: SearchResultItem[], categoryIds: string[] }
 * Returns: { added: number, skipped: number }
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

  // Verify site exists
  const supabase = createServiceClient();
  const { data: site } = await supabase.from("sites").select("id").eq("id", siteId).single();

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Fetch existing ASINs to skip duplicates
  const { data: existing } = await supabase
    .from("tsa_products")
    .select("asin")
    .eq("site_id", siteId);

  const existingAsins = new Set((existing ?? []).map((r) => r.asin));

  const toInsert = products.filter((p) => !existingAsins.has(p.asin));
  let added = 0;
  const skipped = products.length - toInsert.length;

  if (toInsert.length === 0) {
    return NextResponse.json({ added: 0, skipped });
  }

  // Insert products one by one to collect IDs for category linking
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
      // Race condition — already exists, skip silently
    } else if (error) {
      console.error(`[product-search/bulk-add] ASIN=${p.asin} error=${error.message}`);
    }
  }

  // Link to categories
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

  // Auto-enqueue SEO content generation for each inserted product.
  // Fire-and-forget: failures are logged but don't block the response.
  // Uses the first categoryId for context (or empty string if none selected).
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
