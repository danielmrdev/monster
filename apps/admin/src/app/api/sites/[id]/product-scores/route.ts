import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/sites/[id]/product-scores?slugs=slug1,slug2,...
 *
 * Returns a map of product slug → overall SEO score for the requested slugs.
 * Used by CategoryProductsSection to show scores on paginated product rows
 * without embedding them in the main products API response.
 *
 * Response: { [slug: string]: number | null }
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: siteId } = await params;
  const slugsParam = req.nextUrl.searchParams.get("slugs") ?? "";
  const slugs = slugsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (slugs.length === 0) {
    return NextResponse.json({});
  }

  const supabase = createServiceClient();
  const paths = slugs.map((s) => `/products/${s}/`);

  const { data, error } = await supabase
    .from("seo_scores")
    .select("page_path, overall_score")
    .eq("site_id", siteId)
    .in("page_path", paths);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Build slug → score map
  const result: Record<string, number | null> = {};
  for (const slug of slugs) {
    result[slug] = null; // default: no score
  }
  for (const row of data ?? []) {
    const slug = row.page_path.replace("/products/", "").replace(/\/$/, "");
    result[slug] = row.overall_score ?? null;
  }

  return NextResponse.json(result);
}
