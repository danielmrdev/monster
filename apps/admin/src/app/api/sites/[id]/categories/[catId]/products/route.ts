import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const PAGE_SIZE = 25;

interface Params {
  params: Promise<{ id: string; catId: string }>;
}

/**
 * GET /api/sites/[id]/categories/[catId]/products?q=&page=1&limit=25
 *
 * Paginated + searchable product list scoped to a single category via
 * the category_products join table. Mirrors the shape of
 * GET /api/sites/[id]/products exactly.
 *
 * Returns: { products, total, page, pageSize, totalPages }
 * Strips `category_products` join metadata from returned product objects.
 *
 * Failure path: returns { error: string } with status 500 on Supabase error.
 * Structured error message is logged by Next.js and visible in server logs.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const { id: siteId, catId } = await params;
  const { searchParams } = request.nextUrl;

  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(PAGE_SIZE), 10)),
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const supabase = createServiceClient();

  let query = supabase
    .from("tsa_products")
    .select(
      "id, asin, slug, title, current_price, rating, review_count, is_prime, source_image_url, images, category_products!inner(category_id)",
      { count: "exact" },
    )
    .eq("site_id", siteId)
    .eq("category_products.category_id", catId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (q) {
    query = query.or(`title.ilike.%${q}%,asin.ilike.%${q}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("[API /categories/[catId]/products] Supabase error:", error.message, {
      siteId,
      catId,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const totalPages = Math.ceil(total / limit);

  // Strip category_products join metadata — internal only, not part of the Product shape
  const products = (data ?? []).map(({ category_products: _cp, ...p }) => p);

  return NextResponse.json({
    products,
    total,
    page,
    pageSize: limit,
    totalPages,
  });
}
