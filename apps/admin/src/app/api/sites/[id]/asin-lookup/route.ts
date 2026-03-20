import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { DataForSEOClient } from "@monster/agents";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/sites/[id]/asin-lookup?asin=XXXXXX
 *
 * Looks up a single ASIN on Amazon via DataForSEO Merchant API.
 * Returns: { asin, title, imageUrl, price, rating, reviewCount, isPrime }
 *
 * The site's market is used to target the correct Amazon domain.
 * Credentials are read from Supabase settings (D028 pattern).
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: siteId } = await params;
  const asin = request.nextUrl.searchParams.get("asin")?.trim().toUpperCase();

  if (!asin) {
    return NextResponse.json({ error: "asin query param required" }, { status: 400 });
  }

  // Fetch site to get market
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
    // Search by ASIN directly — DataForSEO Merchant API supports ASIN as keyword
    const products = await client.searchProducts(asin, market, undefined, siteId);

    // Find exact ASIN match first, then fall back to first result
    const match = products.find((p) => p.asin === asin) ?? products[0];

    if (!match) {
      return NextResponse.json({ error: "ASIN not found" }, { status: 404 });
    }

    return NextResponse.json({
      asin: match.asin,
      title: match.title,
      imageUrl: match.imageUrl,
      price: match.price,
      rating: match.rating,
      reviewCount: match.reviewCount,
      isPrime: match.isPrime,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[asin-lookup] siteId=${siteId} asin=${asin} error=${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
